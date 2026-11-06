import type { CodingSkillStatus } from "@/lib/coding/types";

export type CodingRewardKind = "persistence" | "improvement" | "mastery";

export type CodingRewardFlags = {
  persistence: boolean;
  improvement: boolean;
  mastery: boolean;
  failedStages: string[];
};

export const EMPTY_REWARD_FLAGS: CodingRewardFlags = {
  persistence: false,
  improvement: false,
  mastery: false,
  failedStages: [],
};

export const CODING_REWARD_AMOUNTS: Record<CodingRewardKind, { stars: number; xp: number; coins: number; reason: string }> = {
  persistence: { stars: 2, xp: 8, coins: 2, reason: "You kept going and fixed your coding" },
  improvement: { stars: 3, xp: 12, coins: 3, reason: "Your coding is improving" },
  mastery: { stars: 8, xp: 30, coins: 8, reason: "You mastered this coding skill" },
};

export function nextCodingRewards(input: {
  flags: CodingRewardFlags;
  previousStatus: CodingSkillStatus;
  nextStatus: CodingSkillStatus;
  stage: string;
  passed: boolean;
}): { flags: CodingRewardFlags; awards: CodingRewardKind[] } {
  const flags: CodingRewardFlags = {
    ...input.flags,
    failedStages: [...input.flags.failedStages],
  };
  const awards: CodingRewardKind[] = [];
  if (!input.passed && !flags.failedStages.includes(input.stage)) {
    flags.failedStages.push(input.stage);
  }
  if (input.passed && flags.failedStages.includes(input.stage) && !flags.persistence) {
    flags.persistence = true;
    awards.push("persistence");
  }
  const improved = (input.previousStatus === "not_started" || input.previousStatus === "learning")
    && (input.nextStatus === "practising" || input.nextStatus === "mastered");
  if (improved && !flags.improvement) {
    flags.improvement = true;
    awards.push("improvement");
  }
  if (input.nextStatus === "mastered" && input.previousStatus !== "mastered" && !flags.mastery) {
    flags.mastery = true;
    awards.push("mastery");
  }
  return { flags, awards };
}
