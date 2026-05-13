import {
  AGE_GROUPS,
  KEY_STAGES,
  YEAR_GROUPS,
  ageGroupForYearGroup,
  keyStageForYearGroup,
  skillsForSubjectAndYear,
  subjectsForYearGroup,
  type KeyStage,
  type Subject,
  type YearGroup,
} from "@/lib/curriculum";

export const LESSON_STATUS_OPTIONS = ["draft", "ready", "assigned", "in_progress", "completed", "archived"] as const;
export type LessonStatus = (typeof LESSON_STATUS_OPTIONS)[number];

export const LESSON_DIFFICULTY_BANDS = ["support", "core", "stretch", "mastery"] as const;
export type LessonDifficultyBand = (typeof LESSON_DIFFICULTY_BANDS)[number];

export const LESSON_TEMPLATES = [
  { value: "phonics-lesson", label: "Phonics lesson" },
  { value: "spelling-practice", label: "Spelling practice" },
  { value: "reading-comprehension", label: "Reading comprehension" },
  { value: "maths-fluency", label: "Maths fluency" },
  { value: "science-concept", label: "Science concept lesson" },
  { value: "gcse-revision", label: "GCSE revision lesson" },
  { value: "intervention", label: "Intervention lesson" },
  { value: "mastery-check", label: "Mastery check" },
] as const;

export type LessonTemplateValue = (typeof LESSON_TEMPLATES)[number]["value"];

export const LESSON_PATHWAY_STEPS = [
  "starter",
  "teach",
  "guided practice",
  "independent practice",
  "assessment",
  "recap",
  "mastery check",
] as const;

export type LessonPathwayStep = (typeof LESSON_PATHWAY_STEPS)[number];

export function lessonYearOptions(): readonly YearGroup[] {
  return YEAR_GROUPS;
}

export function lessonKeyStageOptions(): readonly KeyStage[] {
  return KEY_STAGES;
}

export function lessonAgeGroupOptions(): readonly string[] {
  return AGE_GROUPS;
}

export function lessonSubjectOptions(yearGroup: YearGroup | null | undefined): readonly Subject[] {
  return subjectsForYearGroup(yearGroup);
}

export function lessonSkillOptions(subject: Subject | null | undefined, yearGroup: YearGroup | null | undefined): readonly string[] {
  if (!subject || !yearGroup) return [];
  return skillsForSubjectAndYear(subject, yearGroup);
}

export function buildLessonPathway(template: LessonTemplateValue | null | undefined): LessonPathwayStep[] {
  if (template === "intervention") return ["starter", "teach", "guided practice", "assessment", "recap"];
  if (template === "mastery-check") return ["starter", "assessment", "mastery check", "recap"];
  if (template === "gcse-revision") return ["starter", "teach", "guided practice", "assessment", "recap", "mastery check"];
  return ["starter", "teach", "guided practice", "independent practice", "assessment", "recap", "mastery check"];
}

export function curriculumSummary(yearGroup: YearGroup | null | undefined, subject: Subject | null | undefined, skillFocus: string | null | undefined) {
  const resolvedYear = yearGroup ?? null;
  const resolvedSubject = subject ?? null;
  return {
    yearGroup: resolvedYear,
    keyStage: resolvedYear ? keyStageForYearGroup(resolvedYear) : null,
    ageGroup: resolvedYear ? ageGroupForYearGroup(resolvedYear) : null,
    subject: resolvedSubject,
    skills: resolvedSubject && resolvedYear ? lessonSkillOptions(resolvedSubject, resolvedYear) : [],
    skillFocus: skillFocus ?? null,
  };
}
