import { createHash } from "node:crypto";
import type { LessonPackFileKind } from "@/lib/lesson-pack-import/types";
import {
  LESSON_PACK_UPLOAD_LIMITS,
  formatLessonPackFileLimitError,
} from "@/lib/lesson-pack-import/upload-limits";

/** @deprecated Prefer LESSON_PACK_UPLOAD_LIMITS — kept for existing imports. */
export const LESSON_PACK_MAX_FILE_BYTES = LESSON_PACK_UPLOAD_LIMITS.maxFileBytes;
/** @deprecated Prefer LESSON_PACK_UPLOAD_LIMITS */
export const LESSON_PACK_MAX_TOTAL_BYTES = LESSON_PACK_UPLOAD_LIMITS.maxTotalBytes;
/** @deprecated Prefer LESSON_PACK_UPLOAD_LIMITS */
export const LESSON_PACK_MAX_FILES = LESSON_PACK_UPLOAD_LIMITS.maxFiles;

export { LESSON_PACK_UPLOAD_LIMITS } from "@/lib/lesson-pack-import/upload-limits";

const MAGIC = {
  pdf: Buffer.from("%PDF"),
  zip: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  zipEmpty: Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  ole: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
} as const;

const DANGEROUS_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".ps1", ".vbs", ".js", ".jse",
  ".wsf", ".wsh", ".dll", ".sys", ".jar", ".apk", ".sh", ".bash", ".php", ".asp",
  ".aspx", ".cgi", ".pl", ".py", ".rb", ".hta", ".lnk", ".reg", ".iso", ".img",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".pptx", ".ppt", ".docx", ".doc", ".zip", ".txt", ".md",
]);

export type LessonPackSecurityResult =
  | { ok: true; kind: LessonPackFileKind; normalisedMime: string }
  | { ok: false; error: string; kind?: LessonPackFileKind };

function extensionOf(fileName: string): string {
  const base = fileName.trim().toLowerCase();
  const idx = base.lastIndexOf(".");
  return idx >= 0 ? base.slice(idx) : "";
}

function startsWith(buf: Buffer, magic: Buffer): boolean {
  return buf.length >= magic.length && buf.subarray(0, magic.length).equals(magic);
}

export function detectLessonPackFileKind(fileName: string, bytes: Buffer, mimeType?: string): LessonPackFileKind {
  const ext = extensionOf(fileName);
  const mime = String(mimeType ?? "").trim().toLowerCase();

  if (startsWith(bytes, MAGIC.pdf) || ext === ".pdf" || mime === "application/pdf") {
    if (startsWith(bytes, MAGIC.pdf)) return "pdf";
    return "pdf";
  }

  if (startsWith(bytes, MAGIC.zip) || startsWith(bytes, MAGIC.zipEmpty)) {
    if (ext === ".pptx" || mime.includes("presentationml")) return "pptx";
    if (ext === ".docx" || mime.includes("wordprocessingml")) return "docx";
    if (ext === ".zip" || mime === "application/zip" || mime === "application/x-zip-compressed") return "zip";
    // Peek ZIP names for OOXML
    const ascii = bytes.subarray(0, Math.min(bytes.length, 4096)).toString("latin1");
    if (ascii.includes("ppt/") || ascii.includes("ppt\\")) return "pptx";
    if (ascii.includes("word/") || ascii.includes("word\\")) return "docx";
    return "zip";
  }

  if (startsWith(bytes, MAGIC.ole)) {
    if (ext === ".doc") return "doc";
    if (ext === ".ppt") return "unsupported";
    return "unsupported";
  }

  if (ext === ".txt" || ext === ".md" || mime.startsWith("text/")) return "txt";
  if (ext === ".pptx") return "pptx";
  if (ext === ".docx") return "docx";
  if (ext === ".doc") return "doc";
  if (ext === ".zip") return "zip";
  return "unsupported";
}

export function validateLessonPackUpload(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  bytes?: Buffer;
}): LessonPackSecurityResult {
  const fileName = String(input.fileName ?? "").trim();
  if (!fileName) return { ok: false, error: "File name is required." };

  const ext = extensionOf(fileName);
  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return { ok: false, error: `Executable or script file rejected: ${ext}` };
  }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: `Unsupported file type: ${ext || "(none)"}. Allowed: PDF, PPTX, DOCX, ZIP, TXT.` };
  }
  if (input.sizeBytes <= 0) {
    return { ok: false, error: "Empty files are not allowed." };
  }
  if (input.sizeBytes > LESSON_PACK_MAX_FILE_BYTES) {
    return { ok: false, error: formatLessonPackFileLimitError() };
  }

  if (input.bytes && input.bytes.length > 0) {
    const kind = detectLessonPackFileKind(fileName, input.bytes, input.mimeType);
    if (kind === "unsupported") {
      return { ok: false, error: "File signature does not match an allowed lesson-pack format.", kind };
    }
    // Extension/signature mismatch guards
    if (ext === ".pdf" && !startsWith(input.bytes, MAGIC.pdf)) {
      return { ok: false, error: "PDF extension provided but file signature is not PDF.", kind };
    }
    if ((ext === ".zip" || ext === ".pptx" || ext === ".docx") && !startsWith(input.bytes, MAGIC.zip) && !startsWith(input.bytes, MAGIC.zipEmpty)) {
      return { ok: false, error: "ZIP-based extension provided but file signature is not ZIP/OOXML.", kind };
    }
    // Block obvious embedded script markers in Office/ZIP payloads
    const probe = input.bytes.subarray(0, Math.min(input.bytes.length, 64 * 1024)).toString("latin1").toLowerCase();
    if (probe.includes("vbaproject") || probe.includes("macrosheets") || probe.includes("javascript:") || probe.includes("<script")) {
      return { ok: false, error: "File contains embedded script or macro content and was rejected.", kind };
    }
    return { ok: true, kind, normalisedMime: mimeForKind(kind) };
  }

  const kindGuess =
    ext === ".pdf" ? "pdf"
      : ext === ".pptx" || ext === ".ppt" ? "pptx"
        : ext === ".docx" ? "docx"
          : ext === ".doc" ? "doc"
            : ext === ".zip" ? "zip"
              : "txt";
  return { ok: true, kind: kindGuess, normalisedMime: mimeForKind(kindGuess) };
}

export function mimeForKind(kind: LessonPackFileKind): string {
  switch (kind) {
    case "pdf": return "application/pdf";
    case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "doc": return "application/msword";
    case "zip": return "application/zip";
    case "txt": return "text/plain";
    default: return "application/octet-stream";
  }
}

export function sha256Hex(bytes: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildSourceFingerprint(input: {
  fileHashes: string[];
  normalisedTitle: string;
  sourceProvider?: string | null;
  sourceUrl?: string | null;
  yearGroup?: string | null;
  subject?: string | null;
  normalisedContent: string;
}): string {
  const payload = [
    [...input.fileHashes].sort().join("|"),
    String(input.normalisedTitle ?? "").toLowerCase().replace(/\s+/g, " ").trim(),
    String(input.sourceProvider ?? "").toLowerCase().trim(),
    String(input.sourceUrl ?? "").toLowerCase().trim(),
    String(input.yearGroup ?? "").toLowerCase().trim(),
    String(input.subject ?? "").toLowerCase().trim(),
    String(input.normalisedContent ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 8000),
  ].join("::");
  return sha256Hex(payload);
}
