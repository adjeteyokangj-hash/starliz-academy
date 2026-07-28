/**
 * Shared lesson-pack upload limits (client + server).
 * Keep this module free of Node-only APIs so the Admin UI can import it.
 */
export const LESSON_PACK_UPLOAD_LIMITS = {
  /** Maximum size of one uploaded file (including a ZIP). */
  maxFileBytes: 100 * 1024 * 1024,
  /** Maximum combined size of all files in one upload request. */
  maxTotalBytes: 300 * 1024 * 1024,
  /** Maximum files selected in one upload request (a ZIP counts as one). */
  maxFiles: 40,
  /** Maximum entries extracted from a ZIP (ZIP-bomb guard). */
  maxZipEntries: 500,
  /** Maximum total uncompressed bytes extracted from a ZIP. */
  maxZipExtractedBytes: 1024 * 1024 * 1024,
  /** Maximum size of one extracted ZIP entry. */
  maxZipEntryBytes: 150 * 1024 * 1024,
  /** Nested ZIP depth (0 = nested ZIPs rejected). */
  maxNestedZipDepth: 0,
  /** Reject archives whose expanded/compressed ratio looks explosive. */
  maxCompressionRatio: 100,
} as const;

export type LessonPackUploadLimits = typeof LESSON_PACK_UPLOAD_LIMITS;

export function lessonPackMaxFileMb(): number {
  return Math.round(LESSON_PACK_UPLOAD_LIMITS.maxFileBytes / (1024 * 1024));
}

export function lessonPackMaxTotalMb(): number {
  return Math.round(LESSON_PACK_UPLOAD_LIMITS.maxTotalBytes / (1024 * 1024));
}

export function formatLessonPackFileLimitError(): string {
  return `File exceeds the ${lessonPackMaxFileMb()}MB individual-file limit.`;
}

export function formatLessonPackTotalLimitError(): string {
  return `This upload exceeds the ${lessonPackMaxTotalMb()}MB combined limit.`;
}

export function formatLessonPackFileCountError(): string {
  return `Too many files (max ${LESSON_PACK_UPLOAD_LIMITS.maxFiles}).`;
}
