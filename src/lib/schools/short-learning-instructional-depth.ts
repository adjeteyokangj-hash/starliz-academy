import {
  type DaytimeStageValidationIssue,
  type NormalizedDaytimeStagePack,
} from "@/lib/schools/daytime-stage-validators";
import type { DaytimeSubjectMode } from "@/lib/schools/daytime-subject-mode";
import {
  classifyEnglishSkillIntent,
  englishSkillUsesPassageAsLanguageContext,
} from "@/lib/schools/short-learning-curriculum";

export type ShortLearningBlockIntent = "lesson" | "recap" | "challenge" | "final_review";

export type InstructionalDepthBudget = {
  priorLearningMinutes: number;
  teachingMinutes: number;
  workedExampleMinutes: number;
  guidedMinutes: number;
  independentMinutes: number;
  reflectionMinutes: number;
};

/**
 * Approximate minute split for an academic Short Learning block.
 * Used in prompts and soft validation — not a second duration system.
 */
export function instructionalDepthBudget(targetMinutes: number): InstructionalDepthBudget {
  const total = Math.max(5, Math.round(targetMinutes));
  const priorLearningMinutes = Math.max(1, Math.round(total * 0.11));
  const teachingMinutes = Math.max(2, Math.round(total * 0.22));
  const workedExampleMinutes = Math.max(2, Math.round(total * 0.17));
  const guidedMinutes = Math.max(2, Math.round(total * 0.22));
  const independentMinutes = Math.max(2, Math.round(total * 0.17));
  const used =
    priorLearningMinutes + teachingMinutes + workedExampleMinutes + guidedMinutes + independentMinutes;
  const reflectionMinutes = Math.max(1, total - used);
  return {
    priorLearningMinutes,
    teachingMinutes,
    workedExampleMinutes,
    guidedMinutes,
    independentMinutes,
    reflectionMinutes,
  };
}

export function classifyShortLearningBlockIntent(stageLabel: string): ShortLearningBlockIntent {
  const label = stageLabel.toLowerCase();
  if (label.includes("recap")) return "recap";
  if (label.includes("challenge")) return "challenge";
  if (label.includes("final review") || label.includes("final-review") || /\breview\b/.test(label)) {
    return "final_review";
  }
  return "lesson";
}

/** Minimum closed practice questions the Short Learning depth validator requires. */
export function shortLearningMinQuestionCount(stageLabel: string, targetMinutes: number): number {
  const intent = classifyShortLearningBlockIntent(stageLabel);
  if (intent === "recap") return 2;
  if (intent === "final_review") return Math.max(4, Math.round(targetMinutes / 2.5));
  if (intent === "challenge") return Math.max(4, Math.round(targetMinutes / 2));
  return Math.max(8, Math.round(targetMinutes / 2));
}

