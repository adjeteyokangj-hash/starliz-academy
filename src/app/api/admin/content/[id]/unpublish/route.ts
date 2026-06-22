import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";

type Context = { params: Promise<{ id: string }> };

type UnpublishableContentRecord = {
  id: string;
  status: string;
  publishedAt: Date | null;
};

type UnpublishedContentRecord = {
  id: string;
  status: string;
  publishedAt: Date | null;
};

export async function POST(_request: Request, context: Context) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { id } = await context.params;

  const content: UnpublishableContentRecord | null = await prisma.aIContentCache.findUnique({
    where: { id },
    select: { id: true, status: true, publishedAt: true },
  });

  if (!content) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  if (content.status !== "published") {
    return NextResponse.json(
      { error: `Cannot unpublish content with status "${content.status}".` },
      { status: 422 },
    );
  }

  const updated: UnpublishedContentRecord = await prisma.aIContentCache.update({
    where: { id },
    data: {
      status: "approved",
      publishedAt: null,
    },
    select: { id: true, status: true, publishedAt: true },
  });

  await writeAuditLog({
    actorUserId: session.userId,
    action: "ai_content.unpublished",
    entityType: "content",
    entityId: updated.id,
    metadata: {
      fromStatus: content.status,
      toStatus: updated.status,
      previousPublishedAt: content.publishedAt?.toISOString() ?? null,
    },
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    publishedAt: updated.publishedAt,
  });
}
