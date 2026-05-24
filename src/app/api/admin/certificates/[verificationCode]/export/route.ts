import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { parseIssuedCertificates } from "@/lib/certificate-issuing";
import { buildCertificateExportHtml, buildCertificateExportPayload, certificateTypeLabel } from "@/lib/certificate-pdf-export";

export async function GET(request: Request, { params }: { params: Promise<{ verificationCode: string }> }) {
  const { session, response } = await requireAdminPermission("reports:view");
  if (!session) return response;

  const { verificationCode } = await params;

  const rows = await prisma.studentProfile.findMany({
    where: {
      aiLearningProfileJson: { not: null },
    },
    select: {
      aiLearningProfileJson: true,
    },
  });

  const issued = rows.flatMap((row) => parseIssuedCertificates(row.aiLearningProfileJson));
  const certificate = issued.find((row) => row.verificationCode === verificationCode && row.certificateType === "award_certificate");

  if (!certificate) {
    return NextResponse.json({ ok: false, error: "Certificate not found." }, { status: 404 });
  }

  const exportResult = buildCertificateExportPayload({
    title: certificate.title,
    studentDisplayName: "Learner",
    certificateType: certificate.certificateType,
    typeLabel: certificateTypeLabel(certificate.certificateType),
    yearGroup: certificate.yearGroup,
    keyStage: certificate.keyStage,
    term: certificate.term,
    subject: certificate.subject ?? null,
    strand: certificate.strand ?? null,
    awardType: certificate.awardType ?? null,
    awardScope: certificate.awardScope ?? null,
    issuedAt: certificate.issuedAt,
    certificateNumber: certificate.certificateNumber,
    verificationCode: certificate.verificationCode,
    verificationUrl: certificate.verificationUrl || `/certificates/verify/${certificate.verificationCode}`,
    status: certificate.status,
    score: typeof certificate.score === "number" ? certificate.score : null,
    evidenceSummaryText: typeof certificate.score === "number" ? `Award score ${certificate.score}` : null,
  });

  if (!exportResult.ok) {
    return NextResponse.json({ ok: false, error: exportResult.message }, { status: exportResult.code === "not_found" ? 404 : 400 });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  if (mode === "json") {
    return NextResponse.json({ ok: true, export: exportResult.payload });
  }

  const html = buildCertificateExportHtml(exportResult.payload);
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `inline; filename="${exportResult.payload.certificateNumber}.html"`,
      "cache-control": "no-store",
    },
  });
}
