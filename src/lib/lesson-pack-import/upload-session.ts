import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import {
  assertLessonPackStorageForRuntime,
  assertPrivateObjectKey,
  createSignedUpload,
  deleteStoredObject,
  downloadStoredObject,
  downloadStoredObjectPrefix,
  headStoredObject,
  newFileId,
  type LessonPackStorageProvider,
  type SignedUploadTarget,
} from "@/lib/lesson-pack-import/object-storage";
import { normalizeLessonPackMimeType } from "@/lib/lesson-pack-import/upload-errors";
import {
  LESSON_PACK_UPLOAD_LIMITS,
  formatLessonPackFileCountError,
  formatLessonPackFileLimitError,
  formatLessonPackTotalLimitError,
} from "@/lib/lesson-pack-import/upload-limits";
import { validateLessonPackUpload } from "@/lib/lesson-pack-import/security";
import {
  analyseLessonPackUpload,
  type RawLessonPackUpload,
} from "@/lib/lesson-pack-import/pipeline";
import type {
  LessonPackComponentType,
  LessonPackSessionType,
} from "@/lib/lesson-pack-import/types";
import { normalizeLessonPackSubject } from "@/lib/lesson-pack-import/subject-detection";
import { normalizeYearGroup } from "@/lib/curriculum";

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour for active uploads
export const ABANDONED_RETENTION_MS = 24 * 60 * 60 * 1000;

export type UploadSessionObject = {
  fileId: string;
  fileName: string;
  mimeType: string;
  expectedSizeBytes: number;
  objectKey: string;
  status: "pending" | "uploaded" | "verified" | "rejected";
  actualSizeBytes?: number;
  sha256?: string;
  contentType?: string;
  error?: string;
};

export type UploadSessionState = {
  provider: LessonPackStorageProvider;
  createdByUserId: string;
  expiresAt: string;
  prefix: string;
  objects: UploadSessionObject[];
  licenceConfirmed?: boolean;
  cancelled?: boolean;
  verifiedAt?: string;
};

function isAuto(value: string | null | undefined): boolean {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  return v === "" || v === "auto" || v === "auto-detect";
}

function parseFilesJson(raw: string | null | undefined): {
  uploadSession?: UploadSessionState;
  [key: string]: unknown;
} {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as { uploadSession?: UploadSessionState };
  } catch {
    return {};
  }
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

export async function createUploadSession(input: {
  actorUserId: string;
  files: Array<{ fileName: string; mimeType: string; sizeBytes: number }>;
  sessionType?: LessonPackSessionType;
  yearGroup?: string | null;
  subject?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  licenceType?: string | null;
  attribution?: string | null;
  notes?: string | null;
  licenceConfirmed?: boolean;
}): Promise<{
  sessionId: string;
  status: string;
  provider: LessonPackStorageProvider;
  expiresAt: string;
  uploads: Array<SignedUploadTarget & { fileId: string; fileName: string; expectedSizeBytes: number }>;
}> {
  if (!input.files.length) {
    throw new Error("At least one file is required.");
  }
  if (input.files.length > LESSON_PACK_UPLOAD_LIMITS.maxFiles) {
    throw new Error(formatLessonPackFileCountError());
  }

  let total = 0;
  for (const file of input.files) {
    if (file.sizeBytes > LESSON_PACK_UPLOAD_LIMITS.maxFileBytes) {
      throw new Error(formatLessonPackFileLimitError());
    }
    total += file.sizeBytes;
    if (total > LESSON_PACK_UPLOAD_LIMITS.maxTotalBytes) {
      throw new Error(formatLessonPackTotalLimitError());
    }
  }

  const provider = assertLessonPackStorageForRuntime();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const record = await prisma.lessonPackImport.create({
    data: {
      status: "uploading",
      createdByUserId: input.actorUserId,
      sessionType: input.sessionType ?? "school_day",
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      licenceType: input.licenceType,
      attribution: input.attribution,
      notes: input.notes,
      yearGroupOverride: isAuto(input.yearGroup) ? null : normalizeYearGroup(input.yearGroup),
      subjectOverride: isAuto(input.subject) ? null : normalizeLessonPackSubject(input.subject),
      filesJson: JSON.stringify({ uploadSession: { provider, createdByUserId: input.actorUserId, expiresAt, prefix: "", objects: [], licenceConfirmed: Boolean(input.licenceConfirmed) } }),
    },
  });

  const objects: UploadSessionObject[] = [];
  const uploads: Array<SignedUploadTarget & { fileId: string; fileName: string; expectedSizeBytes: number }> = [];

  for (const file of input.files) {
    const fileId = newFileId();
    const mimeType = normalizeLessonPackMimeType(file.fileName, file.mimeType);
    const signed = await createSignedUpload({
      userId: input.actorUserId,
      sessionId: record.id,
      fileId,
      fileName: file.fileName,
      mimeType,
      expectedSizeBytes: file.sizeBytes,
    });
    objects.push({
      fileId,
      fileName: file.fileName,
      mimeType,
      expectedSizeBytes: file.sizeBytes,
      objectKey: signed.objectKey,
      status: "pending",
    });
    uploads.push({
      ...signed,
      fileId,
      fileName: file.fileName,
      expectedSizeBytes: file.sizeBytes,
    });
  }

  const prefix = `lesson-packs/private/${input.actorUserId}/${record.id}/`;
  const uploadSession: UploadSessionState = {
    provider,
    createdByUserId: input.actorUserId,
    expiresAt,
    prefix,
    objects,
    licenceConfirmed: Boolean(input.licenceConfirmed),
  };

  await prisma.lessonPackImport.update({
    where: { id: record.id },
    data: {
      filesJson: JSON.stringify({ uploadSession }),
    },
  });

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "lesson_pack_import.upload_session_created",
    entityType: "LessonPackImport",
    entityId: record.id,
    metadata: {
      provider,
      fileCount: objects.length,
      expectedTotalBytes: total,
      expiresAt,
    },
  });

  return {
    sessionId: record.id,
    status: "uploading",
    provider,
    expiresAt,
    uploads,
  };
}

