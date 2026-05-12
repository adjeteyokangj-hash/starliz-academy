import { z } from "zod";
import { prisma } from "@/lib/db";
import { fromDbRecord, toDbUpdateInput } from "@/lib/child_profile_db";
import { FLAT_REWARD_CATALOG, findRewardCatalogItem } from "@/lib/reward_catalog";
import { levelFromXp } from "@/lib/level_system";
import { VoiceStyle } from "@/lib/voice_options";

type ShopCategory = "themes" | "avatars" | "voices" | "pet" | "boosts" | "badges";

type StoreApprovalMode = "none" | "parent" | "admin";
type StoreRewardType = "digital" | "physical";
type StoreStockState = "unlimited" | "available" | "low" | "sold_out";

export type LiveShopItem = {
  id: string;
  name: string;
  description: string;
  category: ShopCategory;
  cost: number;
  unlockLevel: number;
  requiredLevel: number;
  minAge: number;
  maxAge: number | null;
  rewardType: StoreRewardType;
  approvalMode: StoreApprovalMode;
  stockTotal: number | null;
  stockRemaining: number | null;
  stockState: StoreStockState;
};

export const shopBodySchema = z.object({
  childId: z.string().min(1),
  itemId: z.string().min(1),
});

export function normalizeShopCategory(category: string): ShopCategory {
  const normalized = category.trim().toLowerCase();
  if (["theme", "themes"].includes(normalized)) return "themes";
  if (["avatar", "avatars", "outfit", "outfits"].includes(normalized)) return "avatars";
  if (["voice", "voices", "voice pack", "voice packs"].includes(normalized)) return "voices";
  if (["pet", "pets", "pet world"].includes(normalized)) return "pet";
  if (["boost", "boosts", "learning boost", "learning boosts"].includes(normalized)) return "boosts";
  if (["badge", "badges"].includes(normalized)) return "badges";
  return "themes";
}

function getUnlockLevelFromDescription(description: string | null | undefined): number {
  const match = description?.match(/(?:unlock(?:s)?\s*(?:at)?\s*)?level\s*:?\s*(\d+)/i);
  return Math.max(1, Number(match?.[1] ?? 1));
}

function getMinAgeFromDescription(description: string | null | undefined, category: ShopCategory): number {
  const match = description?.match(/age\s*(?:\+|>=|:)?\s*(\d+)/i);
  if (match) {
    return Math.max(5, Number(match[1]));
  }
  if (category === "boosts") return 7;
  return 5;
}

function getMaxAgeFromDescription(description: string | null | undefined): number | null {
  const match = description?.match(/max\s*age\s*(?:<=|:)?\s*(\d+)/i);
  return match ? Math.max(5, Number(match[1])) : null;
}

function getAdminStoreIdFromRewardId(rewardId: string): string | null {
  return rewardId.startsWith("admin-store-") ? rewardId.replace(/^admin-store-/, "") : null;
}

function parseStorePolicyFromDescription(description: string | null | undefined): {
  rewardType: StoreRewardType;
  approvalMode: StoreApprovalMode;
  stockTotal: number | null;
} {
  const text = (description ?? "").toLowerCase();
  const typeMatch = text.match(/type\s*:\s*(digital|physical)/i);
  const approvalMatch = text.match(/approval\s*:\s*(none|parent|admin)/i);
  const stockMatch = text.match(/stock\s*:\s*(\d+)/i);

  return {
    rewardType: (typeMatch?.[1] as StoreRewardType | undefined) ?? "digital",
    approvalMode: (approvalMatch?.[1] as StoreApprovalMode | undefined) ?? "none",
    stockTotal: stockMatch ? Math.max(0, Number(stockMatch[1])) : null,
  };
}

function getStockState(stockRemaining: number | null): StoreStockState {
  if (stockRemaining === null) return "unlimited";
  if (stockRemaining <= 0) return "sold_out";
  if (stockRemaining <= 3) return "low";
  return "available";
}