const GENERIC_READING_COMPREHENSION_STEM =
  /\b(main idea|main theme|how does the author|what can we infer|what do you think will happen|how did \w+ feel|what did \w+ (find|discover|notice|love|see|take)|author'?s (intent|purpose)|sense of mystery|what does the author want|which word in the passage means|what kind of cover|why did \w+ (enter|go|take|decide)|who (was|is) (the )?(owner|girl|boy|character)|what is the name of)\b/i;

const LANGUAGE_SKILL_PRACTICE =
  /\b(identify|find the (relative )?clause|rewrite|combine|complete the sentence|create a sentence|relative clause|fronted adverbial|formal|informal|punctuat|noun phrase|verb|clause|extra information|introduces|starts with (who|which|that|whose)|embedded|subordinate|using (who|which|that))\b/i;

export function isGenericReadingComprehensionPrompt(prompt: string): boolean {
  return GENERIC_READING_COMPREHENSION_STEM.test(prompt);
}

export function usesQuotedPassageSpan(text: string, passageText: string, minWords = 5): boolean {
  const hay = text.toLowerCase().replace(/\s+/g, " ");
  const sentences = passageText.split(/[.!?]/);
  for (const sentence of sentences) {
    const words = sentence
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    if (words.length < minWords) continue;
    for (let i = 0; i <= words.length - minWords; i += 1) {
      const span = words.slice(i, i + minWords).join(" ");
      if (hay.includes(span)) return true;
    }
  }
  return false;
}

export function pickPassageSentenceForModel(passageText: string): string | null {
  const sentences = passageText
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter((part) => part.split(/\s+/).length >= 8);
  if (!sentences.length) return null;
  const featured = sentences.find((sentence) =>
    /\b(who|which|that|whose|whom|where|when)\b/i.test(sentence),
  );
  return featured ?? sentences[0] ?? null;
}

export function ensureWorkedExampleFromPassage(
  pack: NormalizedDaytimeStagePack,
  skillFocus: string,
): NormalizedDaytimeStagePack {
  const passageText = pack.passage?.text ?? "";
  if (!passageText.trim()) return pack;
  const examples = pack.workedExamples ?? [];
  const alreadyQuoted = examples.some((example) =>
    usesQuotedPassageSpan(
      `${example.question} ${(example.steps ?? []).join(" ")} ${example.answer ?? ""}`,
      passageText,
    ),
  );
  if (alreadyQuoted) return pack;
  const sentence = pickPassageSentenceForModel(passageText);
  if (!sentence) return pack;
  const skill = skillFocus.trim() || "this skill";
  pack.workedExamples = [
    {
      question: `Use this sentence from the passage to model ${skill}: "${sentence}"`,
      steps: [
        "Read the quoted sentence from the shared passage.",
        `Find how ${skill} is used in that sentence.`,
        "Say what extra information the feature adds.",
      ],
      answer: sentence,
    },
    ...examples,
  ];
  return pack;
}

export function promptPractisesEnglishSkill(prompt: string, skillFocus: string): boolean {
  const hay = prompt.toLowerCase();
  const tokens = skillFocus
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 4 && !["about", "from", "with", "using", "their", "reading"].includes(word));
  if (tokens.some((token) => hay.includes(token))) return true;
  const intent = classifyEnglishSkillIntent(skillFocus);
  if (intent === "grammar" || intent === "writing") return LANGUAGE_SKILL_PRACTICE.test(hay);
  return /\b(infer|evidence|according to|why might|how do we know|summar|retrieve|clue|author)\b/i.test(hay);
}

export function isSkillAlignedEnglishPrompt(prompt: string, skillFocus: string): boolean {
  const practises = promptPractisesEnglishSkill(prompt, skillFocus);
  if (isGenericReadingComprehensionPrompt(prompt) && !practises) return false;
  return practises;
}

function hasScaffold(pack: NormalizedDaytimeStagePack): boolean {
  return pack.activities.some((a) => a.kind === "scaffold" || a.kind === "worked-example")
    || pack.questions.some((q) => q.kind === "scaffold" || /complete the|fill in|missing step|partly/i.test(q.prompt));
}

function hasIndependent(pack: NormalizedDaytimeStagePack): boolean {
  return pack.activities.some((a) =>
    a.kind === "independent" || a.kind === "short-answer" || a.kind === "multiple-choice" || a.kind === "challenge",
  ) || pack.questions.some((q) => q.kind === "independent" || q.kind === "challenge");
}

function hasReasoning(pack: NormalizedDaytimeStagePack): boolean {
  return pack.activities.some((a) => a.kind === "reasoning" || a.kind === "challenge")
    || pack.questions.some((q) =>
      q.kind === "reasoning"
      || /why|explain|reason|justify|compare|discuss|how do you know|mistake|word problem|evidence/i.test(q.prompt),
    );
}

function hasReflection(pack: NormalizedDaytimeStagePack): boolean {
  if ((pack.reflectionCheck ?? "").trim()) return true;
  return pack.activities.some((a) => a.kind === "reflection")
    || pack.questions.some((q) =>
      q.kind === "reflection"
      || /what have you learned|how confident|which part was|next time|reflect|check your understanding/i.test(q.prompt),
    );
}

function hasMisconceptions(pack: NormalizedDaytimeStagePack): boolean {
  if ((pack.misconceptions?.length ?? 0) > 0) return true;
  return pack.questions.some((q) => /mistake|misconception|wrong|error|trap|common error/i.test(q.prompt));
}

