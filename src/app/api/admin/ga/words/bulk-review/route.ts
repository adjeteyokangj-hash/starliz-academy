import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { updateGaWord } from "@/lib/ga-word-bank";

const bulkReviewSchema = z.object({
  wordIds: z.array(z.string().trim().min(1)).min(1),
  reviewStatus: z.enum(["Approved", "Rejected"]),
});

export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const body = bulkReviewSchema.parse(await request.json());
    const uniqueWordIds = [...new Set(body.wordIds)];
    const results = await Promise.all(uniqueWordIds.map(async (wordId) => {
      const updated = await updateGaWord(wordId, { reviewStatus: body.reviewStatus });
      if (updated) {
        await writeAuditLog({
          actorUserId: session.userId,
          action: body.reviewStatus === "Approved" ? "ga_word.bulk_approved" : "ga_word.bulk_rejected",
          entityType: "ga_word",
          entityId: updated.id,
          metadata: { englishWord: updated.englishWord, gaWord: updated.gaWord, reviewStatus: updated.reviewStatus },
        });
      }
      return updated;
    }));

    const updatedCount = results.filter(Boolean).length;
    const missingCount = results.length - updatedCount;

    return NextResponse.json({
      updatedCount,
      missingCount,
      reviewStatus: body.reviewStatus,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update Ga words." }, { status: 400 });
  }
}