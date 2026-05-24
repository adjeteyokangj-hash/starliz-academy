import { randomBytes, randomUUID } from "node:crypto";
import type { CertificateEligibilityResult, CertificateType } from "@/lib/certificate-eligibility";

export type IssuedCertificateRecord = {
  id: string;
  certificateNumber: string;
  verificationCode: string;
  certificateType: CertificateType;
  title: string;
  studentId: string;
  studentName: string;
  yearGroup: string | null;
  keyStage: string | null;
  term: string;
  status: "issued" | "revoked";
  issuedAt: string;
  evidenceSummary: CertificateEligibilityResult["evidenceSummary"];
  subjectBreakdown: CertificateEligibilityResult["subjectBreakdown"];
  verificationUrl: string;
};

export type CertificateIssueBlocked = {
  ok: false;
  reason: string;
  eligibilityStatus: CertificateEligibilityResult["status"];
};

export type CertificateIssueAllowed = {
  ok: true;
};

export type CertificateVerificationResult = {
  status: "valid" | "revoked" | "not_found";
  certificate: {
    certificateNumber: string;
    verificationCode: string;
    certificateType: CertificateType;
    title: string;
    studentDisplayName: string;
    yearGroup: string | null;
    term: string;
    issuedAt: string;
    verificationMessage: string;
  } | null;
};

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed JSON.
  }
  return {};
}

function parseIssuedRecord(value: unknown): IssuedCertificateRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;

  const certificateType = row.certificateType;
  if (
    certificateType !== "term_completion"
    && certificateType !== "end_of_term_exam"
    && certificateType !== "subject_achievement"
    && certificateType !== "english_achievement"
    && certificateType !== "mastery_certificate"
  ) {
    return null;
  }

  const status = row.status === "revoked" ? "revoked" : row.status === "issued" ? "issued" : null;
  if (!status) return null;

  const id = typeof row.id === "string" ? row.id : "";
  const certificateNumber = typeof row.certificateNumber === "string" ? row.certificateNumber : "";
  const verificationCode = typeof row.verificationCode === "string" ? row.verificationCode : "";
  const title = typeof row.title === "string" ? row.title : "";
  const studentId = typeof row.studentId === "string" ? row.studentId : "";
  const studentName = typeof row.studentName === "string" ? row.studentName : "";
  const term = typeof row.term === "string" ? row.term : "";
  const issuedAt = typeof row.issuedAt === "string" ? row.issuedAt : "";

  if (!id || !certificateNumber || !verificationCode || !title || !studentId || !studentName || !term || !issuedAt) {
    return null;
  }

  const evidenceSummary = row.evidenceSummary && typeof row.evidenceSummary === "object" && !Array.isArray(row.evidenceSummary)
    ? (row.evidenceSummary as CertificateEligibilityResult["evidenceSummary"])
    : {
        placementCompleted: true,
        selectedSubjects: 0,
        requiredScopeCount: 0,
        scopesWithAssignments: 0,
        completedAssignments: 0,
        totalAssignments: 0,
        quizAttemptCount: 0,
        activeWeakAreas: 0,
        secureProgressionCount: 0,
        examAttempts: 0,
        passedExamAttempts: 0,
      };

  const subjectBreakdown = Array.isArray(row.subjectBreakdown)
    ? (row.subjectBreakdown as CertificateEligibilityResult["subjectBreakdown"])
    : [];

  return {
    id,
    certificateNumber,
    verificationCode,
    certificateType,
    title,
    studentId,
    studentName,
    yearGroup: typeof row.yearGroup === "string" ? row.yearGroup : null,
    keyStage: typeof row.keyStage === "string" ? row.keyStage : null,
    term,
    status,
    issuedAt,
    evidenceSummary,
    subjectBreakdown,
    verificationUrl: typeof row.verificationUrl === "string" ? row.verificationUrl : `/certificates/verify/${verificationCode}`,
  };
}

export function parseIssuedCertificates(profileJson: string | null | undefined): IssuedCertificateRecord[] {
  const parsed = parseJsonObject(profileJson);
  const certificates = parsed.certificates;
  if (!certificates || typeof certificates !== "object" || Array.isArray(certificates)) return [];
  const issued = (certificates as Record<string, unknown>).issued;
  if (!Array.isArray(issued)) return [];
  return issued
    .map((entry) => parseIssuedRecord(entry))
    .filter((entry): entry is IssuedCertificateRecord => Boolean(entry));
}

