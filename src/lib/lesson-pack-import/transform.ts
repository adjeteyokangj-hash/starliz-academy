import { instructionalDepthBudget } from "@/lib/schools/short-learning-instructional-depth";
import type {
  LessonPackSessionType,
  LessonPackStructuredModel,
  LinkedQaItem,
} from "@/lib/lesson-pack-import/types";

function itemFromQa(
  qa: LinkedQaItem,
  extras: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: qa.id,
    type: qa.choices?.length ? "multiple-choice" : "short-answer",
    prompt: qa.prompt,
    answer: qa.answer ?? "",
    options: qa.choices ?? [],
    explanation: qa.explanation ?? buildOriginalExplanation(qa),
    hint: qa.hint ?? buildOriginalHint(qa),
    difficulty: qa.difficulty,
    ...extras,
  };
}

function buildOriginalHint(qa: LinkedQaItem): string {
  const prompt = qa.prompt.toLowerCase();
  if (/fraction|numerator|denominator/.test(prompt)) {
    return "Think about what the whole is, then check what part of the whole the question asks for.";
  }
  if (/why|explain|reason/.test(prompt)) {
    return "Use evidence from the teaching points and put your reason in your own words.";
  }
  return "Re-read the question carefully and use the worked example as a guide.";
}

function buildOriginalExplanation(qa: LinkedQaItem): string {
  if (qa.answer) {
    return `A strong answer is “${qa.answer}”. Check each step against the teaching explanation and the worked example.`;
  }
  return "Compare your response with the success criteria and the worked example from this lesson.";
}

