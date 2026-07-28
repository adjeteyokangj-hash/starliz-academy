import { randomUUID } from "node:crypto";
import { classifyLessonPackFile, classifyLessonPackFiles, groupFilesIntoLessonPacks, markEquivalentComponentSources } from "@/lib/lesson-pack-import/classification";
import {
  buildStructuredImportModel,
  validateQuestionAnswerSeparation,
  buildQaPairingReport,
  validatePreDraft,
} from "@/lib/lesson-pack-import/content-extraction";
import { detectDifficultyFromPack } from "@/lib/lesson-pack-import/difficulty-detection";
import {
  analyseLessonPackDuplicates,
  type HistoricalContentRecord,
} from "@/lib/lesson-pack-import/duplicates";
import {
  LESSON_PACK_MAX_FILES,
  LESSON_PACK_MAX_TOTAL_BYTES,
  sha256Hex,
  validateLessonPackUpload,
} from "@/lib/lesson-pack-import/security";
import {
  formatLessonPackTotalLimitError,
  LESSON_PACK_UPLOAD_LIMITS,
} from "@/lib/lesson-pack-import/upload-limits";
import { detectSubjectFromPack, normalizeLessonPackSubject } from "@/lib/lesson-pack-import/subject-detection";
import { extractDocumentText } from "@/lib/lesson-pack-import/text-extraction";
import { detectThirdPartyMaterial } from "@/lib/lesson-pack-import/third-party";
import { estimatedDurationMinutes, transformToStarLizDraft } from "@/lib/lesson-pack-import/transform";
import type {
  LessonPackAnalysisResult,
  LessonPackPreview,
  LessonPackSessionType,
  LessonPackStructuredModel,
  LessonPackUploadedFile,
  LessonPackComponentType,
} from "@/lib/lesson-pack-import/types";
import { detectYearGroupFromPack } from "@/lib/lesson-pack-import/year-detection";
import { extractZipEntriesSafe } from "@/lib/lesson-pack-import/zip-extract";
import {
  resolveSubjectValidationProfile,
  runGlobalImportChecks,
  runSubjectSpecificChecks,
} from "@/lib/lesson-pack-import/import-validation";
import { validateImportedLesson } from "@/lib/lesson-pack-import/academic-validation";
import { normalizeYearGroup } from "@/lib/curriculum";

export type RawLessonPackUpload = {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
};

export type LessonPackAnalyseInput = {
  files: RawLessonPackUpload[];
  sessionType?: LessonPackSessionType;
  yearGroup?: string | null; // "auto" or concrete
  subject?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  licenceType?: string | null;
  attribution?: string | null;
  notes?: string | null;
  classificationOverrides?: Record<string, LessonPackComponentType>;
  historicalRecords?: HistoricalContentRecord[];
  difficultyOverride?: number | null;
};

function isAuto(value: string | null | undefined): boolean {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  return v === "" || v === "auto" || v === "auto-detect";
}

