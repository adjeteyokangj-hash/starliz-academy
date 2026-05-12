import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import {
  getLiveShopItem,
  levelForProfile,
  shopBodySchema,
  syncProfileFromDb,
} from "@/app/api/shop/_helpers";
import { applyWalletMutation, type WalletMetadata } from "@/lib/wallet_ledger";

async function recordFailedPurchase(
  childId: string,
  source: string,
  reason: string,
  balance: number,
  itemId?: string,
  itemName?: string,
  metadata?: WalletMetadata,
) {
  await prisma.walletTransaction.create({
    data: {
      childId,
      type: "failed",
      amount: 0,
      source,
      itemId,
      reason,
      balanceBefore: balance,
      balanceAfter: balance,
      metadataJson: JSON.stringify({ itemName, failureCode: reason, ...metadata }),
    },
  });
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  try {
    const body = shopBodySchema.parse(await request.json());
    const item = await getLiveShopItem(body.itemId);
    if (!item) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }

    const child = await prisma.childProfile.findFirst({
      where: { id: body.childId, parentId: session.userId, archived: false },
    });
    if (!child) {
      return NextResponse.json({ error: "Child not found." }, { status: 404 });
    }

    const profile = await syncProfileFromDb(body.childId);
    if (!profile) {
      return NextResponse.json({ error: "Child profile not found." }, { status: 404 });
    }

    const alreadyOwned = await prisma.childReward.findUnique({
      where: { childId_rewardId: { childId: body.childId, rewardId: body.itemId } },
    });

    if (alreadyOwned) {
      await recordFailedPurchase(body.childId, "store", "duplicate_item", profile.coins, body.itemId, item.name);
      return NextResponse.json({ error: `${item.name} is already owned.` }, { status: 400 });
    }

    const level = levelForProfile(profile);
    if (level < item.requiredLevel) {
      await recordFailedPurchase(body.childId, "store", "level_lock", profile.coins, body.itemId, item.name);
      return NextResponse.json({ error: `Reach Level ${item.requiredLevel} to unlock.` }, { status: 400 });
    }

    if (profile.ageYears < item.minAge) {
      await recordFailedPurchase(body.childId, "store", "age_lock", profile.coins, body.itemId, item.name);
      return NextResponse.json({ error: `This item unlocks from age ${item.minAge}+.` }, { status: 400 });
    }

    if (item.maxAge !== null && profile.ageYears > item.maxAge) {
      await recordFailedPurchase(body.childId, "store", "age_ceiling", profile.coins, body.itemId, item.name);
      return NextResponse.json({ error: `This item is only available up to age ${item.maxAge}.` }, { status: 400 });
    }

    if (item.stockState === "sold_out" || item.stockRemaining === 0) {
      await recordFailedPurchase(body.childId, "store", "sold_out", profile.coins, body.itemId, item.name, {
        stockState: "sold_out",
      });
      return NextResponse.json({ error: `${item.name} is currently sold out.` }, { status: 400 });
    }

    if (profile.coins < item.cost) {
      await recordFailedPurchase(body.childId, "store", "insufficient_coins", profile.coins, body.itemId, item.name);
      return NextResponse.json({ error: `You need ${item.cost - profile.coins} more coins.` }, { status: 400 });
    }

    if (item.approvalMode !== "none") {
      const requestId = randomUUID();
      await recordFailedPurchase(body.childId, "store", "approval_required", profile.coins, body.itemId, item.name, {
        requestId,
        approvalMode: item.approvalMode,
        approvalStatus: "pending",
        rewardType: item.rewardType,
        requestedAt: new Date().toISOString(),
        itemCategory: item.category,
        stockState: item.stockState,
      });
      return NextResponse.json(
        {
          ok: true,
          requiresApproval: true,
          requestId,
          itemId: body.itemId,
          message: `${item.name} request submitted for ${item.approvalMode} approval.`,
        },
        { status: 202 },
      );
    }

    const updatedProfile = {
      ...profile,
      inventory: profile.inventory.includes(item.id) ? profile.inventory : [...profile.inventory, item.id],
    };

    const purchasedChild = await prisma.$transaction(async (tx) => {
      await tx.childReward.create({
        data: {
          childId: body.childId,
          rewardId: body.itemId,
          isEquipped: false,
        },
      });
      const mutation = await applyWalletMutation(tx, {
        childId: body.childId,
        type: "spend",
        amount: -item.cost,
        source: "store",
        itemId: body.itemId,
        reason: `Purchased ${item.name}`,
        profileSnapshot: updatedProfile,
        metadata: {
          itemName: item.name,
          category: item.category,
          itemCategory: item.category,
          rewardType: item.rewardType,
          approvalMode: "none",
          stockState: item.stockState,
        },
      });
      await tx.progressRecord.create({
        data: {
          childId: body.childId,
          activityType: "store_purchase",
          activityName: "Store Purchase",
          starsEarned: 0,
          xpEarned: 0,
          coinsEarned: -item.cost,
          score: 1,
          correct: true,
          difficulty: level,
          notes: `Purchased ${item.id} (${item.name})`,
          completed: true,
        },
      });
      return mutation.child;
    });

    return NextResponse.json({
      ok: true,
      child: purchasedChild,
      itemId: body.itemId,
      message: `${item.name} unlocked!`,
    });
  } catch {
    return NextResponse.json({ error: "Invalid buy request." }, { status: 400 });
  }
}