function uniqueByPrompt(items: LinkedQaItem[]): LinkedQaItem[] {
  const seen = new Set<string>();
  const out: LinkedQaItem[] = [];
  for (const item of items) {
    const key = item.prompt.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function estimatedDurationMinutes(
  sessionType: LessonPackSessionType,
  sourceDurationMinutes?: number | null,
): number {
  switch (sessionType) {
    case "short_learning_90":
      return 90;
    case "short_learning_120":
      return 120;
    case "school_day":
      return 60;
    case "general_library":
      return sourceDurationMinutes && sourceDurationMinutes > 0
        ? Math.round(sourceDurationMinutes)
        : 45;
    default:
      return sourceDurationMinutes && sourceDurationMinutes > 0
        ? Math.round(sourceDurationMinutes)
        : 45;
  }
}

/**
 * Convert structured import model into StarLiz Content Library draft items.
 * Does not embed source PDFs/PPTX as student-facing media.
 */
export function transformToStarLizDraft(input: {
  structured: LessonPackStructuredModel;
  sessionType: LessonPackSessionType;
  difficulty: number;
  excludeThirdParty: boolean;
  sourceDurationMinutes?: number | null;
}): {
  items: Record<string, unknown>[];
  metadata: Record<string, unknown>;
  estimatedDurationMinutes: number;
} {
  const duration = estimatedDurationMinutes(input.sessionType, input.sourceDurationMinutes);
  const depth =
    input.sessionType === "short_learning_90" || input.sessionType === "short_learning_120"
      ? instructionalDepthBudget(duration)
      : null;

  const starter = uniqueByPrompt(input.structured.starterQuestions);
  const guided = uniqueByPrompt(input.structured.guidedPractice);
  const independent = uniqueByPrompt(input.structured.independentPractice.length
    ? input.structured.independentPractice
    : input.structured.worksheetTasks);
  const exit = uniqueByPrompt(input.structured.exitQuestions);

  // Avoid cloning the same question into starter and exit
  const starterKeys = new Set(starter.map((q) => q.prompt.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim()));
  const exitFiltered = exit.filter((q) => !starterKeys.has(q.prompt.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim()));

  const items: Record<string, unknown>[] = [];

  items.push({
    id: "block_intro",
    type: "lesson-introduction",
    prompt: input.structured.learningObjective
      ? `In this lesson you will learn: ${input.structured.learningObjective}`
      : `Welcome to ${input.structured.title}.`,
    answer: "",
    explanation: input.structured.teachingExplanations[0] ?? "",
    block: "lesson_introduction",
  });

  if (input.structured.learningObjective) {
    items.push({
      id: "block_objective",
      type: "learning-objective",
      prompt: input.structured.learningObjective,
      answer: "",
      block: "learning_objective",
    });
  }

  if (input.structured.keywords.length) {
    items.push({
      id: "block_vocabulary",
      type: "key-vocabulary",
      prompt: `Key vocabulary: ${input.structured.keywords.join(", ")}`,
      answer: input.structured.keywords.join(", "),
      block: "key_vocabulary",
    });
  }

  if (input.structured.priorKnowledge.length || starter.length) {
    items.push({
      id: "block_warmup",
      type: "prior-learning-warmup",
      prompt: input.structured.priorKnowledge[0] ?? "Warm up with these quick starter questions.",
      answer: "",
      block: "prior_learning_warmup",
    });
  }

  for (const [index, qa] of starter.entries()) {
    items.push(itemFromQa(qa, { block: "starter", slot: "starter", order: index + 1 }));
  }

  for (const [index, explanation] of input.structured.teachingExplanations.entries()) {
    items.push({
      id: `block_teach_${index + 1}`,
      type: "teaching-explanation",
      prompt: explanation,
      answer: "",
      explanation,
      block: "teaching_explanation",
      targetMinutes: depth?.teachingMinutes,
    });
  }

  for (const [index, example] of input.structured.workedExamples.entries()) {
    items.push({
      id: `block_worked_${index + 1}`,
      type: "worked-example",
      prompt: example,
      answer: "",
      block: "worked_examples",
      targetMinutes: depth?.workedExampleMinutes,
    });
  }

  // If Short Learning needs depth and worked examples are thin, expand with original scaffold (not clones)
  if (depth && input.structured.workedExamples.length === 0 && input.structured.teachingExplanations[0]) {
    items.push({
      id: "block_worked_generated",
      type: "worked-example",
      prompt: `Worked example: follow each step for “${input.structured.title}”. Step 1 — identify what is known. Step 2 — apply the method from the teaching explanation. Step 3 — check the answer makes sense.`,
      answer: "",
      block: "worked_examples",
      targetMinutes: depth.workedExampleMinutes,
      generatedExpansion: true,
    });
  }

  for (const [index, qa] of guided.entries()) {
    items.push(itemFromQa(qa, { block: "guided_practice", slot: "guided", order: index + 1, targetMinutes: depth?.guidedMinutes }));
  }

  for (const [index, qa] of independent.entries()) {
    items.push(itemFromQa(qa, {
      block: "independent_practice",
      slot: "independent",
      order: index + 1,
      targetMinutes: depth?.independentMinutes,
    }));
  }

  for (const [index, misconception] of input.structured.misconceptions.entries()) {
    items.push({
      id: `block_misconception_${index + 1}`,
      type: "misconception-check",
      prompt: misconception,
      answer: "",
      block: "misconception_checks",
    });
  }

  for (const [index, reflection] of input.structured.reflectionTasks.entries()) {
    items.push({
      id: `block_reflection_${index + 1}`,
      type: "reflection-check",
      prompt: reflection,
      answer: "",
      block: "reflection_check",
      targetMinutes: depth?.reflectionMinutes,
    });
  }

  if (!input.structured.reflectionTasks.length) {
    items.push({
      id: "block_reflection_default",
      type: "reflection-check",
      prompt: "What was the most important idea in this lesson, and which step are you still unsure about?",
      answer: "",
      block: "reflection_check",
      targetMinutes: depth?.reflectionMinutes,
      generatedExpansion: true,
    });
  }

  for (const [index, qa] of exitFiltered.entries()) {
    items.push(itemFromQa(qa, { block: "exit_assessment", slot: "exit", order: index + 1 }));
  }

  items.push({
    id: "block_ai_tutor",
    type: "ai-tutor-support",
    prompt: "Ask the StarLiz AI Tutor for a hint if you are stuck. Try a hint before asking for the full walkthrough.",
    answer: "",
    block: "ai_tutor_support",
  });

  const metadata: Record<string, unknown> = {
    source: "bulk-lesson-pack-import",
    adaptedFromThirdParty: Boolean(
      input.structured.sourceMetadata.providerHints.length
      || input.structured.sourceMetadata.sourceName
      || input.structured.sourceMetadata.sourceUrl,
    ),
    sourceName: input.structured.sourceMetadata.sourceName,
    sourceUrl: input.structured.sourceMetadata.sourceUrl,
    sourceProviderHints: input.structured.sourceMetadata.providerHints,
    licenceType: input.structured.licenceMetadata.licenceType,
    attribution: input.structured.licenceMetadata.attribution,
    sessionType: input.sessionType,
    estimatedDurationMinutes: duration,
    instructionalDepth: depth,
    excludeThirdPartyVisuals: input.excludeThirdParty,
    starlizAdapted: true,
    studentFacingBranding: "starliz",
    difficulty: input.difficulty,
    lessonTitle: input.structured.title,
    learningObjective: input.structured.learningObjective,
    teacherNotes: input.structured.teacherNotes,
  };

  return { items, metadata, estimatedDurationMinutes: duration };
}
