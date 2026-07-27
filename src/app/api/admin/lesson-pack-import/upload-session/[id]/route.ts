import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { cancelUploadSession } from "@/lib/lesson-pack-import/upload-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response;

  try {
    const { id } = await params;
    await cancelUploadSession({
      sessionId: id,
      actorUserId: session.userId,
    });
    return NextResponse.json({ ok: true, sessionId: id, status: "cancelled" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cancel failed";
    const status = /not found/i.test(message) ? 404
      : /does not belong|Cannot cancel/i.test(message) ? 403
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