function hasPriorWarmup(pack: NormalizedDaytimeStagePack): boolean {
  if ((pack.priorLearningWarmup ?? "").trim()) return true;
  return pack.activities.some((a) =>
    a.kind === "fluency" || a.kind === "prediction" || /warm|prior|recall|recap/i.test(a.title ?? a.kind),
  ) || pack.questions.slice(0, 2).some((q) => /recall|remember|last time|already know|warm/i.test(q.prompt));
}

function explanationLongEnough(text: string | undefined, minChars: number): boolean {
  return (text ?? "").trim().length >= minChars;
}

/** Collapse number/operator substitutions so clone padding is detectable. */
function practiceSkeleton(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/\d+(?:\.\d+)?/g, "#")
    .replace(/[£$€]/g, "")
    .replace(/[×x*÷+\-/=]/g, " ")
    .replace(/[^a-z#\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when too many practice prompts are near-clones (padding with substitutions). */
export function hasExcessivePracticeRepetition(prompts: string[]): boolean {
  const skeletons = prompts
    .map((p) => practiceSkeleton(p))
    .filter((s) => s.length >= 6);
  if (skeletons.length < 3) return false;
  const counts = new Map<string, number>();
  for (const s of skeletons) counts.set(s, (counts.get(s) ?? 0) + 1);
  const maxSame = Math.max(...counts.values());
  // Half or more share an identical skeleton → padded with substitutions.
  return maxSame >= Math.ceil(skeletons.length * 0.5);
}

/**
 * Additive Short Learning instructional-depth checks.
 * Day School must not call this path (profile defaults to day-school).
 */
export function validateShortLearningInstructionalDepth(input: {
  pack: NormalizedDaytimeStagePack;
  mode: DaytimeSubjectMode;
  stage: "warmup" | "core" | "stretch";
  stageLabel: string;
  targetMinutes: number;
  skillFocus?: string | null;
}): DaytimeStageValidationIssue[] {
  const { pack, mode, targetMinutes } = input;
  const intent = classifyShortLearningBlockIntent(input.stageLabel);
  const issues: DaytimeStageValidationIssue[] = [];
  const minExplanation = targetMinutes >= 14 ? 120 : 80;
  const minWorked = mode === "guided-reading" && intent === "lesson" ? 1 : intent === "recap" ? 1 : targetMinutes >= 12 ? 2 : 1;
  const practiceActivityCount = pack.activities.filter((a) =>
    a.kind === "scaffold"
    || a.kind === "independent"
    || a.kind === "short-answer"
    || a.kind === "multiple-choice"
    || a.kind === "reasoning"
    || a.kind === "challenge"
    || a.kind === "fluency",
  ).length;
  const practiceUnits = pack.questions.length + practiceActivityCount;
  const minPracticeUnits = intent === "recap"
    ? 4
    : intent === "final_review"
      ? Math.max(5, Math.round(targetMinutes / 2.5))
      : Math.max(8, Math.round(targetMinutes / 2));
  const minPracticeQuestions = shortLearningMinQuestionCount(input.stageLabel, targetMinutes);

  if (!(pack.learningObjective ?? "").trim() && intent !== "recap") {
    issues.push({
      code: "sl_missing_learning_objective",
      message: "Short Learning academic block needs a clear learning objective.",
    });
  }

  if (intent === "lesson") {
    if (!hasPriorWarmup(pack)) {
      issues.push({
        code: "sl_missing_prior_warmup",
        message: "Lesson block needs a prior-learning warm-up (field, activity, or recall check).",
      });
    }
    if (!explanationLongEnough(pack.explanation, minExplanation)) {
      issues.push({
        code: "sl_thin_teaching",
        message: `Teaching explanation is too thin for a ${targetMinutes}m block (need a real teaching cycle, not a one-liner).`,
      });
    }
    if ((pack.workedExamples?.length ?? 0) < minWorked) {
      issues.push({
        code: "sl_missing_worked_examples",
        message: `Need at least ${minWorked} worked examples for this ${targetMinutes}m academic block.`,
      });
    }
    if (!hasScaffold(pack)) {
      issues.push({
        code: "sl_missing_guided_practice",
        message: "Need guided/scaffolded practice before independent work.",
      });
    }
    if (!hasIndependent(pack)) {
      issues.push({
        code: "sl_missing_independent_practice",
        message: "Need independent practice within the block.",
      });
    }
    if (!hasReasoning(pack)) {
      issues.push({
        code: "sl_missing_reasoning",
        message: "Need a reasoning/discussion or application prompt.",
      });
    }
    if (!hasMisconceptions(pack)) {
      issues.push({
        code: "sl_missing_misconceptions",
        message: "Include common misconceptions (misconceptions[] or a misconception-check question).",
      });
    }
    if (!hasReflection(pack)) {
      issues.push({
        code: "sl_missing_reflection",
        message: "Need a reflection / check-for-understanding moment.",
      });
    }
    if (!(pack.transitionNote ?? "").trim()) {
      issues.push({
        code: "sl_missing_transition",
        message: "Include a short transition into the next block.",
      });
    }
    if (pack.questions.length < minPracticeQuestions || practiceUnits < minPracticeUnits) {
      issues.push({
        code: "sl_insufficient_practice_depth",
        message: `Too little practice depth for ${targetMinutes}m (questions=${pack.questions.length}, practice activities=${practiceActivityCount}; need about ${minPracticeQuestions}+ questions and ${minPracticeUnits} combined practice units — not clones).`,
      });
    }
    if (hasExcessivePracticeRepetition(pack.questions.map((q) => q.prompt))) {
      issues.push({
        code: "sl_excessive_repetition",
        message: "Practice items look excessively repetitive (near-clones). Vary structure and demand — do not pad duration with substitutions.",
      });
    }
  }

  if (intent === "recap") {
    if (!explanationLongEnough(pack.explanation, 60) && !(pack.workedExamples?.length)) {
      issues.push({
        code: "sl_recap_missing_method",
        message: "Recap must restate the method (explanation or worked example).",
      });
    }
    if ((pack.workedExamples?.length ?? 0) < 1) {
      if (!(mode === "guided-reading" && explanationLongEnough(pack.explanation, 80))) {
        issues.push({
          code: "sl_recap_missing_example",
          message: "Recap needs at least one worked example revisiting earlier learning.",
        });
      }
    }
    if (pack.questions.length < 2) {
      issues.push({
        code: "sl_recap_thin_checks",
        message: "Recap needs 2–3 focused checks — not a new topic.",
      });
    }
    if (!hasMisconceptions(pack)) {
      issues.push({
        code: "sl_recap_missing_misconception",
        message: "Recap should address a likely misconception.",
      });
    }
  }

  if (intent === "challenge") {
    if (!hasReasoning(pack)) {
      issues.push({
        code: "sl_challenge_missing_reasoning",
        message: "Challenge must require deeper reasoning, not only harder number substitutions.",
      });
    }
    if (!explanationLongEnough(pack.explanation, 60) && !(pack.scenarioOrObservation ?? "").trim()) {
      issues.push({
        code: "sl_challenge_missing_context",
        message: "Challenge needs application context or a real-world scenario.",
      });
    }
    const hasExtension = pack.activities.some((a) => a.kind === "challenge")
      || pack.questions.some((q) =>
        q.kind === "challenge"
        || q.kind === "reasoning"
        || /extension|another way|compare|explain your method|real[- ]world|how else|which method/i.test(q.prompt),
      );
    if (!hasExtension) {
      issues.push({
        code: "sl_challenge_missing_extension",
        message: "Challenge needs an extension / compare-methods / explain-your-method task.",
      });
    }
  }

  if (intent === "final_review") {
    if (!explanationLongEnough(pack.explanation, 80)) {
      issues.push({
        code: "sl_review_missing_summary",
        message: "Final review needs a summary of the journey objectives.",
      });
    }
    if (pack.questions.length < minPracticeQuestions) {
      issues.push({
        code: "sl_review_thin_retrieval",
        message: "Final review needs mixed retrieval across the journey.",
      });
    }
    if (!hasReasoning(pack)) {
      issues.push({
        code: "sl_review_missing_application",
        message: "Final review needs a reasoning/application check.",
      });
    }
    if (!hasReflection(pack)) {
      issues.push({
        code: "sl_review_missing_reflection",
        message: "Final review needs a confidence or reflection prompt.",
      });
    }
    if (!hasMisconceptions(pack)) {
      issues.push({
        code: "sl_review_missing_misconception",
        message: "Final review should include a misconception check.",
      });
    }
    if (!(pack.transitionNote ?? "").trim() && !/next|recommend|continue|revise/i.test(pack.explanation ?? "")) {
      issues.push({
        code: "sl_review_missing_next_step",
        message: "Final review should include a next-step recommendation.",
      });
    }
  }

  if (mode === "maths" && intent === "lesson") {
    const difficultySpread = pack.questions.length >= 2 && (hasScaffold(pack) && hasIndependent(pack) || pack.questions.length >= 3);
    if (!difficultySpread) {
      issues.push({
        code: "sl_maths_missing_progression",
        message: "Maths lesson blocks need increasing difficulty across guided then independent practice.",
      });
    }
  }

  if (mode === "guided-reading" && (intent === "lesson" || intent === "final_review" || intent === "challenge")) {
    const minPassageWords =
      intent === "lesson"
        ? Math.max(90, Math.min(110, Math.round(25 + targetMinutes * 4)))
        : Math.max(70, Math.min(100, Math.round(20 + targetMinutes * 3)));
    if (!pack.passage?.text || pack.passage.wordCount < minPassageWords) {
      issues.push({
        code: "sl_reading_thin_passage",
        message: `Reading passage is too short for a ${targetMinutes}m block (need about ${minPassageWords}+ words).`,
      });
    }
    if ((pack.vocabulary?.length ?? 0) < 3) {
      issues.push({
        code: "sl_reading_thin_vocabulary",
        message: "Reading blocks need vocabulary preparation (at least 3 terms).",
      });
    }
  }

  if (
    mode === "guided-reading"
    && englishSkillUsesPassageAsLanguageContext(input.skillFocus)
    && (input.skillFocus ?? "").trim()
  ) {
    const skillFocus = input.skillFocus!.trim();
    const teachingBlob = `${pack.learningObjective ?? ""} ${pack.explanation ?? ""}`;
    const skillTokens = skillFocus
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length > 4 && word !== "reading");
    if (skillTokens.length && !skillTokens.some((token) => teachingBlob.toLowerCase().includes(token))) {
      issues.push({
        code: "sl_skill_teaching_mismatch",
        message: `Teaching must stay on the resolved skill (${skillFocus}), not a generic English blurb.`,
      });
    }

    if (intent === "lesson" && pack.passage?.text && (pack.workedExamples?.length ?? 0) > 0) {
      const modelled = pack.workedExamples!.some((example) =>
        usesQuotedPassageSpan(
          `${example.question} ${(example.steps ?? []).join(" ")} ${example.answer ?? ""}`,
          pack.passage!.text,
        ),
      );
      if (!modelled) {
        issues.push({
          code: "sl_model_not_from_passage",
          message: "Worked examples must quote an actual sentence from the shared passage and model the skill on it.",
        });
      }
    }

    const practiceQuestions = pack.questions.filter((question) =>
      question.kind !== "reflection"
      && !/what have you learned|how confident|which part was|next time|reflect/i.test(question.prompt),
    );
    if (practiceQuestions.length >= 2) {
      const aligned = practiceQuestions.filter((question) =>
        isSkillAlignedEnglishPrompt(question.prompt, skillFocus),
      );
      if (aligned.length / practiceQuestions.length < 0.7) {
        issues.push({
          code: "sl_skill_practice_mismatch",
          message: `Practice drifted away from ${skillFocus}. Use the shared passage as context for this skill — do not switch into generic reading comprehension.`,
        });
      }
    }
  }

  return issues;
}

/** Prompt fragment: required teaching cycle + minute budget for Short Learning. */
export function shortLearningDepthPromptGuidance(input: {
  mode: DaytimeSubjectMode;
  stageLabel: string;
  targetMinutes: number;
  skillFocus?: string | null;
}): string {
  const intent = classifyShortLearningBlockIntent(input.stageLabel);
  const budget = instructionalDepthBudget(input.targetMinutes);
  const minQuestions = shortLearningMinQuestionCount(input.stageLabel, input.targetMinutes);
  const languageSkill = input.mode === "guided-reading"
    && englishSkillUsesPassageAsLanguageContext(input.skillFocus);
  const commonFields = `Also include these Short Learning depth fields when relevant:
- priorLearningWarmup (string)
- misconceptions (string array of common pupil mistakes)
- reflectionCheck (string)
- transitionNote (string)`;

  const budgetLine = `Minute budget for this ${input.targetMinutes}m block (approximate, do not pad with clones):
- prior learning / warm-up ~${budget.priorLearningMinutes}m
- teaching explanation ~${budget.teachingMinutes}m
- worked examples ~${budget.workedExampleMinutes}m
- guided practice ~${budget.guidedMinutes}m
- independent practice ~${budget.independentMinutes}m
- reflection / transition ~${budget.reflectionMinutes}m`;

  if (intent === "recap") {
    return `SHORT LEARNING RECAP CONTRACT (mandatory):
${budgetLine}
- Restate the method briefly${languageSkill ? ` for skill "${input.skillFocus}"` : ""}
- One worked example revisiting prior learning${languageSkill ? " using a quoted sentence from the shared passage" : ""}
- 2–3 focused checks${languageSkill ? " that practise the same skill — not a plot quiz" : ""}
- Address one likely misconception
- Do NOT introduce a new topic
${commonFields}`;
  }
  if (intent === "challenge") {
    return `SHORT LEARNING CHALLENGE CONTRACT (mandatory):
${budgetLine}
- Deeper reasoning / application or real-world context
- Explain method; compare approaches where suitable
- Extension task
${languageSkill
  ? `- Independent application of "${input.skillFocus}" using the shared passage as context — not generic comprehension`
  : "- NOT only harder number substitutions"}
${commonFields}`;
  }
  if (intent === "final_review") {
    return `SHORT LEARNING FINAL REVIEW CONTRACT (mandatory):
${budgetLine}
- Summary of objectives covered
- At least ${minQuestions} mixed retrieval questions across the journey${languageSkill ? ` that practise "${input.skillFocus}" (identify, complete, rewrite/apply — not a plot recap)` : ""}
- Reasoning/application
- Confidence or reflection prompt
- Misconception check
- Next-step recommendation in transitionNote
${commonFields}`;
  }

  if (input.mode === "guided-reading" && languageSkill) {
    return `SHORT LEARNING LESSON DEPTH CONTRACT (mandatory for ${input.targetMinutes}m):
${budgetLine}
Required teaching cycle for language/grammar skill "${input.skillFocus}":
1) Learning objective for THIS skill
2) Prior-learning / vocabulary warm-up
3) Keep the shared passage as context
4) Teach the skill in explanation (what it is and how the feature works)
5) Model using a quoted sentence from the shared passage
6) Guided skill practice on passage sentences (identify / complete / manipulate)
7) Independent and harder skill practice (rewrite / combine / apply)
8) Discussion/reasoning prompt about the skill
9) Reflection + transition
Do NOT return a generic reading-comprehension quiz about plot, feelings, or main idea.
Need about ${minQuestions}+ skill-practice questions for this block.
${commonFields}`;
  }

  if (input.mode === "guided-reading") {
    return `SHORT LEARNING LESSON DEPTH CONTRACT (mandatory for ${input.targetMinutes}m):
${budgetLine}
Required teaching cycle:
1) Learning objective
2) Prior-learning / vocabulary warm-up
3) Suitable passage length for the minutes
4) Modelled comprehension strategy in explanation
5) Retrieval, inference, vocabulary-in-context, and evidence-based response
6) Discussion/reasoning prompt
7) Reflection + transition
${commonFields}
Do NOT return only a short blurb and five generic questions.`;
  }

  return `SHORT LEARNING LESSON DEPTH CONTRACT (mandatory for ${input.targetMinutes}m):
${budgetLine}
Required teaching cycle:
1) Learning objective
2) Prior-learning warm-up
3) Clear teaching explanation (substantial — not a one-liner)
4) At least two workedExamples with steps
5) Guided/scaffolded practice
6) Independent practice — enough questions for the minutes (about one every 90 seconds of pupil work)
7) Immediate feedback on closed items (explanation + hints + four answer choices)
8) Common misconceptions[]
9) Reasoning/discussion prompt
10) Reflection/check for understanding
11) Transition to the next block
${commonFields}
Do NOT return: short explanation → one example → two or three questions. A ${input.targetMinutes}m lesson block needs a full practice set.`;
}
