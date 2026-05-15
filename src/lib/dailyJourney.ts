import { prisma } from "@/lib/db";
import { SKILL_MAP, type SkillCode } from "@/lib/skills";
import { buildSkillStatesForStudent } from "@/lib/learningEngineV2";
import { composeDailyLessonPlan } from "@/lib/dailyLessonPlanner";
import { extractForcedWarmupSkills } from "@/lib/retentionScheduler";
import { resolveDashboardTier } from "@/lib/dashboardResolver";

type JourneyMode = "alphabet_foundation" | "spelling" | "maths" | "reading";

export type DailyJourney = {
  studentId: string;
  date: string;
  mode: JourneyMode;
  warmupSkill: SkillCode;
  focusSkill: SkillCode;
  weakSkill: SkillCode | null;
  reviewSkills: SkillCode[];
  bossTestSkills: SkillCode[];
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function modeForSkill(skill: SkillCode): JourneyMode {
  const def = SKILL_MAP[skill];
  if (!def || def.subject === "foundation") return "alphabet_foundation";
  if (def.subject === "maths") return "maths";
  if (def.subject === "reading") return "reading";
  return "spelling";
}

function uniqueSkills(skills: SkillCode[]): SkillCode[] {
  return Array.from(new Set(skills.filter(Boolean)));
}

function isFoundationSkill(skill: SkillCode | null | undefined): boolean {
  if (!skill) return false;
  const subject = SKILL_MAP[skill]?.subject;
  return subject === "foundation";
}

function firstNonFoundationSkill(skills: SkillCode[]): SkillCode | null {
  for (const skill of skills) {
    if (!isFoundationSkill(skill)) return skill;
  }
  return null;
}

export async function buildDailyJourney(studentId: string): Promise<DailyJourney> {
  const [rows, weakAreas, student] = await Promise.all([
    prisma.studentSkill.findMany({
      where: { studentId },
      orderBy: { accuracy: "asc" },
    }),
    prisma.weakArea.findMany({
      where: { studentId, status: "active" },
      select: { skillFocus: true, metadataJson: true },
    }),
    prisma.childProfile.findUnique({
      where: { id: studentId },
      select: { yearGroup: true, age: true },
    }),
  ]);

  const tier = resolveDashboardTier({
    yearGroup: student?.yearGroup,
    ageYears: student?.age ?? null,
  });
  const isPrimaryTier = tier === "primary";

  const letterRecognition = rows.find((row) => row.skill === "letter_recognition");
  const letterSound = rows.find((row) => row.skill === "letter_sound");

  const hasWeakFoundation = !letterRecognition
    || !letterSound
    || letterRecognition.accuracy < 70
    || letterSound.accuracy < 70;

  if (isPrimaryTier && hasWeakFoundation) {
    return {
      studentId,
      date: todayKey(),
      mode: "alphabet_foundation",
      warmupSkill: "letter_recognition",
      focusSkill: "letter_sound",
      weakSkill: "letter_sound",
      reviewSkills: ["letter_recognition", "alphabet_order"],
      bossTestSkills: ["letter_recognition", "letter_sound"],
    };
  }

  const forcedWarmupSkills = extractForcedWarmupSkills(weakAreas);
  const skillStates = await buildSkillStatesForStudent(studentId);
  const planned = composeDailyLessonPlan({
    skillStates,
    forcedWarmupSkills,
    fallbackSkill: isPrimaryTier ? "cvc" : "inference",
  });

  const fallbackFocus: SkillCode = isPrimaryTier ? "cvc" : "inference";
  const fallbackWarmup: SkillCode = isPrimaryTier ? "letter_recognition" : "retrieval";

  const plannedFocus = planned.coreSkills[0] ?? planned.warmupSkill;
  const nonFoundationFocus = firstNonFoundationSkill([plannedFocus, ...planned.coreSkills, planned.warmupSkill]);
  const focusSkill = isPrimaryTier ? plannedFocus : (nonFoundationFocus ?? fallbackFocus);

  const weakSkill = isPrimaryTier || !isFoundationSkill(planned.weakSkill)
    ? planned.weakSkill
    : focusSkill;

  const nonFoundationWarmup = firstNonFoundationSkill([planned.warmupSkill, ...planned.reviewSkills]);
  const warmupSkill = isPrimaryTier ? planned.warmupSkill : (nonFoundationWarmup ?? fallbackWarmup);

  const reviewSkills = uniqueSkills(
    (isPrimaryTier ? planned.reviewSkills : planned.reviewSkills.filter((skill) => !isFoundationSkill(skill))),
  );
  const bossTestSkills = uniqueSkills(
    (isPrimaryTier ? planned.bossTestSkills : planned.bossTestSkills.filter((skill) => !isFoundationSkill(skill))),
  );

  return {
    studentId,
    date: todayKey(),
    mode: modeForSkill(focusSkill),
    warmupSkill,
    focusSkill,
    weakSkill,
    reviewSkills,
    bossTestSkills,
  };
}
