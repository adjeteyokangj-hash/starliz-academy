import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  generateR2ObjectKey,
  type UploadFolder,
  uploadFileToR2,
} from "@/lib/r2-upload";

const ALLOWED_FOLDERS = new Set<UploadFolder>(["avatars", "lessons", "certificates", "audio", "admin"]);
const ALLOWED_AVATAR_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type UploadDeps = {
  requireAdmin: typeof requireAdmin;
  generateR2ObjectKey: typeof generateR2ObjectKey;
  uploadFileToR2: typeof uploadFileToR2;
};

const defaultDeps: UploadDeps = {
  requireAdmin,
  generateR2ObjectKey,
  uploadFileToR2,
};

function getFolder(value: FormDataEntryValue | null): UploadFolder {
  const requested = String(value ?? "admin").trim().toLowerCase() as UploadFolder;
  if (!ALLOWED_FOLDERS.has(requested)) {
    throw new Error("Invalid upload folder. Use avatars, lessons, certificates, audio, or admin.");
  }
  return requested;
}

function isAllowedForFolder(folder: UploadFolder, mimeType: string): boolean {
  if (folder === "avatars") {
    return ALLOWED_AVATAR_MIME_TYPES.has(mimeType);
  }
  return ALLOWED_UPLOAD_MIME_TYPES.has(mimeType);
}

function fileTypeError(folder: UploadFolder): string {
  if (folder === "avatars") {
    return "Avatar uploads must be non-identifying PNG, JPEG, WebP, or GIF images. SVG, documents, audio, and video are not allowed.";
  }
  return "File type not allowed. Use supported images, PDFs, audio, or lesson media formats.";
}

export async function handleUpload(request: Request, deps: UploadDeps = defaultDeps) {
  const { session, response } = await deps.requireAdmin();
  if (!session) return response!;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const rawFile = form.get("file");
  if (!(rawFile instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const folderValue = form.get("folder");
  let folder: UploadFolder;
  try {
    folder = getFolder(folderValue);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid folder." }, { status: 400 });
  }

  if (!rawFile.type || !isAllowedForFolder(folder, rawFile.type)) {
    return NextResponse.json(
      { error: fileTypeError(folder) },
      { status: 400 },
    );
  }

  if (rawFile.size <= 0) {
    return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
  }

  if (rawFile.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `File too large. Max ${(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)} MB.` }, { status: 400 });
  }

  const objectKey = deps.generateR2ObjectKey({
    folder,
    originalFilename: rawFile.name,
    mimeType: rawFile.type,
  });

  try {
    const bytes = Buffer.from(await rawFile.arrayBuffer());
    const uploaded = await deps.uploadFileToR2({
      objectKey,
      body: bytes,
      mimeType: rawFile.type,
      cacheControl: rawFile.type.startsWith("audio/") ? "public, max-age=86400" : undefined,
    });

    return NextResponse.json({
      ok: true,
      folder,
      originalFilename: rawFile.name,
      objectKey: uploaded.objectKey,
      publicUrl: uploaded.publicUrl,
      mimeType: rawFile.type,
      size: rawFile.size,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handleUpload(request);
}
