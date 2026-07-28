import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api_guard";
import { createLessonPackDraft, getLessonPackImport } from "@/lib/lesson-pack-import/service";

export const runtime = "nodejs";

const bodySchema = z.object({
  importId: z.string().min(1),
  lessonGroupId: z.string().optional().nullable(),
  yearGroup: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  difficulty: z.number().int().min(1).max(5).optional().nullable(),
  duplicateOverrideReason: z.string().optional().nullable(),
  classificationOverrides: z.record(z.string(), z.string()).optional(),
});

export async function POST(req: Request) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response;

  try {
    const body = bodySchema.parse(await req.json());
    const existing = await getLessonPackImport(body.importId);
    if (!existing) {
      return NextResponse.json({ error: "Import job not found" }, { status: 404 });
    }

    const result = await createLessonPackDraft({
      importId: body.importId,
      actorUserId: session.userId,
      lessonGroupId: body.lessonGroupId,
      yearGroup: body.yearGroup,
      subject: body.subject,
      difficulty: body.difficulty,
      duplicateOverrideReason: body.duplicateOverrideReason,
      classificationOverrides: body.classificationOverrides as never,
    });

    return NextResponse.json({
      ok: true,
      importId: result.importRecord.id,
      status: result.importRecord.status,
      contentId: result.content.id,
      contentStatus: result.content.status,
      reviewPath: `/admin/content-library?highlight=${result.content.id}`,
      message: "StarLiz draft created and sent to Admin review. Publishing remains blocked until approved.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create draft";
    const status = /duplicate|required|not found/i.test(message) ? 422 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
