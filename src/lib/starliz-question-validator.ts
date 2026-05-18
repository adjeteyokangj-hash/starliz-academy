/**
 * StarLiz Question Validator
 *
 * Validates and optionally repairs question objects before they are saved
 * to the AI content cache or served to students.
 *
 * Rules enforced:
 *  - Every question must have a non-empty `prompt` and `answer`.
 *  - Every question must have a non-empty `explanation`.
 *  - Maths questions must have a `workedSolution`.
 *  - Questions missing `hint1` / `hint2` are warned (not rejected) unless mode is "strict".
 *  - Science questions may include an optional `visual`.
 *  - Spelling and reading questions do not require a `visual`.
 */

export type QuestionSubjectCategory =
  | "maths"
  | "science"
  | "spelling"
  | "reading"
  | "english"
  | "other";

export type ValidatedQuestion = {
  /** The question text shown to the student. */
  prompt: string;
  /** Correct answer (string representation). */
  answer: string;
  /** Why the correct answer is correct — always shown after first submission. */
  explanation: string;
  /** Gentle hint after wrong attempt 1 — must not reveal the answer. */
  hint1?: string;
  /** Stronger support after wrong attempt 2 — may show worked steps. */
  hint2?: string;
  /** Full worked solution shown only on final failed attempt. */
  workedSolution?: string;
  /** Multiple-choice options. Required when the question uses options. */
  answerOptions?: string[];
  /** Visual scaffold (diagram, formula card, passage). */
  visual?: {
    type: "diagram" | "formula_card" | "passage";
    title: string;
    altText: string;
    body: string[];
  } | null;
  /** Subject identifier, e.g. "Maths", "Science", "Spelling". */
  subject?: string;
  /** Year group, e.g. "Year 4". */
  yearGroup?: string;
  /** Key stage, e.g. "KS2". */
  keyStage?: string;
  /** Learning objective for this question. */
  learningObjective?: string;
  /** Skill focus, e.g. "Ohm's Law", "Silent e". */
  skillFocus?: string;
  /** Key given information lines shown before the question. */
  keyInformation?: string[];
  /** Difficulty weighting 1–3. */
  scoringWeight?: number;
  /** Any additional fields are carried through unchanged. */
  [key: string]: unknown;
};

export type QuestionValidationResult = {
  ok: boolean;
  /** Hard errors that prevent the question from being used. */
  errors: string[];
  /** Soft warnings that do not block saving but should be addressed. */
  warnings: string[];
  /** Repaired question when `mode` is "repair" and repairs were possible. */
  repairedQuestion?: ValidatedQuestion;
};

export type BatchValidationResult = {
  ok: boolean;
  /** Total number of questions in the batch. */
  total: number;
  /** Questions that passed validation. */
  valid: ValidatedQuestion[];
  /** Questions that failed validation. */
  invalid: Array<{ index: number; errors: string[]; warnings: string[] }>;
  /** Aggregate errors for the batch. */
  errors: string[];
};

type ValidationOptions = {
  /**
   * "strict"  — missing hints cause errors (not warnings).
   * "repair"  — attempt to fill missing fields with placeholder text.
   * "warn"    — missing hints are warnings only (default).
   */
  mode?: "strict" | "repair" | "warn";
  subjectCategory?: QuestionSubjectCategory;
};

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function isEmpty(value: unknown): boolean {
  return str(value) === "";
}

function inferSubjectCategory(question: Record<string, unknown>): QuestionSubjectCategory {
  const subject = str(question.subject).toLowerCase();
  const skillFocus = str(question.skillFocus).toLowerCase();
  const prompt = str(question.prompt).toLowerCase();

  if (subject.includes("science") || skillFocus.includes("ohm") || prompt.includes("circuit") || prompt.includes("voltage") || prompt.includes("resistance")) {
    return "science";
  }
  if (subject.includes("maths") || subject.includes("math") || subject.includes("numeracy")) {
    return "maths";
  }
  if (subject.includes("spell") || str(question.word) !== "") {
    return "spelling";
  }
  if (subject.includes("reading") || subject.includes("comprehension") || str(question.passage) !== "") {
    return "reading";
  }
  if (subject.includes("english") || subject.includes("grammar") || subject.includes("punctuation")) {
    return "english";
  }
  return "other";
}

/**
 * Validate a single question object.
 */
