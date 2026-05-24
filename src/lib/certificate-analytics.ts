import { parseIssuedCertificates, type IssuedCertificateRecord } from "@/lib/certificate-issuing";
import type { CertificateTemplateType } from "@/components/certificates/certificate-designs";
import {
  defaultCertificateTemplateSettings,
  type CertificateTemplateSettings,
} from "@/lib/certificate-template-settings";

export type CertificateVerificationActivity = {
  verificationCode: string;
  status: "valid" | "revoked" | "not_found";
  createdAt: string;
};

export type CertificateAnalyticsSummary = {
  issuedCertificates: number;
  pendingCertificates: number;
  awardCertificates: number;
  revokedCertificates: number;
  verificationActivity: {
    total: number;
    valid: number;
    revoked: number;
    notFound: number;
    recent: CertificateVerificationActivity[];
  };
  templateUsage: Array<{
    certificateType: CertificateTemplateType;
    template: string;
    theme: string;
    issuedCount: number;
    revokedCount: number;
  }>;
};

export function listAllIssuedCertificates(profileJsonRows: Array<string | null | undefined>): IssuedCertificateRecord[] {
  return profileJsonRows.flatMap((row) => parseIssuedCertificates(row));
}

export function buildCertificateAnalytics(input: {
  certificates: IssuedCertificateRecord[];
  pendingCertificates: number;
  templateSettings?: CertificateTemplateSettings | null;
  verificationEvents?: CertificateVerificationActivity[];
}): CertificateAnalyticsSummary {
  const settings = input.templateSettings ?? defaultCertificateTemplateSettings;
  const verificationEvents = input.verificationEvents ?? [];

  const issuedCertificates = input.certificates.filter((row) => row.status === "issued").length;
  const revokedCertificates = input.certificates.filter((row) => row.status === "revoked").length;
  const awardCertificates = input.certificates.filter((row) => row.certificateType === "award_certificate").length;

  const typeCounts = new Map<CertificateTemplateType, { issuedCount: number; revokedCount: number }>();
  const allTypes = Object.keys(defaultCertificateTemplateSettings) as CertificateTemplateType[];
  for (const type of allTypes) {
    typeCounts.set(type, { issuedCount: 0, revokedCount: 0 });
  }

  for (const record of input.certificates) {
    const key = record.certificateType as CertificateTemplateType;
    if (!typeCounts.has(key)) continue;
    const counts = typeCounts.get(key)!;
    if (record.status === "revoked") {
      counts.revokedCount += 1;
    } else {
      counts.issuedCount += 1;
    }
  }

  const templateUsage = allTypes.map((type) => {
    const counts = typeCounts.get(type) ?? { issuedCount: 0, revokedCount: 0 };
    const resolved = settings[type] ?? defaultCertificateTemplateSettings[type];
    return {
      certificateType: type,
      template: resolved.template,
      theme: resolved.theme,
      issuedCount: counts.issuedCount,
      revokedCount: counts.revokedCount,
    };
  });

  const recent = verificationEvents
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);

  return {
    issuedCertificates,
    pendingCertificates: Math.max(0, input.pendingCertificates),
    awardCertificates,
    revokedCertificates,
    verificationActivity: {
      total: verificationEvents.length,
      valid: verificationEvents.filter((row) => row.status === "valid").length,
      revoked: verificationEvents.filter((row) => row.status === "revoked").length,
      notFound: verificationEvents.filter((row) => row.status === "not_found").length,
      recent,
    },
    templateUsage,
  };
}
