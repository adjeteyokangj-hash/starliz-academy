import { randomBytes, randomUUID } from "node:crypto";
import type { CertificateEligibilityResult, CertificateType } from "@/lib/certificate-eligibility";
import {
  isRankedCertificateType,
  rankLabelForCertificate,
  rankNumberForCertificate,
  rankedAwardSourceType,
  rankedCertificateTitle,
  rankedCertificateTypeCode,
  type RankedCertificateType,
  type RankingMethod,
} from "@/lib/ranked-certificates";
import type { StudentAwardNomination, StudentAwardScope, StudentAwardType } from "@/lib/student-awards";

export type IssuedCertificateType = CertificateType | "award_certificate" | RankedCertificateType;

export type IssuedCertificateRecord = {
  id: string;
  certificateNumber: string;
  verificationCode: string;
  certificateType: IssuedCertificateType;
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
  awardType?: StudentAwardType | RankedCertificateType;
  awardScope?: StudentAwardScope | string;
  subject?: string | null;
  strand?: string | null;
  score?: number | null;
  nominationId?: string;
  awardReason?: string | null;
  awardSourceType?: string | null;
  awardSourceId?: string | null;
  competitionName?: string | null;
  testName?: string | null;
  rank?: number | null;
  rankLabel?: string | null;
  tiedRank?: boolean | null;
  rankingMethod?: RankingMethod | null;
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
    certificateType: IssuedCertificateType;
    title: string;
    studentDisplayName: string;
    yearGroup: string | null;
    term: string;
    issuedAt: string;
    verificationMessage: string;
    awardType: StudentAwardType | RankedCertificateType | null;
    awardScope: StudentAwardScope | string | null;
    subject: string | null;
    strand: string | null;
    score: number | null;
    awardReason: string | null;
    awardSourceType: string | null;
    awardSourceId: string | null;
    competitionName: string | null;
    testName: string | null;
    rank: number | null;
    rankLabel: string | null;
    tiedRank: boolean | null;
    rankingMethod: RankingMethod | null;
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
    && certificateType !== "award_certificate"
    && !(typeof certificateType === "string" && isRankedCertificateType(certificateType))
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
    awardType: typeof row.awardType === "string" ? (row.awardType as StudentAwardType) : undefined,
    awardScope: typeof row.awardScope === "string" ? (row.awardScope as StudentAwardScope) : undefined,
    subject: typeof row.subject === "string" ? row.subject : null,
    strand: typeof row.strand === "string" ? row.strand : null,
    score: typeof row.score === "number" ? row.score : null,
    nominationId: typeof row.nominationId === "string" ? row.nominationId : undefined,
    awardReason: typeof row.awardReason === "string" ? row.awardReason : null,
    awardSourceType: typeof row.awardSourceType === "string" ? row.awardSourceType : null,
    awardSourceId: typeof row.awardSourceId === "string" ? row.awardSourceId : null,
    competitionName: typeof row.competitionName === "string" ? row.competitionName : null,
    testName: typeof row.testName === "string" ? row.testName : null,
    rank: typeof row.rank === "number" ? row.rank : null,
    rankLabel: typeof row.rankLabel === "string" ? row.rankLabel : null,
    tiedRank: typeof row.tiedRank === "boolean" ? row.tiedRank : null,
    rankingMethod: typeof row.rankingMethod === "string" ? (row.rankingMethod as RankingMethod) : null,
  };
}

