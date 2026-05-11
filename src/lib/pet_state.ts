import { ChildProfile, PetEmotion } from "@/lib/store";

export type PetOutcome = "correct" | "wrong" | "reward" | "streak-saved" | "level-up" | "care";

const TRANSITIONS: Record<PetEmotion, Record<PetOutcome, PetEmotion>> = {
  calm: {
    correct: "happy",
    wrong: "sad",
    reward: "excited",
    "streak-saved": "excited",
    "level-up": "excited",
    care: "happy",
  },
  happy: {
    correct: "excited",
    wrong: "calm",
    reward: "excited",
    "streak-saved": "excited",
    "level-up": "excited",
    care: "happy",
  },
  excited: {
    correct: "excited",
    wrong: "happy",
    reward: "excited",
    "streak-saved": "excited",
    "level-up": "excited",
    care: "happy",
  },
  sad: {
    correct: "happy",
    wrong: "sad",
    reward: "happy",
    "streak-saved": "happy",
    "level-up": "excited",
    care: "calm",
  },
};

export function nextPetEmotion(current: PetEmotion, outcome: PetOutcome): PetEmotion {
  return TRANSITIONS[current][outcome] ?? "calm";
}

export function applyPetOutcome(profile: ChildProfile, outcome: PetOutcome): ChildProfile {
  return {
    ...profile,
    petEmotion: nextPetEmotion(profile.petEmotion, outcome),
    petMoodUpdatedAt: new Date().toISOString(),
  };
}
