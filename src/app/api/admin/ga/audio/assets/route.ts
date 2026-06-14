import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { listGaAudioAssets, serializeGaAudioAsset } from "@/lib/ga-audio";

const querySchema = z.object({
  sourceType: z.string().trim().optional(),
  limit: z.string().trim().optional(),
  includeDeleted: z.string().trim().optional(),
});

export async function GET(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.parse(Object.fromEntries(searchParams.entries()));
    const items = await listGaAudioAssets(parsed.limit ? Number(parsed.limit) : undefined, {
      sourceType: parsed.sourceType ?? "ADMIN_UPLOADED",
      includeDeleted: parsed.includeDeleted === "true",
    });
    return NextResponse.json({ items: items.map(serializeGaAudioAsset) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load Ga audio assets." }, { status: 400 });
  }
}