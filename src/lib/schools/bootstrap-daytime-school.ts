import { randomBytes } from "crypto";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import { enrolSchoolStudent } from "@/lib/schools/enrol-student";
import { ensureSchoolYearClasses, SCHOOL_YEAR_CLASS_GROUPS } from "@/lib/schools/ensure-year-classes";

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

type TeachingSlot = {
  periodIndex: number;
  startsAt: string;
  endsAt: string;
  room: string;
  lessonType: "core" | "intervention";
  title: string;
  subject: string;
  skillFocus: string;
  contentKey: string;
};

const FIXED_FRAME: PeriodTemplate[] = [
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
];

/** Core teaching blocks differ by weekday so Mon–Fri are not clones. */
const WEEKDAY_TEACHING: Record<(typeof WEEKDAYS)[number], TeachingSlot[]> = {
  1: [
    { periodIndex: 2, startsAt: "09:00", endsAt: "09:50", room: "Room 12", lessonType: "core", title: "English — Guided reading", subject: "English", skillFocus: "Reading inference", contentKey: "mon-english-guided-reading" },
    { periodIndex: 3, startsAt: "09:50", endsAt: "10:40", room: "Room 12", lessonType: "core", title: "Spelling & phonics fluency", subject: "Spelling", skillFocus: "Spelling patterns", contentKey: "mon-spelling-phonics" },
    { periodIndex: 5, startsAt: "10:55", endsAt: "11:45", room: "Room 12", lessonType: "core", title: "Maths — Number fluency", subject: "Maths", skillFocus: "Place value", contentKey: "mon-maths-number" },
    { periodIndex: 7, startsAt: "12:30", endsAt: "13:20", room: "Room 12", lessonType: "core", title: "Topic — Science enquiry", subject: "Science", skillFocus: "Scientific enquiry", contentKey: "mon-science-enquiry" },
    { periodIndex: 8, startsAt: "13:20", endsAt: "14:10", room: "Room 8", lessonType: "intervention", title: "Intervention / stretch groups", subject: "Intervention", skillFocus: "Reading catch-up", contentKey: "mon-intervention-reading" },
    { periodIndex: 9, startsAt: "14:10", endsAt: "15:00", room: "Hall / Field", lessonType: "core", title: "PE — Invasion games", subject: "PE", skillFocus: "Teamwork", contentKey: "mon-pe-invasion" },
  ],
  2: [
    { periodIndex: 2, startsAt: "09:00", endsAt: "09:50", room: "Room 12", lessonType: "core", title: "English — Writing craft", subject: "English", skillFocus: "Narrative structure", contentKey: "tue-english-writing" },
    { periodIndex: 3, startsAt: "09:50", endsAt: "10:40", room: "Room 12", lessonType: "core", title: "Grammar & punctuation", subject: "English", skillFocus: "Sentence accuracy", contentKey: "tue-grammar" },
    { periodIndex: 5, startsAt: "10:55", endsAt: "11:45", room: "Room 12", lessonType: "core", title: "Maths — Fractions", subject: "Maths", skillFocus: "Fractions fluency", contentKey: "tue-maths-fractions" },
    { periodIndex: 7, startsAt: "12:30", endsAt: "13:20", room: "Room 12", lessonType: "core", title: "History — Local study", subject: "History", skillFocus: "Chronology", contentKey: "tue-history-local" },
    { periodIndex: 8, startsAt: "13:20", endsAt: "14:10", room: "Room 8", lessonType: "intervention", title: "Intervention — Maths fluency", subject: "Intervention", skillFocus: "Number facts", contentKey: "tue-intervention-maths" },
    { periodIndex: 9, startsAt: "14:10", endsAt: "15:00", room: "Hall", lessonType: "core", title: "Music — Singing & rhythm", subject: "Music", skillFocus: "Pulse and pitch", contentKey: "tue-music" },
  ],
  3: [
    { periodIndex: 2, startsAt: "09:00", endsAt: "09:50", room: "Room 12", lessonType: "core", title: "English — Comprehension", subject: "English", skillFocus: "Retrieval and inference", contentKey: "wed-english-comprehension" },
    { periodIndex: 3, startsAt: "09:50", endsAt: "10:40", room: "Room 12", lessonType: "core", title: "Handwriting & presentation", subject: "English", skillFocus: "Fluent handwriting", contentKey: "wed-handwriting" },
    { periodIndex: 5, startsAt: "10:55", endsAt: "11:45", room: "Room 12", lessonType: "core", title: "Maths — Geometry", subject: "Maths", skillFocus: "Shape and space", contentKey: "wed-maths-geometry" },
    { periodIndex: 7, startsAt: "12:30", endsAt: "13:20", room: "Room 12", lessonType: "core", title: "Geography — Maps & places", subject: "Geography", skillFocus: "Map skills", contentKey: "wed-geography-maps" },
    { periodIndex: 8, startsAt: "13:20", endsAt: "14:10", room: "Room 8", lessonType: "intervention", title: "Intervention — Spelling", subject: "Intervention", skillFocus: "Phonics patterns", contentKey: "wed-intervention-spelling" },
    { periodIndex: 9, startsAt: "14:10", endsAt: "15:00", room: "Art Room", lessonType: "core", title: "Art — Colour & texture", subject: "Art", skillFocus: "Visual elements", contentKey: "wed-art" },
  ],
  4: [
    { periodIndex: 2, startsAt: "09:00", endsAt: "09:50", room: "Room 12", lessonType: "core", title: "English — Oracy & debate", subject: "English", skillFocus: "Spoken language", contentKey: "thu-english-oracy" },
    { periodIndex: 3, startsAt: "09:50", endsAt: "10:40", room: "Room 12", lessonType: "core", title: "Reading fluency workshop", subject: "English", skillFocus: "Prosody", contentKey: "thu-reading-fluency" },
    { periodIndex: 5, startsAt: "10:55", endsAt: "11:45", room: "Room 12", lessonType: "core", title: "Maths — Reasoning problems", subject: "Maths", skillFocus: "Multi-step reasoning", contentKey: "thu-maths-reasoning" },
    { periodIndex: 7, startsAt: "12:30", endsAt: "13:20", room: "Room 12", lessonType: "core", title: "Computing — Digital literacy", subject: "Computing", skillFocus: "Online safety", contentKey: "thu-computing" },
    { periodIndex: 8, startsAt: "13:20", endsAt: "14:10", room: "Room 8", lessonType: "intervention", title: "Intervention — Writing support", subject: "Intervention", skillFocus: "Sentence building", contentKey: "thu-intervention-writing" },
    { periodIndex: 9, startsAt: "14:10", endsAt: "15:00", room: "Hall", lessonType: "core", title: "Assembly / PSHE", subject: "PSHE", skillFocus: "Wellbeing", contentKey: "thu-assembly-pshe" },
  ],
  5: [
    { periodIndex: 2, startsAt: "09:00", endsAt: "09:50", room: "Room 12", lessonType: "core", title: "English — Spelling bee prep", subject: "Spelling", skillFocus: "Word families", contentKey: "fri-spelling-prep" },
    { periodIndex: 3, startsAt: "09:50", endsAt: "10:40", room: "Room 12", lessonType: "core", title: "English — Book club", subject: "English", skillFocus: "Reading for pleasure", contentKey: "fri-book-club" },
    { periodIndex: 5, startsAt: "10:55", endsAt: "11:45", room: "Room 12", lessonType: "core", title: "Maths — Weekly challenge", subject: "Maths", skillFocus: "Mixed fluency", contentKey: "fri-maths-challenge" },
    { periodIndex: 7, startsAt: "12:30", endsAt: "13:20", room: "Room 12", lessonType: "core", title: "RE / Citizenship", subject: "RE", skillFocus: "Respect and community", contentKey: "fri-re-citizenship" },
    { periodIndex: 8, startsAt: "13:20", endsAt: "14:10", room: "Room 8", lessonType: "intervention", title: "Catch-up clinic", subject: "Intervention", skillFocus: "Targeted review", contentKey: "fri-catch-up-clinic" },
    { periodIndex: 9, startsAt: "14:10", endsAt: "15:00", room: "Hall / Field", lessonType: "core", title: "PE — Athletics / games", subject: "PE", skillFocus: "Fitness", contentKey: "fri-pe-athletics" },
  ],
};

