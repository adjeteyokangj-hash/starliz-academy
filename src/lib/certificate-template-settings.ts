import type { CertificateTemplateType, CertificateDesignInput } from "@/components/certificates/certificate-designs";
import type { CertificateThemeName } from "@/components/certificates/certificate-theme";

export type CertificateTemplateOption =
  | "classic_academic"
  | "gold_award"
  | "modern_clean"
  | "mastery_premium"
  | "english_learning"
  | "assessment_achievement";

export type CertificateTemplateSetting = {
  certificateType: CertificateTemplateType;
  template: CertificateTemplateOption;
  theme: CertificateThemeName;
};

export type CertificateTemplateSettings = Record<CertificateTemplateType, CertificateTemplateSetting>;

export const certificateTemplateTypes: ReadonlyArray<CertificateTemplateType> = [
  "term_completion",
  "end_of_term_exam",
  "subject_achievement",
  "english_achievement",
  "mastery_certificate",
  "award_certificate",
];

export const availableCertificateTemplates: ReadonlyArray<{ value: CertificateTemplateOption; label: string; description: string }> = [
  {
    value: "classic_academic",
    label: "Classic Academic",
    description: "Formal certificate style for core completion and achievement records.",
  },
  {
    value: "gold_award",
    label: "Gold Award",
    description: "Prestige award layout with high-contrast recognition styling.",
  },
  {
    value: "modern_clean",
    label: "Modern Clean",
    description: "Simple clean variant for broad certificate readability.",
  },
  {
    value: "mastery_premium",
    label: "Mastery Premium",
    description: "Elevated style for mastery and advanced milestone certificates.",
  },
  {
    value: "english_learning",
    label: "English Learning",
    description: "English parent-subject style with strand-focused presentation.",
  },
  {
    value: "assessment_achievement",
    label: "Assessment Achievement",
    description: "Assessment-forward style for exam and achievement certificates.",
  },
];

export const availableCertificateThemes: ReadonlyArray<{ value: CertificateThemeName; label: string; description: string }> = [
  {
    value: "classic_academic",
    label: "Classic Academic",
    description: "Traditional academic visual style.",
  },
  {
    value: "exam_honours",
    label: "Assessment Achievement",
    description: "Assessment-focused honours theme.",
  },
  {
    value: "subject_focus",
    label: "Modern Clean",
    description: "Clean subject-first presentation.",
  },
  {
    value: "english_scholar",
    label: "English Learning",
    description: "English strand-first presentation.",
  },
  {
    value: "mastery_prestige",
    label: "Mastery Premium",
    description: "Premium mastery certificate theme.",
  },
  {
    value: "award_prestige",
    label: "Gold Award",
    description: "Prestige award recognition theme.",
  },
];

const TEMPLATE_TO_THEME: Record<CertificateTemplateOption, CertificateThemeName> = {
  classic_academic: "classic_academic",
  gold_award: "award_prestige",
  modern_clean: "subject_focus",
  mastery_premium: "mastery_prestige",
  english_learning: "english_scholar",
  assessment_achievement: "exam_honours",
};

export const defaultCertificateTemplateSettings: CertificateTemplateSettings = {
  term_completion: {
    certificateType: "term_completion",
    template: "classic_academic",
    theme: "classic_academic",
  },
  end_of_term_exam: {
    certificateType: "end_of_term_exam",
    template: "assessment_achievement",
    theme: "exam_honours",
  },
  subject_achievement: {
    certificateType: "subject_achievement",
    template: "modern_clean",
    theme: "subject_focus",
  },
  english_achievement: {
    certificateType: "english_achievement",
    template: "english_learning",
    theme: "english_scholar",
  },
  mastery_certificate: {
    certificateType: "mastery_certificate",
    template: "mastery_premium",
    theme: "mastery_prestige",
  },
  award_certificate: {
    certificateType: "award_certificate",
    template: "gold_award",
    theme: "award_prestige",
  },
};

export function isCertificateThemeName(value: string): value is CertificateThemeName {
  return value === "classic_academic"
    || value === "exam_honours"
    || value === "subject_focus"
    || value === "english_scholar"
    || value === "mastery_prestige"
    || value === "award_prestige";
}

export function isCertificateTemplateOption(value: string): value is CertificateTemplateOption {
  return value === "classic_academic"
    || value === "gold_award"
    || value === "modern_clean"
    || value === "mastery_premium"
    || value === "english_learning"
    || value === "assessment_achievement";
}

export function isCertificateTemplateType(value: string): value is CertificateTemplateType {
  return certificateTemplateTypes.includes(value as CertificateTemplateType);
}

