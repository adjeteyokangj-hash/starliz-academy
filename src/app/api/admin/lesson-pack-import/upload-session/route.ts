import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api_guard";
import { createUploadSession } from "@/lib/lesson-pack-import/upload-session";
import type { LessonPackSessionType } from "@/lib/lesson-pack-import/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  files: z.array(z.object({
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().positive(),
  })).min(1).max(40),
  sessionType: z.enum(["school_day", "short_learning_90", "short_learning_120", "general_library"]).optional(),
  yearGroup: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  sourceName: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  licenceType: z.string().optional().nullable(),
  attribution: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  licenceConfirmed: z.boolean().optional(),
});

export async function POST(req: Request) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response;

  try {
    const body = bodySchema.parse(await req.json());
    const result = await createUploadSession({
      actorUserId: session.userId,
      files: body.files,
      sessionType: (body.sessionType ?? "school_day") as LessonPackSessionType,
      yearGroup: body.yearGroup,
      subject: body.subject,
      sourceName: body.sourceName,
      sourceUrl: body.sourceUrl,
      licenceType: body.licenceType,
      attribution: body.attribution,
      notes: body.notes,
      licenceConfirmed: body.licenceConfirmed,
    });

    return NextResponse.json({
      ok: true,
      sessionId: result.sessionId,
      importId: result.sessionId,
      status: result.status,
      provider: result.provider,
      expiresAt: result.expiresAt,
      uploads: result.uploads.map((u) => ({
        fileId: u.fileId,
        fileName: u.fileName,
        expectedSizeBytes: u.expectedSizeBytes,
        uploadUrl: u.uploadUrl,
        method: u.method,
        headers: u.headers,
        expiresAt: u.expiresAt,
        // objectKey intentionally omitted from browser response for local; for R2 the key is
        // embedded in the signed URL. Never return bucket credentials.
        objectKey: u.provider === "local" ? undefined : undefined,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create upload session";
    const status = /R2 is not configured/i.test(message) ? 503
      : /required|limit|Too many|exceeds/i.test(message) ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
