import { Prisma, WalletTransaction } from "@prisma/client";
import { ChildProfile } from "@/lib/store";
import { fromDbRecord, toDbUpdateInput, withChildDefaults } from "@/lib/child_profile_db";
import { levelFromXp } from "@/lib/level_system";

export type WalletEntryType = "earn" | "spend" | "failed" | "equip" | "manual_adjustment";

export type WalletMetadata = {
  itemName?: string;
  category?: string;
  subject?: string;
  activityName?: string;
  itemCategory?: string;
  failureCode?: string;
  requestId?: string;
  approvalMode?: "none" | "parent" | "admin";
  approvalStatus?: "pending" | "approved" | "rejected";
  rewardType?: "digital" | "physical";
  stockState?: "unlimited" | "available" | "low" | "sold_out";
  requestedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
};

export type WalletMutationInput = {
  childId: string;
  type: WalletEntryType;
  amount: number;
  source: string;
  reason?: string;
  itemId?: string;
  starsDelta?: number;
  xpDelta?: number;
  profileSnapshot?: Partial<ChildProfile>;
  metadata?: WalletMetadata;
};

export type WalletSummary = {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  recentActivity: Array<{
    id: string;
    type: string;
    amount: number;
    source: string;
    reason: string | null;
    itemId: string | null;
    balanceBefore: number;
    balanceAfter: number;
    createdAt: string;
    metadata: WalletMetadata | null;
  }>;
  earnedBySource: Array<{ source: string; amount: number }>;
  spentByItem: Array<{ itemId: string; amount: number; count: number; itemName: string | null }>;
};

export function parseWalletMetadata(metadataJson: string | null): WalletMetadata | null {
  if (!metadataJson) return null;
  try {
    return JSON.parse(metadataJson) as WalletMetadata;
  } catch {
    return null;
  }
}

export function summarizeWalletTransactions(
  transactions: WalletTransaction[],
  currentBalance: number,
): WalletSummary {
  const totalEarned = transactions
    .filter((entry) => entry.type === "earn" || (entry.type === "manual_adjustment" && entry.amount > 0))
    .reduce((sum, entry) => sum + Math.max(0, entry.amount), 0);

  const totalSpent = transactions
    .filter((entry) => entry.type === "spend" || (entry.type === "manual_adjustment" && entry.amount < 0))
    .reduce((sum, entry) => sum + Math.abs(entry.amount), 0);

  const earnedBySourceMap = new Map<string, number>();
  const spentByItemMap = new Map<string, { amount: number; count: number; itemName: string | null }>();

  for (const entry of transactions) {
    const metadata = parseWalletMetadata(entry.metadataJson);
    if (entry.type === "earn" && entry.amount > 0) {
      earnedBySourceMap.set(entry.source, (earnedBySourceMap.get(entry.source) ?? 0) + entry.amount);
    }
    if (entry.type === "spend" && entry.itemId) {
      const existing = spentByItemMap.get(entry.itemId) ?? {
        amount: 0,
        count: 0,
        itemName: metadata?.itemName ?? null,
      };
      existing.amount += Math.abs(entry.amount);
      existing.count += 1;
      existing.itemName = existing.itemName ?? metadata?.itemName ?? null;
      spentByItemMap.set(entry.itemId, existing);
    }
  }

  return {
    balance: currentBalance,
    totalEarned,
    totalSpent,
    recentActivity: transactions.slice(0, 25).map((entry) => ({
      id: entry.id,
      type: entry.type,
      amount: entry.amount,
      source: entry.source,
      reason: entry.reason,
      itemId: entry.itemId,
      balanceBefore: entry.balanceBefore,
      balanceAfter: entry.balanceAfter,
      createdAt: entry.createdAt.toISOString(),
      metadata: parseWalletMetadata(entry.metadataJson),
    })),
    earnedBySource: Array.from(earnedBySourceMap.entries())
      .map(([source, amount]) => ({ source, amount }))
      .sort((left, right) => right.amount - left.amount),
    spentByItem: Array.from(spentByItemMap.entries())
      .map(([itemId, value]) => ({ itemId, amount: value.amount, count: value.count, itemName: value.itemName }))
      .sort((left, right) => right.amount - left.amount),
  };
}

export async function applyWalletMutation(
  tx: Prisma.TransactionClient,
  input: WalletMutationInput,
): Promise<{ child: ChildProfile; entry: WalletTransaction }> {
  const childRow = await tx.childProfile.findUnique({ where: { id: input.childId } });
  if (!childRow) {
    throw new Error("Child not found.");
  }

  const currentProfile = fromDbRecord(childRow);
  const balanceBefore = childRow.coins;
  const xpBefore = childRow.xp;
  const starsBefore = childRow.stars;

  const nextBalance = input.type === "failed"
    ? balanceBefore
    : balanceBefore + input.amount;

  if (nextBalance < 0) {
    throw new Error("Insufficient coins.");
  }

  const nextXp = input.type === "failed" ? xpBefore : Math.max(0, xpBefore + (input.xpDelta ?? 0));
  const nextStars = input.type === "failed" ? starsBefore : Math.max(0, starsBefore + (input.starsDelta ?? 0));

  const snapshot = input.profileSnapshot
    ? withChildDefaults({
        ...input.profileSnapshot,
        id: currentProfile.id,
        coins: nextBalance,
        xp: nextXp,
        stars: nextStars,
      })
    : withChildDefaults({
        ...currentProfile,
        coins: nextBalance,
        xp: nextXp,
        stars: nextStars,
      });

  const persistedRow = input.type === "failed"
    ? childRow
    : await tx.childProfile.update({
        where: { id: input.childId },
        data: {
          ...toDbUpdateInput(snapshot),
          coins: nextBalance,
          xp: nextXp,
          stars: nextStars,
          level: levelFromXp(nextXp),
        },
      });

  const entry = await tx.walletTransaction.create({
    data: {
      childId: input.childId,
      type: input.type,
      amount: input.amount,
      source: input.source,
      itemId: input.itemId,
      reason: input.reason,
      balanceBefore,
      balanceAfter: input.type === "failed" ? balanceBefore : nextBalance,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });

  return {
    child: input.type === "failed" ? currentProfile : fromDbRecord(persistedRow),
    entry,
  };
}