function teachingToPeriod(slot: TeachingSlot): PeriodTemplate {
  return {
    periodIndex: slot.periodIndex,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    title: slot.title,
    subject: slot.subject,
    lessonType: slot.lessonType,
    skillFocus: slot.skillFocus,
    room: slot.room,
    createContentLesson: true,
    contentKey: slot.contentKey,
  };
}

/** Full day board for a weekday (1=Mon … 5=Fri). Times stay stable; teaching content rotates. */
export function periodsForDay(dayOfWeek: number): PeriodTemplate[] {
  const day = (WEEKDAYS.includes(dayOfWeek as (typeof WEEKDAYS)[number])
    ? dayOfWeek
    : 1) as (typeof WEEKDAYS)[number];
  const teaching = WEEKDAY_TEACHING[day].map(teachingToPeriod);
  return [...FIXED_FRAME, ...teaching].sort((a, b) => a.periodIndex - b.periodIndex);
}

/** @deprecated Prefer periodsForDay — kept as Monday template for older imports/tests. */
export const DAYTIME_PERIODS: PeriodTemplate[] = periodsForDay(1);

export function allTeachingPeriodTemplates(): PeriodTemplate[] {
  const seen = new Set<string>();
  const out: PeriodTemplate[] = [];
  for (const day of WEEKDAYS) {
    for (const period of periodsForDay(day)) {
      if (!period.createContentLesson || !period.contentKey || seen.has(period.contentKey)) continue;
      seen.add(period.contentKey);
      out.push(period);
    }
  }
  return out;
}

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

