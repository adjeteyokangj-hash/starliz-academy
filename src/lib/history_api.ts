import { ChildProfile } from "@/lib/store";

export type LearningEvent = {
  ts: string;
  activity: "spelling" | "math" | "reading" | "coding";
  score: number;
  correct: boolean;
  difficulty: number;
  notes?: string;
};

const historyCache = new Map<string, LearningEvent[]>();

function normalize(records: Array<{
  createdAt: string;
  activityType: string;
  score?: number | null;
  correct?: boolean | null;
  difficulty?: number | null;
  notes?: string | null;
}>): LearningEvent[] {
  return records.map((record) => ({
    ts: record.createdAt,
    activity: (record.activityType as LearningEvent["activity"]) ?? "spelling",
    score: record.score ?? 0,
    correct: record.correct ?? false,
    difficulty: record.difficulty ?? 1,
    notes: record.notes ?? undefined,
  }));
}

export async function fetchProfileHistory(profileId: string): Promise<LearningEvent[]> {
  const response = await fetch(`/api/children/${profileId}/data`, { credentials: "include" });
  if (!response.ok) return [];
  const payload = await response.json() as { progressRecords: Array<{ createdAt: string; activityType: string; score?: number | null; correct?: boolean | null; difficulty?: number | null; notes?: string | null }> };
  const history = normalize(payload.progressRecords).sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  historyCache.set(profileId, history);
  return history;
}

export function getCachedProfileHistory(profileId: string): LearningEvent[] {
  return historyCache.get(profileId) ?? [];
}

export function appendCachedProfileHistory(profileId: string, event: LearningEvent): LearningEvent[] {
  const next = [...getCachedProfileHistory(profileId), event].slice(-400);
  historyCache.set(profileId, next);
  return next;
}

export async function fetchAllChildrenHistory(profiles: ChildProfile[]): Promise<Record<string, LearningEvent[]>> {
  const entries = await Promise.all(profiles.map(async (profile) => [profile.id, await fetchProfileHistory(profile.id)] as const));
  return Object.fromEntries(entries);
}

export function clearHistoryCache(): void {
  historyCache.clear();
}
