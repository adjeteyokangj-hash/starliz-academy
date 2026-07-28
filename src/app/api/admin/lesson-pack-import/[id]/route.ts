import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { getLessonPackImport } from "@/lib/lesson-pack-import/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response;

  const { id } = await params;
  const record = await getLessonPackImport(id);
  if (!record) {
    return NextResponse.json({ error: "Import job not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    import: {
      id: record.id,
      status: record.status,
      sessionType: record.sessionType,
      sourceName: record.sourceName,
      sourceUrl: record.sourceUrl,
      licenceType: record.licenceType,
      attribution: record.attribution,
      notes: record.notes,
      yearGroupOverride: record.yearGroupOverride,
      subjectOverride: record.subjectOverride,
      difficultyOverride: record.difficultyOverride,
      detectedYearGroup: record.detectedYearGroup,
      detectedSubject: record.detectedSubject,
      detectedDifficulty: record.detectedDifficulty,
      yearConfidence: record.yearConfidence,
      subjectConfidence: record.subjectConfidence,
      difficultyConfidence: record.difficultyConfidence,
      sourceFingerprint: record.sourceFingerprint,
      contentId: record.contentId,
      duplicateOverrideReason: record.duplicateOverrideReason,
      analysis: record.analysisJson ? JSON.parse(record.analysisJson) : null,
      preview: record.previewJson ? JSON.parse(record.previewJson) : null,
      errors: record.errorJson ? JSON.parse(record.errorJson) : null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    },
  });
}
