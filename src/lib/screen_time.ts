import { ChildProfile, saveProfile } from "@/lib/store";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function trackUsage(profile: ChildProfile, minutes = 1): ChildProfile {
  const day = todayKey();
  const resetNeeded = profile.usageDayKey !== day;

  const usageToday = resetNeeded ? minutes : profile.usageTodayMinutes + minutes;
  const updated: ChildProfile = {
    ...profile,
    usageDayKey: day,
    usageTodayMinutes: usageToday,
    lastActiveDay: day,
  };

  saveProfile(updated);
  return updated;
}

export function isUsageLocked(profile: ChildProfile): boolean {
  return profile.usageTodayMinutes >= profile.usageLimitMinutes;
}
