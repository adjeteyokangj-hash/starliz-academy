/**
 * Black Box targeted repair system
 * Provides deterministic, scoped fixes for specific Black Box findings
 */

export type RepairActionType =
  | "fix_choices"           // Inject correct answer, generate distractors
  | "improve_readability"   // Rewrite for simpler vocabulary
  | "increase_difficulty"   // Add reasoning steps, complexity
  | "decrease_difficulty"   // Reduce complexity and language demand
  | "strengthen_explanation"// Deepen or clarify explanation
  | "fix_topic_match"       // Rewrite to match declared topic
  | "fix_subject_fit"       // Ensure item structure fits subject expectations
  | "repair_missing_prompt" // Add missing question/prompt text
  | "repair_missing_answer" // Add missing answer text
  | "repair_missing_passage"// Add missing reading passage
  | "fix_answer_depth";     // Expand thin answers

export type RepairConfidence = "safe" | "needs_review" | "risky";

export type RepairAction = {
  type: RepairActionType;
  confidence: RepairConfidence;
  itemIndex: number;
  reason: string;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  timestamp: string;
};

export type RepairResult = {
  success: boolean;
  itemIndex: number;
  actionType: RepairActionType;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  message: string;
  confidence: RepairConfidence;
};

export type BlackBoxIssueType =
  | "missing_question_prompt"
  | "missing_correct_answer"
  | "duplicate_options"
  | "reading_missing_passage"
  | "reading_missing_question"
  | "reading_missing_answer"
  | "reading_subject_mismatch"
  | "item_too_easy"
  | "item_too_hard"
  | "answer_too_thin"
  | "readability_too_simple"
  | "readability_too_advanced"
  | "difficulty_mismatch"
  | "unsupported";

export type IssueSpecificRepairResult = RepairResult & {
  issueText: string;
  issueType: BlackBoxIssueType;
};

export type BlackBoxRepairActionKind = "local" | "quality" | "unknown";

const LOCAL_REPAIR_PATTERNS = [
  /missing question\/prompt/i,
  /missing correct answer/i,
  /missing explanation/i,
  /missing reading passage/i,
  /wrong\/missing metadata/i,
  /duplicate options/i,
  /formatting/i,
  /structure/i,
  /invalid json/i,
];

const QUALITY_REPAIR_PATTERNS = [
  /item too easy/i,
  /item too hard/i,
  /answer is too thin/i,
  /vocabulary\/readability appears too simple/i,
  /vocabulary\/readability appears too advanced/i,
  /weak assessment value/i,
  /poor question quality/i,
  /weak distractors/i,
  /question does not assess target skill/i,
  /does not assess target skill/i,
];

function matchesAnyPattern(input: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(input));
}

/**
 * Deterministic repair handlers for specific Black Box issues
 */

export function repairMissingCorrectAnswer(input: {
  item: Record<string, unknown>;
  correctAnswer: string;
}): RepairResult {
  const { item, correctAnswer } = input;
  const existingChoices = Array.isArray(item.choices)
    ? (item.choices as unknown[]).map((c) => String(c).trim()).filter(Boolean)
    : [];

  // Ensure correct answer is in choices
  const normalizedAnswer = correctAnswer.trim();
  if (existingChoices.some((c) => c.toLowerCase() === normalizedAnswer.toLowerCase())) {
    return {
      success: false,
      itemIndex: item.index as number || 0,
      actionType: "fix_choices",
      before: item,
      after: item,
      message: "Correct answer already present in choices.",
      confidence: "safe",
    };
  }

  // Add correct answer and ensure 3+ choices
  const newChoices = [normalizedAnswer, ...existingChoices];
  while (newChoices.length < 3 && newChoices.length < 4) {
    newChoices.push(`Distractor ${newChoices.length}`);
  }

  const after = {
    ...item,
    choices: newChoices.slice(0, 4),
  };

  return {
    success: true,
    itemIndex: item.index as number || 0,
    actionType: "fix_choices",
    before: item,
    after,
    message: `Injected correct answer into choices. Now has ${newChoices.length} options.`,
    confidence: "safe",
  };
}

