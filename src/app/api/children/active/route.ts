import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { fromDbRecord } from "@/lib/child_profile_db";

const schema = z.object({
  childId: z.string().min(1),
});

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ child: null });
  }

  const user = await prisma.user.findUnique({ where: { id: parentScope.parentId }, select: { activeChildId: true } });
  if (!user?.activeChildId) {
    return NextResponse.json({ child: null });
  }

  const child = await prisma.childProfile.findFirst({
    where: { id: user.activeChildId, parentId: parentScope.parentId, archived: false },
  });

  return NextResponse.json({ child: child ? fromDbRecord(child) : null });
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  try {
    const body = schema.parse(await request.json());
    const child = await prisma.childProfile.findFirst({
      where: { id: body.childId, parentId: parentScope.parentId, archived: false },
      select: { id: true },
    });
    if (!child) {
      return NextResponse.json({ error: "Child not found." }, { status: 404 });
    }

    await prisma.user.update({ where: { id: parentScope.parentId }, data: { activeChildId: body.childId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
