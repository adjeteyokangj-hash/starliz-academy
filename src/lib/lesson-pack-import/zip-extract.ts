import { inflateRawSync, inflateSync } from "node:zlib";
import { LESSON_PACK_UPLOAD_LIMITS } from "@/lib/lesson-pack-import/upload-limits";

export type ZipEntry = {
  path: string;
  data: Buffer;
  isDirectory: boolean;
};

export type ZipExtractResult = {
  entries: ZipEntry[];
  errors: string[];
  totalExtractedBytes: number;
};

/**
 * ZIP reader for lesson-pack uploads.
 * Prefers the central directory so data-descriptor (bit 3) ZIPs used by Oak packs work.
 */
export function extractZipEntries(bytes: Buffer): ZipEntry[] {
  return extractZipEntriesSafe(bytes).entries;
}

export function extractZipEntriesSafe(bytes: Buffer): ZipExtractResult {
  const fromCentral = extractViaCentralDirectory(bytes);
  if (fromCentral.entries.length || fromCentral.errors.length) {
    return fromCentral;
  }
  return extractViaLocalHeaders(bytes);
}

function findEndOfCentralDirectory(bytes: Buffer): number {
  const maxScan = Math.min(bytes.length, 65535 + 22);
  for (let i = bytes.length - 22; i >= bytes.length - maxScan && i >= 0; i -= 1) {
    if (bytes.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function extractViaCentralDirectory(bytes: Buffer): ZipExtractResult {
  const entries: ZipEntry[] = [];
  const errors: string[] = [];
  let totalExtractedBytes = 0;

  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd < 0) return { entries, errors, totalExtractedBytes };

  const totalEntries = bytes.readUInt16LE(eocd + 10);
  const centralSize = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  if (centralOffset + 46 > bytes.length) {
    errors.push("ZIP central directory offset is invalid.");
    return { entries, errors, totalExtractedBytes };
  }

  let offset = centralOffset;
  const end = Math.min(bytes.length, centralOffset + centralSize + 1024);

  while (offset + 46 <= end && entries.length < Math.max(totalEntries, LESSON_PACK_UPLOAD_LIMITS.maxZipEntries)) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) break;

    const flags = bytes.readUInt16LE(offset + 8);
    const compression = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const fileNameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > bytes.length) break;

    const rawName = bytes.subarray(nameStart, nameEnd).toString("utf8");
    const entryPath = sanitiseZipPath(rawName);
    offset = nameEnd + extraLength + commentLength;

    if ((flags & 0x01) !== 0) {
      errors.push(`Encrypted ZIP entry rejected: ${rawName}`);
      continue;
    }
    if (!entryPath || entryPath.endsWith("/")) continue;

    if (entries.length >= LESSON_PACK_UPLOAD_LIMITS.maxZipEntries) {
      errors.push(`ZIP exceeds maximum of ${LESSON_PACK_UPLOAD_LIMITS.maxZipEntries} entries.`);
      break;
    }
    if (uncompressedSize > LESSON_PACK_UPLOAD_LIMITS.maxZipEntryBytes) {
      errors.push(`ZIP entry exceeds ${Math.round(LESSON_PACK_UPLOAD_LIMITS.maxZipEntryBytes / (1024 * 1024))}MB: ${rawName}`);
      continue;
    }
    if (
      compressedSize > 0
      && uncompressedSize > 0
      && uncompressedSize / compressedSize > LESSON_PACK_UPLOAD_LIMITS.maxCompressionRatio
      && uncompressedSize > 10 * 1024 * 1024
    ) {
      errors.push(`Suspicious ZIP compression ratio rejected: ${rawName}`);
      continue;
    }

    if (localHeaderOffset + 30 > bytes.length || bytes.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      errors.push(`Invalid local header for ${rawName}`);
      continue;
    }

    const localNameLen = bytes.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = bytes.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) {
      errors.push(`Truncated ZIP entry: ${rawName}`);
      continue;
    }

    const payload = bytes.subarray(dataStart, dataEnd);
    let data: Buffer;
    try {
      if (compression === 0) data = Buffer.from(payload);
      else if (compression === 8) {
        try {
          data = inflateRawSync(payload);
        } catch {
          data = inflateSync(payload);
        }
      } else {
        errors.push(`Unsupported ZIP compression method ${compression}: ${rawName}`);
        continue;
      }
    } catch {
      errors.push(`Failed to inflate ZIP entry: ${rawName}`);
      continue;
    }

    if (data.length > LESSON_PACK_UPLOAD_LIMITS.maxZipEntryBytes) {
      errors.push(`Extracted ZIP entry exceeds size limit: ${rawName}`);
      continue;
    }

    totalExtractedBytes += data.length;
    if (totalExtractedBytes > LESSON_PACK_UPLOAD_LIMITS.maxZipExtractedBytes) {
      errors.push(`ZIP extracted content exceeds ${Math.round(LESSON_PACK_UPLOAD_LIMITS.maxZipExtractedBytes / (1024 * 1024 * 1024))}GB limit.`);
      break;
    }

    if (entryPath.toLowerCase().endsWith(".zip") && LESSON_PACK_UPLOAD_LIMITS.maxNestedZipDepth === 0) {
      errors.push(`Nested ZIP rejected: ${rawName}`);
      continue;
    }

    entries.push({ path: entryPath, data, isDirectory: false });
  }

  return { entries, errors, totalExtractedBytes };
}

