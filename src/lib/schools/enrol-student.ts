import { randomBytes, randomUUID } from "crypto";
import { hashPassword } from "@/lib/auth";
import { keyStageForYearGroup, yearGroupToOrdinal } from "@/lib/curriculum";
import { canAddSchoolStudent } from "@/lib/schools/licensing";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import { prisma } from "@/lib/db";

export type EnrolStudentInput = {
  schoolId: string;
  firstName: string;
  lastName: string;
  yearGroup: string;
  classroomId?: string | null;
  guardianName: string;
  guardianEmail: string;
  sendSupport?: boolean;
  safeguardingFlag?: boolean;
  baselineNotes?: string | null;
  externalRef?: string | null;
  actorUserId: string;
};

export type EnrolStudentResult = {
  ok: true;
  schoolStudentId: string;
  childId: string;
  parentUserId: string;
} | {
  ok: false;
  status: number;
  error: string;
  access?: unknown;
};

function approximateAgeFromYearGroup(yearGroup: string): number | null {
  const ordinal = yearGroupToOrdinal(yearGroup);
  if (ordinal === null) return null;
  return ordinal + 5;
}

export type EnrolStudentDeps = {
  canAddSchoolStudent: typeof canAddSchoolStudent;
  hashPassword: typeof hashPassword;
  writeSchoolAuditLog: typeof writeSchoolAuditLog;
  findSchool: (schoolId: string) => Promise<{ id: string; name: string } | null>;
  findClassroom: (input: { classroomId: string; schoolId: string }) => Promise<{ id: string } | null>;
  findUserByEmail: (email: string) => Promise<{ id: string; role: string } | null>;
  createParentUser: (input: { email: string; name: string; passwordHash: string }) => Promise<{ id: string }>;
  createChildWithProfile: (input: {
    id: string;
    parentId: string;
    name: string;
    age: number | null;
    yearGroup: string;
    keyStage: string;
    senSupportNeeds: string | null;
    weakAreasText: string | null;
    schoolInformation: string;
  }) => Promise<{ id: string }>;
  createSchoolStudent: (input: {
    schoolId: string;
    childId: string;
    classroomId: string | null;
    externalRef?: string | null;
  }) => Promise<{ id: string }>;
  upsertParentSchoolLink: (input: {
    schoolId: string;
    parentUserId: string;
    schoolStudentId: string;
  }) => Promise<void>;
};

export function createDefaultEnrolStudentDeps(): EnrolStudentDeps {
  return {
    canAddSchoolStudent,
    hashPassword,
    writeSchoolAuditLog,
    findSchool: (schoolId) => prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true } }),
    findClassroom: ({ classroomId, schoolId }) => prisma.classroom.findFirst({
      where: { id: classroomId, schoolId },
      select: { id: true },
    }),
    findUserByEmail: (email) => prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    }),
    createParentUser: async ({ email, name, passwordHash }) => prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: "parent",
        parentProfile: {
          create: {
            phone: "",
            parentRole: "parent",
            status: "active",
            numberOfChildren: 1,
          },
        },
      },
      select: { id: true },
    }),
    createChildWithProfile: async (input) => prisma.childProfile.create({
      data: {
        id: input.id,
        parentId: input.parentId,
        name: input.name,
        age: input.age,
        yearGroup: input.yearGroup,
        selectedVoice: "friendly_coach",
        level: 1,
        studentProfile: {
          create: {
            keyStageLevel: input.keyStage,
            senSupportNeeds: input.senSupportNeeds,
            weakAreasText: input.weakAreasText,
            schoolInformation: input.schoolInformation,
          },
        },
      },
      select: { id: true },
    }),
    createSchoolStudent: async (input) => prisma.schoolStudent.create({
      data: {
        schoolId: input.schoolId,
        childId: input.childId,
        classroomId: input.classroomId,
        externalRef: input.externalRef?.trim() || null,
        status: "active",
      },
      select: { id: true },
    }),
    upsertParentSchoolLink: async (input) => {
      await prisma.parentSchoolLink.upsert({
        where: {
          schoolId_parentUserId_schoolStudentId: {
            schoolId: input.schoolId,
            parentUserId: input.parentUserId,
            schoolStudentId: input.schoolStudentId,
          },
        },
        create: {
          schoolId: input.schoolId,
          parentUserId: input.parentUserId,
          schoolStudentId: input.schoolStudentId,
          status: "active",
          canReceiveReports: true,
          canMessageTeachers: true,
        },
        update: {
          status: "active",
        },
      });
    },
  };
}

