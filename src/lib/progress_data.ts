import {
  fetchAllChildrenHistory as fetchAllChildrenHistoryFromApi,
  fetchProfileHistory as fetchProfileHistoryFromApi,
  getCachedProfileHistory,
  appendCachedProfileHistory,
  LearningEvent,
} from "@/lib/history_api";
import { ChildProfile, getProfiles } from "@/lib/store";

function toProfileId(profileOrId: ChildProfile | string): string {
  return typeof profileOrId === "string" ? profileOrId : profileOrId.id;
}

export type { LearningEvent };

export function getProfileHistory(profileOrId: ChildProfile | string): LearningEvent[] {
  return getCachedProfileHistory(toProfileId(profileOrId));
}

export function recordProfileLearningEvent(profileOrId: ChildProfile | string, event: LearningEvent): LearningEvent[] {
  return appendCachedProfileHistory(toProfileId(profileOrId), event);
}

export function getAllChildrenHistory(profiles: ChildProfile[] = getProfiles()): Record<string, LearningEvent[]> {
  return Object.fromEntries(profiles.map((profile) => [profile.id, getCachedProfileHistory(profile.id)]));
}

export async function fetchProfileHistory(profileOrId: ChildProfile | string): Promise<LearningEvent[]> {
  return fetchProfileHistoryFromApi(toProfileId(profileOrId));
}

export async function fetchAllChildrenHistory(profiles: ChildProfile[]): Promise<Record<string, LearningEvent[]>> {
  return fetchAllChildrenHistoryFromApi(profiles);
}