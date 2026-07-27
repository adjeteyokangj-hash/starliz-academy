import { normalizeLessonPackSubject } from "@/lib/lesson-pack-import/subject-detection";
import type { AcademicValidationIssue, LessonValidationContext } from "./types";

const MOJIBAKE = /(?:Ã.|Â.|â[€™œ“”–—]|�)/;
const INTERNAL_ID = /\b(?:LESS|Q|ACT|FILE)[-_]?\d{3,}\b/i;
const SOURCE_FILE = /\.(?:pdf|pptx?|docx?|zip|txt)$/i;
const ANSWER_SHEET = /^\s*(?:answers?|answer sheet|mark scheme|teacher answers?)\b/i;

export function validateGlobalLesson(context: LessonValidationContext): AcademicValidationIssue[] {
  const { model, subject, difficulty } = context;
  const activities = [...model.starterQuestions, ...model.worksheetTasks, ...model.exitQuestions];
  const issues: AcademicValidationIssue[] = [];
  const add = (code: string, message: string, severity: "warning" | "needs_input" | "blocked" = "blocked") =>
    issues.push({ code, message, severity, scope: "global" });

  if (!model.title?.trim() || SOURCE_FILE.test(model.title) || INTERNAL_ID.test(model.title)) add("invalid_title", "Lesson title is missing, is a source filename, or contains an internal ID.");
  if (!model.learningObjective?.trim() || model.learningObjective.trim().length < 9) add("invalid_objective", "A clean learning objective is required.", "needs_input");
  if (!subject || !normalizeLessonPackSubject(subject)) add("unsupported_subject", "Subject must map to the canonical StarLiz taxonomy.");
  if (!model.yearGroup || !model.keyStage) add("invalid_year_stage", "A valid year group and key stage are required.");
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) add("invalid_difficulty", "Difficulty must be between 1 and 5.");
  const studentText = [model.title, model.learningObjective ?? "", ...activities.map((a) => a.prompt)].join("\n");
  if (MOJIBAKE.test(studentText)) add("corrupted_text", "Student content contains mojibake or corrupted text.");
  if (activities.some((a) => INTERNAL_ID.test(a.prompt))) add("internal_id", "Student content contains internal identifiers.");
  if (activities.some((a) => ANSWER_SHEET.test(a.prompt))) add("answer_sheet_as_question", "Answer-sheet text cannot be used as a student question.");
  if (!activities.length || activities.some((a) => !a.prompt?.trim())) add("empty_activity", "Every lesson needs non-empty student activities.");
  if (activities.some((a) => a.prompt.length > 6000)) add("oversized_dump", "An activity contains an oversized page dump.");
  if (!context.duplicatePassed) issues.push({ code: "duplicate_gate", message: "Duplicate checks must pass.", scope: "duplicate", severity: "blocked" });
  if (!context.licencePassed) issues.push({ code: "licence_gate", message: "Licence details are incomplete.", scope: "licence", severity: "blocked" });
  if (!context.thirdPartyPassed) issues.push({ code: "third_party_review", message: "Third-party material requires Admin review.", scope: "licence", severity: "needs_input" });
  return issues;
}
