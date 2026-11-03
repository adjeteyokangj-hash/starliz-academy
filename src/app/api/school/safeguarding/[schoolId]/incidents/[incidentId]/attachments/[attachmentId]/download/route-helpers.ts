import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { downloadFileFromR2 } from "@/lib/r2-upload";
import { requireSchoolRoles } from "@/lib/schools/guards";

type Context = { params: Promise<{ schoolId: string; incidentId: string; attachmentId: string }> };

type AttachmentForDownload = {
  id: string;
  schoolId: string;
  incidentId: string;
  storedFilename: string;
  originalName: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
};

type DownloadedObject = {
  body: Uint8Array;
  contentType?: string;
  contentLength?: number;
};

type DownloadDeps = {
  requireSchoolRoles: typeof requireSchoolRoles;
  findAttachment: (attachmentId: string) => Promise<AttachmentForDownload | null>;
  downloadFileFromR2: (objectKey: string) => Promise<DownloadedObject>;
};

const defaultDeps: DownloadDeps = {
  requireSchoolRoles,
  findAttachment: (attachmentId) => prisma.safeguardingEvidenceAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      schoolId: true,
      incidentId: true,
      storedFilename: true,
      originalName: true,
      mimeType: true,
      fileSizeBytes: true,
    },
  }),
  downloadFileFromR2,
};

function safeDownloadFilename(name: string): string {
  return name
    .replace(/[\r\n"]/g, "")
    .replace(/[\\/:*?<>|]+/g, "-")
    .trim()
    .slice(0, 120) || "safeguarding-evidence";
}

export async function GET(_request: Request, context: Context) {
  return handleSafeguardingEvidenceDownload(context, defaultDeps);
}

export async function handleSafeguardingEvidenceDownload(
  context: Context,
  deps: DownloadDeps = defaultDeps,
): Promise<Response> {
  const { schoolId, incidentId, attachmentId } = await context.params;
  const { response } = await deps.requireSchoolRoles(schoolId, ["owner", "admin"], {
    method: "GET",
    route: "/api/school/safeguarding/evidence/download",
    resourceType: "safeguarding",
    resourceId: incidentId,
  });
  if (response) return response;

  const attachment = await deps.findAttachment(attachmentId);
  if (!attachment || attachment.schoolId !== schoolId || attachment.incidentId !== incidentId) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const file = await deps.downloadFileFromR2(attachment.storedFilename);
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Type": attachment.mimeType || file.contentType || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${safeDownloadFilename(attachment.originalName)}"`,
  });

  const contentLength = attachment.fileSizeBytes ?? file.contentLength;
  if (typeof contentLength === "number") {
    headers.set("Content-Length", String(contentLength));
  }

  const responseBody = file.body.buffer.slice(
    file.body.byteOffset,
    file.body.byteOffset + file.body.byteLength,
  ) as ArrayBuffer;

  return new Response(responseBody, {
    status: 200,
    headers,
  });
}
