import { prisma } from "@/lib/db";
import type { CertificateEligibilityResult } from "@/lib/certificate-eligibility";
import {
  buildCertificateIdempotencyKey,
  generateCertificateNumber,
  generateVerificationCode,
  issueAwardCertificateRecord,
  issueCertificateRecord,
  issueRankedCertificateRecord,
  mergeIssuedCertificateRecords,
  parseIssuedCertificateRecord,
  parseIssuedCertificates,
  verifyIssuedCertificate,
  type IssuedCertificateRecord,
} from "@/lib/certificate-issuing";
import type { RankedCertificateType, RankingMethod } from "@/lib/ranked-certificates";
import type { StudentAwardNomination } from "@/lib/student-awards";

type PersistedCertificateRow = {
  id: string;
  studentId: string;
  certificateNumber: string;
  verificationCode: string;
  idempotencyKey: string;
  certificateType: string;
  title: string;
  awardReason: string | null;
  subject: string | null;
  level: string | null;
  yearGroup: string | null;
  score: number | null;
  issuedAt: Date;
  status: string;
  metadataJson: string | null;
  awardSourceType: string | null;
  awardSourceId: string | null;
  rank: number | null;
  rankLabel: string | null;
  competitionName: string | null;
  testName: string | null;
  tiedRank: boolean | null;
  rankingMethod: string | null;
  createdAt: Date;
  updatedAt: Date;
  student?: {
    name: string;
  } | null;
};

type CertificateCreateData = {
  studentId: string;
  certificateNumber: string;
  verificationCode: string;
  idempotencyKey: string;
  certificateType: string;
  title: string;
  awardReason: string | null;
  subject: string | null;
  level: string | null;
  yearGroup: string | null;
  score: number | null;
  issuedAt: Date;
  status: string;
  metadataJson: string;
  awardSourceType: string | null;
  awardSourceId: string | null;
  rank: number | null;
  rankLabel: string | null;
  competitionName: string | null;
  testName: string | null;
  tiedRank: boolean | null;
  rankingMethod: string | null;
};

type CertificateDelegate = {
  findUnique(args: unknown): Promise<PersistedCertificateRow | null>;
  findMany(args: unknown): Promise<PersistedCertificateRow[]>;
  create(args: unknown): Promise<PersistedCertificateRow>;
};

const MAX_CERTIFICATE_CREATE_ATTEMPTS = 5;

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
    // Ignore malformed metadata.
  }
  return {};
}

function defaultEvidenceSummary(): IssuedCertificateRecord["evidenceSummary"] {
  return {
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
}

function isKnownPrismaCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === code);
}

export function isCertificatePersistenceUnavailable(error: unknown): boolean {
  if (isKnownPrismaCode(error, "P2021") || isKnownPrismaCode(error, "P2022")) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  return message.includes("certificate") && (
    message.includes("does not exist")
    || message.includes("no such table")
    || message.includes("not been generated")
    || message.includes("is not a function")
    || message.includes("unknown arg")
    || message.includes("unknown field")
  );
}

function certificateDelegate(): CertificateDelegate {
  const delegate = (prisma as unknown as { certificate?: CertificateDelegate }).certificate;
  if (!delegate) {
    throw new Error("Certificate persistence is unavailable because Prisma client has not been generated for the Certificate model.");
  }
  return delegate;
}

function certificateAwardSource(record: IssuedCertificateRecord): { awardSourceType: string | null; awardSourceId: string | null } {
  if (record.awardSourceType || record.awardSourceId) {
    return { awardSourceType: record.awardSourceType ?? null, awardSourceId: record.awardSourceId ?? null };
  }

  if (record.certificateType === "award_certificate" && record.nominationId) {
    return { awardSourceType: "award_nomination", awardSourceId: record.nominationId };
  }

  return {
    awardSourceType: "term",
    awardSourceId: normalize(record.term) || null,
  };
}

