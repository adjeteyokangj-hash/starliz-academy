import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { serializeGaAudioAsset, softDeleteGaAudioAsset } from "@/lib/ga-audio";

const deleteSchema = z.object({
  notes: z.string().trim().optional().nullable(),
});

type Context = { params: Promise<{ audioAssetId: string }> };

export async function DELETE(request: Request, context: Context) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { audioAssetId } = await context.params;
  try {
    const body = deleteSchema.parse(await request.json().catch(() => ({})));
    const asset = await softDeleteGaAudioAsset({ audioAssetId, notes: body.notes }, session.userId);
    if (!asset) return NextResponse.json({ error: "Ga audio asset not found." }, { status: 404 });
    await writeAuditLog({
      actorUserId: session.userId,
      action: "ga_audio_asset.deleted",
      entityType: "ga_audio_asset",
      entityId: asset.id,
      metadata: { reviewStatus: asset.reviewStatus, approvalStatus: asset.approvalStatus, deletedAt: asset.deletedAt },
    });
    return NextResponse.json({ item: serializeGaAudioAsset(asset) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete Ga audio asset." }, { status: 400 });
  }
}