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

function getFolder(value: FormDataEntryValue | null): UploadFolder {
  const requested = String(value ?? "admin").trim().toLowerCase() as UploadFolder;
  if (!ALLOWED_FOLDERS.has(requested)) {
    throw new Error("Invalid upload folder. Use avatars, lessons, certificates, audio, or admin.");
  }
  return requested;
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireAdmin();
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

  if (!rawFile.type || !ALLOWED_UPLOAD_MIME_TYPES.has(rawFile.type)) {
    return NextResponse.json(
      { error: "File type not allowed. Use supported images, PDFs, audio, or lesson media formats." },
      { status: 400 },
    );
  }

  if (rawFile.size <= 0) {
    return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
  }

  if (rawFile.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `File too large. Max ${(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)} MB.` }, { status: 400 });
  }

  const objectKey = generateR2ObjectKey({
    folder,
    originalFilename: rawFile.name,
    mimeType: rawFile.type,
  });

  try {
    const bytes = Buffer.from(await rawFile.arrayBuffer());
    const uploaded = await uploadFileToR2({
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