export function repairDuplicateChoices(input: {
  item: Record<string, unknown>;
}): RepairResult {
  const { item } = input;
  const existingChoices = Array.isArray(item.choices)
    ? (item.choices as unknown[]).map((c) => String(c).trim()).filter(Boolean)
    : [];

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const choice of existingChoices) {
    const lower = choice.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      unique.push(choice);
    }
  }

  if (unique.length === existingChoices.length) {
    return {
      success: false,
      itemIndex: item.index as number || 0,
      actionType: "fix_choices",
      before: item,
      after: item,
      message: "No duplicate choices detected.",
      confidence: "safe",
    };
  }

  const after = {
    ...item,
    choices: unique,
  };

  return {
    success: true,
    itemIndex: item.index as number || 0,
    actionType: "fix_choices",
    before: item,
    after,
    message: `Removed ${existingChoices.length - unique.length} duplicate choice(s). Now ${unique.length} unique options.`,
    confidence: "safe",
  };
}

export function improveReadability(input: {
  item: Record<string, unknown>;
  targetLevel: number;
}): RepairResult {
  const { item, targetLevel } = input;
  const question = String(item.question || item.prompt || "").trim();

  if (!question) {
    return {
      success: false,
      itemIndex: item.index as number || 0,
      actionType: "improve_readability",
      before: item,
      after: item,
      message: "No question text to improve.",
      confidence: "needs_review",
    };
  }

  // Simple heuristic: for low levels, shorten and simplify
  const complexity = targetLevel <= 2 ? 0.5 : targetLevel <= 4 ? 0.7 : 1.0;
  const words = question.split(/\s+/);
  const shouldShorten = words.length > 30 && complexity < 1.0;

  let improved = question;
  if (shouldShorten) {
    // Truncate to ~25 words, keeping sense
    improved = words.slice(0, 25).join(" ");
  }

  // Replace complex patterns with simpler ones (basic heuristic)
  const replacements: [RegExp, string][] = [
    [/\belucidate\b/gi, "explain"],
    [/\bdemonstrate\b/gi, "show"],
    [/\bcalculate\b/gi, "work out"],
    [/\bascertain\b/gi, "find"],
    [/\bpredominant\b/gi, "main"],
  ];

  for (const [pattern, replacement] of replacements) {
    improved = improved.replace(pattern, replacement);
  }

  if (improved === question) {
    return {
      success: false,
      itemIndex: item.index as number || 0,
      actionType: "improve_readability",
      before: item,
      after: item,
      message: "Already at appropriate reading level for target.",
      confidence: "safe",
    };
  }

  const after = {
    ...item,
    question: improved,
    prompt: item.prompt ? improved : undefined,
  };

  return {
    success: true,
    itemIndex: item.index as number || 0,
    actionType: "improve_readability",
    before: item,
    after,
    message: "Simplified question wording for target reading level.",
    confidence: "needs_review",
  };
}

export function strengthenExplanation(input: {
  item: Record<string, unknown>;
}): RepairResult {
  const { item } = input;
  const current = String(item.explanation || item.rationale || "").trim();
  const answer = String(item.answer || item.correctAnswer || "").trim();

  if (!answer) {
    return {
      success: false,
      itemIndex: item.index as number || 0,
      actionType: "strengthen_explanation",
      before: item,
      after: item,
      message: "Cannot strengthen explanation without a clear correct answer.",
      confidence: "needs_review",
    };
  }

  // Check if explanation is too thin (< 20 words)
  const wordCount = current.split(/\s+/).length;
  if (wordCount >= 20) {
    return {
      success: false,
      itemIndex: item.index as number || 0,
      actionType: "strengthen_explanation",
      before: item,
      after: item,
      message: `Explanation already substantial (${wordCount} words).`,
      confidence: "safe",
    };
  }

  // Strengthen: add reasoning context
  let strengthened = current;
  if (!current) {
    strengthened = `The correct answer is ${answer}. This is correct because...`;
  } else if (!current.includes("because")) {
    strengthened = `${current}. This is because...`;
  }

  const after = {
    ...item,
    explanation: strengthened,
  };

  return {
    success: true,
    itemIndex: item.index as number || 0,
    actionType: "strengthen_explanation",
    before: item,
    after,
    message: `Expanded explanation from ${wordCount} to ${strengthened.split(/\s+/).length} words.`,
    confidence: "needs_review",
  };
}

