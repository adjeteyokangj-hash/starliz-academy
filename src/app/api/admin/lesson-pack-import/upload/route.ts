import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import Busboy from "busboy";
import type { FileInfo, FieldInfo } from "busboy";
import { requireAdminPermission } from "@/lib/api_guard";
import { LESSON_PACK_UPLOAD_LIMITS } from "@/lib/lesson-pack-import/upload-limits";
import {
  createUploadSession,
  writeStreamToTemp,
  cleanupSession,
  cleanupExpiredSessions,
} from "@/lib/lesson-pack-import/temp-storage";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type UploadedFileRef = {
  fileName: string;
  mimeType: string;
  filePath: string;
  sizeBytes: number;
};

export async function POST(req: Request) {
  const { session: authSession, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!authSession) return response;

  // Opportunistic cleanup of expired sessions
  cleanupExpiredSessions().catch(() => {});

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const uploadSession = await createUploadSession();
  const files: UploadedFileRef[] = [];
  const fields: Record<string, string> = {};
  let totalBytes = 0;
  let fileCount = 0;
  let abortReason: string | null = null;

  try {
    const body = req.body;
    if (!body) {
      return NextResponse.json({ error: "Empty request body" }, { status: 400 });
    }

    await new Promise<void>((resolve, reject) => {
      const busboy = Busboy({
        headers: { "content-type": contentType },
        limits: {
          fileSize: LESSON_PACK_UPLOAD_LIMITS.maxFileBytes,
          files: LESSON_PACK_UPLOAD_LIMITS.maxFiles,
        },
      });

      busboy.on("file", (fieldname: string, fileStream: Readable & { truncated?: boolean }, info: FileInfo) => {
        if (abortReason) {
          fileStream.resume();
          return;
        }

        fileCount++;
        if (fileCount > LESSON_PACK_UPLOAD_LIMITS.maxFiles) {
          abortReason = `Too many files (max ${LESSON_PACK_UPLOAD_LIMITS.maxFiles}).`;
          fileStream.resume();
          return;
        }

        const { filename, mimeType } = info;

        writeStreamToTemp(
          uploadSession,
          filename,
          fileStream,
          LESSON_PACK_UPLOAD_LIMITS.maxFileBytes,
        ).then(({ filePath, bytesWritten }) => {
          totalBytes += bytesWritten;
          if (totalBytes > LESSON_PACK_UPLOAD_LIMITS.maxTotalBytes) {
            abortReason = `Upload exceeds ${Math.round(LESSON_PACK_UPLOAD_LIMITS.maxTotalBytes / (1024 * 1024))}MB combined limit.`;
            return;
          }
          files.push({
            fileName: filename,
            mimeType: mimeType || "application/octet-stream",
            filePath,
            sizeBytes: bytesWritten,
          });
        }).catch((err) => {
          abortReason = err instanceof Error ? err.message : "Upload failed";
        });

        fileStream.on("limit", () => {
          abortReason = `File "${filename}" exceeds ${Math.round(LESSON_PACK_UPLOAD_LIMITS.maxFileBytes / (1024 * 1024))}MB limit.`;
        });
      });

      busboy.on("field", (name: string, value: string, info: FieldInfo) => {
        void info;
        fields[name] = value;
      });

      busboy.on("finish", () => resolve());
      busboy.on("error", (err: unknown) => reject(err));

      const reader = body.getReader();
      const nodeStream = new Readable({
        async read() {
          try {
            const { done, value } = await reader.read();
            if (done) {
              this.push(null);
            } else {
              this.push(Buffer.from(value));
            }
          } catch {
            this.push(null);
          }
        },
      });
      nodeStream.pipe(busboy);
    });

    if (abortReason) {
      await cleanupSession(uploadSession);
      return NextResponse.json({ error: abortReason }, { status: 400 });
    }

    if (!files.length) {
      await cleanupSession(uploadSession);
      return NextResponse.json({ error: "No files received" }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      sessionId: uploadSession.sessionId,
      fileCount: files.length,
      totalBytes,
      files: files.map((f) => ({
        fileName: f.fileName,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
      })),
      fields,
    });
  } catch (error) {
    await cleanupSession(uploadSession);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Upload failed",
    }, { status: 500 });
  }
}
