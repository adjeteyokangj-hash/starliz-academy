import type { DifficultyDetection, LinkedQaItem, LessonPackStructuredModel } from "@/lib/lesson-pack-import/types";

/** StarLiz generator difficulty scale is 1-5. */
export function clampDifficulty(value: number): number {
  if (!Number.isFinite(value)) return 3;
  return Math.max(1, Math.min(5, Math.round(value)));
}

function scoreTextComplexity(text: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 3;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const avgLen = words.length ? words.reduce((sum, w) => sum + w.length, 0) / words.length : 0;

  if (avgLen >= 6.5) {
    score += 1;
    reasons.push("higher average word length / reading complexity");
  } else if (avgLen > 0 && avgLen <= 4.2) {
    score -= 1;
    reasons.push("simpler reading age vocabulary");
  }

  if (/\b(explain|justify|evaluate|analyse|analyze|prove|derive|multi-step|reasoning)\b/i.test(text)) {
    score += 1;
    reasons.push("multi-step reasoning language");
  }
  if (/\b(with support|scaffolded|guided|fill in the blank|complete the sentence)\b/i.test(text)) {
    score -= 1;
    reasons.push("scaffolded / supported tasks");
  }
  if (/\b(independently|challenge|stretch|mastery|without help)\b/i.test(text)) {
    score += 1;
    reasons.push("high independence demand");
  }
  if (/\b(recall|match|label|circle|tick)\b/i.test(text)) {
    score -= 1;
    reasons.push("lower cognitive demand task verbs");
  }

  return { score, reasons };
}

function scoreQuestion(item: LinkedQaItem): { difficulty: number; reasons: string[] } {
  const text = [item.prompt, item.explanation, item.hint].filter(Boolean).join(" ");
  const base = scoreTextComplexity(text);
  let score = base.score;
  const reasons = [...base.reasons];

  const steps = (item.prompt.match(/\b(then|next|first|second|finally|step)\b/gi) ?? []).length;
  if (steps >= 2) {
    score += 1;
    reasons.push("multiple reasoning steps in prompt");
  }
  if (item.choices && item.choices.length >= 2) {
    score -= 0.5;
    reasons.push("multiple-choice format");
  }
  return { difficulty: clampDifficulty(score), reasons: reasons.slice(0, 5) };
}

export function detectDifficultyFromPack(input: {
  structured: LessonPackStructuredModel;
  combinedText?: string;
  yearGroup?: string | null;
}): DifficultyDetection {
  const questions = [
    ...input.structured.starterQuestions,
    ...input.structured.worksheetTasks,
    ...input.structured.exitQuestions,
    ...input.structured.guidedPractice,
    ...input.structured.independentPractice,
  ];

  const byQuestion = questions.map((q) => {
    const scored = scoreQuestion(q);
    return { questionId: q.id, difficulty: scored.difficulty, reasons: scored.reasons };
  });

  const teachingText = [
    ...input.structured.teachingExplanations,
    ...input.structured.workedExamples,
    input.structured.learningObjective ?? "",
    input.combinedText?.slice(0, 6000) ?? "",
  ].join("\n");

  const overallText = scoreTextComplexity(teachingText);
  const questionAvg = byQuestion.length
    ? byQuestion.reduce((sum, q) => sum + q.difficulty, 0) / byQuestion.length
    : overallText.score;

  let overall = clampDifficulty((overallText.score + questionAvg) / 2);
  const reasons = [...overallText.reasons];

  const year = String(input.yearGroup ?? "");
  if (/Reception|Year 1|Year 2/i.test(year) && overall > 3) {
    overall = clampDifficulty(overall - 1);
    reasons.push("adjusted downward for early primary year group");
  }
  if (/Year 10|Year 11|GCSE/i.test(year) && overall < 3) {
    overall = clampDifficulty(overall + 1);
    reasons.push("adjusted upward for upper secondary year group");
  }

  const avgOf = (items: LinkedQaItem[], fallback: number) => {
    if (!items.length) return fallback;
    return items.map((q) => scoreQuestion(q).difficulty).reduce((a, b) => a + b, 0) / items.length;
  };

  const byBlock = [
    { blockId: "teaching", difficulty: clampDifficulty(overallText.score), reasons: overallText.reasons },
    {
      blockId: "starter",
      difficulty: clampDifficulty(avgOf(input.structured.starterQuestions, overall)),
      reasons: ["derived from starter questions"],
    },
    {
      blockId: "independent_practice",
      difficulty: clampDifficulty(
        avgOf([...input.structured.independentPractice, ...input.structured.worksheetTasks], overall),
      ),
      reasons: ["derived from practice / worksheet tasks"],
    },
    {
      blockId: "exit",
      difficulty: clampDifficulty(avgOf(input.structured.exitQuestions, overall)),
      reasons: ["derived from exit questions"],
    },
  ];

  const confidence = Math.min(
    0.95,
    0.45 + (questions.length > 0 ? 0.25 : 0) + (teachingText.length > 200 ? 0.2 : 0),
  );

  return {
    overall,
    confidence: Number(confidence.toFixed(2)),
    reasons: [...new Set(reasons)].slice(0, 8),
    byBlock,
    byQuestion,
  };
}
