import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAdminPermission } from "@/lib/api_guard";
import { uploadFileToR2 } from "@/lib/r2-upload";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
};

type AdminMessageUploadDeps = {
  requireAdminPermission: typeof requireAdminPermission;
  uploadFileToR2: typeof uploadFileToR2;
  now: () => Date;
  randomUUID: () => string;
};

const defaultDeps: AdminMessageUploadDeps = {
  requireAdminPermission,
  uploadFileToR2,
  now: () => new Date(),
  randomUUID,
};

function isPublicHttpsUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
  } catch {
    return false;
  }
}

async function requireMessagingUploadAccess(deps: AdminMessageUploadDeps) {
  const { session, response } = await deps.requireAdminPermission("MANAGE_INBOX");
  if (!session) return response!;
  return null;
}

function buildAdminMessageObjectKey(date: Date, uuid: string, ext: string): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `admin/messages/${year}/${month}/${day}/${uuid}.${ext}`;
}

export async function handleAdminMessageUpload(request: Request, deps: AdminMessageUploadDeps = defaultDeps) {
  const authResponse = await requireMessagingUploadAccess(deps);
  if (authResponse) return authResponse;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data." }, { status: 400 });

  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });

  const ext = ALLOWED[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "File type not allowed. Use non-sensitive image or audio files only. Do not attach safeguarding, medical, financial, or confidential documents here." },
      { status: 400 },
    );
  }

  if (file.size <= 0) {
    return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large. Max 5 MB." }, { status: 400 });
  }

  const filename = `${deps.randomUUID()}.${ext}`;
  const objectKey = buildAdminMessageObjectKey(deps.now(), filename.replace(`.${ext}`, ""), ext);
  const uploaded = await deps.uploadFileToR2({
    objectKey,
    body: Buffer.from(await file.arrayBuffer()),
    mimeType: file.type,
    // Delivery media must remain reachable long enough for Twilio to fetch it.
    // Do not use admin message attachments for safeguarding or sensitive documents;
    // future hardening should replace this with expiring signed delivery URLs plus lifecycle cleanup.
    cacheControl: "public, max-age=86400",
  });

  if (!isPublicHttpsUrl(uploaded.publicUrl)) {
    return NextResponse.json(
      { error: "Message media storage must return a public HTTPS delivery URL reachable by Twilio." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    url: uploaded.publicUrl,
    deliveryUrl: uploaded.publicUrl,
    objectKey: uploaded.objectKey,
    filename,
    name: file.name,
    type: file.type,
    size: file.size,
    purpose: "twilio_delivery_media",
    warning: "Use only non-sensitive image or audio media. Do not attach safeguarding, medical, financial, or confidential documents.",
  });
}

export async function POST(request: Request) {
  return handleAdminMessageUpload(request);
}