function expandUploads(files: RawLessonPackUpload[]): {
  expanded: Array<RawLessonPackUpload & { logicalName: string }>;
  partialFailures: Array<{ fileId: string; fileName: string; error: string }>;
  errors: string[];
} {
  const expanded: Array<RawLessonPackUpload & { logicalName: string }> = [];
  const partialFailures: Array<{ fileId: string; fileName: string; error: string }> = [];
  const errors: string[] = [];
  let totalBytes = 0;

  for (const file of files) {
    totalBytes += file.bytes.length;
    if (totalBytes > LESSON_PACK_MAX_TOTAL_BYTES) {
      errors.push(formatLessonPackTotalLimitError());
      break;
    }

    const validation = validateLessonPackUpload({
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.bytes.length,
      bytes: file.bytes,
    });

    if (!validation.ok) {
      partialFailures.push({
        fileId: sha256Hex(file.fileName + String(file.bytes.length)).slice(0, 12),
        fileName: file.fileName,
        error: validation.error,
      });
      continue;
    }

    if (validation.kind === "zip") {
      try {
        const extracted = extractZipEntriesSafe(file.bytes);
        errors.push(...extracted.errors);
        if (!extracted.entries.length) {
          partialFailures.push({
            fileId: sha256Hex(file.bytes).slice(0, 12),
            fileName: file.fileName,
            error: extracted.errors[0] ?? "ZIP archive contained no usable files",
          });
          continue;
        }
        for (const entry of extracted.entries) {
          if (expanded.length >= LESSON_PACK_UPLOAD_LIMITS.maxZipEntries) {
            errors.push(`ZIP expansion stopped at ${LESSON_PACK_UPLOAD_LIMITS.maxZipEntries} entries.`);
            break;
          }
          const nestedValidation = validateLessonPackUpload({
            fileName: entry.path,
            mimeType: "application/octet-stream",
            sizeBytes: entry.data.length,
            bytes: entry.data,
          });
          if (!nestedValidation.ok || nestedValidation.kind === "zip") {
            partialFailures.push({
              fileId: sha256Hex(entry.data).slice(0, 12),
              fileName: `${file.fileName}/${entry.path}`,
              error: !nestedValidation.ok
                ? nestedValidation.error
                : "Nested ZIP not supported",
            });
            continue;
          }
          expanded.push({
            fileName: entry.path,
            logicalName: entry.path,
            mimeType: nestedValidation.normalisedMime,
            bytes: entry.data,
          });
        }
      } catch (error) {
        partialFailures.push({
          fileId: sha256Hex(file.bytes).slice(0, 12),
          fileName: file.fileName,
          error: error instanceof Error ? error.message : "ZIP extraction failed",
        });
      }
      continue;
    }

    expanded.push({
      fileName: file.fileName,
      logicalName: file.fileName,
      mimeType: validation.normalisedMime,
      bytes: file.bytes,
    });
  }

  // Upload-picker limit applies to original request files, not expanded ZIP entries.
  if (files.length > LESSON_PACK_MAX_FILES) {
    errors.push(`Too many files (max ${LESSON_PACK_MAX_FILES}).`);
  }

  return { expanded, partialFailures, errors };
}

function toUploadedFile(
  file: RawLessonPackUpload & { logicalName: string },
  override?: LessonPackComponentType,
): LessonPackUploadedFile {
  const validation = validateLessonPackUpload({
    fileName: file.logicalName,
    mimeType: file.mimeType,
    sizeBytes: file.bytes.length,
    bytes: file.bytes,
  });
  const kind = validation.ok ? validation.kind : "unsupported";
  const extracted = kind === "unsupported"
    ? {
      text: "",
      documentTitle: null,
      headings: [] as string[],
      pageOrSlideCount: 0,
      metadata: {} as Record<string, string>,
      status: "failed" as const,
      error: validation.ok ? "Unsupported" : validation.error,
    }
    : extractDocumentText(kind, file.bytes);

  const id = sha256Hex(`${file.logicalName}:${sha256Hex(file.bytes)}`).slice(0, 16);
  const base: LessonPackUploadedFile = {
    id,
    originalName: file.logicalName,
    mimeType: validation.ok ? validation.normalisedMime : file.mimeType,
    sizeBytes: file.bytes.length,
    sha256: sha256Hex(file.bytes),
    kind,
    textContent: extracted.text,
    pageOrSlideCount: extracted.pageOrSlideCount,
    headings: extracted.headings,
    documentTitle: extracted.documentTitle,
    metadata: extracted.metadata,
    extractionStatus: extracted.status,
    extractionError: extracted.error,
    isPasswordProtected: extracted.isPasswordProtected,
    isScannedImageOnly: extracted.isScannedImageOnly,
    classification: "unknown",
    classificationConfidence: 0,
    classificationEvidence: [],
    manualClassification: override,
  };

  const classified = classifyLessonPackFile(base);
  return {
    ...base,
    classification: classified.classification,
    classificationConfidence: classified.confidence,
    classificationEvidence: classified.evidence,
  };
}

