import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { childPayloadSchema } from "@/lib/child_profile_schema";
import { applyWalletMutation } from "@/lib/wallet_ledger";
import { ChildProfile } from "@/lib/store";

const walletAwardSchema = z.object({
  childId: z.string().min(1),
  coins: z.number().int().default(0),
  xp: z.number().int().default(0),
  stars: z.number().int().default(0),
  source: z.string().min(1),
  note: z.string().trim().optional(),
  reason: z.string().trim().optional(),
  difficulty: z.number().int().min(1).max(10).optional(),
  activityName: z.string().trim().optional(),
  profile: childPayloadSchema.optional(),
});

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  try {
    const body = walletAwardSchema.parse(await request.json());
    const child = await prisma.childProfile.findFirst({
      where: { id: body.childId, parentId: parentScope.parentId, archived: false },
      select: { id: true },
    });
    if (!child) {
      return NextResponse.json({ error: "Child not found." }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const mutation = await applyWalletMutation(tx, {
        childId: body.childId,
        type: body.coins < 0 ? "spend" : "earn",
        amount: body.coins,
        source: body.source,
        reason: body.reason ?? body.note,
        xpDelta: body.xp,
        starsDelta: body.stars,
        profileSnapshot: body.profile as Partial<ChildProfile> | undefined,
        metadata: {
          subject: body.source,
          activityName: body.activityName,
        },
      });

      await tx.progressRecord.create({
        data: {
          childId: body.childId,
          activityType: body.source,
          activityName: body.activityName ?? "Wallet Reward",
          starsEarned: body.stars,
          xpEarned: body.xp,
          coinsEarned: body.coins,
          score: body.coins >= 0 ? 1 : 0,
          correct: body.coins >= 0,
          difficulty: body.difficulty,
          notes: body.note,
          accuracy: 100,
          completed: true,
        },
      });

      return mutation.child;
    });

    return NextResponse.json({ ok: true, child: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid wallet request.";
    const status = message === "Insufficient coins." ? 400 : 400;
    return NextResponse.json({ error: message || "Invalid wallet request." }, { status });
  }
}