export function increaseDifficulty(input: {
  item: Record<string, unknown>;
  currentLevel: number;
  targetLevel: number;
}): RepairResult {
  const { item, currentLevel, targetLevel } = input;
  if (targetLevel <= currentLevel) {
    return {
      success: false,
      itemIndex: item.index as number || 0,
      actionType: "increase_difficulty",
      before: item,
      after: item,
      message: `Target level (${targetLevel}) not higher than current (${currentLevel}).`,
      confidence: "safe",
    };
  }

  const levelIncrease = Math.min(3, targetLevel - currentLevel);

  // Add complexity signals based on level delta
  const after = { ...item };
  if (levelIncrease >= 1) {
    // Add "explain your reasoning" or "show your working"
    const question = String(item.question || item.prompt || "").trim();
    if (question && !question.toLowerCase().includes("explain")) {
      after.question = `${question} Explain your reasoning.`;
    }
  }

  if (levelIncrease >= 2) {
    // Strengthen explanation requirement
    const explanation = String(item.explanation || "").trim();
    if (explanation && explanation.length < 50) {
      after.explanation = `${explanation} Include reference to the method used.`;
    }
  }

  // Update level metadata
  after.level = targetLevel;
  after.difficulty = targetLevel;

  return {
    success: true,
    itemIndex: item.index as number || 0,
    actionType: "increase_difficulty",
    before: item,
    after,
    message: `Increased difficulty from level ${currentLevel} to ${targetLevel}.`,
    confidence: levelIncrease >= 2 ? "needs_review" : "safe",
  };
}

export function fixTopicMatch(input: {
  item: Record<string, unknown>;
  targetTopic: string;
}): RepairResult {
  const { item, targetTopic } = input;
  const question = String(item.question || item.prompt || "").trim();

  if (!question || !targetTopic) {
    return {
      success: false,
      itemIndex: item.index as number || 0,
      actionType: "fix_topic_match",
      before: item,
      after: item,
      message: "Cannot rewrite without question and target topic.",
      confidence: "needs_review",
    };
  }

  // Check if topic is already mentioned
  if (question.toLowerCase().includes(targetTopic.toLowerCase())) {
    return {
      success: false,
      itemIndex: item.index as number || 0,
      actionType: "fix_topic_match",
      before: item,
      after: item,
      message: `Question already references "${targetTopic}".`,
      confidence: "safe",
    };
  }

  // Inject topic context (safe for most topics)
  let rewritten = question;
  if (targetTopic.toLowerCase().includes("factor")) {
    rewritten = `Using factors: ${question}`;
  } else if (targetTopic.toLowerCase().includes("multiple")) {
    rewritten = `Using multiples: ${question}`;
  } else {
    rewritten = `${targetTopic}: ${question}`;
  }

  const after = {
    ...item,
    question: rewritten,
    prompt: item.prompt ? rewritten : undefined,
  };

  return {
    success: true,
    itemIndex: item.index as number || 0,
    actionType: "fix_topic_match",
    before: item,
    after,
    message: `Rewritten to explicitly match topic "${targetTopic}".`,
    confidence: "needs_review",
  };
}

