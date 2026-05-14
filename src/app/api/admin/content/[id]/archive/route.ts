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

  const updated = await prisma.aIContentCache.update({
    where: { id },
    data: { status: "archived" },
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
  });
}
