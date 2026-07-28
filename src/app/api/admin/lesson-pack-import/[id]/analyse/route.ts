import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api_guard";
import { analyseFromUploadSession } from "@/lib/lesson-pack-import/upload-session";
import type { LessonPackSessionType } from "@/lib/lesson-pack-import/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  sessionType: z.enum(["school_day", "short_learning_90", "short_learning_120", "general_library"]).optional(),
  yearGroup: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  sourceName: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  licenceType: z.string().optional().nullable(),
  attribution: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  licenceConfirmed: z.boolean().optional(),
  classificationOverrides: z.record(z.string(), z.string()).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response;

  try {
    const { id } = await params;
    const body = bodySchema.parse(await req.json().catch(() => ({})));
    const result = await analyseFromUploadSession({
      sessionId: id,
      actorUserId: session.userId,
      sessionType: body.sessionType as LessonPackSessionType | undefined,
      yearGroup: body.yearGroup,
      subject: body.subject,
      sourceName: body.sourceName,
      sourceUrl: body.sourceUrl,
      licenceType: body.licenceType,
      attribution: body.attribution,
      notes: body.notes,
      licenceConfirmed: body.licenceConfirmed,
      classificationOverrides: body.classificationOverrides as never,
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
          subjectWarning: lesson.subjectWarning,
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
    const message = error instanceof Error ? error.message : "Analysis failed";
    const status = /not found/i.test(message) ? 404
      : /cancelled|verification|expired|does not belong/i.test(message) ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
