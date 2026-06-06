import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { listGaAudioAuditTrail, serializeGaAudioAudit } from "@/lib/ga-audio";

const querySchema = z.object({
  audioAssetId: z.string().optional(),
  referenceId: z.string().optional(),
  studentRecordingId: z.string().optional(),
  limit: z.string().optional(),
});

export async function GET(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.parse(Object.fromEntries(searchParams.entries()));
    const items = await listGaAudioAuditTrail({
      audioAssetId: parsed.audioAssetId,
      referenceId: parsed.referenceId,
      studentRecordingId: parsed.studentRecordingId,
      limit: parsed.limit ? Number(parsed.limit) : undefined,
    });
    return NextResponse.json({ items: items.map(serializeGaAudioAudit) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load Ga audio audit trail." }, { status: 400 });
  }
}