export function validateCertificateTemplateSettings(input: unknown): CertificateTemplateSettings {
  const base = { ...defaultCertificateTemplateSettings };
  if (!input || typeof input !== "object" || Array.isArray(input)) return base;

  const raw = input as Record<string, unknown>;

  for (const type of certificateTemplateTypes) {
    const rawEntry = raw[type];
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;

    const entry = rawEntry as Record<string, unknown>;
    const template = typeof entry.template === "string" && isCertificateTemplateOption(entry.template)
      ? entry.template
      : base[type].template;
    const theme = typeof entry.theme === "string" && isCertificateThemeName(entry.theme)
      ? entry.theme
      : TEMPLATE_TO_THEME[template] ?? base[type].theme;

    base[type] = {
      certificateType: type,
      template,
      theme,
    };
  }

  return base;
}

export function validateCertificateTemplateSettingsStrict(input: unknown):
  | { ok: true; settings: CertificateTemplateSettings }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Settings payload must be an object." };
  }

  const raw = input as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!isCertificateTemplateType(key)) {
      return { ok: false, error: `Invalid certificate type: ${key}` };
    }
  }

  for (const type of certificateTemplateTypes) {
    const rawEntry = raw[type];
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
      return { ok: false, error: `Missing settings for certificate type: ${type}` };
    }

    const entry = rawEntry as Record<string, unknown>;
    if (entry.certificateType !== type) {
      return { ok: false, error: `Invalid certificateType for ${type}` };
    }
    if (typeof entry.template !== "string" || !isCertificateTemplateOption(entry.template)) {
      return { ok: false, error: `Invalid template for certificate type: ${type}` };
    }
    if (typeof entry.theme !== "string" || !isCertificateThemeName(entry.theme)) {
      return { ok: false, error: `Invalid theme for certificate type: ${type}` };
    }
  }

  return { ok: true, settings: validateCertificateTemplateSettings(raw) };
}

export function resolveCertificateTemplateForType(input: {
  certificateType: CertificateTemplateType;
  settings?: Partial<CertificateTemplateSettings> | null;
}): CertificateTemplateSetting {
  const validated = validateCertificateTemplateSettings(input.settings ?? null);
  return validated[input.certificateType] ?? defaultCertificateTemplateSettings[input.certificateType];
}

function demoTitle(type: CertificateTemplateType): string {
  if (type === "term_completion") return "Certificate of Term Completion";
  if (type === "end_of_term_exam") return "End of Term Exam Achievement";
  if (type === "subject_achievement") return "Subject Achievement Certificate";
  if (type === "english_achievement") return "English Achievement Certificate";
  if (type === "mastery_certificate") return "Mastery Certificate";
  return "StarLiz Advancement Award";
}

function demoTypeLabel(type: CertificateTemplateType): string {
  if (type === "term_completion") return "Term Certificate";
  if (type === "end_of_term_exam") return "Term Exam Certificate";
  if (type === "subject_achievement") return "Subject Certificate";
  if (type === "english_achievement") return "English Certificate";
  if (type === "mastery_certificate") return "Mastery Certificate";
  return "Award Certificate";
}

export function buildCertificateTemplatePreviewData(input: {
  certificateType: CertificateTemplateType;
  settings?: Partial<CertificateTemplateSettings> | null;
}): CertificateDesignInput & {
  isPreviewDemo: true;
  template: CertificateTemplateOption;
  theme: CertificateThemeName;
} {
  const resolved = resolveCertificateTemplateForType(input);

  return {
    isPreviewDemo: true,
    template: resolved.template,
    theme: resolved.theme,
    title: demoTitle(input.certificateType),
    studentDisplayName: "D*** (Preview Demo)",
    certificateType: input.certificateType,
    typeLabel: demoTypeLabel(input.certificateType),
    yearGroup: "Year 5",
    keyStage: "KS2",
    term: "Spring",
    subject: input.certificateType === "english_achievement" ? "English" : input.certificateType === "subject_achievement" ? "Maths" : null,
    strand: input.certificateType === "english_achievement" ? "reading" : null,
    awardType: input.certificateType === "award_certificate" ? "student_of_the_term" : null,
    awardScope: input.certificateType === "award_certificate" ? "year_group" : null,
    issuedAt: "2026-05-01T09:00:00.000Z",
    certificateNumber: "SLA-DEMO-TEMPLATE-0001",
    verificationCode: "SV-DEMO-TEMPLATE",
    verificationUrl: "/certificates/verify/SV-DEMO-TEMPLATE",
    status: "issued",
    score: input.certificateType === "award_certificate" ? 95 : null,
    evidenceSummaryText: input.certificateType === "award_certificate" ? "Preview-only evidence summary" : null,
  };
}
