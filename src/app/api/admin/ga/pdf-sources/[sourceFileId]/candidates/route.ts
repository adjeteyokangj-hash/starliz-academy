import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";

export async function GET(_request: Request, context: { params: Promise<{ sourceFileId: string }> }) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { sourceFileId } = await context.params;
  return NextResponse.json({
    sourceFileId,
    items: [],
    message: "Extraction candidates model is not configured yet. Upload is retained as source evidence.",
  });
}
