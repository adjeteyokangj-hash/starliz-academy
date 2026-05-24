import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseIssuedCertificates, verifyIssuedCertificate } from "@/lib/certificate-issuing";
import { writeAuditLog } from "@/lib/audit";

export async function GET(
  _request: Request,
  context: { params: Promise<{ verificationCode: string }> },
) {
  const { verificationCode } = await context.params;

  if (!verificationCode || verificationCode.trim().length < 6) {
    return NextResponse.json({
      ok: false,
      status: "not_found",
      message: "Certificate not found.",
      certificate: null,
    }, { status: 404 });
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

  await writeAuditLog({
    action: "certificate_verification_checked",
    entityType: "certificate_verification",
    entityId: verification.status === "not_found" ? undefined : verification.certificate?.verificationCode,
    metadata: {
      verificationCode,
      status: verification.status,
    },
  });

  if (verification.status === "not_found") {
    return NextResponse.json({
      ok: false,
      status: verification.status,
      message: "Certificate not found.",
      certificate: null,
    }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    status: verification.status,
    message: verification.certificate?.verificationMessage ?? "Certificate status updated.",
    certificate: verification.certificate,
  });
}