export function buildCertificateRecordCreateData(record: IssuedCertificateRecord): CertificateCreateData {
  const source = certificateAwardSource(record);
  const issuedAt = new Date(record.issuedAt);

  return {
    studentId: record.studentId,
    certificateNumber: record.certificateNumber,
    verificationCode: record.verificationCode,
    idempotencyKey: buildCertificateIdempotencyKey(record),
    certificateType: record.certificateType,
    title: record.title,
    awardReason: record.awardReason ?? record.awardType ?? record.title,
    subject: record.subject ?? null,
    level: record.keyStage ?? null,
    yearGroup: record.yearGroup ?? null,
    score: typeof record.score === "number" ? record.score : null,
    issuedAt: Number.isNaN(issuedAt.getTime()) ? new Date() : issuedAt,
    status: record.status,
    metadataJson: JSON.stringify({
      issuedCertificate: record,
      term: record.term,
      keyStage: record.keyStage,
      studentName: record.studentName,
      verificationUrl: record.verificationUrl,
      subjectBreakdown: record.subjectBreakdown,
      evidenceSummary: record.evidenceSummary,
      nominationId: record.nominationId ?? null,
      awardReason: record.awardReason ?? null,
      awardSourceType: record.awardSourceType ?? null,
      awardSourceId: record.awardSourceId ?? null,
      competitionName: record.competitionName ?? null,
      testName: record.testName ?? null,
      rank: record.rank ?? null,
      rankLabel: record.rankLabel ?? null,
      tiedRank: record.tiedRank ?? null,
      rankingMethod: record.rankingMethod ?? null,
    }),
    awardSourceType: source.awardSourceType,
    awardSourceId: source.awardSourceId,
    rank: typeof record.rank === "number" ? record.rank : null,
    rankLabel: record.rankLabel ?? null,
    competitionName: record.competitionName ?? null,
    testName: record.testName ?? null,
    tiedRank: typeof record.tiedRank === "boolean" ? record.tiedRank : null,
    rankingMethod: record.rankingMethod ?? null,
  };
}

export function persistedCertificateRowToIssuedRecord(row: PersistedCertificateRow): IssuedCertificateRecord {
  const metadata = parseJsonObject(row.metadataJson);
  const stored = parseIssuedCertificateRecord(metadata.issuedCertificate);
  const issuedAt = row.issuedAt instanceof Date ? row.issuedAt.toISOString() : new Date(row.issuedAt).toISOString();

  return {
    id: row.id,
    certificateNumber: row.certificateNumber,
    verificationCode: row.verificationCode,
    certificateType: stored?.certificateType ?? (row.certificateType as IssuedCertificateRecord["certificateType"]),
    title: row.title,
    studentId: row.studentId,
    studentName: stored?.studentName ?? row.student?.name ?? "Learner",
    yearGroup: row.yearGroup ?? stored?.yearGroup ?? null,
    keyStage: row.level ?? stored?.keyStage ?? null,
    term: stored?.term ?? (typeof metadata.term === "string" ? metadata.term : "Term"),
    status: row.status === "revoked" ? "revoked" : "issued",
    issuedAt,
    evidenceSummary: stored?.evidenceSummary ?? defaultEvidenceSummary(),
    subjectBreakdown: stored?.subjectBreakdown ?? [],
    verificationUrl: stored?.verificationUrl ?? `/certificates/verify/${row.verificationCode}`,
    awardType: stored?.awardType,
    awardScope: stored?.awardScope,
    subject: row.subject ?? stored?.subject ?? null,
    strand: stored?.strand ?? null,
    score: typeof row.score === "number" ? row.score : stored?.score ?? null,
    nominationId: stored?.nominationId ?? (typeof metadata.nominationId === "string" ? metadata.nominationId : undefined),
    awardReason: row.awardReason ?? stored?.awardReason ?? (typeof metadata.awardReason === "string" ? metadata.awardReason : null),
    awardSourceType: row.awardSourceType ?? stored?.awardSourceType ?? (typeof metadata.awardSourceType === "string" ? metadata.awardSourceType : null),
    awardSourceId: row.awardSourceId ?? stored?.awardSourceId ?? (typeof metadata.awardSourceId === "string" ? metadata.awardSourceId : null),
    competitionName: row.competitionName ?? stored?.competitionName ?? (typeof metadata.competitionName === "string" ? metadata.competitionName : null),
    testName: row.testName ?? stored?.testName ?? (typeof metadata.testName === "string" ? metadata.testName : null),
    rank: typeof row.rank === "number" ? row.rank : stored?.rank ?? null,
    rankLabel: row.rankLabel ?? stored?.rankLabel ?? (typeof metadata.rankLabel === "string" ? metadata.rankLabel : null),
    tiedRank: typeof row.tiedRank === "boolean" ? row.tiedRank : stored?.tiedRank ?? null,
    rankingMethod: (row.rankingMethod as RankingMethod | null) ?? stored?.rankingMethod ?? null,
  };
}

async function findPersistedByIdempotencyKey(idempotencyKey: string): Promise<IssuedCertificateRecord | null> {
  try {
    const row = await certificateDelegate().findUnique({
      where: { idempotencyKey },
      include: { student: { select: { name: true } } },
    });
    return row ? persistedCertificateRowToIssuedRecord(row) : null;
  } catch (error) {
    if (isCertificatePersistenceUnavailable(error)) return null;
    throw error;
  }
}

async function createPersistedCertificate(record: IssuedCertificateRecord): Promise<IssuedCertificateRecord> {
  const data = buildCertificateRecordCreateData(record);
  const row = await certificateDelegate().create({
    data,
    include: { student: { select: { name: true } } },
  });
  return persistedCertificateRowToIssuedRecord(row);
}

