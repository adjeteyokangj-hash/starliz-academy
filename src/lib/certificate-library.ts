import {
  maskStudentName,
  mergeIssuedCertificateRecords,
  parseIssuedCertificates,
  type IssuedCertificateRecord,
  type IssuedCertificateType,
} from "@/lib/certificate-issuing";
import { isRankedCertificateType, rankedCertificateTypeLabel } from "@/lib/ranked-certificates";

export type CertificateLibraryTypeGroup =
  | "term_certificates"
  | "subject_certificates"
  | "english_certificates"
  | "mastery_certificates"
  | "award_certificates"
  | "competition_certificates"
  | "subject_test_certificates"
  | "quiz_certificates"
  | "challenge_certificates";

export type CertificateLibraryEntry = {
  certificateNumber: string;
  verificationCode: string;
  verificationUrl: string;
  certificateType: IssuedCertificateType;
  typeLabel: string;
  typeGroup: CertificateLibraryTypeGroup;
  typeGroupLabel: string;
  title: string;
  awardType: string | null;
  awardScope: string | null;
  subject: string | null;
  strand: string | null;
  yearGroup: string | null;
  keyStage: string | null;
  level: string | null;
  term: string;
  issuedAt: string;
  status: "issued" | "revoked";
  studentDisplayName: string;
  awardReason: string | null;
  awardSourceType: string | null;
  awardSourceId: string | null;
  competitionName: string | null;
  testName: string | null;
  score: number | null;
  rank: number | null;
  rankLabel: string | null;
  tiedRank: boolean | null;
  rankingMethod: string | null;
};

function typeLabel(type: IssuedCertificateType): string {
  if (isRankedCertificateType(type)) return rankedCertificateTypeLabel(type);
  if (type === "term_completion") return "Term Certificate";
  if (type === "end_of_term_exam") return "Term Exam Certificate";
  if (type === "subject_achievement") return "Subject Certificate";
  if (type === "english_achievement") return "English Certificate";
  if (type === "mastery_certificate") return "Mastery Certificate";
  return "Award Certificate";
}

function typeGroup(type: IssuedCertificateType): CertificateLibraryTypeGroup {
  if (isRankedCertificateType(type)) {
    if (type.startsWith("SUBJECT_TEST")) return "subject_test_certificates";
    if (type.startsWith("QUIZ")) return "quiz_certificates";
    if (type.startsWith("CHALLENGE")) return "challenge_certificates";
    return "competition_certificates";
  }
  if (type === "term_completion" || type === "end_of_term_exam") return "term_certificates";
  if (type === "subject_achievement") return "subject_certificates";
  if (type === "english_achievement") return "english_certificates";
  if (type === "mastery_certificate") return "mastery_certificates";
  return "award_certificates";
}

function typeGroupLabel(group: CertificateLibraryTypeGroup): string {
  if (group === "term_certificates") return "Term certificates";
  if (group === "subject_certificates") return "Subject certificates";
  if (group === "english_certificates") return "English certificates";
  if (group === "mastery_certificates") return "Mastery certificates";
  if (group === "competition_certificates") return "Competition certificates";
  if (group === "subject_test_certificates") return "Subject test certificates";
  if (group === "quiz_certificates") return "Quiz certificates";
  if (group === "challenge_certificates") return "Challenge certificates";
  return "Award certificates";
}

function issuedTimestamp(value: string): number {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return 0;
  return ms;
}

export function toCertificateLibraryEntry(record: IssuedCertificateRecord): CertificateLibraryEntry {
  const group = typeGroup(record.certificateType);
  return {
    certificateNumber: record.certificateNumber,
    verificationCode: record.verificationCode,
    verificationUrl: record.verificationUrl || `/certificates/verify/${record.verificationCode}`,
    certificateType: record.certificateType,
    typeLabel: typeLabel(record.certificateType),
    typeGroup: group,
    typeGroupLabel: typeGroupLabel(group),
    title: record.title,
    awardType: record.awardType ?? null,
    awardScope: record.awardScope ?? null,
    subject: record.subject ?? null,
    strand: record.strand ?? null,
    yearGroup: record.yearGroup ?? null,
    keyStage: record.keyStage ?? null,
    level: record.keyStage ?? null,
    term: record.term,
    issuedAt: record.issuedAt,
    status: record.status,
    studentDisplayName: maskStudentName(record.studentName),
    awardReason: record.awardReason ?? null,
    awardSourceType: record.awardSourceType ?? null,
    awardSourceId: record.awardSourceId ?? null,
    competitionName: record.competitionName ?? null,
    testName: record.testName ?? null,
    score: typeof record.score === "number" ? record.score : null,
    rank: record.rank ?? null,
    rankLabel: record.rankLabel ?? null,
    tiedRank: record.tiedRank ?? null,
    rankingMethod: record.rankingMethod ?? null,
  };
}

export function listIssuedCertificatesForLibrary(
  profileJson: string | null | undefined,
  persistedRecords: IssuedCertificateRecord[] = [],
): CertificateLibraryEntry[] {
  return mergeIssuedCertificateRecords(persistedRecords, parseIssuedCertificates(profileJson))
    .map((record) => toCertificateLibraryEntry(record))
    .sort((a, b) => issuedTimestamp(b.issuedAt) - issuedTimestamp(a.issuedAt));
}
