import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api_guard";
import { requireCodingLearner } from "@/lib/coding/student-context";
import { loadActivityWorkspace } from "@/lib/coding/learning/workspace-store";
import { artifactHash, LearningError } from "@/lib/coding/learning/state-machine";
import { saveDemonstration } from "@/lib/coding/learning/demonstration-storage";
import { DEMONSTRATION_MAX_BYTES } from "@/lib/coding/learning/demonstration-contract";
import { sameCodingUploadOrigin } from "@/lib/coding/learning/upload-origin";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  try {
    // Multipart uploads are otherwise cross-origin simple requests. Require
    // the browser's own app origin before accepting a private project write.
    if (!sameCodingUploadOrigin(request)) return NextResponse.json({ error: "Upload a recording from your StarLiz workspace." }, { status: 403, headers });
    const { child, response } = await requireCodingLearner({ bookingId: new URL(request.url).searchParams.get("bookingId") });
    if (!child) return response;
    if (!checkRateLimit({ key: `coding-demo-upload:${child.id}`, limit: 10, windowMs: 3600000 }).allowed) return NextResponse.json({ error: "Keep your local recording and try again later." }, { status: 429, headers });
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) return NextResponse.json({ error: "Use the private recording upload form." }, { status: 415, headers });
    const declared = request.headers.get("content-length"); if (declared && (!/^\d+$/.test(declared) || Number(declared) > DEMONSTRATION_MAX_BYTES + 32768)) return NextResponse.json({ error: "Keep the recording within 4MiB." }, { status: 413, headers });
    const reader = request.body?.getReader(); if (!reader) throw new LearningError("The recording body is missing.");
    const chunks: Uint8Array[] = []; let size = 0;
    let timedOut = false; const deadline = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 10000);
    try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > DEMONSTRATION_MAX_BYTES + 32768) { void reader.cancel().catch(() => {}); return NextResponse.json({ error: "Keep the recording within 4MiB." }, { status: 413, headers }); } chunks.push(chunk.value); } } finally { clearTimeout(deadline); reader.releaseLock(); }
    if (timedOut) throw new LearningError("The recording upload timed out. Keep the local clip and retry.", 408);
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const form = await new Request("https://private-upload.invalid", { method: "POST", headers: { "content-type": request.headers.get("content-type")! }, body: bytes }).formData();
    if ([...form.keys()].some(key => !["video", "activityId", "artifactHash", "taskHash", "transcript", "rights", "limitation"].includes(key)) || [...form.keys()].some(key => form.getAll(key).length !== 1)) throw new LearningError("Check the recording form fields.");
    const activityId = form.get("activityId"), hash = form.get("artifactHash"), video = form.get("video");
    if (typeof activityId !== "string" || activityId.length > 100 || typeof hash !== "string" || !(video instanceof File) || video.type.split(";")[0] !== "video/webm" || video.size > DEMONSTRATION_MAX_BYTES) throw new LearningError("Use a bounded original WebM recording and its saved activity.");
    const workspace = await loadActivityWorkspace(child.id, activityId, child.yearGroup);
    if (!workspace.activity.workflow?.originalDemonstration || workspace.stage !== "create" || artifactHash(workspace.artifact) !== hash || form.get("taskHash") !== workspace.independentFingerprint) throw new LearningError("Save the current independent creation before recording or uploading its demonstration.", 409);
    const text = (name: string) => { const value = form.get(name); if (typeof value !== "string") throw new LearningError("Add the written alternative, rights and limitation."); return value; };
    const attachment = await saveDemonstration({ childId: child.id, activityId: workspace.activity.id, artifactHash: hash, taskHash: workspace.independentFingerprint, bytes: new Uint8Array(await video.arrayBuffer()), transcript: text("transcript"), rights: text("rights"), limitation: text("limitation") });
    return NextResponse.json({ attachment }, { headers });
  } catch (error) {
    if (error instanceof LearningError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error("Private Coding recording upload failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "The private recording could not be stored. Keep your local clip; your project is retained." }, { status: 503, headers });
  }
}
