import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import {
  CERTIFICATE_TEMPLATE_SETTINGS_AUDIT_ACTION,
  CERTIFICATE_TEMPLATE_SETTINGS_ENTITY_TYPE,
  parseCertificateTemplateSettingsAuditMetadata,
} from "@/lib/certificate-template-persistence";
import { buildCertificateAnalytics, listAllIssuedCertificates, type CertificateVerificationActivity } from "@/lib/certificate-analytics";
import { parseAwardReviewDecisions } from "@/lib/award-review-state";
import { mergeIssuedCertificateRecords } from "@/lib/certificate-issuing";
import { listAllPersistedCertificateRecords } from "@/lib/certificate-records";

function parseVerificationMetadata(metadataJson: string | null | undefined): { verificationCode: string; status: "valid" | "revoked" | "not_found" } | null {
  if (!metadataJson) return null;
  try {
    const parsed = JSON.parse(metadataJson) as { verificationCode?: unknown; status?: unknown };
    if (
      typeof parsed.verificationCode !== "string"
      || (parsed.status !== "valid" && parsed.status !== "revoked" && parsed.status !== "not_found")
    ) {
      return null;
    }
    return {
      verificationCode: parsed.verificationCode,
      status: parsed.status,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const { session, response } = await requireAdminPermission("reports:view");
  if (!session) return response;

  const studentProfiles = await prisma.studentProfile.findMany({
    where: { aiLearningProfileJson: { not: null } },
    select: {
      childId: true,
      aiLearningProfileJson: true,
    },
  });

  const legacyCertificates = listAllIssuedCertificates(studentProfiles.map((row) => row.aiLearningProfileJson));
  const persistedCertificates = await listAllPersistedCertificateRecords();
  const certificates = mergeIssuedCertificateRecords(persistedCertificates, legacyCertificates);

  const pendingCertificates = studentProfiles.reduce((count, profile) => {
    const decisions = parseAwardReviewDecisions(profile.aiLearningProfileJson);
    const approved = decisions.filter((row) => row.status === "approved").length;
    const issuedAwardCount = mergeIssuedCertificateRecords(
      persistedCertificates.filter((row) => row.studentId === profile.childId),
      listAllIssuedCertificates([profile.aiLearningProfileJson]),
    )
      .filter((row) => row.certificateType === "award_certificate").length;
    return count + Math.max(0, approved - issuedAwardCount);
  }, 0);

  const [templateSettingAudit, verificationEventsAudit] = await Promise.all([
    prisma.auditLog.findFirst({
      where: {
        action: CERTIFICATE_TEMPLATE_SETTINGS_AUDIT_ACTION,
        entityType: CERTIFICATE_TEMPLATE_SETTINGS_ENTITY_TYPE,
      },
      orderBy: { createdAt: "desc" },
      select: { metadataJson: true },
    }),
    prisma.auditLog.findMany({
      where: {
        action: "certificate_verification_checked",
        entityType: "certificate_verification",
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        metadataJson: true,
        createdAt: true,
      },
    }),
  ]);

  const templateSettings = parseCertificateTemplateSettingsAuditMetadata(templateSettingAudit?.metadataJson ?? null).settings;

  const verificationEvents: CertificateVerificationActivity[] = verificationEventsAudit
    .map((row) => {
      const parsed = parseVerificationMetadata(row.metadataJson);
      if (!parsed) return null;
      return {
        verificationCode: parsed.verificationCode,
        status: parsed.status,
        createdAt: row.createdAt.toISOString(),
      };
    })
    .filter((row): row is CertificateVerificationActivity => Boolean(row));

  const analytics = buildCertificateAnalytics({
    certificates,
    pendingCertificates,
    templateSettings,
    verificationEvents,
  });

  return NextResponse.json({
    ok: true,
    analytics,
    note: "Pending certificates currently represent approved award reviews awaiting award certificate issuance.",
  });
}
