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
    select: { id: true, status: true },
  });

  if (!content) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  if (!["draft", "generated"].includes(content.status)) {
    return NextResponse.json(
      { error: `Content is already "${content.status}" and does not need review.` },
      { status: 422 },
    );
  }

  const updated = await prisma.aIContentCache.update({
    where: { id },
    data: {
      status: "reviewed",
      reviewedAt: new Date(),
    },
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    reviewedAt: updated.reviewedAt?.toISOString(),
  });
}
