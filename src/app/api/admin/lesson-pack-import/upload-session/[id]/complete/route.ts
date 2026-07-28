import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api_guard";
import { completeUploadSession } from "@/lib/lesson-pack-import/upload-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  reportedFiles: z.array(z.object({
    fileId: z.string(),
    objectKey: z.string().optional(),
  })).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response;

  try {
    const { id } = await params;
    const body = bodySchema.parse(await req.json().catch(() => ({})));
    const result = await completeUploadSession({
      sessionId: id,
      actorUserId: session.userId,
      reportedFiles: body.reportedFiles,
    });
    return NextResponse.json({
      ok: true,
      sessionId: id,
      status: result.status,
      verifiedCount: result.verifiedCount,
      totalBytes: result.totalBytes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload verification failed";
    const status = /not found/i.test(message) ? 404
      : /expired|cancelled|limit|missing|Invalid|does not belong/i.test(message) ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
