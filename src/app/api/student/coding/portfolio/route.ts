import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCodingLearner } from "@/lib/coding/student-context";
import { checkRateLimit } from "@/lib/api_guard";
import { parentActivityPortfolio, parentActivityProject } from "@/lib/coding/learning/parent-portfolio";
import { learnerLegacyProjects } from "@/lib/coding/workspace-store";
import { savedReviewAnswers } from "@/lib/coding/learning/saved-review-answers";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const querySchema = z.object({ versionId: z.string().min(1).max(100).optional(), bookingId: z.string().min(1).max(100).optional() }).strict();

/** The authenticated learner's child ID is the only project scope. A caller
 * cannot select another child or bypass Coding subscription/school checks. */
export async function GET(request: Request) {
  try {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { child, response } = await requireCodingLearner({ bookingId: query.bookingId });
    if (!child) { const denied = response ?? NextResponse.json({ error: "Open your learner account to view saved creations." }, { status: 401, headers }); denied.headers.set("Cache-Control", headers["Cache-Control"]); return denied; }
    if (!checkRateLimit({ key: `coding-portfolio:${child.id}`, limit: 60, windowMs: 60000 }).allowed) return NextResponse.json({ error: "Pause briefly before opening another saved creation." }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
    if (query.versionId) {
      const project = await parentActivityProject(child.id, query.versionId);
      return project ? NextResponse.json({ project, reviewAnswers: savedReviewAnswers(project.activity.id, project.artifact, project.execution, project.explanation) }, { headers }) : NextResponse.json({ error: "This saved creation is not available to your account." }, { status: 404, headers });
    }
    const [projects, legacyProjects] = await Promise.all([parentActivityPortfolio(child.id), learnerLegacyProjects(child.id)]);
    return NextResponse.json({ learnerId: child.id, projects, legacyProjects }, { headers });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Check the saved-creation request." }, { status: 400, headers });
    console.error("Coding saved-creation request failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Your saved creations could not be opened. Your work has been retained." }, { status: 500, headers });
  }
}
