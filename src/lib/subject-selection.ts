import { normalizeYearGroup } from "@/lib/curriculum";

export type ParentSubjectKey =
  | "english"
  | "maths"
  | "science"
  | "history"
  | "geography"
  | "french"
  | "spanish"
  | "german"
  | "mandarin"
  | "computing"
  | "citizenship-pshe"
  | "pe-health"
  | "gcse-practice";

export type EnglishStrandKey =
  | "reading"
  | "spelling"
  | "writing"
  | "grammar"
  | "vocabulary"
  | "comprehension"
  | "phonics"
  | "speaking-listening";

export type SubjectSelectionPolicy = {
  minSubjects: number;
  maxSubjects: number;
  requiredSubjectKeys: ParentSubjectKey[];
  optionalSubjectKeys: ParentSubjectKey[];
  mathsCompulsory: boolean;
  englishCompulsory: boolean;
  allowMidTermChanges: boolean;
  schoolsCanOverride: boolean;
};

export const ENGLISH_STRANDS: EnglishStrandKey[] = [
  "reading",
  "spelling",
  "writing",
  "grammar",
  "vocabulary",
  "comprehension",
  "phonics",
  "speaking-listening",
];

export const PARENT_SUBJECTS: Array<{ key: ParentSubjectKey; label: string; core: boolean }> = [
  { key: "english", label: "English", core: true },
  { key: "maths", label: "Maths", core: true },
  { key: "science", label: "Science", core: true },
  { key: "history", label: "History", core: false },
  { key: "geography", label: "Geography", core: false },
  { key: "french", label: "French", core: false },
  { key: "spanish", label: "Spanish", core: false },
  { key: "german", label: "German", core: false },
  { key: "mandarin", label: "Mandarin", core: false },
  { key: "computing", label: "Computing", core: false },
  { key: "citizenship-pshe", label: "Citizenship / PSHE", core: false },
  { key: "pe-health", label: "PE / Health Education", core: false },
  { key: "gcse-practice", label: "GCSE Practice", core: false },
];

const RECEPTION_KS1_PARENT_SUBJECTS: ParentSubjectKey[] = ["english", "maths"];
const KS2_PARENT_SUBJECTS: ParentSubjectKey[] = [
  "english",
  "maths",
  "science",
  "history",
  "geography",
  "computing",
  "citizenship-pshe",
  "pe-health",
  "french",
];
const KS3_PARENT_SUBJECTS: ParentSubjectKey[] = [
  "english",
  "maths",
  "science",
  "history",
  "geography",
  "computing",
  "citizenship-pshe",
  "pe-health",
  "french",
  "spanish",
  "german",
  "mandarin",
];
const KS4_PARENT_SUBJECTS: ParentSubjectKey[] = PARENT_SUBJECTS.map((subject) => subject.key);

function allowedParentSubjectKeysForYearGroup(yearGroup: string | null | undefined): ParentSubjectKey[] {
  const normalized = normalizeYearGroup(yearGroup);
  if (!normalized) return KS4_PARENT_SUBJECTS;
  if (normalized === "Reception" || normalized === "Year 1" || normalized === "Year 2") {
    return RECEPTION_KS1_PARENT_SUBJECTS;
  }
  if (["Year 3", "Year 4", "Year 5", "Year 6"].includes(normalized)) {
    return KS2_PARENT_SUBJECTS;
  }
  if (["Year 7", "Year 8", "Year 9"].includes(normalized)) {
    return KS3_PARENT_SUBJECTS;
  }
  return KS4_PARENT_SUBJECTS;
}

export function parentSubjectsForYearGroup(yearGroup: string | null | undefined): Array<{ key: ParentSubjectKey; label: string; core: boolean }> {
  const allowedKeys = new Set<ParentSubjectKey>(allowedParentSubjectKeysForYearGroup(yearGroup));
  return PARENT_SUBJECTS.filter((subject) => allowedKeys.has(subject.key));
}

const SUBJECT_KEY_SET = new Set<string>(PARENT_SUBJECTS.map((subject) => subject.key));

