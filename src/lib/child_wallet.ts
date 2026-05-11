import { ChildProfile, saveProfile } from "@/lib/store";

export type RewardSource =
  | "spelling"
  | "reading"
  | "math"
  | "recall_test"
  | "boss_test"
  | "bonus"
  | "store"
  | "store_purchase"
  | "manual_adjustment";

export async function awardChildRewards(params: {
  childId: string;
  source: RewardSource;
  coins?: number;
  xp?: number;
  stars?: number;
  note?: string;
  reason?: string;
  difficulty?: number;
  activityName?: string;
  profile?: ChildProfile;
}): Promise<ChildProfile> {
  const response = await fetch("/api/wallet/award", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      childId: params.childId,
      coins: params.coins ?? 0,
      xp: params.xp ?? 0,
      stars: params.stars ?? 0,
      source: params.source,
      note: params.note,
      reason: params.reason,
      difficulty: params.difficulty,
      activityName: params.activityName,
      profile: params.profile,
    }),
  });

  const payload = await response.json() as { child?: ChildProfile; error?: string };
  if (!response.ok || !payload.child) {
    throw new Error(payload.error ?? "Could not update wallet.");
  }

  saveProfile(payload.child);
  return payload.child;
}
