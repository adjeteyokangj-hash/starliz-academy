import type { QuestionBreakdown } from "@/lib/schools/daytime-activity-types";

export type StoredQuestionHelp = {
  hints: string[];
  explanation: string;
  breakdown?: QuestionBreakdown | null;
  answer?: string | number | null;
};

export type QuestionHelpStep = {
  level: number;
  title: string;
  body: string;
  revealsAnswer: boolean;
};

/**
 * Progressive help from stored scaffolding — no live OpenAI call.
 * Level 1 never reveals the answer.
 */
export function buildStoredQuestionHelpSteps(help: StoredQuestionHelp): QuestionHelpStep[] {
  const steps: QuestionHelpStep[] = [];
  const breakdown = help.breakdown;

  if (breakdown?.simplerQuestion) {
    const keyWords = (breakdown.keyWords ?? [])
      .map((kw) => `${kw.word}: ${kw.meaning}`)
      .join(" · ");
    steps.push({
      level: 1,
      title: "Let’s make this clearer",
      body: [
        breakdown.simplerQuestion,
        keyWords ? `Key words — ${keyWords}` : null,
        breakdown.startingPoint ? `Start here: ${breakdown.startingPoint}` : null,
      ].filter(Boolean).join("\n\n"),
      revealsAnswer: false,
    });
  } else if (help.hints[0]) {
    steps.push({
      level: 1,
      title: "A gentler start",
      body: help.hints[0],
      revealsAnswer: false,
    });
  }

  if (breakdown?.steps?.length) {
    steps.push({
      level: steps.length + 1,
      title: "Break it into steps",
      body: breakdown.steps.map((step, index) => `${index + 1}. ${step}`).join("\n"),
      revealsAnswer: false,
    });
  } else if (help.hints[1]) {
    steps.push({
      level: steps.length + 1,
      title: "Another hint",
      body: help.hints[1],
      revealsAnswer: false,
    });
  }

  if (help.hints[2] || help.hints[1]) {
    const hint = help.hints[2] || help.hints[1];
    if (hint && !steps.some((step) => step.body === hint)) {
      steps.push({
        level: steps.length + 1,
        title: "One more nudge",
        body: hint,
        revealsAnswer: false,
      });
    }
  }

  if (help.explanation) {
    steps.push({
      level: steps.length + 1,
      title: "Full explanation",
      body: help.explanation,
      revealsAnswer: true,
    });
  }

  if (!steps.length) {
    steps.push({
      level: 1,
      title: "Try this",
      body: "Read the question again slowly. Underline the key words, then try one small step.",
      revealsAnswer: false,
    });
  }

  return steps;
}

export function nextStoredHelpStep(
  help: StoredQuestionHelp,
  previouslyShown: number,
): QuestionHelpStep | null {
  const steps = buildStoredQuestionHelpSteps(help);
  if (previouslyShown >= steps.length) return null;
  return steps[previouslyShown] ?? null;
}

export function extractHelpFromQuestionItem(item: Record<string, unknown> | null | undefined): StoredQuestionHelp {
  if (!item) {
    return { hints: [], explanation: "", breakdown: null, answer: null };
  }
  const hints = Array.isArray(item.hints)
    ? item.hints.map((h) => String(h ?? "").trim()).filter(Boolean)
    : typeof item.hint === "string" && item.hint.trim()
      ? [item.hint.trim()]
      : [];
  const breakdown = item.breakdown && typeof item.breakdown === "object"
    ? item.breakdown as QuestionBreakdown
    : null;
  return {
    hints,
    explanation: String(item.explanation ?? "").trim(),
    breakdown,
    answer: (item.answer ?? item.correctAnswer ?? null) as string | number | null,
  };
}
