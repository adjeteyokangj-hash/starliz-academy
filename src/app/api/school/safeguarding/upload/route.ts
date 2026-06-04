import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sanitizeFilename, uploadFileToR2 } from "@/lib/r2-upload";
import { requireSchoolRoles } from "@/lib/schools/guards";
import { toSafeguardingEvidenceAttachmentView } from "@/lib/schools/safeguarding-evidence";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const schoolId = String(form.get("schoolId") ?? "").trim();
  const incidentId = String(form.get("incidentId") ?? "").trim();
  const label = String(form.get("label") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();
  const file = form.get("file");

  if (!schoolId || !incidentId || !label || !(file instanceof File)) {
    return NextResponse.json({ error: "schoolId, incidentId, label, and file are required." }, { status: 400 });
  }

  const access = await requireSchoolRoles(schoolId, ["owner", "admin"], {
    method: "POST",
    route: "/api/school/safeguarding/upload",
    resourceType: "safeguarding",
    resourceId: incidentId,
  });
  if (access.response) return access.response;

  const incident = await prisma.safeguardingIncident.findUnique({
    where: { id: incidentId },
    select: { id: true, schoolId: true },
  });
  if (!incident || incident.schoolId !== schoolId) {
    return NextResponse.json({ error: "Incident not found." }, { status: 404 });
  }

  const ext = ALLOWED[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "File type not allowed. Use image, PDF, text, audio, video, or DOCX evidence files." },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large. Max 10 MB." }, { status: 400 });
  }

  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const filename = `${randomUUID().slice(0, 8)}-${sanitizeFilename(file.name || `evidence.${ext}`, file.type)}`;
  const objectKey = `admin/safeguarding/${schoolId}/${incidentId}/${year}/${month}/${day}/${filename}`;

  let publicUrl: string;
  try {
    const uploaded = await uploadFileToR2({
      objectKey,
      body: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type,
      cacheControl: "private, max-age=0, no-store",
    });
    publicUrl = uploaded.publicUrl;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload safeguarding evidence." },
      { status: 500 },
    );
  }
  const attachment = await prisma.$transaction(async (tx) => {
    const created = await tx.safeguardingEvidenceAttachment.create({
      data: {
        schoolId,
        incidentId,
        uploadedByUserId: access.context.userId,
        label,
        originalName: file.name,
        storedFilename: objectKey,
        publicUrl,
        mimeType: file.type,
        fileSizeBytes: file.size,
        note: note || null,
      },
    });

    await tx.safeguardingWorkflowEvent.create({
      data: {
        schoolId,
        incidentId,
        actorUserId: access.context.userId,
        eventType: "evidence_uploaded",
        note: label,
        metadataJson: JSON.stringify({ attachmentId: created.id }),
      },
    });

    return created;
  });

  return NextResponse.json({
    ok: true,
    attachment: toSafeguardingEvidenceAttachmentView(attachment),
  });
}
