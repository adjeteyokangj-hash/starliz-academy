import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";

export async function POST(_request: Request, context: { params: Promise<{ sourceFileId: string }> }) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { sourceFileId } = await context.params;
  await writeAuditLog({
    actorUserId: session.userId,
    action: "ga_pdf.extraction_requested",
    entityType: "ga_pdf_source",
    entityId: sourceFileId,
    metadata: { status: "Needs Extraction" },
  });

  return NextResponse.json({
    ok: false,
    sourceFileId,
    status: "Needs Extraction",
    message: "OCR/extraction pipeline is not configured in this environment yet.",
  }, { status: 501 });
}
