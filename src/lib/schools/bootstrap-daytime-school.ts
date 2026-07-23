import { randomBytes } from "crypto";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import { enrolSchoolStudent } from "@/lib/schools/enrol-student";

export const DAYTIME_CLASSROOM_NAME = "5K — Daytime Class";
export const DAYTIME_CLASSROOM_KEY = "5K";
export const DAYTIME_YEAR_GROUP = "Year 5";
export const DAYTIME_KEY_STAGE = "KS2";
export const DAYTIME_LESSON_TEMPLATE_PREFIX = "school-day-core:";

export type BootstrapCountBucket = {
  created: number;
  reused: number;
  restored: number;
  skipped: number;
};

export type BootstrapDaytimeSchoolSummary = {
  tutors: BootstrapCountBucket;
  classroom: BootstrapCountBucket;
  students: BootstrapCountBucket;
  enrolments: BootstrapCountBucket;
  contentLessons: BootstrapCountBucket;
  dayLessons: BootstrapCountBucket;
};

export type BootstrapDaytimeSchoolInput = {
  schoolId: string;
  actorUserId: string;
};

export type BootstrapDaytimeSchoolResult =
  | {
      ok: true;
      classroomId: string;
      teacherIds: string[];
      studentIds: string[];
      dayLessonIds: string[];
      lessonIds: string[];
      summary: BootstrapDaytimeSchoolSummary;
      changed: boolean;
    }
  | { ok: false; status: number; error: string };

type PeriodTemplate = {
  periodIndex: number;
  startsAt: string;
  endsAt: string;
  title: string;
  subject: string;
  lessonType: string;
  skillFocus: string | null;
  room: string;
  createContentLesson: boolean;
  contentKey: string | null;
};

const WEEKDAYS = [1, 2, 3, 4, 5] as const;

export const DAYTIME_PERIODS: PeriodTemplate[] = [
  {
    periodIndex: 1,
    startsAt: "08:45",
    endsAt: "09:00",
    title: "Morning registration",
    subject: "Pastoral",
    lessonType: "registration",
    skillFocus: null,
    room: "Room 12",
    createContentLesson: false,
    contentKey: null,
  },
  {
    periodIndex: 2,
    startsAt: "09:00",
    endsAt: "09:50",
    title: "English — Guided reading",
    subject: "English",
    lessonType: "core",
    skillFocus: "Reading inference",
    room: "Room 12",
    createContentLesson: true,
    contentKey: "english-guided-reading",
  },
  {
    periodIndex: 3,
    startsAt: "09:50",
    endsAt: "10:40",
    title: "Spelling & phonics fluency",
    subject: "Spelling",
    lessonType: "core",
    skillFocus: "Spelling patterns",
    room: "Room 12",
    createContentLesson: true,
    contentKey: "spelling-phonics",
  },
  {
    periodIndex: 4,
    startsAt: "10:40",
    endsAt: "10:55",
    title: "Break",
    subject: "Break",
    lessonType: "break",
    skillFocus: null,
    room: "Playground",
    createContentLesson: false,
    contentKey: null,
  },
  {
    periodIndex: 5,
    startsAt: "10:55",
    endsAt: "11:45",
    title: "Maths — Number fluency",
    subject: "Maths",
    lessonType: "core",
    skillFocus: "Fractions fluency",
    room: "Room 12",
    createContentLesson: true,
    contentKey: "maths-number-fluency",
  },
  {
    periodIndex: 6,
    startsAt: "11:45",
    endsAt: "12:30",
    title: "Lunch",
    subject: "Lunch",
    lessonType: "break",
    skillFocus: null,
    room: "Hall",
    createContentLesson: false,
    contentKey: null,
  },
  {
    periodIndex: 7,
    startsAt: "12:30",
    endsAt: "13:20",
    title: "Topic — Science enquiry",
    subject: "Science",
    lessonType: "core",
    skillFocus: "Scientific enquiry",
    room: "Room 12",
    createContentLesson: true,
    contentKey: "science-enquiry",
  },
  {
    periodIndex: 8,
    startsAt: "13:20",
    endsAt: "14:10",
    title: "Intervention / stretch groups",
    subject: "Intervention",
    lessonType: "intervention",
    skillFocus: "Targeted catch-up",
    room: "Room 8",
    createContentLesson: true,
    contentKey: "intervention-stretch",
  },
  {
    periodIndex: 9,
    startsAt: "14:10",
    endsAt: "15:00",
    title: "PE / Assembly rotation",
    subject: "PE",
    lessonType: "core",
    skillFocus: "Teamwork",
    room: "Hall / Field",
    createContentLesson: false,
    contentKey: null,
  },
];

