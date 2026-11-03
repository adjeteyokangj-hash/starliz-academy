import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCodingLearner } from "@/lib/coding/student-context";
import { checkRateLimit } from "@/lib/api_guard";
import { learnerSavedEvidence } from "@/lib/coding/learning/saved-evidence";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const querySchema = z.object({ versionId: z.string().min(1).max(100).optional(), bookingId: z.string().min(1).max(100).optional(), purpose: z.enum(["history", "link"]).default("history") }).strict();

export async function GET(request: Request) {
  try {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { child, response } = await requireCodingLearner({ bookingId: query.bookingId });
    if (!child) { const denied = response ?? NextResponse.json({ error: "Open your learner account to view saved evidence." }, { status: 401, headers }); denied.headers.set("Cache-Control", headers["Cache-Control"]); return denied; }
    if (!checkRateLimit({ key: `coding-evidence:${child.id}`, limit: 60, windowMs: 60000 }).allowed) return NextResponse.json({ error: "Pause briefly before opening another saved version." }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
    const projects = await learnerSavedEvidence(child.id, query.versionId, query.purpose === "link");
    if (query.versionId) return projects[0] ? NextResponse.json({ project: projects[0] }, { headers }) : NextResponse.json({ error: "This saved evidence is not available to your account." }, { status: 404, headers });
    return NextResponse.json({ projects, limit: query.purpose === "link" ? 480 : 100, note: query.purpose === "link" ? "Latest practical-result version per activity or bridge; frozen details are checked before linking." : "Latest saved versions; a saved draft is not an independent achievement." }, { headers });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Check the saved-evidence request." }, { status: 400, headers });
    console.error("Coding saved-evidence request failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Saved evidence could not be opened. Your work is retained." }, { status: 500, headers });
  }
}
