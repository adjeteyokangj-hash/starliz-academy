import type { SkillCode } from "@/lib/skills";
import type { SkillState } from "@/lib/learningEngineV2";

export type DailyLessonPlan = {
  warmupSkill: SkillCode;
  coreSkills: SkillCode[];
  weakSkill: SkillCode | null;
  mixedSkill: SkillCode;
  weakSkillsForLesson: SkillCode[];
  reviewSkills: SkillCode[];
  bossTestSkills: SkillCode[];
  sequence: SkillCode[];
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function pickFirst(candidates: Array<string | null | undefined>, fallback: SkillCode): SkillCode {
  for (const value of candidates) {
    if (value) return value as SkillCode;
  }
  return fallback;
}

export function composeDailyLessonPlan(input: {
  skillStates: SkillState[];
  forcedWarmupSkills?: string[];
  fallbackSkill?: SkillCode;
}): DailyLessonPlan {
  const fallback = input.fallbackSkill ?? "letter_sound";
  const forced = unique(input.forcedWarmupSkills ?? []);

  const weak = [...input.skillStates]
    .filter((state) => state.status === "weak")
    .sort((a, b) => b.priority - a.priority);
  const learning = [...input.skillStates]
    .filter((state) => state.status === "learning")
    .sort((a, b) => b.confidence - a.confidence);
  const secure = [...input.skillStates]
    .filter((state) => state.status === "secure")
    .sort((a, b) => b.confidence - a.confidence);

  const warmupSkill = pickFirst([
    forced[0],
    secure[0]?.skill,
    learning[0]?.skill,
    weak[0]?.skill,
  ], fallback);

  const weakSkill = pickFirst([
    forced[0],
    weak[0]?.skill,
    learning[0]?.skill,
  ], warmupSkill);

  const corePool = unique([
    ...learning.map((state) => state.skill),
    ...secure.map((state) => state.skill),
    ...weak.map((state) => state.skill),
  ]).filter((skill) => skill !== warmupSkill);

  const coreSkills = corePool.slice(0, 2) as SkillCode[];
  while (coreSkills.length < 2) {
    coreSkills.push(warmupSkill);
  }

  const mixedSkill = pickFirst([
    secure.find((state) => state.skill !== warmupSkill)?.skill,
    learning.find((state) => state.skill !== coreSkills[0])?.skill,
    weak.find((state) => state.skill !== weakSkill)?.skill,
  ], coreSkills[0] ?? warmupSkill);

  const weakSkillsForLesson = unique([
    weakSkill,
    ...weak.slice(1, 3).map((state) => state.skill),
    ...forced,
  ]) as SkillCode[];

  const reviewSkills = unique([
    warmupSkill,
    coreSkills[0],
    weakSkill,
  ]) as SkillCode[];

  const bossTestSkills = unique([
    coreSkills[1] ?? coreSkills[0],
    weakSkill,
    mixedSkill,
  ]) as SkillCode[];

  const sequence = [
    warmupSkill,
    coreSkills[0],
    coreSkills[1],
    weakSkill,
    mixedSkill,
  ] as SkillCode[];

  return {
    warmupSkill,
    coreSkills,
    weakSkill,
    mixedSkill,
    weakSkillsForLesson,
    reviewSkills,
    bossTestSkills,
    sequence,
  };
}
