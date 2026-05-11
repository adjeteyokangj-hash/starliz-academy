import { parseWeakAreaMetadata } from "@/lib/weakAreas";

export type RetentionMetadata = {
  weakWords: string[];
  weakSkills: string[];
  weakStreakDays: number;
  forceWarmup: boolean;
  nextReviewDate: string | null;
  reinforcementDays: number[];
  lastOutcome: "weak" | "learning" | "secure";
  lastAccuracy: number;
  lastRetries: number;
};

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(start: Date, days: number): Date {
  const result = new Date(start);
  result.setDate(result.getDate() + days);
  return result;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function parseRetentionMetadata(metadataJson: string | null | undefined): RetentionMetadata {
  const base = parseWeakAreaMetadata(metadataJson);
  if (!metadataJson) {
    return {
      weakWords: base.weakWords,
      weakSkills: base.weakSkills,
      weakStreakDays: 0,
      forceWarmup: false,
      nextReviewDate: null,
      reinforcementDays: [1, 2, 4, 7],
      lastOutcome: "learning",
      lastAccuracy: 0,
      lastRetries: 0,
    };
  }

  try {
    const parsed = JSON.parse(metadataJson) as Partial<RetentionMetadata>;
    return {
      weakWords: base.weakWords,
      weakSkills: base.weakSkills,
      weakStreakDays: Math.max(0, Number(parsed.weakStreakDays ?? 0)),
      forceWarmup: Boolean(parsed.forceWarmup),
      nextReviewDate: typeof parsed.nextReviewDate === "string" ? parsed.nextReviewDate : null,
      reinforcementDays: Array.isArray(parsed.reinforcementDays)
        ? parsed.reinforcementDays.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)
        : [1, 2, 4, 7],
      lastOutcome: parsed.lastOutcome === "weak" || parsed.lastOutcome === "secure" ? parsed.lastOutcome : "learning",
      lastAccuracy: clamp(Number(parsed.lastAccuracy ?? 0), 0, 100),
      lastRetries: Math.max(0, Number(parsed.lastRetries ?? 0)),
    };
  } catch {
    return {
      weakWords: base.weakWords,
      weakSkills: base.weakSkills,
      weakStreakDays: 0,
      forceWarmup: false,
      nextReviewDate: null,
      reinforcementDays: [1, 2, 4, 7],
      lastOutcome: "learning",
      lastAccuracy: 0,
      lastRetries: 0,
    };
  }
}

export function applyRetentionRules(input: {
  existing: RetentionMetadata;
  accuracy: number;
  retries: number;
  today?: Date;
}): RetentionMetadata {
  const today = input.today ?? new Date();
  const accuracy = clamp(input.accuracy, 0, 100);
  const retries = Math.max(0, input.retries);

  const weakToday = accuracy < 60 || retries > 2;
  const secureToday = accuracy >= 80 && retries === 0;

  let weakStreakDays = input.existing.weakStreakDays;
  if (weakToday) {
    weakStreakDays += 1;
  } else if (secureToday) {
    weakStreakDays = Math.max(0, weakStreakDays - 1);
  }

  const forceWarmup = weakStreakDays >= 2;
  const reinforcementDays = weakToday ? [1, 2, 4, 7] : [4, 7];
  const nextReviewOffset = forceWarmup ? 1 : reinforcementDays[0] ?? 1;

  return {
    ...input.existing,
    weakStreakDays,
    forceWarmup,
    reinforcementDays,
    nextReviewDate: toIsoDate(addDays(today, nextReviewOffset)),
    lastOutcome: weakToday ? "weak" : secureToday ? "secure" : "learning",
    lastAccuracy: accuracy,
    lastRetries: retries,
  };
}

export function extractForcedWarmupSkills(areas: Array<{ skillFocus: string; metadataJson?: string | null }>): string[] {
  const forced = new Set<string>();
  for (const area of areas) {
    const metadata = parseRetentionMetadata(area.metadataJson);
    if (metadata.forceWarmup && area.skillFocus) {
      forced.add(area.skillFocus);
    }
  }
  return Array.from(forced);
}