function normalizePlanName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function maxSubjectsFromPlan(planName: string | null | undefined, childLimit: number | null | undefined): number {
  const normalizedPlan = normalizePlanName(planName);
  if (normalizedPlan.includes("starter")) return 3;
  if (normalizedPlan.includes("standard") || normalizedPlan.includes("monthly")) return 4;
  if (normalizedPlan.includes("premium") || normalizedPlan.includes("year") || normalizedPlan.includes("pro")) return 5;

  const limit = typeof childLimit === "number" && Number.isFinite(childLimit) ? childLimit : 1;
  if (limit <= 1) return 3;
  if (limit <= 4) return 4;
  return 5;
}

export function resolveSubjectSelectionPolicy(input: {
  planName?: string | null;
  childLimit?: number | null;
  yearGroup?: string | null;
}): SubjectSelectionPolicy {
  const allowedSubjectKeys = allowedParentSubjectKeysForYearGroup(input.yearGroup);
  const maxSubjects = Math.min(maxSubjectsFromPlan(input.planName, input.childLimit), allowedSubjectKeys.length);
  const requiredSubjectKeys: ParentSubjectKey[] = ["english", "maths"];
  const optionalSubjectKeys = allowedSubjectKeys.filter((subject) => !requiredSubjectKeys.includes(subject));
  return {
    minSubjects: 2,
    maxSubjects,
    requiredSubjectKeys,
    optionalSubjectKeys,
    mathsCompulsory: true,
    englishCompulsory: true,
    allowMidTermChanges: true,
    schoolsCanOverride: false,
  };
}

export function sanitizeSelectedSubjects(input: string[] | null | undefined): ParentSubjectKey[] {
  if (!Array.isArray(input)) return [];
  const unique: ParentSubjectKey[] = [];
  for (const raw of input) {
    const normalized = String(raw).trim().toLowerCase();
    if (!SUBJECT_KEY_SET.has(normalized)) continue;
    const casted = normalized as ParentSubjectKey;
    if (!unique.includes(casted)) unique.push(casted);
  }
  return unique;
}

export function applySubjectSelectionPolicy(input: {
  selected: ParentSubjectKey[];
  policy: SubjectSelectionPolicy;
}): { selected: ParentSubjectKey[]; errors: string[] } {
  const errors: string[] = [];
  const normalized = sanitizeSelectedSubjects(input.selected);
  const allowedSet = new Set<ParentSubjectKey>([
    ...input.policy.requiredSubjectKeys,
    ...input.policy.optionalSubjectKeys,
  ]);

  const selected = normalized.filter((key) => allowedSet.has(key));
  if (selected.length < normalized.length) {
    errors.push("Some selected subjects are not available for the chosen year group.");
  }
  for (const required of input.policy.requiredSubjectKeys) {
    if (!selected.includes(required)) selected.unshift(required);
  }

  const deduped: ParentSubjectKey[] = [];
  for (const key of selected) {
    if (!deduped.includes(key)) deduped.push(key);
  }

  const trimmed = deduped.slice(0, input.policy.maxSubjects);
  if (trimmed.length < input.policy.minSubjects) {
    errors.push(`Select at least ${input.policy.minSubjects} subjects.`);
  }
  if (deduped.length > input.policy.maxSubjects) {
    errors.push(`Select up to ${input.policy.maxSubjects} subjects for this term.`);
  }

  for (const required of input.policy.requiredSubjectKeys) {
    if (!trimmed.includes(required)) {
      errors.push(`${required === "english" ? "English" : "Maths"} is required.`);
    }
  }

  return { selected: trimmed, errors };
}

export function selectedSubjectsToFocusText(selected: ParentSubjectKey[]): string {
  return selected.join(", ");
}

export function quickLevelFinderSubjects(selected: ParentSubjectKey[]): Array<{ subject: ParentSubjectKey; strand: string | null }> {
  const rows: Array<{ subject: ParentSubjectKey; strand: string | null }> = [];
  for (const subject of selected) {
    if (subject === "english") {
      for (const strand of ENGLISH_STRANDS) {
        rows.push({ subject, strand });
      }
      continue;
    }
    rows.push({ subject, strand: null });
  }
  return rows;
}

