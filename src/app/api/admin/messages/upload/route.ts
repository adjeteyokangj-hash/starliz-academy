import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { requireAdmin } from "@/lib/api_guard";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
};

export async function POST(request: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data." }, { status: 400 });

  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });

  const ext = ALLOWED[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "File type not allowed. Use image, PDF, MP4, DOCX, or audio files." },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large. Max 5 MB." }, { status: 400 });
  }

  const filename = `${randomUUID()}.${ext}`;
  const dir = join(process.cwd(), "public", "uploads", "messages");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), Buffer.from(await file.arrayBuffer()));

  const rawBase = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (!rawBase) {
    return NextResponse.json(
      { error: "Set NEXT_PUBLIC_APP_URL to a public HTTPS domain before uploading media for WhatsApp." },
      { status: 400 },
    );
  }

  let base: string;
  try {
    const u = new URL(rawBase);
    if (u.protocol !== "https:" || u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1") {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_APP_URL must be a public HTTPS domain reachable by Twilio." },
        { status: 400 },
      );
    }
    base = rawBase.replace(/\/$/, "");
  } catch {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL must be a valid absolute HTTPS URL." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    url: `${base}/uploads/messages/${filename}`,
    filename,
    name: file.name,
    type: file.type,
    size: file.size,
  });
}