export async function completeUploadSession(input: {
  sessionId: string;
  actorUserId: string;
  reportedFiles?: Array<{ fileId: string; objectKey?: string }>;
}): Promise<{ status: string; verifiedCount: number; totalBytes: number }> {
  const record = await prisma.lessonPackImport.findUnique({ where: { id: input.sessionId } });
  if (!record) throw new Error("Upload session not found");
  if (record.createdByUserId && record.createdByUserId !== input.actorUserId) {
    throw new Error("Upload session does not belong to this Admin.");
  }

  const parsed = parseFilesJson(record.filesJson);
  const session = parsed.uploadSession;
  if (!session) throw new Error("Upload session metadata missing");
  if (session.cancelled) throw new Error("Upload session was cancelled");
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    throw new Error("Upload session expired");
  }

  await prisma.lessonPackImport.update({
    where: { id: record.id },
    data: { status: "verifying_upload" },
  });

  let totalBytes = 0;
  const verified: UploadSessionObject[] = [];

  for (const obj of session.objects) {
    assertPrivateObjectKey(obj.objectKey, record.id, input.actorUserId);
    const head = await headStoredObject(obj.objectKey);
    if (!head || head.sizeBytes <= 0) {
      await deleteStoredObject(obj.objectKey).catch(() => {});
      throw new Error(`Uploaded object missing for ${obj.fileName}`);
    }
    // Actual stored size always overrides browser-reported size.
    const actualSize = head.sizeBytes;
    if (actualSize > LESSON_PACK_UPLOAD_LIMITS.maxFileBytes) {
      await deleteStoredObject(obj.objectKey).catch(() => {});
      throw new Error(formatLessonPackFileLimitError());
    }
    totalBytes += actualSize;
    if (totalBytes > LESSON_PACK_UPLOAD_LIMITS.maxTotalBytes) {
      for (const prev of [...verified, obj]) {
        await deleteStoredObject(prev.objectKey).catch(() => {});
      }
      throw new Error(formatLessonPackTotalLimitError());
    }

    const sample = await downloadStoredObjectPrefix(obj.objectKey, 64 * 1024);
    const validation = validateLessonPackUpload({
      fileName: obj.fileName,
      mimeType: obj.mimeType,
      sizeBytes: actualSize,
      bytes: sample.bytes,
    });
    if (!validation.ok) {
      await deleteStoredObject(obj.objectKey).catch(() => {});
      throw new Error(validation.error);
    }

    verified.push({
      ...obj,
      status: "verified",
      actualSizeBytes: actualSize,
      contentType: head.contentType || obj.mimeType,
      error: undefined,
    });
  }

  session.objects = verified;
  session.verifiedAt = new Date().toISOString();

  await prisma.lessonPackImport.update({
    where: { id: record.id },
    data: {
      status: "uploaded",
      filesJson: JSON.stringify({
        ...parsed,
        uploadSession: session,
        verifiedFiles: verified.map((f) => ({
          fileId: f.fileId,
          fileName: f.fileName,
          objectKey: f.objectKey,
          sizeBytes: f.actualSizeBytes,
          sha256: f.sha256,
          mimeType: f.mimeType,
        })),
      }),
    },
  });

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "lesson_pack_import.upload_verified",
    entityType: "LessonPackImport",
    entityId: record.id,
    metadata: {
      verifiedCount: verified.length,
      totalBytes,
      fingerprints: verified.map((f) => f.sha256),
    },
  });

  return { status: "uploaded", verifiedCount: verified.length, totalBytes };
}

