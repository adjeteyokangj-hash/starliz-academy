export type HomeworkOutcomeBand =
  | "MASTERED"
  | "SECURE"
  | "DEVELOPING"
  | "NEEDS_SUPPORT"
  | "REVIEW_NEEDED"
  | "INCOMPLETE";

export type HomeworkAnswerMarkingResult = {
  questionId: string;
  markingStatus: "correct" | "incorrect" | "review_needed" | "incomplete";
  isCorrect: boolean | null;
  score: number | null;
  reviewNeeded: boolean;
  feedback: string;
  aiConfidence: number | null;
  weakArea: string | null;
};

export type HomeworkMarkingSummary = {
  scorePercent: number | null;
  outcomeBand: HomeworkOutcomeBand;
  correctCount: number;
  incorrectCount: number;
  reviewNeededCount: number;
  incompleteCount: number;
  answeredCount: number;
  totalQuestions: number;
  feedback: string;
  weakAreas: string[];
  requiresRecap: boolean;
};

export type HomeworkMarkingQuestionInput = {
  id: string;
  subject: string;
  topic: string | null;
  skill: string | null;
  questionType: string;
  prompt: unknown;
  expectedAnswer: unknown;
  submittedAnswer: unknown;
};

export type HomeworkOpenAnswerAiRequest = {
  questionId: string;
  prompt: unknown;
  subject: string;
  topic: string | null;
  skill: string | null;
  submittedAnswer: unknown;
  expectedAnswer: unknown;
};

export type HomeworkOpenAnswerAiResponse =
  | {
      available: true;
      markingStatus: "correct" | "incorrect" | "review_needed";
      isCorrect: boolean | null;
      score: number | null;
      feedback: string;
      aiConfidence?: number | null;
      weakArea?: string | null;
    }
  | {
      available: false;
      reason?: string;
    };

export interface HomeworkOpenAnswerAiBoundary {
  markOpenAnswer(input: HomeworkOpenAnswerAiRequest): Promise<HomeworkOpenAnswerAiResponse>;
}

export const unavailableHomeworkOpenAnswerAiBoundary: HomeworkOpenAnswerAiBoundary = {
  async markOpenAnswer() {
    return {
      available: false,
      reason: "AI marking is unavailable.",
    };
  },
};

function normalizeText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim().toLowerCase();
  }
  if (typeof value === "object" && value !== null) {
    if ("text" in value) return normalizeText((value as { text?: unknown }).text);
    if ("value" in value) return normalizeText((value as { value?: unknown }).value);
    if ("answer" in value) return normalizeText((value as { answer?: unknown }).answer);
    if ("label" in value) return normalizeText((value as { label?: unknown }).label);
  }
  return "";
}

function extractExpectedCandidates(expectedAnswer: unknown): string[] {
  if (Array.isArray(expectedAnswer)) {
    return expectedAnswer.flatMap((item) => extractExpectedCandidates(item)).filter(Boolean);
  }

  if (typeof expectedAnswer === "object" && expectedAnswer !== null) {
    const record = expectedAnswer as Record<string, unknown>;
    if (Array.isArray(record.acceptableAnswers)) {
      return record.acceptableAnswers.flatMap((item) => extractExpectedCandidates(item)).filter(Boolean);
    }
    if (Array.isArray(record.answers)) {
      return record.answers.flatMap((item) => extractExpectedCandidates(item)).filter(Boolean);
    }
    for (const key of ["correctAnswer", "expected", "answer", "text", "value"]) {
      if (key in record) {
        const normalized = normalizeText(record[key]);
        if (normalized) return [normalized];
      }
    }
  }

  const normalized = normalizeText(expectedAnswer);
  return normalized ? [normalized] : [];
}

function parseNumeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = normalizeText(value).replace(/,/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isOpenAnswerType(questionType: string, expectedCandidates: string[]): boolean {
  const normalized = questionType.trim().toLowerCase();
  if (["open_answer", "open-answer", "long_answer", "long-answer", "essay", "free_response", "free-response", "explanation"].includes(normalized)) {
    return true;
  }
  return expectedCandidates.length === 0;
}

function isNumericType(questionType: string): boolean {
  return ["numeric", "number", "simple_numeric", "simple-numeric"].includes(questionType.trim().toLowerCase());
}

function inferWeakArea(question: HomeworkMarkingQuestionInput): string | null {
  return question.skill ?? question.topic ?? question.subject ?? null;
}

function scoreToBand(scorePercent: number | null, reviewNeededCount: number, incompleteCount: number): HomeworkOutcomeBand {
  if (reviewNeededCount > 0) return "REVIEW_NEEDED";
  if (scorePercent === null || incompleteCount > 0) return "INCOMPLETE";
  if (scorePercent >= 85) return "MASTERED";
  if (scorePercent >= 70) return "SECURE";
  if (scorePercent >= 50) return "DEVELOPING";
  return "NEEDS_SUPPORT";
}

function buildSummaryFeedback(band: HomeworkOutcomeBand, weakAreas: string[], reviewNeededCount: number): string {
  if (band === "MASTERED") return "Excellent work. You showed strong understanding across this homework.";
  if (band === "SECURE") return "Good work. You are secure in most of this week’s homework.";
  if (band === "DEVELOPING") return weakAreas.length
    ? `Good effort. Review ${weakAreas.slice(0, 2).join(" and ")} before your next lesson.`
    : "Good effort. A short recap will help you feel ready for the next lesson.";
  if (band === "NEEDS_SUPPORT") return weakAreas.length
    ? `Recap is ready to help with ${weakAreas.slice(0, 2).join(" and ")} before normal progression.`
    : "Recap is ready before normal progression resumes.";
  if (band === "REVIEW_NEEDED") return reviewNeededCount === 1
    ? "One answer needs review before StarLiz can confirm your full result."
    : `${reviewNeededCount} answers need review before StarLiz can confirm your full result.`;
  return "This homework is not complete enough to calculate a final outcome yet.";
}

function autoMarkQuestion(question: HomeworkMarkingQuestionInput): HomeworkAnswerMarkingResult | null {
  const submittedText = normalizeText(question.submittedAnswer);
  if (!submittedText) {
    return {
      questionId: question.id,
      markingStatus: "incomplete",
      isCorrect: null,
      score: null,
      reviewNeeded: false,
      feedback: "No submitted answer was available to mark.",
      aiConfidence: null,
      weakArea: inferWeakArea(question),
    };
  }

  const expectedCandidates = extractExpectedCandidates(question.expectedAnswer);
  if (isOpenAnswerType(question.questionType, expectedCandidates)) {
    return null;
  }

  if (isNumericType(question.questionType)) {
    const submittedNumber = parseNumeric(question.submittedAnswer);
    const expectedNumbers = expectedCandidates
      .map((candidate) => parseNumeric(candidate))
      .filter((value): value is number => value !== null);
    const correct = submittedNumber !== null && expectedNumbers.some((value) => value === submittedNumber);
    return {
      questionId: question.id,
      markingStatus: correct ? "correct" : "incorrect",
      isCorrect: correct,
      score: correct ? 100 : 0,
      reviewNeeded: false,
      feedback: correct
        ? "Correct answer."
        : expectedCandidates.length
          ? `Review this one. Expected answer: ${expectedCandidates[0]}.`
          : "Review this one and try the recap guidance.",
      aiConfidence: null,
      weakArea: correct ? null : inferWeakArea(question),
    };
  }

  const normalizedExpected = expectedCandidates;
  const correct = normalizedExpected.includes(submittedText);
  return {
    questionId: question.id,
    markingStatus: correct ? "correct" : "incorrect",
    isCorrect: correct,
    score: correct ? 100 : 0,
    reviewNeeded: false,
    feedback: correct
      ? "Correct answer."
      : normalizedExpected.length
        ? `Review this one. Expected answer: ${normalizedExpected[0]}.`
        : "Review this one and try the recap guidance.",
    aiConfidence: null,
    weakArea: correct ? null : inferWeakArea(question),
  };
}

export async function markHomeworkSubmission(input: {
  questions: HomeworkMarkingQuestionInput[];
  aiBoundary?: HomeworkOpenAnswerAiBoundary;
}): Promise<{
  answers: HomeworkAnswerMarkingResult[];
  summary: HomeworkMarkingSummary;
}> {
  const aiBoundary = input.aiBoundary ?? unavailableHomeworkOpenAnswerAiBoundary;
  const answers: HomeworkAnswerMarkingResult[] = [];

  for (const question of input.questions) {
    const autoMarked = autoMarkQuestion(question);
    if (autoMarked) {
      answers.push(autoMarked);
      continue;
    }

    const aiResult = await aiBoundary.markOpenAnswer({
      questionId: question.id,
      prompt: question.prompt,
      subject: question.subject,
      topic: question.topic,
      skill: question.skill,
      submittedAnswer: question.submittedAnswer,
      expectedAnswer: question.expectedAnswer,
    });

    if (!aiResult.available) {
      answers.push({
        questionId: question.id,
        markingStatus: "review_needed",
        isCorrect: null,
        score: null,
        reviewNeeded: true,
        feedback: "This answer needs review because AI marking is not available right now.",
        aiConfidence: null,
        weakArea: inferWeakArea(question),
      });
      continue;
    }

    answers.push({
      questionId: question.id,
      markingStatus: aiResult.markingStatus,
      isCorrect: aiResult.isCorrect,
      score: aiResult.score ?? (aiResult.isCorrect === true ? 100 : aiResult.isCorrect === false ? 0 : null),
      reviewNeeded: aiResult.markingStatus === "review_needed",
      feedback: aiResult.feedback,
      aiConfidence: aiResult.aiConfidence ?? null,
      weakArea: aiResult.markingStatus === "correct" ? null : (aiResult.weakArea ?? inferWeakArea(question)),
    });
  }

  const correctCount = answers.filter((answer) => answer.isCorrect === true).length;
  const incorrectCount = answers.filter((answer) => answer.isCorrect === false).length;
  const reviewNeededCount = answers.filter((answer) => answer.reviewNeeded).length;
  const incompleteCount = answers.filter((answer) => answer.markingStatus === "incomplete").length;
  const scoredAnswers = answers.filter((answer) => typeof answer.score === "number");
  const scorePercent = scoredAnswers.length
    ? Math.round(scoredAnswers.reduce((sum, answer) => sum + (answer.score ?? 0), 0) / scoredAnswers.length)
    : null;
  const weakAreas = Array.from(new Set(answers
    .filter((answer) => answer.markingStatus !== "correct")
    .map((answer) => answer.weakArea)
    .filter((value): value is string => Boolean(value))));
  const outcomeBand = scoreToBand(scorePercent, reviewNeededCount, incompleteCount);

  return {
    answers,
    summary: {
      scorePercent,
      outcomeBand,
      correctCount,
      incorrectCount,
      reviewNeededCount,
      incompleteCount,
      answeredCount: answers.filter((answer) => answer.markingStatus !== "incomplete").length,
      totalQuestions: input.questions.length,
      feedback: buildSummaryFeedback(outcomeBand, weakAreas, reviewNeededCount),
      weakAreas,
      requiresRecap: scorePercent !== null && scorePercent < 50 && reviewNeededCount === 0,
    },
  };
}