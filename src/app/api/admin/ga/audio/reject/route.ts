import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { rejectGaAudioAsset, serializeGaAudioAsset } from "@/lib/ga-audio";

const rejectSchema = z.object({
  audioAssetId: z.string().trim().min(1),
  notes: z.string().trim().optional().nullable(),
});

export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const body = rejectSchema.parse(await request.json());
    const asset = await rejectGaAudioAsset(body, session.userId);
    if (!asset) return NextResponse.json({ error: "Ga audio asset not found." }, { status: 404 });
    await writeAuditLog({
      actorUserId: session.userId,
      action: "ga_audio_asset.rejected",
      entityType: "ga_audio_asset",
      entityId: asset.id,
      metadata: { reviewStatus: asset.reviewStatus, approvalStatus: asset.approvalStatus },
    });
    return NextResponse.json({ item: serializeGaAudioAsset(asset) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to reject Ga audio asset." }, { status: 400 });
  }
}