export function parseIssuedCertificateRecord(value: unknown): IssuedCertificateRecord | null {
  return parseIssuedRecord(value);
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

export function buildCertificateIdempotencyKey(record: Pick<IssuedCertificateRecord, "studentId" | "certificateType" | "term" | "nominationId" | "subject" | "strand" | "awardSourceType" | "awardSourceId" | "rank" | "rankLabel">): string {
  const rankedType = isRankedCertificateType(record.certificateType) ? record.certificateType : null;
  const sourceType = rankedType
    ? (record.awardSourceType || rankedAwardSourceType(rankedType))
    : record.certificateType === "award_certificate" ? "award_nomination" : "term";
  const sourceId = rankedType
    ? String(record.awardSourceId || record.term || "manual").trim()
    : record.certificateType === "award_certificate"
      ? String(record.nominationId ?? "").trim()
      : [
          record.term,
          record.subject ?? "",
          record.strand ?? "",
        ].map((part) => normalize(part)).join(":");
  const rankKey = rankedType ? normalize(record.rankLabel) || String(record.rank ?? "unranked") : "";

  return [
    record.studentId,
    record.certificateType,
    sourceType,
    sourceId || "default",
    rankKey,
  ].map((part) => normalize(part).replace(/\s+/g, "_")).join("|");
}

export function findMatchingIssuedCertificate(input: {
  records: IssuedCertificateRecord[];
  studentId: string;
  certificateType: IssuedCertificateType;
  term: string;
  nominationId?: string | null;
  awardSourceType?: string | null;
  awardSourceId?: string | null;
  rank?: number | null;
  rankLabel?: string | null;
}): IssuedCertificateRecord | null {
  const targetKey = buildCertificateIdempotencyKey({
    studentId: input.studentId,
    certificateType: input.certificateType,
    term: input.term,
    nominationId: input.nominationId ?? undefined,
    awardSourceType: input.awardSourceType ?? undefined,
    awardSourceId: input.awardSourceId ?? undefined,
    rank: input.rank ?? undefined,
    rankLabel: input.rankLabel ?? undefined,
  });

  return input.records.find((record) => buildCertificateIdempotencyKey(record) === targetKey) ?? null;
}

export function mergeIssuedCertificateRecords(...groups: IssuedCertificateRecord[][]): IssuedCertificateRecord[] {
  const out: IssuedCertificateRecord[] = [];
  const seen = new Set<string>();

  for (const record of groups.flat()) {
    const keys = [
      normalize(record.verificationCode),
      normalize(record.certificateNumber),
    ].filter(Boolean);

    if (keys.some((key) => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    out.push(record);
  }

  return out.sort((a, b) => {
    const left = Date.parse(a.issuedAt);
    const right = Date.parse(b.issuedAt);
    return (Number.isNaN(right) ? 0 : right) - (Number.isNaN(left) ? 0 : left);
  });
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

function issuedCertificateTypeCode(type: IssuedCertificateType): string {
  if (type === "award_certificate") return "AW";
  if (isRankedCertificateType(type)) return rankedCertificateTypeCode(type);
  return certificateTypeCode(type);
}

export function generateCertificateNumber(input: {
  certificateType: IssuedCertificateType;
  yearGroup?: string | null;
  term: string;
}): string {
  const year = new Date().getFullYear();
  const typeCode = issuedCertificateTypeCode(input.certificateType);
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

export function issueAwardCertificateRecord(input: {
  nomination: StudentAwardNomination;
  studentId: string;
  studentName: string;
  yearGroup?: string | null;
  keyStage?: string | null;
  verificationBaseUrl?: string;
}): IssuedCertificateRecord {
  const certificateNumber = generateCertificateNumber({
    certificateType: "award_certificate",
    yearGroup: input.yearGroup,
    term: input.nomination.term,
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
    certificateType: "award_certificate",
    title: input.nomination.suggestedCertificateTitle,
    studentId: input.studentId,
    studentName: input.studentName,
    yearGroup: input.yearGroup ?? null,
    keyStage: input.keyStage ?? null,
    term: input.nomination.term,
    status: "issued",
    issuedAt: new Date().toISOString(),
    evidenceSummary: {
      placementCompleted: input.nomination.evidenceSummary.baselineAccuracy > 0,
      selectedSubjects: 0,
      requiredScopeCount: 0,
      scopesWithAssignments: 0,
      completedAssignments: 0,
      totalAssignments: 0,
      quizAttemptCount: 0,
      activeWeakAreas: input.nomination.evidenceSummary.activeWeakAreas,
      secureProgressionCount: 0,
      examAttempts: 0,
      passedExamAttempts: 0,
    },
    subjectBreakdown: [],
    verificationUrl,
    awardType: input.nomination.awardType,
    awardScope: input.nomination.awardScope,
    subject: input.nomination.subject,
    strand: input.nomination.strand,
    score: input.nomination.score,
    nominationId: input.nomination.nominationId,
  };
}

export function issueRankedCertificateRecord(input: {
  certificateType: RankedCertificateType;
  studentId: string;
  studentName: string;
  yearGroup?: string | null;
  keyStage?: string | null;
  level?: string | null;
  term?: string | null;
  title?: string | null;
  awardReason?: string | null;
  awardSourceType?: string | null;
  awardSourceId: string;
  competitionName?: string | null;
  testName?: string | null;
  subject?: string | null;
  strand?: string | null;
  score?: number | null;
  rank?: number | null;
  rankLabel?: string | null;
  tiedRank?: boolean | null;
  rankingMethod?: RankingMethod | null;
  verificationBaseUrl?: string;
}): IssuedCertificateRecord {
  const term = input.term?.trim() || "Ranked Award";
  const rank = rankNumberForCertificate({ certificateType: input.certificateType, rank: input.rank });
  const rankLabel = rankLabelForCertificate({ certificateType: input.certificateType, rank, rankLabel: input.rankLabel });
  const certificateNumber = generateCertificateNumber({
    certificateType: input.certificateType,
    yearGroup: input.yearGroup,
    term,
  });
  const verificationCode = generateVerificationCode();
  const baseUrl = input.verificationBaseUrl ?? "";
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const verificationUrl = normalizedBase
    ? `${normalizedBase}/certificates/verify/${verificationCode}`
    : `/certificates/verify/${verificationCode}`;
  const title = input.title?.trim() || rankedCertificateTitle({
    certificateType: input.certificateType,
    rankLabel,
    competitionName: input.competitionName,
    testName: input.testName,
  });

  return {
    id: randomUUID(),
    certificateNumber,
    verificationCode,
    certificateType: input.certificateType,
    title,
    studentId: input.studentId,
    studentName: input.studentName,
    yearGroup: input.yearGroup ?? null,
    keyStage: input.level ?? input.keyStage ?? null,
    term,
    status: "issued",
    issuedAt: new Date().toISOString(),
    evidenceSummary: {
      placementCompleted: true,
      selectedSubjects: input.subject ? 1 : 0,
      requiredScopeCount: input.subject ? 1 : 0,
      scopesWithAssignments: 0,
      completedAssignments: 0,
      totalAssignments: 0,
      quizAttemptCount: 0,
      activeWeakAreas: 0,
      secureProgressionCount: 0,
      examAttempts: 0,
      passedExamAttempts: 0,
    },
    subjectBreakdown: [],
    verificationUrl,
    awardType: input.certificateType,
    awardScope: input.awardSourceType ?? rankedAwardSourceType(input.certificateType),
    subject: input.subject ?? null,
    strand: input.strand ?? null,
    score: typeof input.score === "number" ? input.score : null,
    awardReason: input.awardReason?.trim() || title,
    awardSourceType: input.awardSourceType ?? rankedAwardSourceType(input.certificateType),
    awardSourceId: input.awardSourceId,
    competitionName: input.competitionName ?? null,
    testName: input.testName ?? null,
    rank,
    rankLabel,
    tiedRank: input.tiedRank ?? false,
    rankingMethod: input.rankingMethod ?? "admin_adjusted",
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
      awardType: found.awardType ?? null,
      awardScope: found.awardScope ?? null,
      subject: found.subject ?? null,
      strand: found.strand ?? null,
      score: typeof found.score === "number" ? found.score : null,
      awardReason: found.awardReason ?? null,
      awardSourceType: found.awardSourceType ?? null,
      awardSourceId: found.awardSourceId ?? null,
      competitionName: found.competitionName ?? null,
      testName: found.testName ?? null,
      rank: found.rank ?? null,
      rankLabel: found.rankLabel ?? null,
      tiedRank: found.tiedRank ?? null,
      rankingMethod: found.rankingMethod ?? null,
    },
  };
}
