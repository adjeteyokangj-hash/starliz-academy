import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { createGaAudioAsset, getGaAudioDashboardMetrics, isGaAudioSchemaNotReadyError, serializeGaAudioAsset } from "@/lib/ga-audio";

const createAudioSchema = z.object({
  wordId: z.string().trim().optional().nullable(),
  lessonId: z.string().trim().optional().nullable(),
  phraseText: z.string().trim().optional().nullable(),
  songId: z.string().trim().optional().nullable(),
  letterKey: z.string().trim().optional().nullable(),
  soundKey: z.string().trim().optional().nullable(),
  audioUrl: z.string().trim().min(1),
  audioStorageKey: z.string().trim().optional().nullable(),
  sourceType: z.string().trim().min(1),
  reviewStatus: z.string().trim().optional().nullable(),
  approvalStatus: z.string().trim().optional().nullable(),
  confidenceLevel: z.number().int().optional().nullable(),
  pronunciationNote: z.string().trim().optional().nullable(),
  adminNotes: z.string().trim().optional().nullable(),
});

export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const item = await getGaAudioDashboardMetrics();
    return NextResponse.json({ item });
  } catch (error) {
    if (isGaAudioSchemaNotReadyError(error)) {
      return NextResponse.json({
        item: {
          totalAudioAssets: 0,
          aiGeneratedFiles: 0,
          approvedForEarlyLearning: 0,
          needsNativeReview: 0,
          nativeVerified: 0,
          rejectedAudio: 0,
          approvedWords: 0,
          wordsMissingAudio: 0,
          lessonsCount: 0,
          lessonAudioMissing: 0,
          studentRecordingsAwaitingReview: 0,
          songsPendingApproval: 0,
          approvedAudioWords: 0,
          pendingAudioWords: 0,
          reviewedAt: new Date().toISOString(),
        },
        warning: "Ga Voice tables are not ready yet. Apply migrations to enable full voice data.",
      });
    }
    return NextResponse.json({ error: "Unable to load Ga voice metrics." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const body = createAudioSchema.parse(await request.json());
    const asset = await createGaAudioAsset(body, session.userId);
    if (!asset) throw new Error("Unable to create Ga audio asset.");
    await writeAuditLog({
      actorUserId: session.userId,
      action: "ga_audio_asset.created",
      entityType: "ga_audio_asset",
      entityId: asset.id,
      metadata: {
        sourceType: asset.sourceType,
        reviewStatus: asset.reviewStatus,
        approvalStatus: asset.approvalStatus,
        wordId: asset.wordId,
        lessonId: asset.lessonId,
        songId: asset.songId,
      },
    });
    return NextResponse.json({ item: serializeGaAudioAsset(asset) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create Ga audio asset." }, { status: 400 });
  }
}
