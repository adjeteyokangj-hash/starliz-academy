import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { replaceGaAudioAsset, serializeGaAudioAsset } from "@/lib/ga-audio";

const replacementSchema = z.object({
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
  qualityStatus: z.string().trim().optional().nullable(),
  enhancementStatus: z.string().trim().optional().nullable(),
  confidenceLevel: z.number().int().optional().nullable(),
  pronunciationNote: z.string().trim().optional().nullable(),
  adminNotes: z.string().trim().optional().nullable(),
});

const replaceSchema = z.object({
  audioAssetId: z.string().trim().min(1),
  replacement: replacementSchema,
  notes: z.string().trim().optional().nullable(),
});

export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const body = replaceSchema.parse(await request.json());
    const asset = await replaceGaAudioAsset(body, session.userId);
    if (!asset) return NextResponse.json({ error: "Ga audio asset not found." }, { status: 404 });
    await writeAuditLog({
      actorUserId: session.userId,
      action: "ga_audio_asset.replaced",
      entityType: "ga_audio_asset",
      entityId: body.audioAssetId,
      metadata: { replacementId: asset.id, reviewStatus: asset.reviewStatus, approvalStatus: asset.approvalStatus },
    });
    return NextResponse.json({ item: serializeGaAudioAsset(asset) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to replace Ga audio asset." }, { status: 400 });
  }
}