export async function cancelUploadSession(input: {
  sessionId: string;
  actorUserId: string;
}): Promise<void> {
  const record = await prisma.lessonPackImport.findUnique({ where: { id: input.sessionId } });
  if (!record) throw new Error("Upload session not found");
  if (record.createdByUserId && record.createdByUserId !== input.actorUserId) {
    throw new Error("Upload session does not belong to this Admin.");
  }
  // Do not cancel once a Content Library draft exists
  if (record.contentId) {
    throw new Error("Cannot cancel an import that already has a Content Library draft.");
  }

  const parsed = parseFilesJson(record.filesJson);
  const session = parsed.uploadSession;
  if (session) {
    session.cancelled = true;
    for (const obj of session.objects) {
      await deleteStoredObject(obj.objectKey).catch(() => {});
      obj.status = "rejected";
    }
  }

  await prisma.lessonPackImport.update({
    where: { id: record.id },
    data: {
      status: "cancelled",
      filesJson: JSON.stringify({ ...parsed, uploadSession: session }),
      errorJson: JSON.stringify({ cancelled: true, at: new Date().toISOString() }),
    },
  });

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "lesson_pack_import.upload_cancelled",
    entityType: "LessonPackImport",
    entityId: record.id,
    metadata: { deletedObjects: session?.objects.length ?? 0 },
  });
}

