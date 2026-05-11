import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { ChildProfile } from "@/lib/store";
import { fromDbRecord, toDbUpdateInput, withChildDefaults } from "@/lib/child_profile_db";
import { childPayloadSchema } from "@/lib/child_profile_schema";
import { resolveParentScope } from "@/lib/parent_scope";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  const { id } = await params;
  const child = await prisma.childProfile.findFirst({ where: { id, parentId: parentScope.parentId } });
  if (!child) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  return NextResponse.json({ child: fromDbRecord(child) });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  const { id } = await params;
  const mode = new URL(request.url).searchParams.get("mode");

  const existing = await prisma.childProfile.findFirst({ where: { id, parentId: parentScope.parentId } });
  if (!existing) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  if (mode === "restore") {
    const restored = await prisma.childProfile.update({
      where: { id },
      data: { archived: false },
    });
    return NextResponse.json({ ok: true, child: fromDbRecord(restored) });
  }

  try {
    const body = childPayloadSchema.parse(await request.json());
    const normalized = withChildDefaults({ ...(body as Partial<ChildProfile>), id });

    const updated = await prisma.childProfile.update({
      where: { id },
      data: {
        ...toDbUpdateInput(normalized),
      },
    });

    return NextResponse.json({ ok: true, child: fromDbRecord(updated) });
  } catch {
    return NextResponse.json({ error: "Invalid child payload." }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  const { id } = await params;
  const mode = new URL(request.url).searchParams.get("mode") ?? "soft";

  const existing = await prisma.childProfile.findFirst({ where: { id, parentId: parentScope.parentId } });
  if (!existing) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  if (mode === "hard") {
    await prisma.childProfile.delete({ where: { id } });
  } else {
    await prisma.childProfile.update({ where: { id }, data: { archived: true } });
  }

  const user = await prisma.user.findUnique({ where: { id: parentScope.parentId }, select: { activeChildId: true } });
  if (user?.activeChildId === id) {
    const fallback = await prisma.childProfile.findFirst({ where: { parentId: parentScope.parentId, archived: false }, orderBy: { createdAt: "asc" } });
    await prisma.user.update({ where: { id: parentScope.parentId }, data: { activeChildId: fallback?.id ?? null } });
  }

  return NextResponse.json({ ok: true, mode });
}
