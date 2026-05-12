import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { fromDbRecord } from "@/lib/child_profile_db";
import { parseWalletMetadata, summarizeWalletTransactions } from "@/lib/wallet_ledger";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const { id } = await params;
  const child = await prisma.childProfile.findFirst({ where: { id, parentId: session.userId } });
  if (!child) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  const [progressRecords, rewards, questionHistory, walletTransactions] = await Promise.all([
    prisma.progressRecord.findMany({ where: { childId: id }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.childReward.findMany({ where: { childId: id }, include: { reward: true }, orderBy: { purchasedAt: "desc" } }),
    prisma.questionHistory.findMany({ where: { childId: id }, orderBy: { createdAt: "desc" }, take: 1000 }),
    prisma.walletTransaction.findMany({ where: { childId: id }, orderBy: { createdAt: "desc" }, take: 250 }),
  ]);

  const normalizedChild = fromDbRecord(child);
  const walletSummary = summarizeWalletTransactions(walletTransactions, child.coins);
  const purchaseHistory = walletTransactions
    .filter((entry) => entry.type === "spend" && Boolean(entry.itemId))
    .map((entry) => ({
      id: entry.id,
      itemId: entry.itemId,
      amount: Math.abs(entry.amount),
      source: entry.source,
      reason: entry.reason,
      createdAt: entry.createdAt.toISOString(),
      metadata: parseWalletMetadata(entry.metadataJson),
    }));

  const pendingRedemptions = walletTransactions
    .filter((entry) => entry.type === "failed" && entry.reason === "approval_required")
    .map((entry) => ({
      id: entry.id,
      itemId: entry.itemId,
      createdAt: entry.createdAt.toISOString(),
      metadata: parseWalletMetadata(entry.metadataJson),
    }))
    .filter((entry) => entry.metadata?.approvalStatus === "pending");

  return NextResponse.json({
    child: normalizedChild,
    progressRecords,
    history: progressRecords.map((record) => ({
      ts: record.createdAt.toISOString(),
      activity: record.activityType,
      score: record.score ?? 0,
      correct: record.correct ?? false,
      difficulty: record.difficulty ?? 1,
      notes: record.notes,
    })),
    rewards,
    questionHistory,
    walletSummary,
    purchaseHistory,
    pendingRedemptions,
    recentLevelDecisions: [...(normalizedChild.levelDecisions ?? [])].slice(-12).reverse(),
    recommendedNextActivity: normalizedChild.adaptive.nextBestActivity,
  });
}
