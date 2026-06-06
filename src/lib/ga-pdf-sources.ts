import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

export const GA_PDF_MAX_BYTES = 25 * 1024 * 1024;

export type GaPdfValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export function validateGaPdfUpload(fileName: string, mimeType: string, sizeBytes: number): GaPdfValidationResult {
  const safeName = String(fileName ?? "").trim();
  const safeType = String(mimeType ?? "").trim().toLowerCase();

  const isPdf = safeName.toLowerCase().endsWith(".pdf") || safeType === "application/pdf";
  if (!isPdf) {
    return { ok: false, error: "Invalid file type. Please upload a PDF file." };
  }
  if (sizeBytes > GA_PDF_MAX_BYTES) {
    return { ok: false, error: "File too large. Maximum PDF size is 25MB." };
  }
  return { ok: true };
}

export function isGaPdfStorageConfigured(): boolean {
  return Boolean(process.env.GA_PDF_STORAGE_DIR);
}

export async function saveGaPdfToLocalStorage(fileName: string, bytes: Uint8Array): Promise<{ filePath: string; fileName: string }> {
  const dir = process.env.GA_PDF_STORAGE_DIR;
  if (!dir) {
    throw new Error("PDF storage is not configured.");
  }

  await mkdir(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const cleanedFileName = basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `${timestamp}-${cleanedFileName}`;
  const filePath = join(dir, storedName);
  await writeFile(filePath, Buffer.from(bytes));
  return { filePath, fileName: storedName };
}
