import {
  maskStudentName,
  mergeIssuedCertificateRecords,
  parseIssuedCertificates,
  type IssuedCertificateRecord,
  type IssuedCertificateType,
} from "@/lib/certificate-issuing";

export type CertificateLibraryTypeGroup = "term_certificates" | "subject_certificates" | "english_certificates" | "mastery_certificates" | "award_certificates";

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
  term: string;
  issuedAt: string;
  status: "issued" | "revoked";
  studentDisplayName: string;
};

function typeLabel(type: IssuedCertificateType): string {
  if (type === "term_completion") return "Term Certificate";
  if (type === "end_of_term_exam") return "Term Exam Certificate";
  if (type === "subject_achievement") return "Subject Certificate";
  if (type === "english_achievement") return "English Certificate";
  if (type === "mastery_certificate") return "Mastery Certificate";
  return "Award Certificate";
}

function typeGroup(type: IssuedCertificateType): CertificateLibraryTypeGroup {
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
    term: record.term,
    issuedAt: record.issuedAt,
    status: record.status,
    studentDisplayName: maskStudentName(record.studentName),
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