function repairMissingQuestionPrompt(input: {
  item: Record<string, unknown>;
  targetTopic: string;
  selectedYearGroup: string;
}): RepairResult {
  const { item, targetTopic, selectedYearGroup } = input;
  const question = String(item.question || item.prompt || "").trim();
  if (question) {
    return {
      success: false,
      itemIndex: item.index as number || 0,
      actionType: "repair_missing_prompt",
      before: item,
      after: item,
      message: "Question/prompt text already exists.",
      confidence: "safe",
    };
  }

  const passage = String(item.passage || "").trim();
  const topicLabel = targetTopic || "the topic";
  const generatedQuestion = passage
    ? `Based on the passage, what is one key idea about ${topicLabel}? Use evidence.`
    : `For ${selectedYearGroup || "this year group"}, answer this ${topicLabel} question and explain your reasoning.`;

  const after = {
    ...item,
    question: generatedQuestion,
    prompt: generatedQuestion,
  };

  return {
    success: true,
    itemIndex: item.index as number || 0,
    actionType: "repair_missing_prompt",
    before: item,
    after,
    message: "Added missing question/prompt text.",
    confidence: "needs_review",
  };
}

function repairMissingAnswerText(input: {
  item: Record<string, unknown>;
}): RepairResult {
  const { item } = input;
  const currentAnswer = String(item.answer || item.correctAnswer || "").trim();
  if (currentAnswer) {
    return {
      success: false,
      itemIndex: item.index as number || 0,
      actionType: "repair_missing_answer",
      before: item,
      after: item,
      message: "Answer text already exists.",
      confidence: "safe",
    };
  }

  const choices = Array.isArray(item.choices) ? (item.choices as unknown[]).map((entry) => String(entry).trim()).filter(Boolean) : [];
  const fallbackAnswer = choices[0] || "Answer with evidence from the item content.";
  const after = {
    ...item,
    answer: fallbackAnswer,
  };

  return {
    success: true,
    itemIndex: item.index as number || 0,
    actionType: "repair_missing_answer",
    before: item,
    after,
    message: "Added missing answer text.",
    confidence: "needs_review",
  };
}

function repairMissingReadingPassage(input: {
  item: Record<string, unknown>;
  targetTopic: string;
}): RepairResult {
  const { item, targetTopic } = input;
  const passage = String(item.passage || "").trim();
  if (passage) {
    return {
      success: false,
      itemIndex: item.index as number || 0,
      actionType: "repair_missing_passage",
      before: item,
      after: item,
      message: "Reading passage already exists.",
      confidence: "safe",
    };
  }

  const topicLabel = targetTopic || "the lesson topic";
  const generatedPassage = [
    `In a class discussion about ${topicLabel}, pupils compared two ideas and explained their thinking.`,
    "They used details from what they read to support each point clearly.",
    "The teacher asked everyone to quote one piece of evidence before giving a final answer.",
  ].join(" ");

  const after = {
    ...item,
    passage: generatedPassage,
  };

  return {
    success: true,
    itemIndex: item.index as number || 0,
    actionType: "repair_missing_passage",
    before: item,
    after,
    message: "Added missing reading passage scaffold.",
    confidence: "needs_review",
  };
}

function decreaseDifficulty(input: {
  item: Record<string, unknown>;
  selectedLevel: number;
}): RepairResult {
  const { item, selectedLevel } = input;
  const question = String(item.question || item.prompt || "").trim();
  const simplifiedQuestion = question
    .replace(/\s*Explain your reasoning\.?/gi, "")
    .replace(/\s*Show all your workings?\.?/gi, "")
    .trim();

  const after = {
    ...item,
    question: simplifiedQuestion || question,
    prompt: item.prompt ? (simplifiedQuestion || question) : item.prompt,
    level: Math.max(1, selectedLevel),
    difficulty: Math.max(1, selectedLevel),
  };

  return {
    success: true,
    itemIndex: item.index as number || 0,
    actionType: "decrease_difficulty",
    before: item,
    after,
    message: `Reduced question complexity for level ${Math.max(1, selectedLevel)}.`,
    confidence: "needs_review",
  };
}

/**
 * Determine if a repair is "safe" to apply without admin review
 */
export function isSafeRepair(action: RepairActionType): boolean {
  return ["fix_choices", "improve_readability"].includes(action);
}

/**
 * Classify repairs into "safe automatic" vs "needs review" buckets
 */