export const SEED_TUTORS = [
  { name: "Ms Amara Khan", emailPrefix: "amara.khan", title: "Class Teacher", role: "teacher" as const },
  { name: "Mr James Okafor", emailPrefix: "james.okafor", title: "Intervention Tutor", role: "support" as const },
  { name: "Ms Priya Shah", emailPrefix: "priya.shah", title: "Year Group Lead", role: "teacher" as const },
];

export const SEED_STUDENTS = [
  { firstName: "Noah", lastName: "Bennett", guardianName: "Sarah Bennett", admissionKey: "noah-bennett" },
  { firstName: "Aisha", lastName: "Rahman", guardianName: "Farah Rahman", admissionKey: "aisha-rahman" },
  { firstName: "Leo", lastName: "Patel", guardianName: "Anita Patel", admissionKey: "leo-patel" },
  { firstName: "Maya", lastName: "Chen", guardianName: "Wei Chen", admissionKey: "maya-chen" },
  { firstName: "Ethan", lastName: "Wright", guardianName: "Helen Wright", admissionKey: "ethan-wright" },
  { firstName: "Sofia", lastName: "Almeida", guardianName: "Carla Almeida", admissionKey: "sofia-almeida" },
];

export function academicYearLabel(now = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month >= 8 ? year : year - 1;
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

export function schoolEmailDomain(slug: string): string {
  const safe = slug.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "school";
  return `${safe}.starliz.local`;
}

export function studentExternalRef(admissionKey: string): string {
  return `bootstrap:5k:${admissionKey}`;
}

export function contentLessonTemplate(contentKey: string): string {
  return `${DAYTIME_LESSON_TEMPLATE_PREFIX}${contentKey}`;
}

export function emptyBucket(): BootstrapCountBucket {
  return { created: 0, reused: 0, restored: 0, skipped: 0 };
}

function bump(bucket: BootstrapCountBucket, key: keyof BootstrapCountBucket) {
  bucket[key] += 1;
}

export type BootstrapDaytimeSchoolDeps = {
  findSchool: (schoolId: string) => Promise<{
    id: string;
    name: string;
    slug: string;
    status: string;
    licence: { id: string; seatLimit: number; status: string } | null;
    studentCount: number;
  } | null>;
  ensureLicenceSeats: (input: {
    schoolId: string;
    licence: { id: string; seatLimit: number; status: string } | null;
    neededSeats: number;
  }) => Promise<void>;
  activateSchoolIfNeeded: (input: { schoolId: string; status: string }) => Promise<void>;
  findUserByEmail: (email: string) => Promise<{ id: string } | null>;
  createTeacherUser: (input: { email: string; name: string; passwordHash: string }) => Promise<{ id: string }>;
  upsertSchoolTeacher: (input: {
    schoolId: string;
    userId: string;
    role: "teacher" | "support";
    title: string;
    actorUserId: string;
    existed: boolean;
  }) => Promise<{ id: string; created: boolean }>;
  findClassroom: (input: {
    schoolId: string;
    academicYear: string;
  }) => Promise<{ id: string; teacherId: string | null } | null>;
  createClassroom: (input: {
    schoolId: string;
    name: string;
    yearGroup: string;
    academicYear: string;
    teacherId: string | null;
  }) => Promise<{ id: string; teacherId: string | null }>;
  updateClassroom: (input: {
    classroomId: string;
    teacherId: string | null;
    yearGroup: string;
  }) => Promise<void>;
  findSchoolStudentByExternalRef: (input: {
    schoolId: string;
    externalRef: string;
  }) => Promise<{ id: string; classroomId: string | null; status: string; childId: string } | null>;
  enrolSchoolStudent: typeof enrolSchoolStudent;
  updateSchoolStudentEnrolment: (input: {
    schoolStudentId: string;
    classroomId: string;
    status: "active";
  }) => Promise<void>;
  findContentLesson: (input: {
    title: string;
    subject: string;
    yearGroup: string;
    template: string;
  }) => Promise<{ id: string } | null>;
  createContentLesson: (input: {
    title: string;
    subject: string;
    yearGroup: string;
    keyStage: string;
    skillFocus: string | null;
    template: string;
    lessonType: string;
  }) => Promise<{ id: string }>;
  findDayLesson: (input: {
    schoolId: string;
    classroomId: string;
    dayOfWeek: number;
    startsAt: string;
    endsAt: string;
    subject: string;
  }) => Promise<{ id: string } | null>;
  createDayLesson: (input: {
    schoolId: string;
    classroomId: string;
    teacherId: string | null;
    lessonId: string | null;
    title: string;
    subject: string;
    lessonType: string;
    yearGroup: string;
    keyStage: string;
    skillFocus: string | null;
    dayOfWeek: number;
    periodIndex: number;
    startsAt: string;
    endsAt: string;
    room: string;
  }) => Promise<{ id: string }>;
  writeSchoolAuditLog: typeof writeSchoolAuditLog;
  hashPassword: typeof hashPassword;
};

export function createDefaultBootstrapDaytimeSchoolDeps(): BootstrapDaytimeSchoolDeps {
  return {
    findSchool: async (schoolId) => {
      const school = await prisma.school.findUnique({
        where: { id: schoolId },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          licence: { select: { id: true, seatLimit: true, status: true } },
          _count: { select: { students: true } },
        },
      });
      if (!school) return null;
      return {
        id: school.id,
        name: school.name,
        slug: school.slug,
        status: school.status,
        licence: school.licence,
        studentCount: school._count.students,
      };
    },
    ensureLicenceSeats: async ({ schoolId, licence, neededSeats }) => {
      if (!licence) {
        await prisma.schoolLicence.create({
          data: {
            schoolId,
            status: "active",
            seatLimit: neededSeats,
            provider: "manual",
            billingInterval: "custom",
            notes: "Auto-provisioned for daytime school bootstrap",
          },
        });
        return;
      }
      if (licence.seatLimit > 0 && licence.seatLimit < neededSeats) {
        await prisma.schoolLicence.update({
          where: { id: licence.id },
          data: {
            seatLimit: neededSeats,
            status: licence.status === "pilot" ? "active" : licence.status,
          },
        });
      }
    },
    activateSchoolIfNeeded: async ({ schoolId, status }) => {
      if (status === "pilot" || status === "archived") {
        await prisma.school.update({ where: { id: schoolId }, data: { status: "active" } });
      }
    },
    findUserByEmail: (email) => prisma.user.findUnique({ where: { email }, select: { id: true } }),
    createTeacherUser: async ({ email, name, passwordHash }) => prisma.user.create({
      data: { email, name, role: "teacher", passwordHash },
      select: { id: true },
    }),
    upsertSchoolTeacher: async (input) => {
      const existing = await prisma.schoolTeacher.findUnique({
        where: { schoolId_userId: { schoolId: input.schoolId, userId: input.userId } },
        select: { id: true },
      });
      const teacher = await prisma.schoolTeacher.upsert({
        where: { schoolId_userId: { schoolId: input.schoolId, userId: input.userId } },
        create: {
          schoolId: input.schoolId,
          userId: input.userId,
          role: input.role,
          title: input.title,
          status: "active",
          invitedByUserId: input.actorUserId,
          invitedAt: new Date(),
          acceptedAt: new Date(),
          lastActiveAt: new Date(),
        },
        update: {
          role: input.role,
          title: input.title,
          status: "active",
          acceptedAt: new Date(),
          lastActiveAt: new Date(),
        },
        select: { id: true },
      });
      return { id: teacher.id, created: !existing };
    },
    findClassroom: async ({ schoolId, academicYear }) => {
      const exact = await prisma.classroom.findFirst({
        where: {
          schoolId,
          academicYear,
          OR: [
            { name: DAYTIME_CLASSROOM_NAME },
            { name: DAYTIME_CLASSROOM_KEY },
            { name: { startsWith: `${DAYTIME_CLASSROOM_KEY} ` } },
            { name: { startsWith: `${DAYTIME_CLASSROOM_KEY}—` } },
            { name: { startsWith: `${DAYTIME_CLASSROOM_KEY} -` } },
          ],
        },
        select: { id: true, teacherId: true },
      });
      return exact;
    },
    createClassroom: async (input) => prisma.classroom.create({
      data: {
        schoolId: input.schoolId,
        name: input.name,
        yearGroup: input.yearGroup,
        academicYear: input.academicYear,
        teacherId: input.teacherId,
        status: "active",
      },
      select: { id: true, teacherId: true },
    }),
    updateClassroom: async (input) => {
      await prisma.classroom.update({
        where: { id: input.classroomId },
        data: {
          teacherId: input.teacherId,
          yearGroup: input.yearGroup,
          status: "active",
          name: DAYTIME_CLASSROOM_NAME,
        },
      });
    },
    findSchoolStudentByExternalRef: async ({ schoolId, externalRef }) => prisma.schoolStudent.findUnique({
      where: { schoolId_externalRef: { schoolId, externalRef } },
      select: { id: true, classroomId: true, status: true, childId: true },
    }),
    enrolSchoolStudent,
    updateSchoolStudentEnrolment: async (input) => {
      await prisma.schoolStudent.update({
        where: { id: input.schoolStudentId },
        data: {
          classroomId: input.classroomId,
          status: input.status,
          leftAt: null,
        },
      });
    },
    findContentLesson: async (input) => prisma.lesson.findFirst({
      where: {
        title: input.title,
        subject: input.subject,
        yearGroup: input.yearGroup,
        template: input.template,
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    }),
    createContentLesson: async (input) => prisma.lesson.create({
      data: {
        title: input.title,
        subject: input.subject,
        yearGroup: input.yearGroup,
        keyStage: input.keyStage,
        skillFocus: input.skillFocus,
        template: input.template,
        objectives: `Deliver ${input.title} for ${input.yearGroup} during the school day.`,
        difficultyBand: input.lessonType === "intervention" ? "support" : "core",
        status: "assigned",
      },
      select: { id: true },
    }),
    findDayLesson: async (input) => prisma.schoolDayLesson.findFirst({
      where: {
        schoolId: input.schoolId,
        classroomId: input.classroomId,
        dayOfWeek: input.dayOfWeek,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        subject: input.subject,
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    }),
    createDayLesson: async (input) => prisma.schoolDayLesson.create({
      data: {
        schoolId: input.schoolId,
        classroomId: input.classroomId,
        teacherId: input.teacherId,
        lessonId: input.lessonId,
        title: input.title,
        subject: input.subject,
        lessonType: input.lessonType,
        yearGroup: input.yearGroup,
        keyStage: input.keyStage,
        skillFocus: input.skillFocus,
        dayOfWeek: input.dayOfWeek,
        periodIndex: input.periodIndex,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        room: input.room,
        status: "scheduled",
      },
      select: { id: true },
    }),
    writeSchoolAuditLog,
    hashPassword,
  };
}

export async function bootstrapDaytimeSchool(
  input: BootstrapDaytimeSchoolInput,
  deps: BootstrapDaytimeSchoolDeps = createDefaultBootstrapDaytimeSchoolDeps(),
): Promise<BootstrapDaytimeSchoolResult> {
  const school = await deps.findSchool(input.schoolId);
  if (!school) {
    return { ok: false, status: 404, error: "School not found." };
  }

  const summary: BootstrapDaytimeSchoolSummary = {
    tutors: emptyBucket(),
    classroom: emptyBucket(),
    students: emptyBucket(),
    enrolments: emptyBucket(),
    contentLessons: emptyBucket(),
    dayLessons: emptyBucket(),
  };

  const domain = schoolEmailDomain(school.slug);
  const academicYear = academicYearLabel();
  const neededSeats = Math.max(12, school.studentCount + SEED_STUDENTS.length + 2);
  await deps.ensureLicenceSeats({
    schoolId: school.id,
    licence: school.licence,
    neededSeats,
  });
  await deps.activateSchoolIfNeeded({ schoolId: school.id, status: school.status });

  const teacherIds: string[] = [];
  for (const tutor of SEED_TUTORS) {
    const email = `${tutor.emailPrefix}@${domain}`;
    const existingUser = await deps.findUserByEmail(email);
    let userId = existingUser?.id ?? null;
    if (!userId) {
      const created = await deps.createTeacherUser({
        email,
        name: tutor.name,
        passwordHash: await deps.hashPassword(randomBytes(18).toString("base64url")),
      });
      userId = created.id;
    }
    const teacher = await deps.upsertSchoolTeacher({
      schoolId: school.id,
      userId,
      role: tutor.role,
      title: tutor.title,
      actorUserId: input.actorUserId,
      existed: Boolean(existingUser),
    });
    if (teacher.created) bump(summary.tutors, "created");
    else bump(summary.tutors, "reused");
    teacherIds.push(teacher.id);
  }

  const classTeacherId = teacherIds[0] ?? null;
  let classroomRecord = await deps.findClassroom({ schoolId: school.id, academicYear });
  if (!classroomRecord) {
    classroomRecord = await deps.createClassroom({
      schoolId: school.id,
      name: DAYTIME_CLASSROOM_NAME,
      yearGroup: DAYTIME_YEAR_GROUP,
      academicYear,
      teacherId: classTeacherId,
    });
    bump(summary.classroom, "created");
  } else {
    await deps.updateClassroom({
      classroomId: classroomRecord.id,
      teacherId: classTeacherId,
      yearGroup: DAYTIME_YEAR_GROUP,
    });
    bump(summary.classroom, "reused");
  }
  const classroom = classroomRecord;

  const studentIds: string[] = [];
  for (const [index, student] of SEED_STUDENTS.entries()) {
    const externalRef = studentExternalRef(student.admissionKey);
    const existing = await deps.findSchoolStudentByExternalRef({
      schoolId: school.id,
      externalRef,
    });

    if (existing) {
      bump(summary.students, "reused");
      studentIds.push(existing.id);
      const needsRestore = existing.classroomId !== classroom.id || existing.status !== "active";
      if (needsRestore) {
        await deps.updateSchoolStudentEnrolment({
          schoolStudentId: existing.id,
          classroomId: classroom.id,
          status: "active",
        });
        bump(summary.enrolments, "restored");
      } else {
        bump(summary.enrolments, "reused");
      }
      continue;
    }

    const guardianEmail = `${student.admissionKey}.parent@${domain}`;
    const enrolled = await deps.enrolSchoolStudent({
      schoolId: school.id,
      firstName: student.firstName,
      lastName: student.lastName,
      yearGroup: DAYTIME_YEAR_GROUP,
      classroomId: classroom.id,
      guardianName: student.guardianName,
      guardianEmail,
      externalRef,
      baselineNotes: index === 0
        ? "Baseline: strong oral fluency; watch reading stamina in longer texts."
        : null,
      actorUserId: input.actorUserId,
    });

    if (!enrolled.ok) {
      return { ok: false, status: enrolled.status, error: enrolled.error };
    }

    bump(summary.students, "created");
    bump(summary.enrolments, "created");
    studentIds.push(enrolled.schoolStudentId);
  }

  const contentLessonIdByKey = new Map<string, string>();
  const lessonIds: string[] = [];
  for (const period of DAYTIME_PERIODS) {
    if (!period.createContentLesson || !period.contentKey) continue;
    const template = contentLessonTemplate(period.contentKey);
    const existing = await deps.findContentLesson({
      title: period.title,
      subject: period.subject,
      yearGroup: DAYTIME_YEAR_GROUP,
      template,
    });
    if (existing) {
      bump(summary.contentLessons, "reused");
      contentLessonIdByKey.set(period.contentKey, existing.id);
      lessonIds.push(existing.id);
      continue;
    }
    const created = await deps.createContentLesson({
      title: period.title,
      subject: period.subject,
      yearGroup: DAYTIME_YEAR_GROUP,
      keyStage: DAYTIME_KEY_STAGE,
      skillFocus: period.skillFocus,
      template,
      lessonType: period.lessonType,
    });
    bump(summary.contentLessons, "created");
    contentLessonIdByKey.set(period.contentKey, created.id);
    lessonIds.push(created.id);
  }

  const dayLessonIds: string[] = [];
  for (const dayOfWeek of WEEKDAYS) {
    for (const period of DAYTIME_PERIODS) {
      const teacherId = period.lessonType === "intervention"
        ? (teacherIds[1] ?? classTeacherId)
        : classTeacherId;
      const lessonId = period.contentKey
        ? (contentLessonIdByKey.get(period.contentKey) ?? null)
        : null;

      const existing = await deps.findDayLesson({
        schoolId: school.id,
        classroomId: classroom.id,
        dayOfWeek,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        subject: period.subject,
      });
      if (existing) {
        bump(summary.dayLessons, "reused");
        dayLessonIds.push(existing.id);
        continue;
      }

      const created = await deps.createDayLesson({
        schoolId: school.id,
        classroomId: classroom.id,
        teacherId,
        lessonId,
        title: period.title,
        subject: period.subject,
        lessonType: period.lessonType,
        yearGroup: DAYTIME_YEAR_GROUP,
        keyStage: DAYTIME_KEY_STAGE,
        skillFocus: period.skillFocus,
        dayOfWeek,
        periodIndex: period.periodIndex,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        room: period.room,
      });
      // Missing timetable rows after a prior bootstrap count as restored.
      const rosterAlreadyPresent = summary.tutors.reused > 0 || summary.students.reused > 0 || summary.classroom.reused > 0;
      bump(summary.dayLessons, rosterAlreadyPresent ? "restored" : "created");
      dayLessonIds.push(created.id);
    }
  }

  const changed = Object.values(summary).some(
    (bucket) => bucket.created > 0 || bucket.restored > 0,
  );

  if (!changed) {
    for (const bucket of Object.values(summary)) {
      if (bucket.reused > 0 && bucket.created === 0 && bucket.restored === 0) {
        bucket.skipped = bucket.reused;
      }
    }
  }

  if (changed) {
    await deps.writeSchoolAuditLog({
      schoolId: school.id,
      actorUserId: input.actorUserId,
      action: "classroom_created",
      entityType: "classroom",
      entityId: classroom.id,
      metadata: {
        bootstrap: "daytime_school",
        summary,
      },
      severity: "info",
    });
  }

  return {
    ok: true,
    classroomId: classroom.id,
    teacherIds,
    studentIds,
    dayLessonIds,
    lessonIds,
    summary,
    changed,
  };
}