function buildPreviewForGroup(input: {
  lessonGroupId: string;
  files: LessonPackUploadedFile[];
  sessionType: LessonPackSessionType;
  yearGroup?: string | null;
  subject?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  licenceType?: string | null;
  attribution?: string | null;
  historicalRecords: HistoricalContentRecord[];
  difficultyOverride?: number | null;
}): LessonPackPreview {
  const structured = buildStructuredImportModel({
    files: input.files,
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl,
    licenceType: input.licenceType,
    attribution: input.attribution,
  });

  const combined = input.files.map((f) => f.textContent).join("\n");
  const year = detectYearGroupFromPack({
    title: structured.title,
    headings: input.files.flatMap((f) => f.headings),
    text: combined,
    metadata: Object.assign({}, ...input.files.map((f) => f.metadata)),
    manualYearGroup: isAuto(input.yearGroup) ? null : input.yearGroup,
  });
  const subject = detectSubjectFromPack({
    title: structured.title,
    headings: input.files.flatMap((f) => f.headings),
    text: combined,
    metadata: Object.assign({}, ...input.files.map((f) => f.metadata)),
    manualSubject: isAuto(input.subject) ? null : input.subject,
  });

  structured.yearGroup = year.value;
  structured.keyStage = year.keyStage;
  structured.subject = subject.value;
  structured.curriculumArea = subject.curriculumArea;
  if (subject.topic && !structured.title) {
    structured.title = subject.topic;
  }

  const difficulty = detectDifficultyFromPack({
    structured,
    combinedText: combined,
    yearGroup: year.value,
  });
  const finalDifficulty = input.difficultyOverride && input.difficultyOverride >= 1 && input.difficultyOverride <= 5
    ? Math.round(input.difficultyOverride)
    : difficulty.overall;

  for (const q of [
    ...structured.starterQuestions,
    ...structured.worksheetTasks,
    ...structured.exitQuestions,
    ...structured.guidedPractice,
    ...structured.independentPractice,
  ]) {
    const perQ = difficulty.byQuestion.find((d) => d.questionId === q.id);
    q.difficulty = perQ?.difficulty ?? finalDifficulty;
  }

  const thirdPartyFindings = detectThirdPartyMaterial(input.files);
  const duplicateReport = analyseLessonPackDuplicates({
    structured,
    fileHashes: input.files.map((f) => f.sha256),
    sourceProvider: structured.sourceMetadata.providerHints[0] ?? input.sourceName,
    sourceUrl: input.sourceUrl,
    yearGroup: year.value,
    subject: subject.value,
    historicalRecords: input.historicalRecords,
  });

  const sourceDurationEstimate = estimateSourceClassroomMinutes(structured, input.files);
  const durationMinutes = estimatedDurationMinutes(input.sessionType, sourceDurationEstimate);

  const transformed = transformToStarLizDraft({
    structured,
    sessionType: input.sessionType,
    difficulty: finalDifficulty,
    excludeThirdParty: true,
    sourceDurationMinutes: sourceDurationEstimate,
  });

  const componentCounts: Record<string, number> = {};
  for (const file of input.files) {
    const key = file.manualClassification ?? file.classification;
    componentCounts[key] = (componentCounts[key] ?? 0) + 1;
  }

  const questionCount =
    structured.starterQuestions.length
    + structured.worksheetTasks.length
    + structured.exitQuestions.length;
  const answerKeyCount =
    structured.starterAnswers.length
    + structured.worksheetAnswers.length
    + structured.exitAnswers.length;

  const qaPairingReport = buildQaPairingReport(structured);
  const basePreDraftValidation = validatePreDraft({
    structured,
    licenceType: input.licenceType,
    attribution: input.attribution,
    sourceName: input.sourceName,
    thirdPartyCount: thirdPartyFindings.length,
    providerHints: structured.sourceMetadata.providerHints,
  });

  const subjectProfile = resolveSubjectValidationProfile(subject.value ?? structured.subject);
  const globalChecks = runGlobalImportChecks(structured);
  const subjectIssues = runSubjectSpecificChecks(
    subjectProfile,
    [...structured.starterQuestions, ...structured.worksheetTasks, ...structured.exitQuestions],
  );
  const academicValidation = validateImportedLesson({
    model: structured,
    subject: subject.value ?? structured.subject,
    sessionType: input.sessionType,
    difficulty: finalDifficulty,
    estimatedDurationMinutes: durationMinutes,
    duplicatePassed: !duplicateReport.blocked,
    licencePassed: basePreDraftValidation.licenceResult === "pass",
    thirdPartyPassed: thirdPartyFindings.every((finding) => finding.action === "exclude"),
  });
  const preDraftValidation = {
    ...basePreDraftValidation,
    overallReady: basePreDraftValidation.overallReady && academicValidation.readiness === "ready",
    issues: [...new Set([...basePreDraftValidation.issues, ...academicValidation.issues.map((issue) => issue.message)])],
  };

  return {
    lessonGroupId: input.lessonGroupId,
    title: structured.title,
    subject: subject.value,
    curriculumArea: structured.curriculumArea,
    yearGroup: year.value,
    keyStage: year.keyStage,
    difficulty: finalDifficulty,
    subjectConfidence: subject.confidence,
    yearConfidence: year.confidence,
    difficultyConfidence: difficulty.confidence,
    yearEvidence: year.evidence,
    difficultyReasons: difficulty.reasons,
    subjectEvidence: subject.evidence,
    yearWarning: year.mismatchWarning ?? year.warning,
    subjectWarning: subject.warning,
    learningObjective: structured.learningObjective,
    estimatedDurationMinutes: durationMinutes,
    sessionType: input.sessionType,
    fileClassifications: input.files.map((f) => ({
      fileId: f.id,
      originalName: f.originalName,
      classification: f.manualClassification ?? f.classification,
      confidence: f.classificationConfidence,
      extractionStatus: f.extractionStatus,
      extractionError: f.extractionError,
      equivalentGroupId: f.equivalentGroupId,
      isPrimaryExtractionSource: f.isPrimaryExtractionSource,
    })),
    componentCounts,
    questionCount,
    answerKeyCount,
    qaPairingReport,
    preDraftValidation,
    academicValidation,
    duplicateReport,
    thirdPartyFindings,
    licenceType: input.licenceType,
    attribution: input.attribution,
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl,
    structured,
    starlizDraftItems: transformed.items,
    starlizMetadata: {
      ...transformed.metadata,
      sourceFingerprint: duplicateReport.sourceFingerprint,
      lessonFingerprint: duplicateReport.sourceFingerprint
        ? `${duplicateReport.sourceFingerprint}:${input.lessonGroupId}`
        : `lesson:${input.lessonGroupId}`,
      qaSeparationIssues: validateQuestionAnswerSeparation(structured),
      yearDetection: year,
      subjectDetection: subject,
      difficultyDetection: difficulty,
      curriculumArea: structured.curriculumArea,
      topic: subject.topic,
      subjectValidationProfile: subjectProfile,
      globalImportChecks: globalChecks,
      subjectValidationIssues: subjectIssues,
      academicValidationVersion: academicValidation.version,
      academicValidationDate: academicValidation.validatedAt,
      academicValidationReadiness: academicValidation.readiness,
      academicValidation,
      playableReport: structured.sourceMetadata.extractionMeta
        ? {
            playableActivities: structured.sourceMetadata.extractionMeta.playableActivities ?? 0,
            blockedActivities: structured.sourceMetadata.extractionMeta.blockedActivities ?? 0,
            needsAdminReconstruction: structured.sourceMetadata.extractionMeta.needsAdminReconstruction ?? 0,
            incompleteMathExpressions: structured.sourceMetadata.extractionMeta.incompleteMathExpressions ?? 0,
            missingVisuals: structured.sourceMetadata.extractionMeta.missingVisuals ?? 0,
            lowConfidenceActivities: structured.sourceMetadata.extractionMeta.lowConfidenceActivities ?? 0,
            excludedFromQuestionCount: structured.sourceMetadata.extractionMeta.excludedFromQuestionCount ?? 0,
          }
        : null,
      adminReconstructionQueue: structured.sourceMetadata.extractionMeta?.adminReconstructionQueue ?? [],
    },
  };
}