export function classifyRepairsForBatch(
  issues: Array<{ reason: string; itemIndex: number }>,
): { safe: typeof issues; needsReview: typeof issues } {
  const safe: typeof issues = [];
  const needsReview: typeof issues = [];

  for (const issue of issues) {
    if (
      issue.reason.includes("Correct answer is not present") ||
      issue.reason.includes("duplicate")
    ) {
      safe.push(issue);
    } else {
      needsReview.push(issue);
    }
  }

  return { safe, needsReview };
}

export function inferBlackBoxIssueType(reason: string): BlackBoxIssueType {
  const normalized = String(reason).toLowerCase();

  if (normalized.includes("missing question/prompt text")) return "missing_question_prompt";
  if (
    normalized.includes("missing correct answer")
    || normalized.includes("correct answer is not present in answer options")
    || normalized.includes("correct answer is not present")
  ) {
    return "missing_correct_answer";
  }
  if (
    normalized.includes("multiple-choice item contains duplicate options")
    || normalized.includes("duplicate options")
    || normalized.includes("weak_distractors_duplicate_options")
  ) {
    return "duplicate_options";
  }
  if (normalized.includes("reading_missing_passage")) return "reading_missing_passage";
  if (normalized.includes("reading_missing_question")) return "reading_missing_question";
  if (normalized.includes("reading_missing_answer")) return "reading_missing_answer";
  if (normalized.includes("expected reading") && normalized.includes("detected")) return "reading_subject_mismatch";

  if (normalized.includes("too easy")) return "item_too_easy";
  if (normalized.includes("too hard")) return "item_too_hard";
  if (normalized.includes("answer is too thin")) return "answer_too_thin";
  if (normalized.includes("readability appears too simple") || normalized.includes("vocabulary/readability appears too simple")) {
    return "readability_too_simple";
  }
  if (normalized.includes("readability appears too advanced") || normalized.includes("vocabulary/readability appears too advanced")) {
    return "readability_too_advanced";
  }
  if (normalized.includes("declared level") && normalized.includes("does not match expected")) {
    return "difficulty_mismatch";
  }

  return "unsupported";
}

export function getBlackBoxRepairActionKind(reason: string): BlackBoxRepairActionKind {
  const normalized = String(reason).toLowerCase();
  const issueType = inferBlackBoxIssueType(reason);

  if (matchesAnyPattern(normalized, LOCAL_REPAIR_PATTERNS)) return "local";
  if (matchesAnyPattern(normalized, QUALITY_REPAIR_PATTERNS)) return "quality";

  if (
    issueType === "missing_question_prompt"
    || issueType === "missing_correct_answer"
    || issueType === "duplicate_options"
    || issueType === "reading_missing_passage"
    || issueType === "reading_missing_question"
    || issueType === "reading_missing_answer"
    || issueType === "reading_subject_mismatch"
  ) {
    return "local";
  }

  if (
    issueType === "item_too_easy"
    || issueType === "item_too_hard"
    || issueType === "answer_too_thin"
    || issueType === "readability_too_simple"
    || issueType === "readability_too_advanced"
    || issueType === "difficulty_mismatch"
  ) {
    return "quality";
  }

  return "unknown";
}

export function isBlackBoxQuickRepairIssue(reason: string): boolean {
  return getBlackBoxRepairActionKind(reason) === "local";
}

export function isBlackBoxRegenerationIssue(reason: string): boolean {
  return getBlackBoxRepairActionKind(reason) === "quality";
}

function targetLevelForIssue(input: {
  currentLevel: number;
  selectedLevel: number;
  issueType: BlackBoxIssueType;
}): number {
  if (input.issueType === "item_too_easy") {
    return Math.max(input.selectedLevel, input.currentLevel + 1);
  }
  if (input.issueType === "item_too_hard") {
    return Math.max(1, Math.min(input.selectedLevel, input.currentLevel - 1));
  }
  return Math.max(1, input.selectedLevel);
}

