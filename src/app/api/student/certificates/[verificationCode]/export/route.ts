import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { listIssuedCertificatesForLibrary } from "@/lib/certificate-library";
import { listPersistedCertificateRecordsForStudent } from "@/lib/certificate-records";
import { buildCertificateExportHtml, buildCertificateExportPayload } from "@/lib/certificate-pdf-export";
import { storeCertificateExportHtml } from "@/lib/certificate-export-storage";

export async function GET(request: Request, { params }: { params: Promise<{ verificationCode: string }> }) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ ok: false, error: "Parent account not found." }, { status: 404 });
  }

  const studentId = await resolveParentActiveChildId(parentScope.parentId);
  if (!studentId) {
    return NextResponse.json({ ok: false, error: "No active student selected." }, { status: 400 });
  }

  const { verificationCode } = await params;

  const child = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId, archived: false },
    select: {
      studentProfile: {
        select: {
          aiLearningProfileJson: true,
        },
      },
    },
  });

  if (!child) {
    return NextResponse.json({ ok: false, error: "Student not found." }, { status: 404 });
  }

  const persistedCertificates = await listPersistedCertificateRecordsForStudent(studentId);
  const certificates = listIssuedCertificatesForLibrary(child.studentProfile?.aiLearningProfileJson ?? null, persistedCertificates);
  const certificate = certificates.find((row) => row.verificationCode === verificationCode);

  if (!certificate) {
    return NextResponse.json({ ok: false, error: "Certificate not found." }, { status: 404 });
  }

  const exportResult = buildCertificateExportPayload({
    title: certificate.title,
    studentDisplayName: certificate.studentDisplayName,
    certificateType: certificate.certificateType,
    typeLabel: certificate.typeLabel,
    yearGroup: certificate.yearGroup,
    keyStage: certificate.keyStage,
    term: certificate.term,
    subject: certificate.subject,
    strand: certificate.strand,
    awardType: certificate.awardType,
    awardScope: certificate.awardScope,
    issuedAt: certificate.issuedAt,
    certificateNumber: certificate.certificateNumber,
    verificationCode: certificate.verificationCode,
    verificationUrl: certificate.verificationUrl,
    status: certificate.status,
  });

  if (!exportResult.ok) {
    return NextResponse.json({ ok: false, error: exportResult.message }, { status: exportResult.code === "not_found" ? 404 : 400 });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const shouldStore = ["1", "true", "yes"].includes((url.searchParams.get("store") ?? "").toLowerCase());

  const html = buildCertificateExportHtml(exportResult.payload);
  const upload = shouldStore
    ? await storeCertificateExportHtml({ certificateNumber: exportResult.payload.certificateNumber, html }).catch(() => null)
    : null;

  if (mode === "json") {
    return NextResponse.json({ ok: true, export: exportResult.payload, upload });
  }

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `inline; filename="${exportResult.payload.certificateNumber}.html"`,
      "cache-control": "no-store",
      ...(upload?.publicUrl ? { "x-certificate-export-url": upload.publicUrl } : {}),
    },
  });
}
