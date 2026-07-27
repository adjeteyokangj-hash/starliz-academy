import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { requireAdminPermission } from "@/lib/api_guard";
import {
  verifyLocalUploadToken,
  writeLocalObjectFromStream,
  assertPrivateObjectKey,
} from "@/lib/lesson-pack-import/object-storage";
import { LESSON_PACK_UPLOAD_LIMITS } from "@/lib/lesson-pack-import/upload-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Local/dev direct PUT target used when Cloudflare R2 is not configured.
 * Production must use R2 signed URLs so the Vercel function never receives the file body.
 */
export async function PUT(req: Request) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response;

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "Upload token required." }, { status: 400 });
    }

    const claims = verifyLocalUploadToken(token);
    if (claims.userId !== session.userId) {
      return NextResponse.json({ error: "Upload token does not match authenticated Admin." }, { status: 403 });
    }
    assertPrivateObjectKey(claims.objectKey, claims.sessionId, claims.userId);

    if (!req.body) {
      return NextResponse.json({ error: "Empty body." }, { status: 400 });
    }

    const maxBytes = Math.min(claims.maxBytes, LESSON_PACK_UPLOAD_LIMITS.maxFileBytes);
    const nodeStream = Readable.fromWeb(req.body as import("stream/web").ReadableStream);
    const bytesWritten = await writeLocalObjectFromStream({
      objectKey: claims.objectKey,
      stream: nodeStream,
      maxBytes,
    });

    return NextResponse.json({
      ok: true,
      sizeBytes: bytesWritten,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Direct upload failed";
    const status = /expired|Invalid|exceeds|outside/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
