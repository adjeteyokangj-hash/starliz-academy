import type { CertificateThemeName } from "@/components/certificates/certificate-theme";
import { isRankedCertificateType, rankLabelForCertificate, rankedCertificateTypeLabel, type RankedCertificateType, type RankingMethod } from "@/lib/ranked-certificates";

export type CertificateTemplateType =
  | "term_completion"
  | "end_of_term_exam"
  | "subject_achievement"
  | "english_achievement"
  | "mastery_certificate"
  | "award_certificate";

export type CertificateDesignCertificateType = CertificateTemplateType | RankedCertificateType;

export type CertificatePreviewStatus = "valid" | "issued" | "revoked";

export type CertificateDesignInput = {
  title: string;
  studentDisplayName: string;
  certificateType: CertificateDesignCertificateType;
  typeLabel: string;
  yearGroup: string | null;
  keyStage: string | null;
  term: string;
  subject: string | null;
  strand: string | null;
  awardType: string | null;
  awardScope: string | null;
  issuedAt: string;
  certificateNumber: string;
  verificationCode: string;
  verificationUrl: string;
  status: CertificatePreviewStatus;
  score?: number | null;
  awardMessage?: string | null;
  evidenceSummaryText?: string | null;
  awardReason?: string | null;
  competitionName?: string | null;
  testName?: string | null;
  rank?: number | null;
  rankLabel?: string | null;
  tiedRank?: boolean | null;
  rankingMethod?: RankingMethod | null;
};

export type CertificateDesignModel = {
  templateType: CertificateDesignCertificateType;
  theme: CertificateThemeName;
  title: string;
  subtitle: string;
  recipientLine: string;
  bodyText: string;
  badgeText: string;
  accentLabel: string;
  sealLabel: string;
  footerNote: string;
  showAwardDetails: boolean;
  showSubjectDetails: boolean;
  showEnglishStrands: boolean;
  showVerificationBlock: boolean;
  printClassName: string;
  normalizedSubject: string | null;
  normalizedStrand: string | null;
};

const ENGLISH_STRAND_LABELS: Record<string, string> = {
  reading: "Reading",
  spelling: "Spelling",
  writing: "Writing",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  comprehension: "Comprehension",
  phonics: "Phonics",
  "speaking-listening": "Speaking & Listening",
  speaking_listening: "Speaking & Listening",
};

function formatToken(value: string | null | undefined): string {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim();
}