export async function ensureCatalogItemsInDb(): Promise<void> {
  await Promise.all(
    FLAT_REWARD_CATALOG.map((item) =>
      prisma.rewardItem.upsert({
        where: { id: item.id },
        update: {
          name: item.name,
          description: `${item.category} reward`,
          category: item.category,
          cost: item.cost,
          unlockLevel: item.unlockLevel,
          isActive: true,
        },
        create: {
          id: item.id,
          name: item.name,
          description: `${item.category} reward`,
          category: item.category,
          cost: item.cost,
          unlockLevel: item.unlockLevel,
          isActive: true,
        },
      })
    )
  );

  const adminStoreItems = await prisma.storeItem.findMany();
  await prisma.rewardItem.updateMany({
    where: { id: { startsWith: "admin-store-" } },
    data: { isActive: false },
  });
  await Promise.all(
    adminStoreItems.map((item) => {
      const rewardId = `admin-store-${item.id}`;
      const category = normalizeShopCategory(item.category);
      const description = item.description ?? `Admin store ${category} reward`;
      return prisma.rewardItem.upsert({
        where: { id: rewardId },
        update: {
          name: item.name,
          description,
          category,
          cost: item.price,
          unlockLevel: item.requiredLevel ?? getUnlockLevelFromDescription(item.description),
          isActive: item.isActive,
        },
        create: {
          id: rewardId,
          name: item.name,
          description,
          category,
          cost: item.price,
          unlockLevel: item.requiredLevel ?? getUnlockLevelFromDescription(item.description),
          isActive: item.isActive,
        },
      });
    }),
  );
}

export async function getLiveShopItems(): Promise<LiveShopItem[]> {
  await ensureCatalogItemsInDb();
  const [items, adminStoreItems] = await Promise.all([
    prisma.rewardItem.findMany({
      where: { isActive: true },
      orderBy: [{ unlockLevel: "asc" }, { cost: "asc" }, { name: "asc" }],
    }),
    prisma.storeItem.findMany(),
  ]);
  const adminStoreMap = new Map(adminStoreItems.map((item) => [item.id, item]));
  const rewardIds = items.map((item) => item.id);
  const purchaseCounts = rewardIds.length
    ? await prisma.childReward.groupBy({
        by: ["rewardId"],
        where: { rewardId: { in: rewardIds } },
        _count: { rewardId: true },
      })
    : [];
  const purchaseCountMap = new Map(purchaseCounts.map((entry) => [entry.rewardId, entry._count.rewardId]));

  return items.map((item) => {
    const adminStoreId = getAdminStoreIdFromRewardId(item.id);
    const adminStoreItem = adminStoreId ? adminStoreMap.get(adminStoreId) ?? null : null;
    const category = normalizeShopCategory(item.category);
    const requiredLevel = adminStoreItem?.requiredLevel ?? item.unlockLevel;
    const minAge = adminStoreItem?.minAge ?? getMinAgeFromDescription(item.description, category);
    const maxAge = adminStoreItem?.maxAge ?? getMaxAgeFromDescription(item.description);
    const policy = parseStorePolicyFromDescription(adminStoreItem?.description ?? item.description);
    const used = purchaseCountMap.get(item.id) ?? 0;
    const stockRemaining = policy.stockTotal === null ? null : Math.max(0, policy.stockTotal - used);

    return {
      id: item.id,
      name: item.name,
      description: item.description,
      category,
      cost: item.cost,
      unlockLevel: requiredLevel,
      requiredLevel,
      minAge,
      maxAge,
      rewardType: policy.rewardType,
      approvalMode: policy.approvalMode,
      stockTotal: policy.stockTotal,
      stockRemaining,
      stockState: getStockState(stockRemaining),
    };
  });
}

export async function getLiveShopItem(itemId: string): Promise<LiveShopItem | null> {
  await ensureCatalogItemsInDb();
  const item = await prisma.rewardItem.findFirst({ where: { id: itemId, isActive: true } });
  if (!item) return null;
  const adminStoreId = getAdminStoreIdFromRewardId(item.id);
  const adminStoreItem = adminStoreId ? await prisma.storeItem.findUnique({ where: { id: adminStoreId } }) : null;
  const category = normalizeShopCategory(item.category);
  const requiredLevel = adminStoreItem?.requiredLevel ?? item.unlockLevel;
  const policy = parseStorePolicyFromDescription(adminStoreItem?.description ?? item.description);
  const used = await prisma.childReward.count({ where: { rewardId: item.id } });
  const stockRemaining = policy.stockTotal === null ? null : Math.max(0, policy.stockTotal - used);
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    category,
    cost: item.cost,
    unlockLevel: requiredLevel,
    requiredLevel,
    minAge: adminStoreItem?.minAge ?? getMinAgeFromDescription(item.description, category),
    maxAge: adminStoreItem?.maxAge ?? getMaxAgeFromDescription(item.description),
    rewardType: policy.rewardType,
    approvalMode: policy.approvalMode,
    stockTotal: policy.stockTotal,
    stockRemaining,
    stockState: getStockState(stockRemaining),
  };
}