function keyStageForYearGroup(yearGroup: string): string {
  const year = Number(String(yearGroup).replace(/\D/g, ""));
  if (!Number.isFinite(year) || year <= 0) return DAYTIME_KEY_STAGE;
  if (year <= 2) return "KS1";
  if (year <= 6) return "KS2";
  if (year <= 9) return "KS3";
  return "KS4";
}

function periodLookupKey(input: {
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
}): string {
  return `${input.dayOfWeek}|${input.startsAt}|${input.endsAt}`;
}

export function contentLessonTemplateForYear(contentKey: string, yearGroup: string): string {
  const yearSlug = yearGroup.trim().toLowerCase().replace(/\s+/g, "-");
  return `${DAYTIME_LESSON_TEMPLATE_PREFIX}${yearSlug}:${contentKey}`;
}

async function ensureTeachingLessonsForYear(input: {
  yearGroup: string;
  keyStage: string;
  deps: BootstrapDaytimeSchoolDeps;
  summary: BootstrapDaytimeSchoolSummary;
  cache: Map<string, string>;
}): Promise<Map<string, string>> {
  const byKey = new Map<string, string>();
  for (const period of allTeachingPeriodTemplates()) {
    if (!period.createContentLesson || !period.contentKey) continue;
    const cacheKey = `${input.yearGroup}::${period.contentKey}`;
    const cached = input.cache.get(cacheKey);
    if (cached) {
      byKey.set(period.contentKey, cached);
      continue;
    }

    const template = contentLessonTemplateForYear(period.contentKey, input.yearGroup);
    const existing = await input.deps.findContentLesson({
      title: period.title,
      subject: period.subject,
      yearGroup: input.yearGroup,
      template,
    });
    if (existing) {
      bump(input.summary.contentLessons, "reused");
      input.cache.set(cacheKey, existing.id);
      byKey.set(period.contentKey, existing.id);
      continue;
    }

    // Fall back to legacy Year-5-only templates from earlier bootstraps.
    const legacy = await input.deps.findContentLesson({
      title: period.title,
      subject: period.subject,
      yearGroup: input.yearGroup,
      template: contentLessonTemplate(period.contentKey),
    });
    if (legacy) {
      bump(input.summary.contentLessons, "reused");
      input.cache.set(cacheKey, legacy.id);
      byKey.set(period.contentKey, legacy.id);
      continue;
    }

    const created = await input.deps.createContentLesson({
      title: period.title,
      subject: period.subject,
      yearGroup: input.yearGroup,
      keyStage: input.keyStage,
      skillFocus: period.skillFocus,
      template,
      lessonType: period.lessonType,
    });
    bump(input.summary.contentLessons, "created");
    input.cache.set(cacheKey, created.id);
    byKey.set(period.contentKey, created.id);
  }
  return byKey;
}