function toTitleCase(value: string | null | undefined): string {
  const normalized = formatToken(value);
  if (!normalized) return "";
  return normalized
    .split(/\s+/g)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function englishStrandLabel(strand: string | null): string | null {
  if (!strand) return null;
  const key = String(strand).trim().toLowerCase();
  if (ENGLISH_STRAND_LABELS[key]) return ENGLISH_STRAND_LABELS[key];
  return toTitleCase(strand);
}

function statusBadgeText(status: CertificatePreviewStatus): string {
  if (status === "revoked") return "Revoked";
  if (status === "valid") return "Valid";
  return "Issued";
}

function templateTheme(type: CertificateTemplateType): CertificateThemeName {
  if (type === "term_completion") return "classic_academic";
  if (type === "end_of_term_exam") return "exam_honours";
  if (type === "subject_achievement") return "subject_focus";
  if (type === "english_achievement") return "english_scholar";
  if (type === "mastery_certificate") return "mastery_prestige";
  return "award_prestige";
}

function rankedTheme(input: CertificateDesignInput): CertificateThemeName {
  const label = rankLabelForCertificate({
    certificateType: input.certificateType as RankedCertificateType,
    rank: input.rank,
    rankLabel: input.rankLabel,
  }).toLowerCase();

  if (input.rank === 1 || label.includes("1st") || label.includes("winner")) return "ranked_gold";
  if (input.rank === 2 || label.includes("2nd")) return "ranked_silver";
  if (input.rank === 3 || label.includes("3rd")) return "ranked_bronze";
  if (label.includes("finalist")) return "ranked_finalist";
  return "ranked_participant";
}

export function resolveCertificateDesign(input: CertificateDesignInput): CertificateDesignModel {
  const templateType = input.certificateType;
  const theme = isRankedCertificateType(templateType) ? rankedTheme(input) : templateTheme(templateType);

  const normalizedSubject = templateType === "english_achievement"
    ? "English"
    : (input.subject ? toTitleCase(input.subject) : null);

  const normalizedStrand = templateType === "english_achievement"
    ? englishStrandLabel(input.strand)
    : (input.strand ? toTitleCase(input.strand) : null);

  const badgeText = statusBadgeText(input.status);
  const printClassName = "print:w-[297mm] print:min-h-[210mm] print:max-w-none print:rounded-none print:shadow-none";

  if (isRankedCertificateType(templateType)) {
    const rankLabel = rankLabelForCertificate({
      certificateType: templateType,
      rank: input.rank,
      rankLabel: input.rankLabel,
    });
    const eventName = input.competitionName || input.testName || rankedCertificateTypeLabel(templateType);
    const tiedText = input.tiedRank ? " Shared rank recognised." : "";

    return {
      templateType,
      theme,
      title: input.title || rankedCertificateTypeLabel(templateType),
      subtitle: `${rankLabel} Certificate`,
      recipientLine: rankLabel === "Participant" ? "This certificate recognises the participation of" : "This ranked award is proudly presented to",
      bodyText: input.awardReason?.trim()
        || `for achieving ${rankLabel} in ${eventName}.${tiedText}`,
      badgeText,
      accentLabel: rankLabel,
      sealLabel: rankLabel,
      footerNote: "Ranked certificates are verified StarLiz Academy award records.",
      showAwardDetails: true,
      showSubjectDetails: true,
      showEnglishStrands: Boolean(normalizedStrand),
      showVerificationBlock: true,
      printClassName,
      normalizedSubject,
      normalizedStrand,
    };
  }

  if (templateType === "term_completion") {
    return {
      templateType,
      theme,
      title: "Certificate of Term Completion",
      subtitle: "Academic Completion Certificate",
      recipientLine: "This certificate is proudly awarded to",
      bodyText: `for successfully completing the required StarLiz Academy learning evidence for ${input.term}.`,
      badgeText,
      accentLabel: `Term ${input.term}`,
      sealLabel: "Academic Completion",
      footerNote: "Validated through StarLiz Academy internal assessment and progression evidence.",
      showAwardDetails: false,
      showSubjectDetails: true,
      showEnglishStrands: false,
      showVerificationBlock: true,
      printClassName,
      normalizedSubject,
      normalizedStrand,
    };
  }

  if (templateType === "end_of_term_exam") {
    const scoreLine = typeof input.score === "number" ? ` Exam score achieved: ${input.score}.` : "";
    return {
      templateType,
      theme,
      title: "End of Term Exam Achievement",
      subtitle: "Assessment Achievement Certificate",
      recipientLine: "This certificate is proudly awarded to",
      bodyText: `for demonstrating strong exam performance in the ${input.term} assessment cycle.${scoreLine}`,
      badgeText,
      accentLabel: "Assessment Achievement",
      sealLabel: "Exam Honours",
      footerNote: "Exam outcome verified against approved StarLiz Academy assessment records.",
      showAwardDetails: false,
      showSubjectDetails: true,
      showEnglishStrands: false,
      showVerificationBlock: true,
      printClassName,
      normalizedSubject,
      normalizedStrand,
    };
  }

  if (templateType === "subject_achievement") {
    return {
      templateType,
      theme,
      title: "Subject Achievement Certificate",
      subtitle: "Focused Subject Achievement",
      recipientLine: "This certificate is proudly awarded to",
      bodyText: "for meeting subject learning milestones and maintaining consistent achievement.",
      badgeText,
      accentLabel: normalizedSubject ?? "Subject Achievement",
      sealLabel: "Subject Merit",
      footerNote: "Issued for sustained achievement in selected StarLiz Academy subject pathways.",
      showAwardDetails: false,
      showSubjectDetails: true,
      showEnglishStrands: false,
      showVerificationBlock: true,
      printClassName,
      normalizedSubject,
      normalizedStrand,
    };
  }

  if (templateType === "english_achievement") {
    return {
      templateType,
      theme,
      title: "English Achievement Certificate",
      subtitle: "English Learning Strands Achievement",
      recipientLine: "This certificate is proudly awarded to",
      bodyText: "This certificate recognises achievement across English learning strands including reading, spelling, grammar, vocabulary, and comprehension.",
      badgeText,
      accentLabel: "English Parent Subject",
      sealLabel: "English Scholar",
      footerNote: "English remains one parent subject with strand-level recognition.",
      showAwardDetails: false,
      showSubjectDetails: true,
      showEnglishStrands: true,
      showVerificationBlock: true,
      printClassName,
      normalizedSubject,
      normalizedStrand,
    };
  }

  if (templateType === "mastery_certificate") {
    return {
      templateType,
      theme,
      title: "Mastery Certificate",
      subtitle: "Advanced Mastery Achievement",
      recipientLine: "This certificate is proudly awarded to",
      bodyText: "for demonstrating secure mastery, high-quality evidence, and consistent academic advancement.",
      badgeText,
      accentLabel: "Mastery Milestone",
      sealLabel: "Mastery Distinction",
      footerNote: "Mastery status issued after rigorous StarLiz Academy progression checks.",
      showAwardDetails: false,
      showSubjectDetails: true,
      showEnglishStrands: false,
      showVerificationBlock: true,
      printClassName,
      normalizedSubject,
      normalizedStrand,
    };
  }

  return {
    templateType,
    theme,
    title: input.title || "StarLiz Advancement Award",
    subtitle: "Prestige Award Certificate",
    recipientLine: "This award is presented to",
    bodyText: input.awardMessage?.trim()
      || "This award is presented in recognition of outstanding progress, commitment, and achievement.",
    badgeText,
    accentLabel: toTitleCase(input.awardType) || "StarLiz Academy Award",
    sealLabel: "Award of Distinction",
    footerNote: "Award certificates are issued only after formal review and approval.",
    showAwardDetails: true,
    showSubjectDetails: true,
    showEnglishStrands: Boolean(normalizedStrand),
    showVerificationBlock: true,
    printClassName,
    normalizedSubject,
    normalizedStrand,
  };
}
