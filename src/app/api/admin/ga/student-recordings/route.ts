import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { listGaStudentRecordings, serializeGaStudentRecording } from "@/lib/ga-audio";

const querySchema = z.object({
  reviewStatus: z.string().optional(),
  limit: z.string().optional(),
});

export async function GET(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.parse(Object.fromEntries(searchParams.entries()));
    const items = await listGaStudentRecordings(parsed.limit ? Number(parsed.limit) : undefined, parsed.reviewStatus);
    return NextResponse.json({ items: items.map(serializeGaStudentRecording) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load student recordings." }, { status: 400 });
  }
}