export function applyEquippedItemToProfile(profile: ReturnType<typeof fromDbRecord>, itemId: string, categoryHint?: string): ReturnType<typeof fromDbRecord> {
  const item = findRewardCatalogItem(itemId);
  const category = item?.category ?? normalizeShopCategory(categoryHint ?? "");

  if (category === "themes") {
    const themeMap: Partial<Record<string, ReturnType<typeof fromDbRecord>["theme"]>> = {
      "theme-rainbow": "rainbow",
      "theme-sunshine": "sunshine",
      "theme-night-sky": "night-sky",
      "theme-space": "space",
      "theme-candy": "candy",
      "theme-princess": "princess",
      "theme-dinosaur": "dinosaur",
      "theme-jungle": "jungle",
      "theme-football": "football",
      "theme-ocean": "ocean",
      "theme-galaxy-pro": "galaxy-pro",
    };
    const nextTheme = themeMap[itemId] ?? "default";
    return { ...profile, theme: nextTheme };
  }

  if (category === "avatars") {
    if (itemId === "avatar-star-student") return { ...profile, avatar: "🧑‍🎓" };
    if (itemId === "avatar-unicorn") return { ...profile, avatar: "🦄" };
    if (itemId === "avatar-robot") return { ...profile, avatar: "🤖" };
    if (itemId === "avatar-astronaut") return { ...profile, avatar: "👨‍🚀" };
    if (itemId === "avatar-dragon") return { ...profile, avatar: "🐉" };
    if (itemId === "avatar-book-hero") return { ...profile, avatar: "📚" };
    if (itemId === "outfit-superhero-cape") return { ...profile, avatar: "🦸" };
    if (itemId === "outfit-crown") return { ...profile, avatar: "👑" };
    if (itemId === "outfit-wizard-hat") return { ...profile, avatar: "🧙" };
    return profile;
  }

  if (category === "voices") {
    const voiceMap: Record<string, VoiceStyle> = {
      "voice-friendly-coach": "friendly_coach",
      "voice-cheerful-kid": "cheerful_kid",
      "voice-story-reader": "storyteller",
      "voice-gentle-reader": "calm_reader",
      "voice-funny-robot": "fun_robot",
      "voice-adventure-guide": "little_helper",
      "voice-superhero-coach": "superhero_coach",
      "voice-calm-helper": "calm_reader",
      "voice-magic-fairy": "soft_encourager",
      "voice-premium-storyteller": "storyteller",
      "voice-accent-american": "accent_american",
      "voice-accent-british": "accent_british",
      "voice-accent-irish": "accent_irish",
      "voice-accent-south-african": "accent_south_african",
      "voice-accent-australian": "accent_australian",
      "voice-accent-canadian": "accent_canadian",
      "voice-accent-indian": "accent_indian",
      "voice-accent-new-zealand": "accent_new_zealand",
    };
    const style = voiceMap[itemId] ?? profile.settings.voiceStyle;
    return { ...profile, settings: { ...profile.settings, voiceStyle: style } };
  }

  if (category === "pet") {
    return { ...profile, petEmotion: "excited" };
  }

  if (category === "boosts") {
    if (itemId === "boost-streak-shield") {
      return { ...profile, streakShields: profile.streakShields + 1 };
    }
    if (itemId === "boost-hint-token-x3") {
      return { ...profile, coins: profile.coins + 5 };
    }
    if (itemId === "boost-bonus-coin-round") {
      return { ...profile, coins: profile.coins + 10 };
    }
    if (itemId === "boost-double-xp-10m") {
      return { ...profile, xp: profile.xp + 50 };
    }
    return profile;
  }

  return profile;
}

export async function getOwnedMap(childId: string): Promise<Map<string, boolean>> {
  const rewards = await prisma.childReward.findMany({ where: { childId } });
  return new Map(rewards.map((entry) => [entry.rewardId, true]));
}

export async function getEquippedMap(childId: string): Promise<Map<string, boolean>> {
  const rewards = await prisma.childReward.findMany({ where: { childId, isEquipped: true } });
  return new Map(rewards.map((entry) => [entry.rewardId, true]));
}

export async function syncProfileFromDb(childId: string) {
  const row = await prisma.childProfile.findUnique({ where: { id: childId } });
  return row ? fromDbRecord(row) : null;
}

export async function persistProfile(childId: string, profile: ReturnType<typeof fromDbRecord>) {
  await prisma.childProfile.update({
    where: { id: childId },
    data: toDbUpdateInput(profile),
  });
}

export function levelForProfile(profile: ReturnType<typeof fromDbRecord>): number {
  return levelFromXp(profile.xp);
}