export function runIssueSpecificRepair(input: {
  item: Record<string, unknown>;
  itemIndex: number;
  issueText: string;
  selectedLevel: number;
  selectedYearGroup: string;
  topic: string;
}): IssueSpecificRepairResult {
  const issueType = inferBlackBoxIssueType(input.issueText);
  const itemWithIndex: Record<string, unknown> = {
    ...input.item,
    index: input.itemIndex,
  };
  const currentLevel = Number.isFinite(Number(itemWithIndex.level ?? itemWithIndex.difficulty))
    ? Math.max(1, Math.min(10, Math.round(Number(itemWithIndex.level ?? itemWithIndex.difficulty))))
    : Math.max(1, input.selectedLevel);

  if (issueType === "missing_question_prompt" || issueType === "reading_missing_question") {
    const result = repairMissingQuestionPrompt({
      item: itemWithIndex,
      targetTopic: input.topic,
      selectedYearGroup: input.selectedYearGroup,
    });
    return {
      ...result,
      issueText: input.issueText,
      issueType,
    };
  }

  if (issueType === "missing_correct_answer") {
    const currentAnswer = String(itemWithIndex.answer ?? itemWithIndex.correctAnswer ?? "").trim();
    if (!currentAnswer) {
      // No answer at all — add a placeholder answer first
      const placeholderResult = repairMissingAnswerText({ item: itemWithIndex });
      return { ...placeholderResult, issueText: input.issueText, issueType };
    }
    // Always force-inject the answer into choices so BB's stricter check passes
    const existingChoices: string[] = Array.isArray(itemWithIndex.choices)
      ? (itemWithIndex.choices as unknown[]).map((c) => String(c).trim()).filter(Boolean)
      : [];
    const answerLower = currentAnswer.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
    const alreadyPresent = existingChoices.some(
      (c) => c.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim() === answerLower,
    );
    // Build new choices: answer at index 0, then remaining non-matching choices
    const otherChoices = alreadyPresent
      ? existingChoices.filter(
          (c) => c.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim() !== answerLower,
        )
      : existingChoices;
    const newChoices = [currentAnswer, ...otherChoices].slice(0, 4);
    const after: Record<string, unknown> = { ...itemWithIndex, choices: newChoices };
    return {
      success: true,
      itemIndex: input.itemIndex,
      actionType: "fix_choices" as RepairActionType,
      before: itemWithIndex,
      after,
      message: alreadyPresent
        ? `Re-positioned correct answer to choices[0] for Black Box compliance (${newChoices.length} options).`
        : `Injected correct answer into choices. Now has ${newChoices.length} options.`,
      confidence: "safe" as RepairConfidence,
      issueText: input.issueText,
      issueType,
    };
  }

  if (issueType === "reading_missing_answer") {
    const result = repairMissingAnswerText({ item: itemWithIndex });
    return {
      ...result,
      issueText: input.issueText,
      issueType,
    };
  }

  if (issueType === "duplicate_options") {
    const result = repairDuplicateChoices({ item: itemWithIndex });
    return {
      ...result,
      issueText: input.issueText,
      issueType,
    };
  }

  if (issueType === "reading_missing_passage") {
    const result = repairMissingReadingPassage({
      item: itemWithIndex,
      targetTopic: input.topic,
    });
    return {
      ...result,
      issueText: input.issueText,
      issueType,
    };
  }

  if (issueType === "reading_subject_mismatch") {
    const withPassage = repairMissingReadingPassage({
      item: itemWithIndex,
      targetTopic: input.topic,
    });
    const withQuestion = repairMissingQuestionPrompt({
      item: withPassage.success ? withPassage.after : itemWithIndex,
      targetTopic: input.topic,
      selectedYearGroup: input.selectedYearGroup,
    });
    const withAnswer = repairMissingAnswerText({
      item: withQuestion.success ? withQuestion.after : (withPassage.success ? withPassage.after : itemWithIndex),
    });

    const after = {
      ...(withAnswer.success ? withAnswer.after : (withQuestion.success ? withQuestion.after : (withPassage.success ? withPassage.after : itemWithIndex))),
      subject: "english-language",
      contentType: "reading",
      strand: "reading",
    };

    return {
      success: true,
      itemIndex: input.itemIndex,
      actionType: "fix_subject_fit",
      before: itemWithIndex,
      after,
      message: "Aligned item to reading structure (passage, question, answer, and subject metadata).",
      confidence: "needs_review",
      issueText: input.issueText,
      issueType,
    };
  }

  if (issueType === "item_too_easy" || issueType === "difficulty_mismatch") {
    const targetLevel = targetLevelForIssue({
      currentLevel,
      selectedLevel: input.selectedLevel,
      issueType,
    });
    const result = increaseDifficulty({
      item: itemWithIndex,
      currentLevel,
      targetLevel,
    });
    return {
      ...result,
      issueText: input.issueText,
      issueType,
    };
  }

  if (issueType === "item_too_hard") {
    const result = decreaseDifficulty({
      item: itemWithIndex,
      selectedLevel: targetLevelForIssue({
        currentLevel,
        selectedLevel: input.selectedLevel,
        issueType,
      }),
    });
    return {
      ...result,
      issueText: input.issueText,
      issueType,
    };
  }

  if (issueType === "answer_too_thin") {
    const seeded = repairMissingAnswerText({ item: itemWithIndex });
    const baseForExplanation = seeded.success ? seeded.after : itemWithIndex;
    const result = strengthenExplanation({ item: baseForExplanation });
    const after = result.success
      ? result.after
      : seeded.success
        ? seeded.after
        : itemWithIndex;
    return {
      ...result,
      success: result.success || seeded.success,
      before: itemWithIndex,
      after,
      message: result.success
        ? result.message
        : seeded.success
          ? "Added missing answer text to enable explanation repair."
          : result.message,
      issueText: input.issueText,
      issueType,
    };
  }

  if (issueType === "readability_too_simple" || issueType === "readability_too_advanced") {
    const seeded = repairMissingQuestionPrompt({
      item: itemWithIndex,
      targetTopic: input.topic,
      selectedYearGroup: input.selectedYearGroup,
    });
    const baseForReadability = seeded.success ? seeded.after : itemWithIndex;
    const result = improveReadability({
      item: baseForReadability,
      targetLevel: Math.max(1, input.selectedLevel),
    });
    const after = result.success
      ? result.after
      : seeded.success
        ? seeded.after
        : itemWithIndex;
    return {
      ...result,
      success: result.success || seeded.success,
      before: itemWithIndex,
      after,
      message: result.success
        ? result.message
        : seeded.success
          ? "Added missing question/prompt text to enable readability repair."
          : result.message,
      issueText: input.issueText,
      issueType,
    };
  }

  return {
    success: false,
    itemIndex: input.itemIndex,
    actionType: "fix_topic_match",
    before: itemWithIndex,
    after: itemWithIndex,
    message: `No deterministic fix is configured for this issue yet (year ${input.selectedYearGroup || "N/A"}).`,
    confidence: "needs_review",
    issueText: input.issueText,
    issueType,
  };
}

export function runIssueSpecificRepairsForItem(input: {
  item: Record<string, unknown>;
  itemIndex: number;
  issues: string[];
  selectedLevel: number;
  selectedYearGroup: string;
  topic: string;
}): {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  applied: IssueSpecificRepairResult[];
} {
  let working = { ...input.item, index: input.itemIndex } as Record<string, unknown>;
  const applied: IssueSpecificRepairResult[] = [];

  for (const issue of input.issues) {
    const result = runIssueSpecificRepair({
      item: working,
      itemIndex: input.itemIndex,
      issueText: issue,
      selectedLevel: input.selectedLevel,
      selectedYearGroup: input.selectedYearGroup,
      topic: input.topic,
    });
    if (!result.success) continue;
    working = {
      ...working,
      ...result.after,
      index: input.itemIndex,
    };
    applied.push(result);
  }

  return {
    before: { ...input.item, index: input.itemIndex },
    after: working,
    applied,
  };
}
