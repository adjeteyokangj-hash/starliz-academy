import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { revalidateImportedContent } from "@/lib/lesson-pack-import/service";

export const runtime = "nodejs";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response;
  try {
    const { id } = await context.params;
    const outcome = await revalidateImportedContent({ contentId: id, actorUserId: session.userId });
    return NextResponse.json({ ok: true, ...outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Revalidation failed";
    return NextResponse.json({ error: message }, { status: /not found|only available|unavailable/i.test(message) ? 404 : 422 });
  }
}
