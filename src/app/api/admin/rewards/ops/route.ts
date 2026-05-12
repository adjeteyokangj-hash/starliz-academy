import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { applyWalletMutation, parseWalletMetadata } from "@/lib/wallet_ledger";
import { getLiveShopItem } from "@/app/api/shop/_helpers";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("award_bonus"),
    childId: z.string().min(1),
    amount: z.number().int().positive(),
    reason: z.string().trim().min(3),
  }),
  z.object({
    action: z.literal("review_redemption"),
    requestId: z.string().min(1),
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().optional(),
  }),
]);

type PendingRequest = {
  transactionId: string;
  requestId: string;
  childId: string;
  childName: string;
  itemId: string;
  itemName: string;
  itemCategory: string;
  approvalMode: "none" | "parent" | "admin";
  rewardType: "digital" | "physical";
  balanceBefore: number;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
  reviewedAt: string | null;
  reviewedBy: string | null;
};

function asPendingRequest(row: {
  id: string;
  childId: string;
  itemId: string | null;
  balanceBefore: number;
  createdAt: Date;
  metadataJson: string | null;
  child: { name: string };
}): PendingRequest | null {
  const metadata = parseWalletMetadata(row.metadataJson);
  if (!metadata?.requestId || !row.itemId) return null;
  const status = metadata.approvalStatus ?? "pending";
  if (status !== "pending" && status !== "approved" && status !== "rejected") return null;
  return {
    transactionId: row.id,
    requestId: metadata.requestId,
    childId: row.childId,
    childName: row.child.name,
    itemId: row.itemId,
    itemName: metadata.itemName ?? row.itemId,
    itemCategory: metadata.itemCategory ?? "unknown",
    approvalMode: metadata.approvalMode ?? "none",
    rewardType: metadata.rewardType ?? "digital",
    balanceBefore: row.balanceBefore,
    requestedAt: metadata.requestedAt ?? row.createdAt.toISOString(),
    status,
    reviewedAt: metadata.reviewedAt ?? null,
    reviewedBy: metadata.reviewedBy ?? null,
  };
}

async function listPendingRequests() {
  const rows = await prisma.walletTransaction.findMany({
    where: {
      type: "failed",
      source: "store",
      reason: "approval_required",
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      childId: true,
      itemId: true,
      balanceBefore: true,
      createdAt: true,
      metadataJson: true,
      child: { select: { name: true } },
    },
  });

  return rows
    .map(asPendingRequest)
    .filter((entry): entry is PendingRequest => Boolean(entry));
}