function estimateSourceClassroomMinutes(
  structured: LessonPackStructuredModel,
  files: LessonPackUploadedFile[],
): number {
  const slides = files.filter((f) => (f.manualClassification ?? f.classification) === "teaching_slides");
  const slideCount = slides.reduce((sum, f) => sum + (f.pageOrSlideCount || 0), 0);
  const questionCount =
    structured.starterQuestions.length
    + structured.worksheetTasks.length
    + structured.exitQuestions.length;
  // Standard classroom lesson baseline ~45–60 minutes.
  let minutes = 45;
  if (slideCount >= 20 || questionCount >= 12) minutes = 60;
  if (slideCount >= 35 || questionCount >= 20) minutes = 75;
  return minutes;
}

export function analyseLessonPackUpload(input: LessonPackAnalyseInput): LessonPackAnalysisResult {
  const sessionType: LessonPackSessionType = input.sessionType ?? "school_day";
  const { expanded, partialFailures, errors } = expandUploads(input.files);

  if (!expanded.length) {
    return {
      status: "analysis_failed",
      files: [],
      lessonCount: 0,
      lessons: [],
      errors: errors.length ? errors : ["No valid lesson-pack files to analyse"],
      partialFailures,
    };
  }

  const uploaded = expanded.map((file) => {
    const overrideKey = Object.keys(input.classificationOverrides ?? {}).find((key) =>
      file.logicalName === key || file.fileName === key,
    );
    return toUploadedFile(file, overrideKey ? input.classificationOverrides?.[overrideKey] : undefined);
  });

  const classified = classifyLessonPackFiles(uploaded);
  for (const file of classified) {
    if (file.extractionStatus === "failed") {
      partialFailures.push({
        fileId: file.id,
        fileName: file.originalName,
        error: file.extractionError ?? "Extraction failed",
      });
    }
  }

  // Group first so lessonGroupId is set before equivalent PDF/PPTX primary selection.
  // Marking equivalents before grouping collapsed all lessons into one primary across the ZIP.
  const rawGroups = groupFilesIntoLessonPacks(classified);
  const lessons: LessonPackPreview[] = [];
  for (const [groupId, groupFiles] of rawGroups.entries()) {
    const scoped = markEquivalentComponentSources(groupFiles);
    lessons.push(buildPreviewForGroup({
      lessonGroupId: groupId,
      files: scoped,
      sessionType,
      yearGroup: input.yearGroup,
      subject: input.subject,
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      licenceType: input.licenceType,
      attribution: input.attribution,
      historicalRecords: input.historicalRecords ?? [],
      difficultyOverride: input.difficultyOverride,
    }));
  }

  const needsInput = lessons.some((lesson) =>
    !lesson.yearGroup
    || !lesson.subject
    || Boolean(lesson.subjectWarning?.includes("could not be mapped"))
    || lesson.duplicateReport.blocked
    || lesson.fileClassifications.some((f) => f.classification === "unknown")
    || (lesson.preDraftValidation && !lesson.preDraftValidation.overallReady),
  );

  const filesWithEquivalents = lessons.flatMap((lesson) =>
    (lesson.fileClassifications ?? []).map((fc) => {
      const base = classified.find((f) => f.id === fc.fileId)
        ?? classified.find((f) => f.originalName === fc.originalName);
      return base
        ? {
            ...base,
            lessonGroupId: lesson.lessonGroupId,
            equivalentGroupId: fc.equivalentGroupId,
            isPrimaryExtractionSource: fc.isPrimaryExtractionSource,
          }
        : null;
    }).filter((f): f is NonNullable<typeof f> => Boolean(f)),
  );

  return {
    status: errors.length && !lessons.length
      ? "analysis_failed"
      : needsInput
        ? "needs_input"
        : "analysing",
    files: filesWithEquivalents.length ? filesWithEquivalents : classified,
    lessonCount: lessons.length,
    lessons,
    errors,
    partialFailures,
  };
}

