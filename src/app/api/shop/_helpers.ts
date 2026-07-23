import { z } from "zod";
import { prisma } from "@/lib/db";
import { fromDbRecord, toDbUpdateInput } from "@/lib/child_profile_db";
import { FLAT_REWARD_CATALOG, findRewardCatalogItem } from "@/lib/reward_catalog";
import { levelFromXp } from "@/lib/level_system";
import { VoiceStyle } from "@/lib/voice_options";
import { resolveStorePolicy } from "@/lib/store-policy";
import { enrichStoreItemsWithPolicy } from "@/lib/store_item_db";

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

type StoreItemRow = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price: number;
  minAge: number | null;
  maxAge: number | null;
  requiredLevel: number | null;
  rewardType?: string | null;
  approvalMode?: string | null;
  stockTotal?: number | null;
  isActive: boolean;
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

function getStockState(stockRemaining: number | null): StoreStockState {
  if (stockRemaining === null) return "unlimited";
  if (stockRemaining <= 0) return "sold_out";
  if (stockRemaining <= 3) return "low";
  return "available";
}

const CATALOG_IDS = new Set(FLAT_REWARD_CATALOG.map((item) => item.id));

function resolveOverlayStoreItem(
  rewardId: string,
  storeById: Map<string, StoreItemRow>,
): StoreItemRow | null {
  const direct = storeById.get(rewardId);
  if (direct) return direct;
  const adminStoreId = getAdminStoreIdFromRewardId(rewardId);
  if (!adminStoreId) return null;
  return storeById.get(adminStoreId) ?? null;
}

function buildLiveShopItem(
  item: {
    id: string;
    name: string;
    description: string;
    category: string;
    cost: number;
    unlockLevel: number;
  },
  storeItem: StoreItemRow | null,
  used: number,
): LiveShopItem {
  const category = normalizeShopCategory(item.category);
  const requiredLevel = storeItem?.requiredLevel ?? item.unlockLevel;
  const policy = resolveStorePolicy({
    rewardType: storeItem?.rewardType,
    approvalMode: storeItem?.approvalMode,
    stockTotal: storeItem?.stockTotal,
    description: storeItem?.description ?? item.description,
  });
  const stockRemaining = policy.stockTotal === null ? null : Math.max(0, policy.stockTotal - used);

  return {
    id: item.id,
    name: item.name,
    description: item.description,
    category,
    cost: item.cost,
    unlockLevel: requiredLevel,
    requiredLevel,
    minAge: storeItem?.minAge ?? getMinAgeFromDescription(item.description, category),
    maxAge: storeItem?.maxAge ?? getMaxAgeFromDescription(item.description),
    rewardType: policy.rewardType,
    approvalMode: policy.approvalMode,
    stockTotal: policy.stockTotal,
    stockRemaining,
    stockState: getStockState(stockRemaining),
  };
}

/** Upsert catalog SKUs into StoreItem with stable catalog ids (admin list + shop sync). */
export async function seedStoreItemsFromCatalog(): Promise<number> {
  let count = 0;
  for (const item of FLAT_REWARD_CATALOG) {
    const description = item.description ?? `${item.category} reward`;
    // Avoid rewardType/approvalMode/stockTotal on typed client until prisma generate refreshes.
    await prisma.storeItem.upsert({
      where: { id: item.id },
      create: {
        id: item.id,
        name: item.name,
        category: item.category,
        description,
        price: item.cost,
        requiredLevel: item.unlockLevel,
        isActive: true,
      },
      update: {
        name: item.name,
        category: item.category,
        price: item.cost,
        requiredLevel: item.unlockLevel,
      },
    });
    await prisma.$executeRawUnsafe(
      `UPDATE "StoreItem"
       SET "rewardType" = COALESCE("rewardType", 'digital'),
           "approvalMode" = COALESCE("approvalMode", 'none')
       WHERE "id" = $1`,
      item.id,
    );
    count += 1;
  }
  return count;
}

export async function ensureCatalogItemsInDb(): Promise<void> {
  await Promise.all(
    FLAT_REWARD_CATALOG.map((item) =>
      prisma.rewardItem.upsert({
        where: { id: item.id },
        update: {
          name: item.name,
          description: item.description ?? `${item.category} reward`,
          category: item.category,
          cost: item.cost,
          unlockLevel: item.unlockLevel,
          isActive: true,
        },
        create: {
          id: item.id,
          name: item.name,
          description: item.description ?? `${item.category} reward`,
          category: item.category,
          cost: item.cost,
          unlockLevel: item.unlockLevel,
          isActive: true,
        },
      }),
    ),
  );

  await seedStoreItemsFromCatalog();

  const adminStoreItems = await prisma.storeItem.findMany();
  const customStoreItems = adminStoreItems.filter((item) => !CATALOG_IDS.has(item.id));
  const customRewardIds = customStoreItems.map((item) => `admin-store-${item.id}`);

  // Deactivate orphan custom mirrors only (never touch catalog reward ids).
  const staleCustomRewards = await prisma.rewardItem.findMany({
    where: { id: { startsWith: "admin-store-" } },
    select: { id: true },
  });
  const keepCustom = new Set(customRewardIds);
  const staleIds = staleCustomRewards.map((row) => row.id).filter((id) => !keepCustom.has(id));
  if (staleIds.length) {
    await prisma.rewardItem.updateMany({
      where: { id: { in: staleIds } },
      data: { isActive: false },
    });
  }

  // Catalog-backed store rows update RewardItem in place (same id).
  await Promise.all(
    adminStoreItems
      .filter((item) => CATALOG_IDS.has(item.id))
      .map((item) => {
        const category = normalizeShopCategory(item.category);
        const description = item.description ?? `${category} reward`;
        return prisma.rewardItem.upsert({
          where: { id: item.id },
          update: {
            name: item.name,
            description,
            category,
            cost: item.price,
            unlockLevel: item.requiredLevel ?? getUnlockLevelFromDescription(item.description),
            isActive: item.isActive,
          },
          create: {
            id: item.id,
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

  // Legacy/custom cuid store rows keep admin-store-* mirrors.
  await Promise.all(
    customStoreItems.map((item) => {
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
  const enrichedStoreItems = await enrichStoreItemsWithPolicy(adminStoreItems);
  const storeById = new Map(enrichedStoreItems.map((item) => [item.id, item as StoreItemRow]));
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
    const storeItem = resolveOverlayStoreItem(item.id, storeById);
    return buildLiveShopItem(item, storeItem, purchaseCountMap.get(item.id) ?? 0);
  });
}

export async function getLiveShopItem(itemId: string): Promise<LiveShopItem | null> {
  await ensureCatalogItemsInDb();
  const item = await prisma.rewardItem.findFirst({ where: { id: itemId, isActive: true } });
  if (!item) return null;

  let storeItem = await prisma.storeItem.findUnique({ where: { id: item.id } });
  if (!storeItem) {
    const adminStoreId = getAdminStoreIdFromRewardId(item.id);
    if (adminStoreId) {
      storeItem = await prisma.storeItem.findUnique({ where: { id: adminStoreId } });
    }
  }

  const enriched = storeItem ? (await enrichStoreItemsWithPolicy([storeItem]))[0] : null;
  const used = await prisma.childReward.count({ where: { rewardId: item.id } });
  return buildLiveShopItem(item, enriched as StoreItemRow | null, used);
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
