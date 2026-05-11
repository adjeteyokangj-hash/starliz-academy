import { ChildProfile } from "@/lib/store";

export type SurpriseReward = {
  awarded: boolean;
  starsBonus: number;
  coinsBonus: number;
  message: string;
  chance: number;
};

export function rollSurpriseReward(profile: ChildProfile, difficulty: number, isCorrect: boolean): SurpriseReward {
  if (!isCorrect) {
    return { awarded: false, starsBonus: 0, coinsBonus: 0, message: "", chance: 0 };
  }

  const chance = Math.min(0.25, 0.1 + difficulty * 0.02 + Math.min(0.08, profile.adaptive.spellingStreak * 0.01));
  const awarded = Math.random() < chance;
  if (!awarded) {
    return { awarded: false, starsBonus: 0, coinsBonus: 0, message: "", chance };
  }

  const starsBonus = 3 + difficulty;
  const coinsBonus = 2 + Math.floor(difficulty / 2);
  return {
    awarded: true,
    starsBonus,
    coinsBonus,
    message: `Surprise reward! +${starsBonus} stars and +${coinsBonus} coins!`,
    chance,
  };
}