export async function GET() {
  const { session, response } = await requireAdminPermission("content:view");
  if (!session) return response;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [rewardRuleCount, activeRewardRuleCount, storeItemCount, todayAwards, todayRedemptions, pendingRequests, topStudents] =
    await Promise.all([
      prisma.rewardRule.count(),
      prisma.rewardRule.count({ where: { isActive: true } }),
      prisma.storeItem.count(),
      prisma.walletTransaction.count({
        where: { type: "earn", createdAt: { gte: startOfDay } },
      }),
      prisma.walletTransaction.count({
        where: { type: "spend", source: "store", createdAt: { gte: startOfDay } },
      }),
      listPendingRequests(),
      prisma.childProfile.findMany({
        orderBy: [{ coins: "desc" }, { xp: "desc" }],
        take: 8,
        select: {
          id: true,
          name: true,
          coins: true,
          xp: true,
          parent: { select: { id: true, email: true } },
        },
      }),
    ]);

  const recentLedger = await prisma.walletTransaction.findMany({
    where: {
      OR: [{ source: "store" }, { source: { startsWith: "admin" } }, { source: "reward_rule" }],
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: {
      id: true,
      childId: true,
      type: true,
      amount: true,
      source: true,
      reason: true,
      balanceAfter: true,
      itemId: true,
      createdAt: true,
      metadataJson: true,
      child: { select: { name: true } },
    },
  });

  return NextResponse.json({
    metrics: {
      rewardRules: rewardRuleCount,
      activeRewardRules: activeRewardRuleCount,
      storeItems: storeItemCount,
      todayAwards,
      todayRedemptions,
      pendingApprovals: pendingRequests.filter((entry) => entry.status === "pending").length,
    },
    pendingRequests,
    topStudents: topStudents.map((student) => ({
      id: student.id,
      name: student.name,
      coins: student.coins,
      xp: student.xp,
      parentEmail: student.parent.email,
    })),
    recentLedger: recentLedger.map((entry) => ({
      id: entry.id,
      childId: entry.childId,
      childName: entry.child.name,
      type: entry.type,
      amount: entry.amount,
      source: entry.source,
      reason: entry.reason,
      balanceAfter: entry.balanceAfter,
      itemId: entry.itemId,
      createdAt: entry.createdAt.toISOString(),
      metadata: parseWalletMetadata(entry.metadataJson),
    })),
  });
}

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("content:edit");
  if (!session) return response;

  try {
    const body = actionSchema.parse(await request.json());

    if (body.action === "award_bonus") {
      const child = await prisma.childProfile.findUnique({
        where: { id: body.childId },
        select: { id: true },
      });
      if (!child) {
        return NextResponse.json({ error: "Student not found." }, { status: 404 });
      }

      const mutation = await prisma.$transaction((tx) =>
        applyWalletMutation(tx, {
          childId: body.childId,
          type: "earn",
          amount: body.amount,
          source: "admin_bonus",
          reason: body.reason,
          metadata: {
            activityName: "Admin bonus",
            reviewedBy: session.userId,
          },
        }),
      );

      return NextResponse.json({ ok: true, newBalance: mutation.child.coins });
    }

    const pendingRows = await prisma.walletTransaction.findMany({
      where: {
        type: "failed",
        source: "store",
        reason: "approval_required",
        metadataJson: { contains: body.requestId },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        childId: true,
        itemId: true,
        metadataJson: true,
      },
    });

    const target = pendingRows.find((row) => parseWalletMetadata(row.metadataJson)?.requestId === body.requestId);
    if (!target || !target.itemId) {
      return NextResponse.json({ error: "Redemption request not found." }, { status: 404 });
    }
    const targetItemId = target.itemId;

    const currentMetadata = parseWalletMetadata(target.metadataJson) ?? {};
    const currentStatus = currentMetadata.approvalStatus ?? "pending";
    if (currentStatus !== "pending") {
      return NextResponse.json({ error: "Request has already been reviewed." }, { status: 400 });
    }

    if (body.decision === "reject") {
      await prisma.walletTransaction.update({
        where: { id: target.id },
        data: {
          metadataJson: JSON.stringify({
            ...currentMetadata,
            approvalStatus: "rejected",
            reviewedAt: new Date().toISOString(),
            reviewedBy: session.userId,
            reviewNote: body.note ?? null,
          }),
        },
      });
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    const item = await getLiveShopItem(targetItemId);
    if (!item) {
      return NextResponse.json({ error: "Store item no longer available." }, { status: 400 });
    }
    if (item.stockState === "sold_out" || item.stockRemaining === 0) {
      return NextResponse.json({ error: "Store item is sold out." }, { status: 400 });
    }

    const child = await prisma.childProfile.findUnique({
      where: { id: target.childId },
      select: { id: true, coins: true, snapshotJson: true, name: true },
    });
    if (!child) {
      return NextResponse.json({ error: "Student no longer exists." }, { status: 404 });
    }

    const owned = await prisma.childReward.findUnique({
      where: { childId_rewardId: { childId: target.childId, rewardId: target.itemId } },
    });
    if (owned) {
      return NextResponse.json({ error: "Student already owns this reward." }, { status: 400 });
    }

    if (child.coins < item.cost) {
      return NextResponse.json({ error: "Student no longer has enough coins." }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.childReward.create({
        data: {
          childId: target.childId,
          rewardId: targetItemId,
          isEquipped: false,
        },
      });

      await applyWalletMutation(tx, {
        childId: target.childId,
        type: "spend",
        amount: -item.cost,
        source: "store",
        itemId: targetItemId,
        reason: `Approved redemption: ${item.name}`,
        metadata: {
          itemName: item.name,
          itemCategory: item.category,
          approvalMode: item.approvalMode,
          approvalStatus: "approved",
          requestId: body.requestId,
          reviewedBy: session.userId,
          reviewedAt: new Date().toISOString(),
          reviewNote: body.note?.trim() || undefined,
          rewardType: item.rewardType,
        },
      });

      await tx.walletTransaction.update({
        where: { id: target.id },
        data: {
          metadataJson: JSON.stringify({
            ...currentMetadata,
            approvalStatus: "approved",
            reviewedAt: new Date().toISOString(),
            reviewedBy: session.userId,
            reviewNote: body.note ?? null,
          }),
        },
      });

      await tx.progressRecord.create({
        data: {
          childId: target.childId,
          activityType: "store_approval",
          activityName: "Store Approval",
          starsEarned: 0,
          xpEarned: 0,
          coinsEarned: -item.cost,
          score: 1,
          correct: true,
          difficulty: 1,
          notes: `Approved redemption ${item.name}`,
          completed: true,
        },
      });
    });

    return NextResponse.json({ ok: true, status: "approved" });
  } catch {
    return NextResponse.json({ error: "Invalid rewards operation payload." }, { status: 400 });
  }
}
