import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { parentCodingSummary } from "@/lib/coding/workspace-store";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const parentScope = await resolveParentScope(session);
  if (!parentScope) return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  const studentId = new URL(request.url).searchParams.get("studentId")?.trim();
  if (!studentId) return NextResponse.json({ error: "Choose a child first." }, { status: 400 });
  const child = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId, archived: false },
    select: { id: true },
  });
  if (!child) return NextResponse.json({ error: "Child not found." }, { status: 404 });
  const summary = await parentCodingSummary(child.id);
  return NextResponse.json({ summary });
}
