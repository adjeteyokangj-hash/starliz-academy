import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import {
  analyseLessonPackUpload,
  type LessonPackAnalyseInput,
  type RawLessonPackUpload,
} from "@/lib/lesson-pack-import/pipeline";
import type {
  LessonPackComponentType,
  LessonPackPreview,
  LessonPackSessionType,
} from "@/lib/lesson-pack-import/types";
import {
  GENERATION_CONTENT_TYPE_BY_SUBJECT,
  keyStageForYearGroup,
  mapSubjectToLegacyContentType,
  normalizeYearGroup,
} from "@/lib/curriculum";
import { normalizeLessonPackSubject } from "@/lib/lesson-pack-import/subject-detection";
import { resolveBlackBoxGatedSaveStatus } from "@/lib/ai/content-black-box-gate";
import { validateImportedLesson } from "@/lib/lesson-pack-import/academic-validation";

function privateStorageDir(): string | null {
  return process.env.LESSON_PACK_STORAGE_DIR?.trim() || process.env.GA_PDF_STORAGE_DIR?.trim() || null;
}

export async function storeLessonPackSourceFile(fileName: string, bytes: Uint8Array): Promise<{ storedName: string; filePath: string } | null> {
  const dir = privateStorageDir();
  if (!dir) return null;
  const root = join(dir, "lesson-packs");
  await mkdir(root, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const cleaned = basename(fileName).replace(/[^a-zA-Z0-9._/-]/g, "_").replace(/\//g, "__");
  const storedName = `${timestamp}-${cleaned}`;
  const filePath = join(root, storedName);
  await writeFile(filePath, Buffer.from(bytes));
  return { storedName, filePath };
}

async function loadHistoricalRecords(subject?: string | null, yearGroup?: string | null) {
  const rows = await prisma.aIContentCache.findMany({
    where: {
      OR: [
        ...(subject ? [{ metadataJson: { contains: subject } }] : []),
        ...(yearGroup ? [{ yearGroup }] : []),
        { status: { in: ["generated", "reviewed", "approved", "published", "draft"] } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 250,
    select: {
      id: true,
      status: true,
      topic: true,
      yearGroup: true,
      keyStage: true,
      contentJson: true,
      metadataJson: true,
      contentType: true,
    },
  });

  return rows.map((row) => {
    let sourceFingerprint: string | null = null;
    let contentSubject: string | null = null;
    if (row.metadataJson) {
      try {
        const meta = JSON.parse(row.metadataJson) as Record<string, unknown>;
        if (typeof meta.sourceFingerprint === "string") sourceFingerprint = meta.sourceFingerprint;
        if (typeof meta.subject === "string") contentSubject = meta.subject;
      } catch {
        // ignore
      }
    }
    return {
      contentId: row.id,
      contentStatus: row.status,
      contentSubject,
      contentYearGroup: row.yearGroup,
      contentKeyStage: row.keyStage,
      topic: row.topic,
      contentJson: row.contentJson,
      sourceFingerprint,
      metadataJson: row.metadataJson,
    };
  });
}

export async function createLessonPackAnalysis(input: {
  actorUserId?: string;
  files: RawLessonPackUpload[];
  sessionType?: LessonPackSessionType;
  yearGroup?: string | null;
  subject?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  licenceType?: string | null;
  attribution?: string | null;
  notes?: string | null;
  classificationOverrides?: Record<string, LessonPackComponentType>;
}) {
  const storedFiles: Array<{ originalName: string; storedName?: string; sha256?: string }> = [];
  for (const file of input.files) {
    const stored = await storeLessonPackSourceFile(file.fileName, file.bytes);
    storedFiles.push({
      originalName: file.fileName,
      storedName: stored?.storedName,
    });
  }

  const historicalRecords = await loadHistoricalRecords(
    isAuto(input.subject) ? null : input.subject,
    isAuto(input.yearGroup) ? null : input.yearGroup,
  );

  const analyseInput: LessonPackAnalyseInput = {
    files: input.files,
    sessionType: input.sessionType,
    yearGroup: input.yearGroup,
    subject: input.subject,
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl,
    licenceType: input.licenceType,
    attribution: input.attribution,
    notes: input.notes,
    classificationOverrides: input.classificationOverrides,
    historicalRecords,
  };

  const analysis = analyseLessonPackUpload(analyseInput);
  const primary = analysis.lessons[0] ?? null;

  const record = await prisma.lessonPackImport.create({
    data: {
      status: analysis.status === "analysing" ? "needs_input" : analysis.status,
      createdByUserId: input.actorUserId,
      sessionType: input.sessionType ?? "school_day",
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      licenceType: input.licenceType,
      attribution: input.attribution,
      notes: input.notes,
      yearGroupOverride: isAuto(input.yearGroup) ? null : normalizeYearGroup(input.yearGroup),
      subjectOverride: isAuto(input.subject) ? null : normalizeLessonPackSubject(input.subject),
      detectedYearGroup: primary?.yearGroup ?? null,
      detectedSubject: primary?.subject ?? null,
      detectedDifficulty: primary?.difficulty ?? null,
      yearConfidence: primary?.yearConfidence ?? null,
      subjectConfidence: primary?.subjectConfidence ?? null,
      difficultyConfidence: primary?.difficultyConfidence ?? null,
      sourceFingerprint: primary?.duplicateReport.sourceFingerprint ?? null,
      filesJson: JSON.stringify({
        storedFiles,
        files: analysis.files.map((f) => ({
          id: f.id,
          originalName: f.originalName,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
          sha256: f.sha256,
          kind: f.kind,
          classification: f.classification,
          classificationConfidence: f.classificationConfidence,
          classificationEvidence: f.classificationEvidence,
          extractionStatus: f.extractionStatus,
          extractionError: f.extractionError,
          // Persist extracted text for re-preview (private admin store only)
          textContent: f.textContent.slice(0, 100_000),
          headings: f.headings,
          documentTitle: f.documentTitle,
          pageOrSlideCount: f.pageOrSlideCount,
          metadata: f.metadata,
        })),
      }),
      analysisJson: JSON.stringify({
        lessonCount: analysis.lessonCount,
        errors: analysis.errors,
        partialFailures: analysis.partialFailures,
        lessons: analysis.lessons,
      }),
      previewJson: primary ? JSON.stringify(primary) : null,
      errorJson: analysis.errors.length || analysis.partialFailures.length
        ? JSON.stringify({ errors: analysis.errors, partialFailures: analysis.partialFailures })
        : null,
    },
  });

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "lesson_pack_import.uploaded",
    entityType: "LessonPackImport",
    entityId: record.id,
    metadata: {
      fileNames: input.files.map((f) => f.fileName),
      fileHashes: analysis.files.map((f) => f.sha256),
      classifications: analysis.files.map((f) => ({ name: f.originalName, classification: f.classification })),
      detectedYearGroup: primary?.yearGroup,
      detectedSubject: primary?.subject,
      detectedDifficulty: primary?.difficulty,
      lessonCount: analysis.lessonCount,
      licenceType: input.licenceType,
    },
  });

  return { record, analysis };
}

function isAuto(value: string | null | undefined): boolean {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  return v === "" || v === "auto" || v === "auto-detect";
}

export async function createLessonPackDraft(input: {
  importId: string;
  actorUserId?: string;
  lessonGroupId?: string | null;
  yearGroup?: string | null;
  subject?: string | null;
  difficulty?: number | null;
  duplicateOverrideReason?: string | null;
  classificationOverrides?: Record<string, LessonPackComponentType>;
}) {
  const existing = await prisma.lessonPackImport.findUnique({ where: { id: input.importId } });
  if (!existing) {
    throw new Error("Import job not found");
  }

  const analysis = existing.analysisJson ? JSON.parse(existing.analysisJson) as {
    lessons: LessonPackPreview[];
  } : { lessons: [] as LessonPackPreview[] };

  const preview =
    (input.lessonGroupId
      ? analysis.lessons.find((l) => l.lessonGroupId === input.lessonGroupId)
      : null)
    ?? analysis.lessons[0]
    ?? (existing.previewJson ? JSON.parse(existing.previewJson) as LessonPackPreview : null);

  if (!preview) {
    throw new Error("No analysed lesson preview available");
  }

  if (preview.preDraftValidation && !preview.preDraftValidation.overallReady) {
    const detail = preview.preDraftValidation.issues?.slice(0, 3).join("; ") || "lesson is not Ready";
    throw new Error(`Cannot create draft while pre-draft validation is incomplete: ${detail}`);
  }

  // Apply curriculum overrides for draft creation
  const yearGroup = normalizeYearGroup(input.yearGroup ?? existing.yearGroupOverride ?? preview.yearGroup);
  const subject = normalizeLessonPackSubject(input.subject ?? existing.subjectOverride ?? preview.subject);
  const difficulty = input.difficulty ?? existing.difficultyOverride ?? preview.difficulty ?? 3;

  if (!yearGroup || !subject) {
    throw new Error("Year group and a supported StarLiz subject are required before creating a draft. Unsupported detected subjects cannot be saved.");
  }

  // Licence gate: third-party imported content must have source/licence info
  const hasThirdPartyOrigin = Boolean(
    preview.sourceName || preview.structured?.sourceMetadata?.providerHints?.length
    || existing.sourceName,
  );
  if (hasThirdPartyOrigin) {
    const missingFields: string[] = [];
    if (!existing.sourceName?.trim() && !preview.sourceName?.trim()) missingFields.push("Source name");
    if (!existing.licenceType?.trim() && !preview.licenceType?.trim()) missingFields.push("Licence type");
    if (!existing.attribution?.trim() && !preview.attribution?.trim()) missingFields.push("Attribution wording");
    let licenceConfirmed = false;
    try {
      const filesMeta = existing.filesJson ? JSON.parse(existing.filesJson) as {
        uploadSession?: { licenceConfirmed?: boolean };
      } : {};
      licenceConfirmed = Boolean(filesMeta.uploadSession?.licenceConfirmed);
    } catch {
      licenceConfirmed = false;
    }
    if (!licenceConfirmed) {
      missingFields.push("Licence confirmation");
    }
    if (missingFields.length) {
      throw new Error(`${missingFields.join(", ")} required for third-party imported content before creating a draft.`);
    }
  }

  const duplicateBlocked = preview.duplicateReport.blocked;
  if (duplicateBlocked) {
    const reason = String(input.duplicateOverrideReason ?? "").trim();
    if (!reason || reason.length < 8) {
      throw new Error("High-confidence or exact duplicate detected. Provide a mandatory override reason (min 8 characters) or cancel.");
    }
  }

  // Rebuild items with overrides reflected in metadata
  const items = preview.starlizDraftItems;
  const metadata = {
    ...preview.starlizMetadata,
    subject,
    curriculumArea: preview.curriculumArea ?? preview.structured?.curriculumArea ?? null,
    yearGroup,
    keyStage: keyStageForYearGroup(yearGroup),
    difficulty,
    sourceFingerprint: preview.duplicateReport.sourceFingerprint,
    importId: existing.id,
    licenceType: existing.licenceType ?? preview.licenceType,
    attribution: existing.attribution ?? preview.attribution,
    sourceName: existing.sourceName ?? preview.sourceName,
    sourceUrl: existing.sourceUrl ?? preview.sourceUrl,
    duplicateOverrideReason: duplicateBlocked ? input.duplicateOverrideReason : null,
    thirdPartyFindings: preview.thirdPartyFindings,
    reviewStatus: "awaiting_review",
  };

  const legacyType = mapSubjectToLegacyContentType(subject) ?? "reading";
  const generationType = GENERATION_CONTENT_TYPE_BY_SUBJECT[subject] ?? "reading";
  const status = resolveBlackBoxGatedSaveStatus("generated");

  const content = await prisma.aIContentCache.create({
    data: {
      contentType: legacyType,
      level: difficulty,
      topic: preview.title,
      contentJson: JSON.stringify(items),
      status,
      createdBy: input.actorUserId ?? "admin-import",
      model: "lesson-pack-bulk-import-v1",
      prompt: `Bulk import: ${preview.title}`,
      keyStage: keyStageForYearGroup(yearGroup),
      yearGroup,
      skillFocus: preview.learningObjective?.slice(0, 120) ?? generationType,
      metadataJson: JSON.stringify(metadata),
    },
  });

  const updated = await prisma.lessonPackImport.update({
    where: { id: existing.id },
    data: {
      status: "awaiting_review",
      contentId: content.id,
      yearGroupOverride: yearGroup,
      subjectOverride: subject,
      difficultyOverride: difficulty,
      detectedYearGroup: preview.yearGroup,
      detectedSubject: preview.subject,
      detectedDifficulty: preview.difficulty,
      duplicateOverrideReason: duplicateBlocked ? input.duplicateOverrideReason : existing.duplicateOverrideReason,
      previewJson: JSON.stringify({ ...preview, yearGroup, subject, difficulty }),
    },
  });

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "lesson_pack_import.draft_created",
    entityType: "LessonPackImport",
    entityId: existing.id,
    metadata: {
      contentId: content.id,
      yearGroup,
      subject,
      difficulty,
      duplicateBlocked,
      duplicateOverrideReason: duplicateBlocked ? input.duplicateOverrideReason : null,
      sourceFingerprint: preview.duplicateReport.sourceFingerprint,
      licenceType: existing.licenceType,
      thirdPartyExcluded: preview.thirdPartyFindings.filter((f) => f.action === "exclude").length,
    },
  });

  if (duplicateBlocked) {
    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: "lesson_pack_import.duplicate_override",
      entityType: "LessonPackImport",
      entityId: existing.id,
      metadata: {
        reason: input.duplicateOverrideReason,
        matches: preview.duplicateReport.matches,
        contentId: content.id,
      },
    });
  }

  return { importRecord: updated, content };
}

