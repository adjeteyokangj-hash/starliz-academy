import { ChildProfile, saveProfile } from "@/lib/store";
import { applyPetOutcome } from "@/lib/pet_state";

type ShopItem = {
  id: string;
  name: string;
  cost: number;
  effect: "pet" | "theme" | "boost";
};

export const SHOP_ITEMS: ShopItem[] = [
  { id: "pet_hat", name: "Pet Hat", cost: 20, effect: "pet" },
  { id: "pet_ball", name: "Pet Ball", cost: 18, effect: "pet" },
  { id: "theme_ocean", name: "Ocean Theme", cost: 35, effect: "theme" },
  { id: "theme_space", name: "Space Theme", cost: 50, effect: "theme" },
  { id: "xp_boost", name: "XP Boost", cost: 25, effect: "boost" },
];

export function getCurrentWeekKey(date = new Date()): string {
  const first = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - first.getTime()) / 86400000);
  const week = Math.ceil((days + first.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${week}`;
}

export function claimWeeklyReward(profile: ChildProfile): { profile: ChildProfile; awarded: boolean } {
  const weekKey = getCurrentWeekKey();
  const already = profile.weeklyRewardClaimedAt === weekKey;
  if (already) return { profile, awarded: false };

  let updated: ChildProfile = {
    ...profile,
    stars: profile.stars + 20,
    xp: profile.xp + 50,
    coins: profile.coins + 25,
    streakShields: Math.min(3, profile.streakShields + 1),
    weeklyRewardClaimedAt: weekKey,
  };
  updated = applyPetOutcome(updated, "reward");
  saveProfile(updated);
  return { profile: updated, awarded: true };
}

export function buyShopItem(profile: ChildProfile, itemId: string): { profile: ChildProfile; ok: boolean; message: string } {
  const item = SHOP_ITEMS.find((s) => s.id === itemId);
  if (!item) return { profile, ok: false, message: "Item not found." };
  if (profile.inventory.includes(item.id)) return { profile, ok: false, message: "Item already owned." };
  if (profile.coins < item.cost) return { profile, ok: false, message: "Not enough coins." };

  let updated: ChildProfile = {
    ...profile,
    coins: profile.coins - item.cost,
    inventory: [...profile.inventory, item.id],
    petStage: item.effect === "pet" ? Math.min(5, profile.petStage + 1) : profile.petStage,
    theme: item.id === "theme_ocean" ? "ocean" : item.id === "theme_space" ? "space" : profile.theme,
    xp: item.id === "xp_boost" ? profile.xp + 40 : profile.xp,
  };
  updated = applyPetOutcome(updated, item.effect === "pet" ? "care" : "reward");

  saveProfile(updated);
  return { profile: updated, ok: true, message: item.effect === "theme" ? `${item.name} purchased and applied!` : `Purchased ${item.name}!` };
}

export function applyStreakProtection(profile: ChildProfile): ChildProfile {
  if (profile.streakShields <= 0) return profile;
  let updated: ChildProfile = {
    ...profile,
    streakShields: profile.streakShields - 1,
    weekStreak: Math.max(1, profile.weekStreak),
  };
  updated = applyPetOutcome(updated, "streak-saved");
  saveProfile(updated);
  return updated;
}
