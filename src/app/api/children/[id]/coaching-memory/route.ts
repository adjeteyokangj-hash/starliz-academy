import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { z } from "zod";

const coachingMemorySchema = z.object({
  confidence: z.number().min(0).max(1),
  pace: z.enum(["slow", "balanced", "challenge"]),
  updatedAt: z.string(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { id } = await params;
  const child = await prisma.childProfile.findFirst({
    where: { id, parentId: parentScope.parentId },
    select: { coachingMemoryJson: true },
  });
  if (!child) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (!child.coachingMemoryJson) {
    return NextResponse.json({ memory: null });
  }

  try {
    const memory = JSON.parse(child.coachingMemoryJson) as unknown;
    return NextResponse.json({ memory });
  } catch {
    return NextResponse.json({ memory: null });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { id } = await params;

  const child = await prisma.childProfile.findFirst({
    where: { id, parentId: parentScope.parentId },
    select: { id: true },
  });
  if (!child) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body: unknown = await request.json();
  const parsed = coachingMemorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid coaching memory payload." }, { status: 400 });
  }

  await prisma.childProfile.update({
    where: { id },
    data: { coachingMemoryJson: JSON.stringify(parsed.data) },
  });

  return NextResponse.json({ ok: true });
}
