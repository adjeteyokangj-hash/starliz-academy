import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { createLessonPackAnalysis } from "@/lib/lesson-pack-import/service";
import type { LessonPackSessionType } from "@/lib/lesson-pack-import/types";
import { LESSON_PACK_MAX_FILES, LESSON_PACK_MAX_TOTAL_BYTES } from "@/lib/lesson-pack-import/security";
import {
  formatLessonPackFileCountError,
  formatLessonPackTotalLimitError,
  LESSON_PACK_UPLOAD_LIMITS,
} from "@/lib/lesson-pack-import/upload-limits";

export const runtime = "nodejs";
export const maxDuration = 300;
// Allow large multipart lesson-pack uploads (aligned with LESSON_PACK_UPLOAD_LIMITS).
export const dynamic = "force-dynamic";

function parseSessionType(value: FormDataEntryValue | null): LessonPackSessionType {
  const raw = String(value ?? "school_day");
  if (raw === "short_learning_90" || raw === "short_learning_120" || raw === "general_library" || raw === "school_day") {
    return raw;
  }
  return "school_day";
}

export async function POST(req: Request) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response;

  try {
    const form = await req.formData();
    const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
    if (!files.length) {
      return NextResponse.json({ error: "Lesson pack files are required." }, { status: 400 });
    }
    if (files.length > LESSON_PACK_MAX_FILES) {
      return NextResponse.json({ error: formatLessonPackFileCountError() }, { status: 400 });
    }

    let total = 0;
    const uploads = [];
    for (const file of files) {
      total += file.size;
      if (file.size > LESSON_PACK_UPLOAD_LIMITS.maxFileBytes) {
        return NextResponse.json({
          error: `File exceeds the ${Math.round(LESSON_PACK_UPLOAD_LIMITS.maxFileBytes / (1024 * 1024))}MB individual-file limit.`,
        }, { status: 400 });
      }
      if (total > LESSON_PACK_MAX_TOTAL_BYTES) {
        return NextResponse.json({
          error: formatLessonPackTotalLimitError(),
        }, { status: 400 });
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      uploads.push({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        bytes,
      });
    }

    let classificationOverrides: Record<string, string> | undefined;
    const overridesRaw = form.get("classificationOverrides");
    if (typeof overridesRaw === "string" && overridesRaw.trim()) {
      classificationOverrides = JSON.parse(overridesRaw) as Record<string, string>;
    }

    const result = await createLessonPackAnalysis({
      actorUserId: session.userId,
      files: uploads,
      sessionType: parseSessionType(form.get("sessionType")),
      yearGroup: String(form.get("yearGroup") ?? "auto"),
      subject: String(form.get("subject") ?? "auto"),
      sourceName: String(form.get("sourceName") ?? "") || null,
      sourceUrl: String(form.get("sourceUrl") ?? "") || null,
      licenceType: String(form.get("licenceType") ?? "") || null,
      attribution: String(form.get("attribution") ?? "") || null,
      notes: String(form.get("notes") ?? "") || null,
      classificationOverrides: classificationOverrides as never,
    });

    return NextResponse.json({
      ok: true,
      importId: result.record.id,
      status: result.record.status,
      analysis: {
        lessonCount: result.analysis.lessonCount,
        lessons: result.analysis.lessons.map((lesson) => ({
          lessonGroupId: lesson.lessonGroupId,
          title: lesson.title,
          subject: lesson.subject,
          curriculumArea: lesson.curriculumArea ?? lesson.structured?.curriculumArea ?? null,
          yearGroup: lesson.yearGroup,
          keyStage: lesson.keyStage,
          difficulty: lesson.difficulty,
          subjectConfidence: lesson.subjectConfidence,
          yearConfidence: lesson.yearConfidence,
          difficultyConfidence: lesson.difficultyConfidence,
          yearEvidence: lesson.yearEvidence,
          difficultyReasons: lesson.difficultyReasons,
          subjectEvidence: lesson.subjectEvidence,
          yearWarning: lesson.yearWarning,
          learningObjective: lesson.learningObjective,
          estimatedDurationMinutes: lesson.estimatedDurationMinutes,
          sessionType: lesson.sessionType,
          fileClassifications: lesson.fileClassifications,
          componentCounts: lesson.componentCounts,
          questionCount: lesson.questionCount,
          answerKeyCount: lesson.answerKeyCount,
          qaPairingReport: lesson.qaPairingReport,
          preDraftValidation: lesson.preDraftValidation,
          starlizMetadata: lesson.starlizMetadata,
          duplicateReport: {
            level: lesson.duplicateReport.level,
            label: lesson.duplicateReport.label,
            blocked: lesson.duplicateReport.blocked,
            overrideAllowed: lesson.duplicateReport.overrideAllowed,
            sourceFingerprint: lesson.duplicateReport.sourceFingerprint,
            matches: lesson.duplicateReport.matches.map((m) => ({
              level: m.level,
              reason: m.reason,
              matchedContentId: m.matchedContentId,
              matchedTopic: m.matchedTopic,
            })),
          },
          thirdPartyFindings: lesson.thirdPartyFindings,
          licenceType: lesson.licenceType,
          attribution: lesson.attribution,
          sourceName: lesson.sourceName,
          sourceUrl: lesson.sourceUrl,
        })),
        files: result.analysis.files.map((f) => ({
          id: f.id,
          originalName: f.originalName,
          classification: f.classification,
          classificationConfidence: f.classificationConfidence,
          classificationEvidence: f.classificationEvidence,
          extractionStatus: f.extractionStatus,
          extractionError: f.extractionError,
          kind: f.kind,
          sizeBytes: f.sizeBytes,
        })),
        errors: result.analysis.errors,
        partialFailures: result.analysis.partialFailures,
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Lesson pack analysis failed",
    }, { status: 500 });
  }
}
