import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { isGaPdfStorageConfigured, saveGaPdfToLocalStorage, validateGaPdfUpload } from "@/lib/ga-pdf-sources";

export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const items = await prisma.gaSource.findMany({
    where: {
      OR: [
        { fileName: { endsWith: ".pdf", mode: "insensitive" } },
        { fileReference: { contains: ".pdf", mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const validation = validateGaPdfUpload(file.name, file.type, file.size);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    if (!isGaPdfStorageConfigured()) {
      await writeAuditLog({
        actorUserId: session.userId,
        action: "ga_pdf.upload_rejected_storage_not_configured",
        entityType: "ga_pdf_source",
        metadata: { fileName: file.name, sizeBytes: file.size },
      });
      return NextResponse.json({
        ok: false,
        fileName: file.name,
        sizeBytes: file.size,
        status: "StorageNotConfigured",
        message: "PDF upload entry point is ready, but permanent storage is not configured yet.",
      }, { status: 503 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const stored = await saveGaPdfToLocalStorage(file.name, bytes);

    const source = await prisma.gaSource.create({
      data: {
        sourceName: "Kasahorow Ga Children's Dictionary",
        fileName: file.name,
        fileReference: stored.filePath,
        section: "PDF Scan Upload",
        notes: "Uploaded for extraction review",
      },
      select: { id: true, sourceName: true },
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "ga_pdf.uploaded_for_extraction",
      entityType: "ga_pdf_source",
      entityId: source.id,
      metadata: { fileName: file.name, storedName: stored.fileName, sizeBytes: file.size },
    });

    return NextResponse.json({
      ok: true,
      sourceFileId: source.id,
      fileName: file.name,
      sizeBytes: file.size,
      status: "UploadedForExtraction",
      message: "PDF uploaded for Ga word extraction review.",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 500 });
  }
}