function extractViaLocalHeaders(bytes: Buffer): ZipExtractResult {
  const entries: ZipEntry[] = [];
  const errors: string[] = [];
  let offset = 0;
  let totalExtractedBytes = 0;

  while (offset + 30 <= bytes.length) {
    const signature = bytes.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;

    if (entries.length >= LESSON_PACK_UPLOAD_LIMITS.maxZipEntries) {
      errors.push(`ZIP exceeds maximum of ${LESSON_PACK_UPLOAD_LIMITS.maxZipEntries} entries.`);
      break;
    }

    const flags = bytes.readUInt16LE(offset + 6);
    const compression = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const uncompressedSize = bytes.readUInt32LE(offset + 22);
    const fileNameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > bytes.length) break;

    const rawName = bytes.subarray(nameStart, nameEnd).toString("utf8");
    const entryPath = sanitiseZipPath(rawName);
    const dataStart = nameEnd + extraLength;

    if ((flags & 0x01) !== 0) {
      errors.push(`Encrypted ZIP entry rejected: ${rawName}`);
      break;
    }

    if ((flags & 0x08) !== 0 && compressedSize === 0) {
      errors.push("ZIP uses data descriptors; central-directory parse required.");
      break;
    }

    const dataEnd = dataStart + compressedSize;
    const payload = bytes.subarray(dataStart, Math.min(dataEnd, bytes.length));

    if (uncompressedSize > LESSON_PACK_UPLOAD_LIMITS.maxZipEntryBytes) {
      errors.push(`ZIP entry exceeds size limit: ${rawName}`);
      offset = dataEnd;
      continue;
    }

    let data: Buffer;
    try {
      if (compression === 0) data = Buffer.from(payload);
      else if (compression === 8) {
        try {
          data = inflateRawSync(payload);
        } catch {
          data = inflateSync(payload);
        }
      } else {
        offset = dataEnd;
        continue;
      }
    } catch {
      offset = dataEnd;
      continue;
    }

    totalExtractedBytes += data.length;
    if (totalExtractedBytes > LESSON_PACK_UPLOAD_LIMITS.maxZipExtractedBytes) {
      errors.push("ZIP extracted content exceeds size limit.");
      break;
    }

    const lower = (entryPath || rawName).toLowerCase();
    if (lower.endsWith(".zip") && LESSON_PACK_UPLOAD_LIMITS.maxNestedZipDepth === 0) {
      errors.push(`Nested ZIP rejected: ${rawName}`);
      offset = dataEnd;
      continue;
    }

    if (entryPath) {
      entries.push({
        path: entryPath,
        data,
        isDirectory: entryPath.endsWith("/") || (uncompressedSize === 0 && rawName.endsWith("/")),
      });
    }
    offset = dataEnd;
  }

  return {
    entries: entries.filter((entry) => !entry.isDirectory && Boolean(entry.path)),
    errors,
    totalExtractedBytes,
  };
}

function sanitiseZipPath(raw: string): string {
  const normalised = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalised || normalised.includes("..") || normalised.startsWith("/") || /^[a-zA-Z]:/.test(normalised)) {
    return "";
  }
  if (normalised.startsWith("__MACOSX/") || normalised.endsWith(".DS_Store")) return "";
  return normalised;
}
