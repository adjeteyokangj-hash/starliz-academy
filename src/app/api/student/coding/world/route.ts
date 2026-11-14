import { publishedWorldCopy, extendWorldMissions } from "@/lib/coding/world/content";
import { worldRequestIsSameOrigin } from "@/lib/coding/world/request-origin";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCodingLearner } from "@/lib/coding/student-context";
import { checkRateLimit } from "@/lib/api_guard";
import { boundedJson } from "@/lib/coding/learning/types";
import { worldActionSchema, WorldInputError } from "@/lib/coding/world/model";
import { loadWorld, updateWorld, WorldConflict } from "@/lib/coding/world/store";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const envelope = z.object({ learnerId: z.string().min(1).max(100), bookingId: z.string().min(1).max(100).optional(), revision: z.number().int().nonnegative(), action: worldActionSchema }).strict();
async function boundedBody(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new WorldInputError("Missing request body.");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 65536) { await reader.cancel(); throw new WorldInputError("This program is too large."); } chunks.push(item.value); }
  const raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!boundedJson(raw)) throw new WorldInputError("This program is too deeply nested.");
  return envelope.parse(raw);
}
function failure(error: unknown) {
  if (error instanceof WorldInputError) return NextResponse.json({ error: error.message }, { status: 400, headers });
  if (error instanceof WorldConflict) return NextResponse.json({ error: error.message }, { status: 409, headers });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Check the world request. Your saved work has been retained." }, { status: 400, headers });
  console.error("Coding world request failed", error instanceof Error ? error.name : "UnknownError");
  return NextResponse.json({ error: "Your world could not be saved or opened. Your previous save has been retained." }, { status: 500, headers });
}
export async function GET(request: Request) {
  try {
    const bookingId = z.string().min(1).max(100).optional().parse(new URL(request.url).searchParams.get("bookingId") ?? undefined);
    const { child, response } = await requireCodingLearner({ bookingId }); if (!child) { response.headers.set("Cache-Control", "private, no-store"); return response; }
    const before = z.string().min(1).max(100).optional().parse(new URL(request.url).searchParams.get("versionsBefore") ?? undefined);
    const { state, versions, nextCursor } = await loadWorld(child.id, child.yearGroup, { before });
    const missionCopy = await publishedWorldCopy();
    return NextResponse.json({ learnerId: child.id, state, versions, nextCursor, missionCopy, missions: extendWorldMissions(missionCopy) }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (!worldRequestIsSameOrigin(request)) return NextResponse.json({ error: "Open your world on StarLiz Academy." }, { status: 403, headers });
    const { learnerId, bookingId, revision, action } = await boundedBody(request);
    const { child, response } = await requireCodingLearner({ bookingId }); if (!child) { response.headers.set("Cache-Control", "private, no-store"); return response; }
    if (!checkRateLimit({ key: `coding-world:${child.id}`, limit: 90, windowMs: 60000 }).allowed) return NextResponse.json({ error: "Pause briefly before saving again." }, { status: 429, headers });
    if (learnerId !== child.id) return NextResponse.json({ error: "Your active learner changed. Reload the world for this learner." }, { status: 409, headers });
    return NextResponse.json(await updateWorld(child.id, child.yearGroup, revision, action), { headers });
  } catch (error) { return failure(error); }
}
