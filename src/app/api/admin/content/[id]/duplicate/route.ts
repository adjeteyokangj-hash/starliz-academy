import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { randomUUID } from "node:crypto";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { id } = await context.params;

  const original = await prisma.aIContentCache.findUnique({
    where: { id },
  });

  if (!original) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  const duplicate = await prisma.aIContentCache.create({
    data: {
      id: randomUUID(),
      contentType: original.contentType,
      contentJson: original.contentJson,
      level: original.level,
      topic: original.topic ? `${original.topic} (Copy)` : "(Copy)",
      keyStage: original.keyStage,
      yearGroup: original.yearGroup,
      skillFocus: original.skillFocus,
      status: "draft",
      createdBy: session.email,
      model: original.model,
      prompt: original.prompt,
      skills: original.skills,
      usedCount: 0,
    },
  });

  return NextResponse.json({
    id: duplicate.id,
    topic: duplicate.topic,
    status: duplicate.status,
    createdAt: duplicate.createdAt.toISOString(),
  });
}