export function upsertIssuedCertificates(profileJson: string | null | undefined, records: IssuedCertificateRecord[]): string {
  const parsed = parseJsonObject(profileJson);
  const certificates = parsed.certificates;
  const nextCertificates = certificates && typeof certificates === "object" && !Array.isArray(certificates)
    ? (certificates as Record<string, unknown>)
    : {};

  nextCertificates.issued = records;

  const next = {
    ...parsed,
    certificates: nextCertificates,
  };

  return JSON.stringify(next);
}

export function canIssueCertificate(eligibility: CertificateEligibilityResult): CertificateIssueAllowed | CertificateIssueBlocked {
  if (eligibility.status === "eligible") {
    return { ok: true };
  }

  const reason = eligibility.blockers[0]
    ?? (eligibility.status === "pending_exam"
      ? "Certificate cannot be issued yet. End-of-term exam is still pending."
      : `Certificate cannot be issued yet. Current status is ${eligibility.status}.`);

  return {
    ok: false,
    reason,
    eligibilityStatus: eligibility.status,
  };
}

function certificateTypeCode(type: CertificateType): string {
  if (type === "term_completion") return "TC";
  if (type === "end_of_term_exam") return "EE";
  if (type === "subject_achievement") return "SA";
  if (type === "english_achievement") return "EA";
  return "MC";
}

export function generateCertificateNumber(input: {
  certificateType: CertificateType;
  yearGroup?: string | null;
  term: string;
}): string {
  const year = new Date().getFullYear();
  const typeCode = certificateTypeCode(input.certificateType);
  const termCode = normalize(input.term).slice(0, 3).toUpperCase() || "TRM";
  const yearCode = normalize(input.yearGroup).replace(/[^0-9]/g, "").slice(0, 2) || "00";
  const randomCode = randomBytes(3).toString("hex").toUpperCase();
  return `SLA-${year}-${typeCode}-${termCode}-${yearCode}-${randomCode}`;
}

export function generateVerificationCode(): string {
  return `SV-${randomBytes(6).toString("hex").toUpperCase()}`;
}

export function issueCertificateRecord(input: {
  eligibility: CertificateEligibilityResult;
  studentId: string;
  studentName: string;
  yearGroup?: string | null;
  keyStage?: string | null;
  verificationBaseUrl?: string;
}): IssuedCertificateRecord {
  const certificateNumber = generateCertificateNumber({
    certificateType: input.eligibility.certificateType,
    yearGroup: input.yearGroup,
    term: input.eligibility.term,
  });
  const verificationCode = generateVerificationCode();
  const baseUrl = input.verificationBaseUrl ?? "";
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const verificationUrl = normalizedBase
    ? `${normalizedBase}/certificates/verify/${verificationCode}`
    : `/certificates/verify/${verificationCode}`;

  return {
    id: randomUUID(),
    certificateNumber,
    verificationCode,
    certificateType: input.eligibility.certificateType,
    title: input.eligibility.suggestedCertificateTitle,
    studentId: input.studentId,
    studentName: input.studentName,
    yearGroup: input.yearGroup ?? null,
    keyStage: input.keyStage ?? null,
    term: input.eligibility.term,
    status: "issued",
    issuedAt: new Date().toISOString(),
    evidenceSummary: input.eligibility.evidenceSummary,
    subjectBreakdown: input.eligibility.subjectBreakdown,
    verificationUrl,
  };
}

export function maskStudentName(name: string): string {
  const clean = String(name || "").trim();
  if (!clean) return "Learner";
  const [first] = clean.split(/\s+/g);
  if (!first) return "Learner";
  if (first.length <= 1) return `${first}*`;
  return `${first.charAt(0)}${"*".repeat(Math.max(1, first.length - 1))}`;
}

export function verifyIssuedCertificate(input: {
  verificationCode: string;
  candidates: IssuedCertificateRecord[];
}): CertificateVerificationResult {
  const normalized = normalize(input.verificationCode);
  const found = input.candidates.find((row) => normalize(row.verificationCode) === normalized);

  if (!found) {
    return {
      status: "not_found",
      certificate: null,
    };
  }

  return {
    status: found.status === "revoked" ? "revoked" : "valid",
    certificate: {
      certificateNumber: found.certificateNumber,
      verificationCode: found.verificationCode,
      certificateType: found.certificateType,
      title: found.title,
      studentDisplayName: maskStudentName(found.studentName),
      yearGroup: found.yearGroup,
      term: found.term,
      issuedAt: found.issuedAt,
      verificationMessage: found.status === "revoked"
        ? "This StarLiz Academy certificate has been revoked."
        : "This StarLiz Academy certificate is valid.",
    },
  };
}
