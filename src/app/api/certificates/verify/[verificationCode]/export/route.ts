import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseIssuedCertificates, verifyIssuedCertificate } from "@/lib/certificate-issuing";
import { buildCertificateExportHtml, buildCertificateExportPayload, certificateTypeLabel } from "@/lib/certificate-pdf-export";

export async function GET(request: Request, { params }: { params: Promise<{ verificationCode: string }> }) {
  const { verificationCode } = await params;

  if (!verificationCode || verificationCode.trim().length < 6) {
    return NextResponse.json({ ok: false, error: "Certificate not found." }, { status: 404 });
  }

  const rows = await prisma.studentProfile.findMany({
    where: {
      aiLearningProfileJson: { not: null },
    },
    select: {
      aiLearningProfileJson: true,
    },
  });

  const issued = rows.flatMap((row) => parseIssuedCertificates(row.aiLearningProfileJson));
  const verification = verifyIssuedCertificate({ verificationCode, candidates: issued });

  if (verification.status === "not_found" || !verification.certificate) {
    return NextResponse.json({ ok: false, error: "Certificate not found." }, { status: 404 });
  }

  const exportResult = buildCertificateExportPayload({
    title: verification.certificate.title,
    studentDisplayName: verification.certificate.studentDisplayName,
    certificateType: verification.certificate.certificateType,
    typeLabel: certificateTypeLabel(verification.certificate.certificateType),
    yearGroup: verification.certificate.yearGroup,
    keyStage: null,
    term: verification.certificate.term,
    subject: verification.certificate.subject,
    strand: verification.certificate.strand,
    awardType: verification.certificate.awardType,
    awardScope: verification.certificate.awardScope,
    issuedAt: verification.certificate.issuedAt,
    certificateNumber: verification.certificate.certificateNumber,
    verificationCode: verification.certificate.verificationCode,
    verificationUrl: `/certificates/verify/${encodeURIComponent(verification.certificate.verificationCode)}`,
    status: verification.status,
    score: verification.certificate.score,
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
