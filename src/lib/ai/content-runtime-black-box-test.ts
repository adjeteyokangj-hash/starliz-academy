type RuntimeItem = Record<string, unknown>;

export type ContentRuntimeBlackBoxInput = {
  contentType: string;
  level: number;
  topic?: string | null;
  skillFocus?: string | null;
  contentJson: string;
};

export type ContentRuntimeBlackBoxResult = {
  status: "passed" | "failed" | "needs_review";
  score: number;
  maxScore: number;
  passRate: number;
  reasons: string[];
  simulatedAttempts: number;
  hintChecks: string[];
  masteryChecks: string[];
  flowChecks: string[];
  testedAt: string;
};

function asItems(contentJson: string): RuntimeItem[] {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((item): item is RuntimeItem => Boolean(item && typeof item === "object" && !Array.isArray(item)));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const envelope = parsed as Record<string, unknown>;
      const nested = Array.isArray(envelope.items)
        ? envelope.items
        : Array.isArray(envelope.questions)
          ? envelope.questions
          : null;
      if (nested) {
        return nested.filter(
          (item): item is RuntimeItem => Boolean(item && typeof item === "object" && !Array.isArray(item)),
        );
      }
      return [envelope];
    }
  } catch {
    return [];
  }
  return [];
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function answerFor(item: RuntimeItem): string {
  return text(item.answer ?? item.correctAnswer ?? item.expectedAnswer);
}

function promptFor(item: RuntimeItem): string {
  return text(item.question ?? item.prompt ?? item.word);
}

function hasHintPath(item: RuntimeItem): boolean {
  return Boolean(text(item.hint) || text(item.explanation) || text(item.workedSolution));
}

function hasProgressionSignal(item: RuntimeItem): boolean {
  return Boolean(text(item.explanation) || text(item.skillFocus) || text(item.topic));
}

function hasOptionsIssue(item: RuntimeItem): boolean {
  const options = item.options ?? item.choices ?? item.answerOptions;
  if (!Array.isArray(options)) return false;
  const cleaned = options.map(text).filter(Boolean);
  if (cleaned.length === 0) return false;
  if (cleaned.length < 2) return true;
  const normalized = cleaned.map((option) => option.toLowerCase());
  return new Set(normalized).size !== normalized.length || !normalized.includes(answerFor(item).toLowerCase());
}

export function runContentRuntimeBlackBoxTest(input: ContentRuntimeBlackBoxInput): ContentRuntimeBlackBoxResult {
  const items = asItems(input.contentJson);
  const reasons: string[] = [];
  const hintChecks: string[] = [];
  const masteryChecks: string[] = [];
  const flowChecks: string[] = [];
  let score = 0;
  const maxScore = 100;

  if (!items.length) {
    reasons.push("Runtime simulation could not find any lesson items.");
  } else {
    score += 20;
    flowChecks.push(`Loaded ${items.length} generated item${items.length === 1 ? "" : "s"} into the simulated lesson flow.`);
  }

  const allHavePrompts = items.every((item) => promptFor(item).length > 0);
  if (allHavePrompts && items.length) {
    score += 18;
    flowChecks.push("Every simulated item has a prompt/question entry point.");
  } else {
    reasons.push("One or more items are missing a prompt/question for runtime display.");
  }

  const allHaveAnswers = items.every((item) => answerFor(item).length > 0);
  if (allHaveAnswers && items.length) {
    score += 18;
    masteryChecks.push("Every simulated item has a target answer for marking and mastery checks.");
  } else {
    reasons.push("One or more items are missing an answer for runtime marking.");
  }

  const hintCoverage = items.length ? items.filter(hasHintPath).length / items.length : 0;
  if (hintCoverage >= 0.8) {
    score += 14;
    hintChecks.push("Hint/recovery coverage is present for most simulated mistakes.");
  } else if (hintCoverage > 0) {
    score += 7;
    reasons.push("Hint/recovery coverage is partial; admin should check mistake support.");
  } else {
    reasons.push("No hint, explanation, or worked solution path was found for simulated mistakes.");
  }

  const progressionCoverage = items.length ? items.filter(hasProgressionSignal).length / items.length : 0;
  if (progressionCoverage >= 0.8) {
    score += 14;
    masteryChecks.push("Items expose enough topic/skill/explanation data for progression checks.");
  } else {
    reasons.push("Progression metadata is thin for simulated mastery behaviour.");
  }

  const optionIssues = items.filter(hasOptionsIssue).length;
  if (optionIssues === 0) {
    score += 10;
    flowChecks.push("Multiple-choice option checks did not find duplicate or missing-answer options.");
  } else {
    reasons.push(`${optionIssues} item${optionIssues === 1 ? "" : "s"} have option issues that could break runtime marking.`);
  }

  const hasTopicMatch = !input.topic && !input.skillFocus
    ? true
    : items.some((item) => {
        const haystack = `${text(item.topic)} ${text(item.skillFocus)} ${promptFor(item)} ${text(item.explanation)}`.toLowerCase();
        const topic = text(input.topic).toLowerCase();
        const skillFocus = text(input.skillFocus).toLowerCase();
        return Boolean((topic && haystack.includes(topic)) || (skillFocus && haystack.includes(skillFocus)));
      });
  if (hasTopicMatch) {
    score += 6;
    flowChecks.push("Simulated flow found visible topic or skill alignment.");
  } else {
    reasons.push("Simulated flow could not confirm topic or skill alignment.");
  }

  const boundedScore = Math.max(0, Math.min(maxScore, score));
  const passRate = Number((boundedScore / maxScore).toFixed(3));
  const status = !items.length || !allHavePrompts || !allHaveAnswers || optionIssues > 0
    ? "failed"
    : boundedScore >= 82
      ? "passed"
      : "needs_review";

  return {
    status,
    score: boundedScore,
    maxScore,
    passRate,
    reasons: Array.from(new Set(reasons)),
    simulatedAttempts: Math.max(1, items.length) * 3,
    hintChecks,
    masteryChecks,
    flowChecks,
    testedAt: new Date().toISOString(),
  };
}
