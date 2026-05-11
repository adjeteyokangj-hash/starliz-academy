import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api_guard";
import { autoFillLowContentLibrary, generateDraftContent } from "@/lib/ai/generate-content";
import { detectWeakAreas } from "@/lib/ai/weakness-detector";
import { recommendNextLesson } from "@/lib/ai/lesson-recommender";

const bodySchema = z.object({
  mode: z.enum(["autofill", "auto-fill-low-library", "generate", "weaknesses", "detect-weak-areas", "recommend", "recommend-lessons"]),
  type: z.enum(["spelling", "math", "reading"]).optional(),
  level: z.number().int().min(1).max(5).optional(),
  topic: z.string().optional(),
  studentId: z.string().optional(),
});

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("ai:run");
  if (!session) return response;

  try {
    const body = bodySchema.parse(await request.json());
    if (body.mode === "autofill" || body.mode === "auto-fill-low-library") {
      return NextResponse.json({ created: await autoFillLowContentLibrary() });
    }
    if (body.mode === "weaknesses" || body.mode === "detect-weak-areas") {
      return NextResponse.json({ weakAreas: await detectWeakAreas(body.studentId) });
    }
    if (body.mode === "recommend" || body.mode === "recommend-lessons") {
      if (!body.studentId) return NextResponse.json({ error: "studentId is required." }, { status: 400 });
      return NextResponse.json(await recommendNextLesson(body.studentId));
    }

    const generated = await generateDraftContent({
      type: body.type ?? "spelling",
      level: body.level ?? 1,
      topic: body.topic ?? "starter content",
      createdBy: session.email,
    });
    return NextResponse.json({ id: generated.record.id, reused: generated.reused });
  } catch {
    return NextResponse.json({ error: "Invalid automation request." }, { status: 400 });
  }
}