export async function enrolSchoolStudent(
  input: EnrolStudentInput,
  deps: EnrolStudentDeps = createDefaultEnrolStudentDeps(),
): Promise<EnrolStudentResult> {
  const school = await deps.findSchool(input.schoolId);
  if (!school) {
    return { ok: false, status: 404, error: "School not found." };
  }

  const classroomId = input.classroomId?.trim() || null;
  if (classroomId) {
    const classroom = await deps.findClassroom({ classroomId, schoolId: input.schoolId });
    if (!classroom) {
      return { ok: false, status: 400, error: "Classroom not found for this school." };
    }
  }

  const seatDecision = await deps.canAddSchoolStudent(input.schoolId);
  if (!seatDecision.allowed) {
    return {
      ok: false,
      status: 402,
      error: "School licence does not allow adding this student.",
      access: seatDecision,
    };
  }

  const email = input.guardianEmail.trim().toLowerCase();
  const guardianName = input.guardianName.trim();
  const studentName = `${input.firstName.trim()} ${input.lastName.trim()}`.replace(/\s+/g, " ").trim();
  const yearGroup = input.yearGroup.trim();
  const keyStage = keyStageForYearGroup(yearGroup);
  const age = approximateAgeFromYearGroup(yearGroup);

  let parentUserId: string;
  const existing = await deps.findUserByEmail(email);
  if (existing) {
    if (existing.role !== "parent") {
      return {
        ok: false,
        status: 400,
        error: "That email belongs to a non-parent account. Use a guardian email.",
      };
    }
    parentUserId = existing.id;
  } else {
    const createdParent = await deps.createParentUser({
      email,
      name: guardianName,
      passwordHash: await deps.hashPassword(randomBytes(18).toString("base64url")),
    });
    parentUserId = createdParent.id;
  }

  const senBits = [
    input.sendSupport ? "SEND support flagged at enrolment" : null,
    input.safeguardingFlag ? "Safeguarding flagged at enrolment" : null,
  ].filter(Boolean);
  const childId = randomUUID();
  await deps.createChildWithProfile({
    id: childId,
    parentId: parentUserId,
    name: studentName,
    age,
    yearGroup,
    keyStage,
    senSupportNeeds: senBits.length ? senBits.join("; ") : null,
    weakAreasText: input.baselineNotes?.trim() || null,
    schoolInformation: JSON.stringify({
      schoolId: school.id,
      schoolName: school.name,
      enrolledAt: new Date().toISOString(),
    }),
  });

  const schoolStudent = await deps.createSchoolStudent({
    schoolId: input.schoolId,
    childId,
    classroomId,
    externalRef: input.externalRef?.trim() || null,
  });

  await deps.upsertParentSchoolLink({
    schoolId: input.schoolId,
    parentUserId,
    schoolStudentId: schoolStudent.id,
  });

  await deps.writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    action: "student_enrolled",
    entityType: "student",
    entityId: schoolStudent.id,
    metadata: {
      childId,
      parentUserId,
      classroomId,
      yearGroup,
      sendSupport: Boolean(input.sendSupport),
      safeguardingFlag: Boolean(input.safeguardingFlag),
    },
    severity: "info",
  });

  return {
    ok: true,
    schoolStudentId: schoolStudent.id,
    childId,
    parentUserId,
  };
}

/** Map staff UI role keys to SchoolTeacher.role values. */
export { mapStaffUiRoleToSchoolRole } from "@/lib/schools/staff-role-map";
