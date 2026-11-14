export type ParentProgressRecord = {
  id?: unknown;
  skill?: unknown;
  level?: unknown;
  score?: unknown;
  activityType?: unknown;
  activityName?: unknown;
  accuracy?: unknown;
  difficulty?: unknown;
  starsEarned?: unknown;
};

export type ParentProgressRow = {
  subject: string;
  skill: string;
  level: string;
  accuracy: number | null;
};

const EMPTY = "—";

export function describeParentProgressRecord(record: unknown): ParentProgressRow | null {
  if (!record || typeof record !== "object") return null;
  const row = record as ParentProgressRecord;
  const skill = text(row.skill);
  const activityName = text(row.activityName);
  const activityType = text(row.activityType);
  const level = text(row.level);
  const difficulty = finiteNumber(row.difficulty);
  const reward = codingReward(row);
  if (reward) {
    const stars = reward.stars === 1 ? "1 star" : reward.stars + " stars";
    return {
      subject: "Coding",
      skill: activityName ?? "Coding reward",
      level: stars,
      accuracy: null,
    };
  }
  const accuracy = finiteNumber(row.score) ?? finiteNumber(row.accuracy);
  return {
    subject: skill ? skill.split("_")[0] || "General" : activityType ?? EMPTY,
    skill: skill ?? activityName ?? EMPTY,
    level: level ?? (difficulty === null ? EMPTY : String(difficulty)),
    accuracy,
  };
}

export function progressRecordKey(record: unknown, index: number): string {
  if (record && typeof record === "object" && "id" in record) {
    const id = (record as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id;
  }
  return `progress-${index}`;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function codingReward(row: ParentProgressRecord): { stars: number } | null {
  if (text(row.activityType) !== "coding") return null;
  const name = text(row.activityName);
  if (!name || !/·\s*(mastery|improvement|persistence)\s*$/i.test(name)) return null;
  return { stars: finiteNumber(row.starsEarned) ?? 0 };
}