export async function analyseFromUploadSession(input: {
  sessionId: string;
  actorUserId: string;
  sessionType?: LessonPackSessionType;
  yearGroup?: string | null;
  subject?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  licenceType?: string | null;
  attribution?: string | null;
  notes?: string | null;
  licenceConfirmed?: boolean;
  classificationOverrides?: Record<string, LessonPackComponentType>;
}) {
  const record = await prisma.lessonPackImport.findUnique({ where: { id: input.sessionId } });
  if (!record) throw new Error("Upload session not found");
  if (record.createdByUserId && record.createdByUserId !== input.actorUserId) {
    throw new Error("Upload session does not belong to this Admin.");
  }
  if (record.status === "cancelled") {
    throw new Error("Cancelled upload sessions cannot be analysed.");
  }

  const parsed = parseFilesJson(record.filesJson);
  const session = parsed.uploadSession;
  if (!session) throw new Error("Upload session metadata missing");
  if (session.cancelled) throw new Error("Cancelled upload sessions cannot be analysed.");
  if (!session.objects.every((o) => o.status === "verified")) {
    throw new Error("Upload verification must complete before analysis.");
  }

  const sourceName = input.sourceName ?? record.sourceName;
  const licenceType = input.licenceType ?? record.licenceType;
  const attribution = input.attribution ?? record.attribution;
  const licenceConfirmed = Boolean(input.licenceConfirmed ?? session.licenceConfirmed);

  // Soft third-party gate: if provider hints may exist we still analyse, but draft creation remains gated.
  session.licenceConfirmed = licenceConfirmed;

  await prisma.lessonPackImport.update({
    where: { id: record.id },
    data: {
      status: "extracting",
      sourceName,
      sourceUrl: input.sourceUrl ?? record.sourceUrl,
      licenceType,
      attribution,
      notes: input.notes ?? record.notes,
      filesJson: JSON.stringify({ ...parsed, uploadSession: session }),
    },
  });

  const rawFiles: RawLessonPackUpload[] = [];
  for (const obj of session.objects) {
    const downloaded = await downloadStoredObject(obj.objectKey);
    rawFiles.push({
      fileName: obj.fileName,
      mimeType: obj.mimeType,
      bytes: downloaded.bytes,
    });
  }

  await prisma.lessonPackImport.update({
    where: { id: record.id },
    data: { status: "analysing" },
  });

  const historicalRecords = await loadHistoricalRecords(
    isAuto(input.subject ?? record.subjectOverride) ? null : (input.subject ?? record.subjectOverride),
    isAuto(input.yearGroup ?? record.yearGroupOverride) ? null : (input.yearGroup ?? record.yearGroupOverride),
  );

  const analysis = analyseLessonPackUpload({
    files: rawFiles,
    sessionType: input.sessionType ?? (record.sessionType as LessonPackSessionType) ?? "school_day",
    yearGroup: input.yearGroup ?? record.yearGroupOverride,
    subject: input.subject ?? record.subjectOverride,
    sourceName,
    sourceUrl: input.sourceUrl ?? record.sourceUrl,
    licenceType,
    attribution,
    notes: input.notes ?? record.notes,
    classificationOverrides: input.classificationOverrides,
    historicalRecords,
  });

  const primary = analysis.lessons[0] ?? null;
  const hasNeedsInput = analysis.status === "needs_input"
    || analysis.lessons.some((l) => l.preDraftValidation && !l.preDraftValidation.overallReady);

  const nextStatus = analysis.status === "analysis_failed"
    ? "failed"
    : hasNeedsInput
      ? "needs_input"
      : "preview_ready";

  const updated = await prisma.lessonPackImport.update({
    where: { id: record.id },
    data: {
      status: nextStatus,
      detectedYearGroup: primary?.yearGroup ?? null,
      detectedSubject: primary?.subject ?? null,
      detectedDifficulty: primary?.difficulty ?? null,
      yearConfidence: primary?.yearConfidence ?? null,
      subjectConfidence: primary?.subjectConfidence ?? null,
      difficultyConfidence: primary?.difficultyConfidence ?? null,
      sourceFingerprint: primary?.duplicateReport.sourceFingerprint ?? null,
      filesJson: JSON.stringify({
        ...parsed,
        uploadSession: session,
        verifiedFiles: session.objects,
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
          textContent: f.textContent.slice(0, 100_000),
          headings: f.headings,
          documentTitle: f.documentTitle,
          pageOrSlideCount: f.pageOrSlideCount,
          metadata: f.metadata,
          equivalentGroupId: f.equivalentGroupId,
          isPrimaryExtractionSource: f.isPrimaryExtractionSource,
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
    action: "lesson_pack_import.analysed",
    entityType: "LessonPackImport",
    entityId: record.id,
    metadata: {
      status: nextStatus,
      lessonCount: analysis.lessonCount,
      sourceFingerprint: primary?.duplicateReport.sourceFingerprint,
      licenceConfirmed,
    },
  });

  return { record: updated, analysis };
}

export async function cleanupAbandonedUploadSessions(maxAgeMs = ABANDONED_RETENTION_MS): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const candidates = await prisma.lessonPackImport.findMany({
    where: {
      contentId: null,
      status: { in: ["uploading", "uploaded", "verifying_upload", "failed", "cancelled", "analysis_failed"] },
      updatedAt: { lt: cutoff },
    },
    take: 100,
  });

  let cleaned = 0;
  for (const record of candidates) {
    const parsed = parseFilesJson(record.filesJson);
    const session = parsed.uploadSession;
    if (!session?.objects?.length) continue;
    for (const obj of session.objects) {
      await deleteStoredObject(obj.objectKey).catch(() => {});
    }
    session.cancelled = true;
    await prisma.lessonPackImport.update({
      where: { id: record.id },
      data: {
        status: record.status === "cancelled" ? "cancelled" : record.status,
        filesJson: JSON.stringify({
          ...parsed,
          uploadSession: session,
          cleanupAt: new Date().toISOString(),
        }),
      },
    });
    cleaned++;
  }
  return cleaned;
}

/** Test helper: compute fingerprint from verified bytes. */
export function fingerprintFromBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