export function validateQuestion(
  question: unknown,
  options: ValidationOptions = {},
): QuestionValidationResult {
  const { mode = "warn" } = options;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!question || typeof question !== "object") {
    return { ok: false, errors: ["Question must be a non-null object."], warnings: [] };
  }

  const q = question as Record<string, unknown>;
  const category = options.subjectCategory ?? inferSubjectCategory(q);

  // ── Hard requirements ──────────────────────────────────────────────────────

  if (isEmpty(q.prompt) && isEmpty(q.question) && isEmpty(q.word)) {
    errors.push("Question is missing a prompt or question text.");
  }

  if (isEmpty(q.answer)) {
    errors.push("Question is missing the correct answer.");
  }

  if (isEmpty(q.explanation)) {
    errors.push("Question is missing an explanation. Every question must explain why the correct answer is correct.");
  }

  // ── Maths-specific ─────────────────────────────────────────────────────────

  if (category === "maths" || category === "science") {
    if (isEmpty(q.workedSolution)) {
      if (mode === "strict") {
        errors.push("Maths/Science question is missing a workedSolution.");
      } else {
        warnings.push("Maths/Science question should include a workedSolution for the final-fail reveal.");
      }
    }
  }

  // ── Hint requirements ──────────────────────────────────────────────────────

  const hintsMissing = isEmpty(q.hint1) || isEmpty(q.hint2);

  if (hintsMissing) {
    if (mode === "strict") {
      errors.push("Question is missing hint1 and/or hint2. Both hints are required in strict mode.");
    } else {
      warnings.push("Question is missing hint1 and/or hint2. Students will receive generic hints.");
    }
  }

  // ── Multiple-choice integrity ──────────────────────────────────────────────

  const hasOptions =
    (Array.isArray(q.answerOptions) && q.answerOptions.length > 0) ||
    (Array.isArray(q.options) && (q.options as unknown[]).length > 0) ||
    (Array.isArray(q.choices) && (q.choices as unknown[]).length > 0);

  if (hasOptions) {
    const opts = (q.answerOptions ?? q.options ?? q.choices) as unknown[];
    const correctAnswer = str(q.answer);
    const normalised = opts.map((o) => str(o).toLowerCase());
    if (!normalised.includes(correctAnswer.toLowerCase())) {
      warnings.push(
        `The correct answer "${correctAnswer}" does not appear in the answer options. Students will not be able to select it.`,
      );
    }
  }

  const ok = errors.length === 0;

  // ── Repair mode ───────────────────────────────────────────────────────────

  if (mode === "repair" && ok) {
    const repaired: ValidatedQuestion = {
      prompt: str(q.prompt || q.question || q.word),
      answer: str(q.answer),
      explanation: str(q.explanation),
      ...(str(q.hint1) ? { hint1: str(q.hint1) } : { hint1: "Look carefully at the question and identify the key information." }),
      ...(str(q.hint2) ? { hint2: str(q.hint2) } : { hint2: "Try working through the problem step by step." }),
      ...q,
    };
    return { ok, errors, warnings, repairedQuestion: repaired };
  }

  return { ok, errors, warnings };
}

/**
 * Validate a batch of questions.
 * Returns the subset of valid questions and details on failures.
 */
export function validateQuestionBatch(
  questions: unknown[],
  options: ValidationOptions = {},
): BatchValidationResult {
  const valid: ValidatedQuestion[] = [];
  const invalid: Array<{ index: number; errors: string[]; warnings: string[] }> = [];

  for (let i = 0; i < questions.length; i++) {
    const result = validateQuestion(questions[i], options);
    if (result.ok) {
      valid.push((options.mode === "repair" && result.repairedQuestion ? result.repairedQuestion : questions[i]) as ValidatedQuestion);
    } else {
      invalid.push({ index: i, errors: result.errors, warnings: result.warnings });
    }
  }

  const errors = invalid.flatMap((entry) => entry.errors.map((e) => `Q${entry.index + 1}: ${e}`));

  return {
    ok: invalid.length === 0,
    total: questions.length,
    valid,
    invalid,
    errors,
  };
}

/**
 * Quick boolean check: is this question safe to assign to a student?
 * Returns false if the question is missing prompt, answer, or explanation.
 */
export function isAssignableQuestion(question: unknown): boolean {
  const result = validateQuestion(question, { mode: "warn" });
  return result.ok;
}