async function seedDayLessonsForClassroom(input: {
  schoolId: string;
  classroomId: string;
  yearGroup: string;
  keyStage: string;
  classTeacherId: string | null;
  supportTeacherId: string | null;
  deps: BootstrapDaytimeSchoolDeps;
  summary: BootstrapDaytimeSchoolSummary;
  treatMissingAsRestored: boolean;
  lessonCache: Map<string, string>;
}): Promise<string[]> {
  const lessonIdByContentKey = await ensureTeachingLessonsForYear({
    yearGroup: input.yearGroup,
    keyStage: input.keyStage,
    deps: input.deps,
    summary: input.summary,
    cache: input.lessonCache,
  });

  const existingRows = await input.deps.listClassroomDayLessons({
    schoolId: input.schoolId,
    classroomId: input.classroomId,
  });
  const existingByKey = new Map(
    existingRows.map((row) => [
      periodLookupKey({
        dayOfWeek: row.dayOfWeek,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
      }),
      row,
    ]),
  );

  const dayLessonIds: string[] = [];
  const toCreate: Array<{
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
  }> = [];

  for (const dayOfWeek of WEEKDAYS) {
    for (const period of periodsForDay(dayOfWeek)) {
      const teacherId = period.lessonType === "intervention"
        ? (input.supportTeacherId ?? input.classTeacherId)
        : input.classTeacherId;
      const lessonId = period.contentKey
        ? (lessonIdByContentKey.get(period.contentKey) ?? null)
        : null;
      const key = periodLookupKey({
        dayOfWeek,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
      });
      const existing = existingByKey.get(key);

      if (existing) {
        dayLessonIds.push(existing.id);
        const needsUpdate =
          existing.title !== period.title
          || existing.subject !== period.subject
          || existing.lessonType !== period.lessonType
          || (existing.skillFocus ?? null) !== (period.skillFocus ?? null)
          || (existing.room ?? null) !== period.room
          || (lessonId && existing.lessonId !== lessonId)
          || existing.teacherId !== teacherId;

        if (needsUpdate) {
          await input.deps.updateDayLessonSlot({
            dayLessonId: existing.id,
            lessonId,
            title: period.title,
            subject: period.subject,
            lessonType: period.lessonType,
            yearGroup: input.yearGroup,
            keyStage: input.keyStage,
            skillFocus: period.skillFocus,
            periodIndex: period.periodIndex,
            teacherId,
            room: period.room,
          });
          bump(input.summary.dayLessons, "restored");
        } else {
          bump(input.summary.dayLessons, "reused");
        }
        continue;
      }

      toCreate.push({
        schoolId: input.schoolId,
        classroomId: input.classroomId,
        teacherId,
        lessonId,
        title: period.title,
        subject: period.subject,
        lessonType: period.lessonType,
        yearGroup: input.yearGroup,
        keyStage: input.keyStage,
        skillFocus: period.skillFocus,
        dayOfWeek,
        periodIndex: period.periodIndex,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        room: period.room,
      });
    }
  }

  if (toCreate.length > 0) {
    const created = await input.deps.createDayLessonsBatch(toCreate);
    for (const row of created) {
      dayLessonIds.push(row.id);
      bump(input.summary.dayLessons, input.treatMissingAsRestored ? "restored" : "created");
    }
  }

  return dayLessonIds;
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
  }) => Promise<{ id: string; lessonId?: string | null } | null>;
  listClassroomDayLessons: (input: {
    schoolId: string;
    classroomId: string;
  }) => Promise<Array<{
    id: string;
    dayOfWeek: number;
    startsAt: string;
    endsAt: string;
    subject: string;
    title: string;
    lessonType: string;
    skillFocus: string | null;
    room: string | null;
    teacherId: string | null;
    lessonId: string | null;
  }>>;
  updateDayLessonSlot: (input: {
    dayLessonId: string;
    teacherId: string | null;
    lessonId: string | null;
    title: string;
    subject: string;
    lessonType: string;
    yearGroup: string;
    keyStage: string;
    skillFocus: string | null;
    periodIndex: number;
    room: string;
  }) => Promise<void>;
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
  createDayLessonsBatch: (rows: Array<{
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
  }>) => Promise<Array<{ id: string }>>;
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
      select: { id: true, lessonId: true },
      orderBy: { createdAt: "asc" },
    }),
    listClassroomDayLessons: async (input) => prisma.schoolDayLesson.findMany({
      where: { schoolId: input.schoolId, classroomId: input.classroomId },
      select: {
        id: true,
        dayOfWeek: true,
        startsAt: true,
        endsAt: true,
        subject: true,
        title: true,
        lessonType: true,
        skillFocus: true,
        room: true,
        teacherId: true,
        lessonId: true,
      },
    }),
    updateDayLessonSlot: async (input) => {
      await prisma.schoolDayLesson.update({
        where: { id: input.dayLessonId },
        data: {
          teacherId: input.teacherId,
          lessonId: input.lessonId,
          title: input.title,
          subject: input.subject,
          lessonType: input.lessonType,
          yearGroup: input.yearGroup,
          keyStage: input.keyStage,
          skillFocus: input.skillFocus,
          periodIndex: input.periodIndex,
          room: input.room,
          status: "scheduled",
        },
      });
    },
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
    createDayLessonsBatch: async (rows) => {
      if (rows.length === 0) return [];
      await prisma.schoolDayLesson.createMany({
        data: rows.map((row) => ({ ...row, status: "scheduled" })),
      });
      const created = await prisma.schoolDayLesson.findMany({
        where: {
          schoolId: rows[0]!.schoolId,
          classroomId: rows[0]!.classroomId,
          OR: rows.map((row) => ({
            dayOfWeek: row.dayOfWeek,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
          })),
        },
        select: { id: true },
      });
      return created;
    },
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

  const lessonCache = new Map<string, string>();
  const lessonIds: string[] = [];
  const dayLessonIds: string[] = [];
  const treatMissingAsRestored = summary.tutors.reused > 0 || summary.students.reused > 0 || summary.classroom.reused > 0;
  dayLessonIds.push(
    ...(await seedDayLessonsForClassroom({
      schoolId: school.id,
      classroomId: classroom.id,
      yearGroup: DAYTIME_YEAR_GROUP,
      keyStage: DAYTIME_KEY_STAGE,
      classTeacherId,
      supportTeacherId: teacherIds[1] ?? null,
      deps,
      summary,
      treatMissingAsRestored,
      lessonCache,
    })),
  );
  for (const lessonId of lessonCache.values()) {
    if (!lessonIds.includes(lessonId)) lessonIds.push(lessonId);
  }

  // Standard ladder Year 1–11 so secondary / mixed-year schools can enrol immediately.
  // Soft-fail in unit tests / environments without the year-class tables hydrated.
  let yearClassroomTimetableCount = 0;
  try {
    await ensureSchoolYearClasses({
      schoolId: school.id,
      actorUserId: input.actorUserId,
      academicYear,
    });

    // Prefer classrooms that already have students; otherwise seed every Year 1–11 class once.
    const yearClassrooms = await prisma.classroom.findMany({
      where: {
        schoolId: school.id,
        status: "active",
        yearGroup: { in: [...SCHOOL_YEAR_CLASS_GROUPS] },
      },
      select: {
        id: true,
        yearGroup: true,
        teacherId: true,
        _count: { select: { students: { where: { status: "active" } } } },
      },
      orderBy: { yearGroup: "asc" },
    });
    const populated = yearClassrooms.filter((row) => row._count.students > 0);
    const targets = populated.length > 0 ? populated : yearClassrooms;
    yearClassroomTimetableCount = targets.length;

    for (const yearClassroom of targets) {
      if (yearClassroom.id === classroom.id) continue;
      const yearGroup = yearClassroom.yearGroup ?? DAYTIME_YEAR_GROUP;
      dayLessonIds.push(
        ...(await seedDayLessonsForClassroom({
          schoolId: school.id,
          classroomId: yearClassroom.id,
          yearGroup,
          keyStage: keyStageForYearGroup(yearGroup),
          classTeacherId: yearClassroom.teacherId ?? classTeacherId,
          supportTeacherId: teacherIds[1] ?? null,
          deps,
          summary,
          treatMissingAsRestored: true,
          lessonCache,
        })),
      );
    }
  } catch (error) {
    console.warn("Year-class timetable expansion skipped:", error);
  }
  for (const lessonId of lessonCache.values()) {
    if (!lessonIds.includes(lessonId)) lessonIds.push(lessonId);
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
        yearClassroomTimetables: yearClassroomTimetableCount,
        lessonsLinked: lessonIds.length,
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
