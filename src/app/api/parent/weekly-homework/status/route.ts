import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { isWeeklyHomeworkPhase1BEnabled } from "@/lib/homework-phase1b/config";
import { getHomeworkStatusSummaryForStudent } from "@/lib/homework-phase1b/service";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const featureEnabled = isWeeklyHomeworkPhase1BEnabled();
  if (!featureEnabled) {
    return NextResponse.json({ featureEnabled, children: [] });
  }

  const params = new URL(request.url).searchParams;
  const childId = params.get("childId")?.trim();

  const children = await prisma.childProfile.findMany({
    where: {
      parentId: parentScope.parentId,
      archived: false,
      ...(childId ? { id: childId } : {}),
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const summaries = await Promise.all(
    children.map(async (child) => ({
      childId: child.id,
      childName: child.name,
      homework: await getHomeworkStatusSummaryForStudent(child.id),
    })),
  );

  return NextResponse.json({
    featureEnabled,
    children: summaries,
  });
}
