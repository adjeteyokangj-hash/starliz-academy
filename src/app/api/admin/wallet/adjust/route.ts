import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { applyWalletMutation } from "@/lib/wallet_ledger";

const adjustSchema = z.object({
  childId: z.string().min(1),
  amount: z.number().int().min(-10000).max(10000).refine((n) => n !== 0, {
    message: "Amount must be non-zero.",
  }),
  reason: z.string().trim().min(1).max(500),
});

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = adjustSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 422 });
  }

  const { childId, amount, reason } = parsed.data;

  // Ensure child exists and is not archived
  const child = await prisma.childProfile.findFirst({
    where: { id: childId, archived: false },
    select: { id: true, name: true, coins: true },
  });
  if (!child) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  // Guard against balance going negative
  if (child.coins + amount < 0) {
    return NextResponse.json(
      { error: `Cannot deduct ${Math.abs(amount)} coins; balance is only ${child.coins}.` },
      { status: 422 },
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      return applyWalletMutation(tx, {
        childId,
        type: "manual_adjustment",
        amount,
        source: "admin",
        reason,
        metadata: {
          subject: "admin_adjustment",
        },
      });
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "wallet.manual_adjustment",
      entityType: "child_profile",
      entityId: childId,
      metadata: { amount, reason, balanceAfter: result.entry.balanceAfter },
    });

    return NextResponse.json({
      success: true,
      entry: {
        id: result.entry.id,
        amount: result.entry.amount,
        balanceBefore: result.entry.balanceBefore,
        balanceAfter: result.entry.balanceAfter,
        reason: result.entry.reason,
        createdAt: result.entry.createdAt.toISOString(),
      },
      newBalance: result.child.coins,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Adjustment failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
