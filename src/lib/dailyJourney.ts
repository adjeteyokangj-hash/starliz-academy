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

  const focusSkill = planned.coreSkills[0] ?? planned.warmupSkill;
  const weakSkill = planned.weakSkill;
  const warmupSkill = planned.warmupSkill;
  const reviewSkills = uniqueSkills(planned.reviewSkills);
  const bossTestSkills = uniqueSkills(planned.bossTestSkills);

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