export async function listPersistedCertificateRecordsForStudent(studentId: string): Promise<IssuedCertificateRecord[]> {
  try {
    const rows = await certificateDelegate().findMany({
      where: { studentId },
      orderBy: { issuedAt: "desc" },
      include: { student: { select: { name: true } } },
    });
    return rows.map((row) => persistedCertificateRowToIssuedRecord(row));
  } catch (error) {
    if (isCertificatePersistenceUnavailable(error)) return [];
    throw error;
  }
}

export async function listAllPersistedCertificateRecords(): Promise<IssuedCertificateRecord[]> {
  try {
    const rows = await certificateDelegate().findMany({
      orderBy: { issuedAt: "desc" },
      include: { student: { select: { name: true } } },
    });
    return rows.map((row) => persistedCertificateRowToIssuedRecord(row));
  } catch (error) {
    if (isCertificatePersistenceUnavailable(error)) return [];
    throw error;
  }
}

export async function findPersistedCertificateRecordByVerificationCode(verificationCode: string): Promise<IssuedCertificateRecord | null> {
  try {
    const row = await certificateDelegate().findUnique({
      where: { verificationCode },
      include: { student: { select: { name: true } } },
    });
    return row ? persistedCertificateRowToIssuedRecord(row) : null;
  } catch (error) {
    if (isCertificatePersistenceUnavailable(error)) return null;
    throw error;
  }
}

async function persistWithReusableIdentity(recordFactory: () => IssuedCertificateRecord): Promise<IssuedCertificateRecord> {
  let lastRecord = recordFactory();
  const idempotencyKey = buildCertificateIdempotencyKey(lastRecord);
  const existing = await findPersistedByIdempotencyKey(idempotencyKey);
  if (existing) return existing;

  for (let attempt = 0; attempt < MAX_CERTIFICATE_CREATE_ATTEMPTS; attempt += 1) {
    const candidate = attempt === 0 ? lastRecord : {
      ...lastRecord,
      certificateNumber: generateCertificateNumber({
        certificateType: lastRecord.certificateType,
        yearGroup: lastRecord.yearGroup,
        term: lastRecord.term,
      }),
      verificationCode: generateVerificationCode(),
    };
    lastRecord = candidate;

    try {
      return await createPersistedCertificate(candidate);
    } catch (error) {
      if (isCertificatePersistenceUnavailable(error)) return candidate;
      if (isKnownPrismaCode(error, "P2002")) {
        const duplicate = await findPersistedByIdempotencyKey(idempotencyKey);
        if (duplicate) return duplicate;
        continue;
      }
      throw error;
    }
  }

  throw new Error("Certificate could not be issued with a unique number after multiple attempts.");
}

export async function issueAndPersistCertificateRecord(input: {
  eligibility: CertificateEligibilityResult;
  studentId: string;
  studentName: string;
  yearGroup?: string | null;
  keyStage?: string | null;
  verificationBaseUrl?: string;
}): Promise<IssuedCertificateRecord> {
  return persistWithReusableIdentity(() => issueCertificateRecord(input));
}

export async function issueAndPersistAwardCertificateRecord(input: {
  nomination: StudentAwardNomination;
  studentId: string;
  studentName: string;
  yearGroup?: string | null;
  keyStage?: string | null;
  verificationBaseUrl?: string;
}): Promise<IssuedCertificateRecord> {
  return persistWithReusableIdentity(() => issueAwardCertificateRecord(input));
}

export async function issueAndPersistRankedCertificateRecord(input: {
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
}): Promise<IssuedCertificateRecord> {
  return persistWithReusableIdentity(() => issueRankedCertificateRecord(input));
}

export async function findIssuedCertificateByVerificationCode(verificationCode: string): Promise<IssuedCertificateRecord | null> {
  const persisted = await findPersistedCertificateRecordByVerificationCode(verificationCode);
  if (persisted) return persisted;

  const rows = await prisma.studentProfile.findMany({
    where: {
      aiLearningProfileJson: { not: null },
    },
    select: {
      aiLearningProfileJson: true,
    },
  });

  const legacy = rows.flatMap((row) => parseIssuedCertificates(row.aiLearningProfileJson));
  return legacy.find((row) => normalize(row.verificationCode) === normalize(verificationCode)) ?? null;
}

export async function verifyCertificateByVerificationCode(verificationCode: string) {
  const certificate = await findIssuedCertificateByVerificationCode(verificationCode);
  return verifyIssuedCertificate({
    verificationCode,
    candidates: certificate ? [certificate] : [],
  });
}

export function mergePersistedAndLegacyCertificates(input: {
  persisted: IssuedCertificateRecord[];
  profileJson: string | null | undefined;
}): IssuedCertificateRecord[] {
  return mergeIssuedCertificateRecords(input.persisted, parseIssuedCertificates(input.profileJson));
}
