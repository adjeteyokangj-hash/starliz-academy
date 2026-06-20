/**
 * Black Box targeted repair system
 * Provides deterministic, scoped fixes for specific Black Box findings
 */

export type RepairActionType =
  | "fix_choices"           // Inject correct answer, generate distractors
  | "improve_readability"   // Rewrite for simpler vocabulary
  | "increase_difficulty"   // Add reasoning steps, complexity
  | "strengthen_explanation"// Deepen or clarify explanation
  | "fix_topic_match"       // Rewrite to match declared topic
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
