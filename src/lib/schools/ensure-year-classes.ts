import { prisma } from "@/lib/db";
import { writeSchoolAuditLog } from "@/lib/schools/audit";

/** Standard daytime school year classes: Year 1 … Year 11. */
export const SCHOOL_YEAR_CLASS_GROUPS = [
  "Year 1",
  "Year 2",
  "Year 3",
  "Year 4",
  "Year 5",
  "Year 6",
  "Year 7",
  "Year 8",
  "Year 9",
  "Year 10",
  "Year 11",
] as const;

export type SchoolYearClassGroup = (typeof SCHOOL_YEAR_CLASS_GROUPS)[number];

export function currentAcademicYearLabel(now = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based; Aug (7)+ is next academic year start in UK
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

export function classroomNameForYearGroup(yearGroup: SchoolYearClassGroup): string {
  return yearGroup;
}

export type EnsureYearClassesResult = {
  ok: true;
  academicYear: string;
  created: Array<{ id: string; yearGroup: SchoolYearClassGroup }>;
  reused: Array<{ id: string; yearGroup: SchoolYearClassGroup }>;
  restored: Array<{ id: string; yearGroup: SchoolYearClassGroup }>;
};

export type EnsureYearClassesDeps = {
  findSchool: (schoolId: string) => Promise<{ id: string } | null>;
  findClassrooms: (input: {
    schoolId: string;
    academicYear: string;
  }) => Promise<Array<{ id: string; name: string; yearGroup: string | null; status: string }>>;
  createClassroom: (input: {
    schoolId: string;
    name: string;
    yearGroup: SchoolYearClassGroup;
    academicYear: string;
  }) => Promise<{ id: string }>;
  restoreClassroom: (input: {
    classroomId: string;
    yearGroup: SchoolYearClassGroup;
  }) => Promise<{ id: string }>;
  writeSchoolAuditLog: typeof writeSchoolAuditLog;
};

export function createDefaultEnsureYearClassesDeps(): EnsureYearClassesDeps {
  return {
    findSchool: (schoolId) => prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } }),
    findClassrooms: async ({ schoolId }) => prisma.classroom.findMany({
      where: { schoolId },
      select: { id: true, name: true, yearGroup: true, status: true },
    }),
    createClassroom: async (input) => prisma.classroom.create({
      data: {
        schoolId: input.schoolId,
        name: input.name,
        yearGroup: input.yearGroup,
        academicYear: input.academicYear,
        status: "active",
      },
      select: { id: true },
    }),
    restoreClassroom: async (input) => prisma.classroom.update({
      where: { id: input.classroomId },
      data: {
        status: "active",
        yearGroup: input.yearGroup,
        name: classroomNameForYearGroup(input.yearGroup),
      },
      select: { id: true },
    }),
    writeSchoolAuditLog,
  };
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export async function ensureSchoolYearClasses(
  input: { schoolId: string; actorUserId: string; academicYear?: string },
  deps: EnsureYearClassesDeps = createDefaultEnsureYearClassesDeps(),
): Promise<EnsureYearClassesResult | { ok: false; status: number; error: string }> {
  const school = await deps.findSchool(input.schoolId);
  if (!school) {
    return { ok: false, status: 404, error: "School not found." };
  }

  const configured = await prisma.schoolAcademicYearConfig.findUnique({
    where: { schoolId: input.schoolId },
    select: { currentAcademicYear: true },
  });
  const academicYear =
    input.academicYear?.trim() ||
    configured?.currentAcademicYear?.trim() ||
    currentAcademicYearLabel();
  const existing = await deps.findClassrooms({ schoolId: input.schoolId, academicYear });

  const created: EnsureYearClassesResult["created"] = [];
  const reused: EnsureYearClassesResult["reused"] = [];
  const restored: EnsureYearClassesResult["restored"] = [];

  for (const yearGroup of SCHOOL_YEAR_CLASS_GROUPS) {
    const targetName = normalize(classroomNameForYearGroup(yearGroup));
    const match = existing.find((row) => {
      const byYear = normalize(row.yearGroup) === normalize(yearGroup);
      const byName = normalize(row.name) === targetName;
      return byYear || byName;
    });

    if (match) {
      if (match.status !== "active") {
        const restoredRow = await deps.restoreClassroom({
          classroomId: match.id,
          yearGroup,
        });
        restored.push({ id: restoredRow.id, yearGroup });
      } else {
        reused.push({ id: match.id, yearGroup });
      }
      continue;
    }

    const createdRow = await deps.createClassroom({
      schoolId: input.schoolId,
      name: classroomNameForYearGroup(yearGroup),
      yearGroup,
      academicYear,
    });
    created.push({ id: createdRow.id, yearGroup });
  }

  if (created.length > 0 || restored.length > 0) {
    await deps.writeSchoolAuditLog({
      schoolId: input.schoolId,
      actorUserId: input.actorUserId,
      action: "classroom_created",
      entityType: "classroom",
      metadata: {
        source: "ensure_year_classes",
        academicYear,
        created: created.map((row) => row.yearGroup),
        restored: restored.map((row) => row.yearGroup),
        reusedCount: reused.length,
      },
    });
  }

  return {
    ok: true,
    academicYear,
    created,
    reused,
    restored,
  };
}