export function applyPreviewOverrides(
  preview: LessonPackPreview,
  overrides: {
    yearGroup?: string | null;
    subject?: string | null;
    difficulty?: number | null;
    classificationOverrides?: Record<string, LessonPackComponentType>;
    files?: LessonPackUploadedFile[];
    historicalRecords?: HistoricalContentRecord[];
  },
): LessonPackPreview {
  const workingFiles: LessonPackUploadedFile[] = overrides.files
    ? overrides.files.map((file) => {
      const override = overrides.classificationOverrides?.[file.id] ?? overrides.classificationOverrides?.[file.originalName];
      if (!override) return file;
      return {
        ...file,
        manualClassification: override,
        classification: override,
        classificationConfidence: 1,
        classificationEvidence: ["manual admin override"],
      };
    })
    : preview.fileClassifications.map((fc) => ({
      id: fc.fileId,
      originalName: fc.originalName,
      mimeType: "text/plain",
      sizeBytes: 0,
      sha256: fc.fileId,
      kind: "txt" as const,
      textContent: [
        ...preview.structured.starterQuestions.map((q) => q.prompt),
        ...preview.structured.worksheetTasks.map((q) => q.prompt),
        ...preview.structured.exitQuestions.map((q) => q.prompt),
        ...preview.structured.teachingExplanations,
      ].join("\n"),
      pageOrSlideCount: 1,
      headings: [preview.title],
      documentTitle: preview.title,
      metadata: { title: preview.title },
      extractionStatus: fc.extractionStatus as LessonPackUploadedFile["extractionStatus"],
      extractionError: fc.extractionError,
      classification: (overrides.classificationOverrides?.[fc.fileId] ?? fc.classification) as LessonPackComponentType,
      classificationConfidence: 1,
      classificationEvidence: ["preview override"],
      manualClassification: overrides.classificationOverrides?.[fc.fileId],
      lessonGroupId: preview.lessonGroupId,
    }));

  return buildPreviewForGroup({
    lessonGroupId: preview.lessonGroupId,
    files: workingFiles,
    sessionType: preview.sessionType,
    yearGroup: overrides.yearGroup ?? preview.yearGroup,
    subject: overrides.subject ?? preview.subject,
    sourceName: preview.sourceName,
    sourceUrl: preview.sourceUrl,
    licenceType: preview.licenceType,
    attribution: preview.attribution,
    historicalRecords: overrides.historicalRecords ?? [],
    difficultyOverride: overrides.difficulty ?? null,
  });
}

export function assertDraftPublishBlocked(status: string): boolean {
  return status !== "approved" && status !== "published";
}

export function newImportId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 24);
}

export function resolveCurriculumOverrides(input: {
  yearGroup?: string | null;
  subject?: string | null;
}): { yearGroup: string | null; subject: string | null } {
  return {
    yearGroup: isAuto(input.yearGroup) ? null : normalizeYearGroup(input.yearGroup),
    subject: isAuto(input.subject) ? null : normalizeLessonPackSubject(input.subject),
  };
}
