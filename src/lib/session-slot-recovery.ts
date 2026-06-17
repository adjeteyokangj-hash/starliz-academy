import { isQuestionSlotFilled } from "@/lib/session-slot-validation";

export type SessionSlotGenerationContext = {
  subject: string;
  keyStage?: string | null;
  yearGroup?: string | null;
  ageGroup?: string | null;
  examBoard?: string | null;
  level: number;
  topic?: string | null;
  skillFocus?: string | null;
  curriculumPathway?: string | null;
  module?: string | null;
  contentType: string;
  avoidPrompts?: string[];
};

export type SessionSlotSummary = {
  totalSlots: number;
  filledSlots: number;
  missingSlots: number;
  filledSlotIndexes: number[];
  emptySlotIndexes: number[];
};

export function summarizeSessionSlots(items: Array<Record<string, unknown>>): SessionSlotSummary {
  const filledSlotIndexes: number[] = [];
  const emptySlotIndexes: number[] = [];

  items.forEach((item, index) => {
    if (isQuestionSlotFilled(item)) {
      filledSlotIndexes.push(index);
      return;
    }
    emptySlotIndexes.push(index);
  });

  return {
    totalSlots: items.length,
    filledSlots: filledSlotIndexes.length,
    missingSlots: emptySlotIndexes.length,
    filledSlotIndexes,
    emptySlotIndexes,
  };
}

export function mergeGeneratedIntoEmptySlots(input: {
  existingItems: Array<Record<string, unknown>>;
  generatedItems: Array<Record<string, unknown>>;
}): {
  mergedItems: Array<Record<string, unknown>>;
  replacedCount: number;
  summary: SessionSlotSummary;
} {
  const mergedItems = [...input.existingItems];
  const summary = summarizeSessionSlots(mergedItems);
  let generatedCursor = 0;
  let replacedCount = 0;

  for (const emptyIndex of summary.emptySlotIndexes) {
    while (generatedCursor < input.generatedItems.length) {
      const candidate = input.generatedItems[generatedCursor];
      generatedCursor += 1;
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        continue;
      }
      if (!isQuestionSlotFilled(candidate)) {
        continue;
      }
      mergedItems[emptyIndex] = candidate;
      replacedCount += 1;
      break;
    }
  }

  return {
    mergedItems,
    replacedCount,
    summary: summarizeSessionSlots(mergedItems),
  };
}

export function buildMissingSlotGenerationRequest(input: {
  context: SessionSlotGenerationContext;
  missingSlots: number;
}): Record<string, unknown> {
  return {
    subject: input.context.subject,
    keyStage: input.context.keyStage ?? undefined,
    yearGroup: input.context.yearGroup ?? undefined,
    ageGroup: input.context.ageGroup ?? undefined,
    examBoard: input.context.examBoard ?? undefined,
    curriculumPathway: input.context.curriculumPathway ?? undefined,
    module: input.context.module ?? undefined,
    topic: input.context.topic ?? input.context.skillFocus ?? "General",
    skillFocus: input.context.skillFocus ?? input.context.topic ?? "General",
    difficulty: input.context.level,
    level: input.context.level,
    numberOfItems: Math.max(1, Math.min(10, input.missingSlots)),
    activityType: input.context.contentType,
    lessonFormat: input.context.contentType,
    questionStyle: "same_lesson_session_format",
    aiMode: "live_openai_only",
    avoidPrompts: (input.context.avoidPrompts ?? []).slice(0, 12),
  };
}
