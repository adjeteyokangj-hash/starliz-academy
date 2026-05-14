import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { id } = await context.params;

  const content = await prisma.aIContentCache.findUnique({
    where: { id },
  });

  if (!content) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  // Can only publish if reviewed or already published
  if (!["reviewed", "published"].includes(content.status)) {
    return NextResponse.json(
      { error: `Cannot publish content with status "${content.status}". Status must be "reviewed" or "published".` },
      { status: 422 },
    );
  }

  const updated = await prisma.aIContentCache.update({
    where: { id },
    data: {
      status: "published",
      publishedAt: new Date(),
    },
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    publishedAt: updated.publishedAt?.toISOString(),
  });
}
