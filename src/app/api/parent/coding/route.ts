import { worldPracticeSummaries } from "@/lib/coding/world/oversight";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { parentCodingSummary } from "@/lib/coding/workspace-store";
import { parentActivityPortfolio, parentActivityProject } from "@/lib/coding/learning/parent-portfolio";
import { learnerSavedEvidence } from "@/lib/coding/learning/saved-evidence";
import { readinessOverview } from "@/lib/coding/learning/readiness";
import { codingActivityProgress } from "@/lib/coding/learning/workspace-store";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;
  if (session.role !== "parent") return NextResponse.json({ error: "Parent access is required to inspect project portfolios." }, { status: 403 });
  const parentScope = await resolveParentScope(session);
  if (!parentScope) return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  const studentId = new URL(request.url).searchParams.get("studentId")?.trim();
  if (!studentId) return NextResponse.json({ error: "Choose a child first." }, { status: 400 });
  const child = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId, archived: false },
    select: { id: true },
  });
  if (!child) return NextResponse.json({ error: "Child not found." }, { status: 404 });
  if (new URL(request.url).searchParams.get("evidenceList") === "1") return NextResponse.json({ projects: await learnerSavedEvidence(child.id) }, { headers: { "Cache-Control": "private, no-store" } });
  const evidenceVersionId = new URL(request.url).searchParams.get("evidenceVersionId");
  if (evidenceVersionId !== null) {
    const project = evidenceVersionId.length > 0 && evidenceVersionId.length <= 100 ? (await learnerSavedEvidence(child.id, evidenceVersionId))[0] : null;
    return project ? NextResponse.json({ project }, { headers: { "Cache-Control": "private, no-store" } }) : NextResponse.json({ error: "Saved evidence not found for this child." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  const versionId = new URL(request.url).searchParams.get("versionId")?.trim();
  if (versionId !== undefined) {
    const project = versionId.length > 0 && versionId.length <= 100 ? await parentActivityProject(child.id, versionId) : null;
    return project ? NextResponse.json({ project }, { headers: { "Cache-Control": "private, no-store" } }) : NextResponse.json({ error: "Assessed project not found for this child." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  const [summary, portfolio, readiness, progress, worlds] = await Promise.all([parentCodingSummary(child.id), parentActivityPortfolio(child.id), readinessOverview(child.id), codingActivityProgress(child.id), worldPracticeSummaries([child.id])]);
  const curriculum = { available: progress.length, started: progress.filter(activity => activity.status !== "not_started").length, mastered: progress.filter(activity => activity.status === "mastered").length,
    lessons: progress.filter(activity => activity.kind === "lesson" && activity.status === "mastered").length, consolidations: progress.filter(activity => activity.kind === "consolidation" && activity.status === "mastered").length, projects: progress.filter(activity => activity.kind === "project" && activity.status === "mastered").length };
  return NextResponse.json({ summary, portfolio, readiness, curriculum, worldPractice: worlds[0] ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}
