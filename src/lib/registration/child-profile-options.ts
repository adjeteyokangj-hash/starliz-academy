export const UK_YEAR_GROUP_OPTIONS = [
  "Reception",
  "Year 1",
  "Year 2",
  "Year 3",
  "Year 4",
  "Year 5",
  "Year 6",
  "Year 7",
  "Year 8",
  "Year 9",
  "Year 10",
  "Year 11",
] as const;

export const AVATAR_OPTIONS = ["🦊", "🦄", "🐼", "🐯", "🐬", "🐧"] as const;

export type UkYearGroup = (typeof UK_YEAR_GROUP_OPTIONS)[number];

export const STAGE_BY_YEAR_GROUP: Record<UkYearGroup, string> = {
  Reception: "EYFS",
  "Year 1": "KS1",
  "Year 2": "KS1",
  "Year 3": "KS2",
  "Year 4": "KS2",
  "Year 5": "KS2",
  "Year 6": "KS2",
  "Year 7": "KS3",
  "Year 8": "KS3",
  "Year 9": "KS3",
  "Year 10": "KS4 / GCSE",
  "Year 11": "KS4 / GCSE",
};

export const SUBJECT_OPTIONS_BY_STAGE: Record<string, readonly string[]> = {
  EYFS: [
    "Early English",
    "Early Maths",
    "Communication & Language",
    "Understanding the World",
    "Physical Development",
    "Creative Development",
    "Wellbeing & Personal Development",
  ],
  KS1: [
    "English",
    "Maths",
    "Science",
    "Computing",
    "History & Geography",
    "Creative Arts & Design",
    "PE & Health",
    "Religious Education",
    "Wellbeing & Personal Development",
  ],
  KS2: [
    "English",
    "Maths",
    "Science",
    "Computing",
    "History & Geography",
    "Creative Arts & Design",
    "Languages",
    "PE & Health",
    "Religious Education",
    "Wellbeing & Personal Development",
  ],
  KS3: [
    "English",
    "Maths",
    "Science",
    "Computing",
    "Humanities",
    "Languages",
    "Creative Arts & Design",
    "PE & Health",
    "Religious Education",
    "Wellbeing & Personal Development",
  ],
  "KS4 / GCSE": [
    "GCSE English",
    "GCSE Maths",
    "GCSE Science",
    "GCSE Computer Science",
    "GCSE Humanities",
    "GCSE Languages",
    "GCSE Religious Studies",
    "GCSE Creative Arts & Design",
    "GCSE PE",
    "Wellbeing & Exam Confidence",
  ],
};

export const INTERNAL_STRANDS_BY_PARENT_SUBJECT: Record<string, readonly string[]> = {
  English: [
    "Reading",
    "Spelling",
    "Phonics",
    "Grammar",
    "Writing",
    "Vocabulary",
    "Comprehension",
    "Speaking & Listening",
  ],
  "GCSE English": [
    "English Language",
    "English Literature",
    "Reading analysis",
    "Writing skills",
    "Spelling, punctuation and grammar",
    "Vocabulary",
    "Exam practice",
  ],
  "GCSE Science": [
    "Combined Science",
    "Biology",
    "Chemistry",
    "Physics",
    "Required practicals",
    "Exam questions",
  ],
  "GCSE Humanities": ["History", "Geography"],
};

export const LEARNING_FOCUS_OPTIONS = [
  { id: "all_recommended", label: "All recommended subjects" },
  { id: "core_subjects", label: "Core subjects only" },
  { id: "english_support", label: "English support" },
  { id: "maths_support", label: "Maths support" },
  { id: "science_support", label: "Science support" },
  { id: "reading_writing_support", label: "Reading and writing support" },
  { id: "gcse_readiness", label: "GCSE readiness", stages: ["KS4 / GCSE"] as const },
  { id: "catch_up_support", label: "Catch-up support" },
  { id: "confidence_building", label: "Confidence building" },
  { id: "challenge_stretch", label: "Challenge / stretch learning" },
] as const;

export const LEARNING_CONFIDENCE_OPTIONS = [
  "Needs support",
  "Growing",
  "Confident",
  "Advanced / ready for challenge",
] as const;

export function calculateAgeFromDateOfBirth(dateOfBirth: string, referenceDate = new Date()): number | null {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;

  let age = referenceDate.getFullYear() - dob.getFullYear();
  const monthDelta = referenceDate.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && referenceDate.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age < 0 ? null : age;
}

function getAcademicYearStart(referenceDate: Date): number {
  const month = referenceDate.getMonth() + 1;
  return month >= 9 ? referenceDate.getFullYear() : referenceDate.getFullYear() - 1;
}

function getReceptionAcademicStartYear(dateOfBirth: Date): number {
  const month = dateOfBirth.getMonth() + 1;
  return month >= 9 ? dateOfBirth.getFullYear() + 5 : dateOfBirth.getFullYear() + 4;
}

export function suggestUkYearGroupFromDateOfBirth(
  dateOfBirth: string,
  referenceDate = new Date(),
): UkYearGroup | null {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;

  const academicStartYear = getAcademicYearStart(referenceDate);
  const receptionStartYear = getReceptionAcademicStartYear(dob);
  const yearOffset = academicStartYear - receptionStartYear;
  const clampedOffset = Math.max(0, Math.min(yearOffset, UK_YEAR_GROUP_OPTIONS.length - 1));
  return UK_YEAR_GROUP_OPTIONS[clampedOffset];
}

export function getStageForYearGroup(yearGroup: string): string {
  return STAGE_BY_YEAR_GROUP[yearGroup as UkYearGroup] ?? "KS2";
}

export function getSubjectOptionsForYearGroup(yearGroup: string): readonly string[] {
  const stage = getStageForYearGroup(yearGroup);
  return SUBJECT_OPTIONS_BY_STAGE[stage] ?? SUBJECT_OPTIONS_BY_STAGE.KS2;
}

export function mapLearningFocusToLegacyMainFocus(focusLabel: string): "Spelling" | "Maths" | "Reading" | "All subjects" {
  if (focusLabel === "Maths support") return "Maths";
  if (focusLabel === "English support" || focusLabel === "Reading and writing support") return "Reading";
  if (focusLabel === "Catch-up support") return "Spelling";
  return "All subjects";
}

export function validateRequiredConsents(consents: {
  isGuardianConfirmed: boolean;
  learningProfileConsent: boolean;
  termsPrivacyConsent: boolean;
}): boolean {
  return consents.isGuardianConfirmed && consents.learningProfileConsent && consents.termsPrivacyConsent;
}