export async function revalidateImportedContent(input: { contentId: string; actorUserId?: string }) {
  const content = await prisma.aIContentCache.findUnique({ where: { id: input.contentId } });
  if (!content) throw new Error("Imported content not found");
  const importRecord = await prisma.lessonPackImport.findFirst({ where: { contentId: input.contentId } });
  if (!importRecord) throw new Error("This action is only available for imported content");
  const preview = importRecord.previewJson ? JSON.parse(importRecord.previewJson) as LessonPackPreview : null;
  if (!preview?.structured) throw new Error("Imported lesson validation source is unavailable");
  const metadata = content.metadataJson ? JSON.parse(content.metadataJson) as Record<string, unknown> : {};
  const subject = normalizeLessonPackSubject(String(metadata.subject ?? preview.subject ?? ""));
  const previousResult = metadata.academicValidation ?? preview.academicValidation ?? null;
  const result = validateImportedLesson({
    model: preview.structured,
    subject,
    sessionType: preview.sessionType,
    difficulty: Number(metadata.difficulty ?? preview.difficulty ?? 3),
    estimatedDurationMinutes: preview.estimatedDurationMinutes,
    duplicatePassed: !preview.duplicateReport.blocked || Boolean(metadata.duplicateOverrideReason),
    licencePassed: Boolean((importRecord.licenceType ?? preview.licenceType)?.trim())
      && Boolean((importRecord.sourceName ?? preview.sourceName)?.trim())
      && Boolean((importRecord.attribution ?? preview.attribution)?.trim()),
    thirdPartyPassed: preview.thirdPartyFindings.every((finding) => finding.action === "exclude"),
  });
  const nextMetadata = {
    ...metadata,
    academicValidationVersion: result.version,
    academicValidationDate: result.validatedAt,
    academicValidationReadiness: result.readiness,
    previousAcademicValidation: previousResult,
    academicValidation: result,
    validationUpdateAvailable: false,
  };
  await prisma.$transaction([
    prisma.aIContentCache.update({ where: { id: content.id }, data: { metadataJson: JSON.stringify(nextMetadata) } }),
    prisma.lessonPackImport.update({ where: { id: importRecord.id }, data: { previewJson: JSON.stringify({ ...preview, academicValidation: result }) } }),
  ]);
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "lesson_pack_import.academic_revalidated",
    entityType: "AIContentCache",
    entityId: content.id,
    metadata: { previousResult, newResult: result, issuesFound: result.issues.length, validationVersion: result.version },
  });
  return { previousResult, result };
}

export async function getLessonPackImport(id: string) {
  return prisma.lessonPackImport.findUnique({ where: { id } });
}
