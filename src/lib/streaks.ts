import { ChildProfile, saveProfile } from "@/lib/store";

function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function diffDays(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00`);
  const to = new Date(`${toKey}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export function reconcileStreak(profile: ChildProfile, today = dayKey()): { profile: ChildProfile; status: string | null } {
  const previous = profile.lastActiveDay || today;
  const gap = diffDays(previous, today);

  if (gap <= 0) {
    return { profile, status: null };
  }

  let updated = { ...profile, lastActiveDay: today };

  if (gap === 1) {
    updated = { ...updated, weekStreak: profile.weekStreak + 1 };
    saveProfile(updated);
    return { profile: updated, status: "streak-continued" };
  }

  const missedDays = gap - 1;
  if (profile.streakShields >= missedDays) {
    updated = {
      ...updated,
      streakShields: profile.streakShields - missedDays,
      weekStreak: profile.weekStreak + 1,
    };
    saveProfile(updated);
    return { profile: updated, status: "shield-used" };
  }

  updated = {
    ...updated,
    weekStreak: 1,
  };
  saveProfile(updated);
  return { profile: updated, status: "streak-reset" };
}
