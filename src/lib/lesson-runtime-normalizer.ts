import { buildQuestionFormulaScaffold } from "@/lib/starliz-question-formula";

export type LessonQuestionType =
  | "spelling"
  | "math"
  | "reading"
  | "grammar"
  | "punctuation"
  | "science"
  | "languages"
  | "generic";

export type LessonVisualType =
  | "diagram"
  | "chart"
  | "image"
  | "number_line"
  | "graph"
  | "table"
  | "map"
  | "timeline"
  | "formula_card"
  | "passage"
  | "none";

export type LessonVisuals = {
  required: boolean;
  type: LessonVisualType;
  title: string;
  altText: string;
  body: string[];
  prompt: string;
};

export type LessonMasterySignals = {
  firstTryCorrect: boolean;
  retryCorrect: boolean;
  attemptCount: number;
  hintsUsed: number;
  mastered: boolean;
  reviewed: boolean;
};

export type NormalizedLessonItem = {
  id: string;
  questionType: LessonQuestionType;
  question: string;
  options: string[];
  correctAnswer: string | number;
  explanation: string;
  hint: string;
  coachSteps: string[];
  guidedSteps: string[];
  workedSolution: string;
  visuals: LessonVisuals;
  learningFocus: string;
  retryPrompts: string[];
  reviewPrompt: string;
  weakSkillTags: string[];
  difficulty: number;
  masterySignals: LessonMasterySignals;
  prompt?: string;
  type?: string;
  word?: string;
  passage?: string;
  answer?: string | number;
  choices?: string[];
  skillFocus?: string;
  topic?: string;
  assessmentPrompt?: string;
  supportPrompt?: string;
  tapPrompt?: string;
  missionGroup?: string;
  bridgeWord?: string;
  bridgeMode?: string;
  bridgeWordIndex?: number;
  visualRequired?: boolean;
  visualType?: LessonVisualType;
  visualPrompt?: string;
  visualAltText?: string;
  visualBody?: string[];
  visualTitle?: string;
  visual?: LessonVisuals;
  sentenceContext?: string;
  categoryHint?: string;
  syllables?: string;
  emoji?: string;
  patterns?: string[];
  vocabularyWords?: string[];
  questions?: unknown[];
  answerOptions?: string[];
  learningObjective?: string;
  keyInformation?: string[];
  activityMode?: string;
};

export type LessonPayloadContext = {
  contentType?: string | null;
  subject?: string | null;
  topic?: string | null;
  skillFocus?: string | null;
  difficulty?: number | null;
  yearGroup?: string | null;
  keyStage?: string | null;
  ageGroup?: string | null;
  contentId?: string | null;
  assignmentId?: string | null;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => text(entry)).filter(Boolean);
}

function numberValue(value: unknown, fallback = 1): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const result = text(value);
    if (result) return result;
  }
  return "";
}

function contentTypeToQuestionType(contentType: string | null | undefined): LessonQuestionType {
  const value = text(contentType).toLowerCase();
  if (!value) return "generic";
  if (value.includes("spell") || value.includes("phonics")) return "spelling";
  if (value.includes("math")) return "math";
  if (value.includes("read") || value.includes("english") || value.includes("literature") || value.includes("language")) return "reading";
  if (value.includes("grammar")) return "grammar";
  if (value.includes("punct")) return "punctuation";
  if (value.includes("science")) return "science";
  if (value.includes("language")) return "languages";
  return "generic";
}

function normalizeQuestionType(raw: unknown, fallback: LessonQuestionType): LessonQuestionType {
  const value = text(raw).toLowerCase();
  if (!value) return fallback;
  if (value.includes("spell") || value.includes("phonics")) return "spelling";
  if (value.includes("math") || value.includes("number") || value.includes("science") || value.includes("gcse-maths")) return "math";
  if (value.includes("read") || value.includes("comprehension") || value.includes("literature") || value.includes("language")) return "reading";
  if (value.includes("grammar")) return "grammar";
  if (value.includes("punct")) return "punctuation";
  if (value.includes("science")) return "science";
  if (value.includes("language")) return "languages";
  return fallback;
}

function inferQuestionType(raw: Record<string, unknown>, context: LessonPayloadContext): LessonQuestionType {
  const hasExplicitType = raw.questionType !== undefined || raw.type !== undefined;
  const explicit = hasExplicitType
    ? normalizeQuestionType(raw.questionType ?? raw.type, contentTypeToQuestionType(context.contentType))
    : "generic";
  if (explicit !== "generic") return explicit;
  if (text(raw.word)) return "spelling";
  if (text(raw.passage) || Array.isArray(raw.questions)) return "reading";
  if (typeof raw.answer === "number" || Array.isArray(raw.options) || Array.isArray(raw.choices)) return "math";
  return contentTypeToQuestionType(context.contentType);
}

function buildFallbackLearningFocus(type: LessonQuestionType, skillFocus: string, topic: string): string {
  if (skillFocus) return `We are practising ${skillFocus}.`;
  if (topic) return `We are practising ${topic}.`;
  if (type === "math") return "We are practising maths step by step.";
  if (type === "reading") return "We are practising reading carefully and using clues.";
  if (type === "spelling") return "We are practising sounding out and spelling carefully.";
  return "We are practising this question carefully.";
}

function buildFallbackExplanation(type: LessonQuestionType, question: string, answer: string): string {
  if (type === "math") return `Use the steps and check that ${answer || "the answer"} matches the calculation.`;
  if (type === "reading") return "Find the clue in the passage and choose the answer that matches best.";
  if (type === "spelling") return `Say the sounds in ${question || answer} slowly, then blend them together.`;
  return "Use the clue, method, or pattern that belongs to the question.";
}

function buildFallbackHint(type: LessonQuestionType, question: string, learningFocus: string): string {
  if (type === "math") return "Look for the important numbers and work step by step.";
  if (type === "reading") return "Re-read the passage and find the clue that matches the question.";
  if (type === "spelling") return `Listen carefully to the sounds in ${question || learningFocus}.`;
  return "Look at the key information and try again.";
}

function buildFallbackCoachSteps(type: LessonQuestionType, question: string, hint: string, learningFocus: string): string[] {
  if (type === "math") {
    return [
      "Read the question carefully.",
      hint,
      "Use the method step by step, then check your answer.",
    ];
  }
  if (type === "reading") {
    return [
      "Read the question and the passage again.",
      hint,
      "Find the clue that matches the best answer.",
    ];
  }
  if (type === "spelling") {
    return [
      "Say the word slowly.",
      hint,
      "Blend the sounds and spell it again.",
    ];
  }
  return [
    learningFocus || question || "Look at the question carefully.",
    hint,
    "Use the clue, then try again.",
  ];
}

function buildFallbackGuidedSteps(type: LessonQuestionType, question: string, correctAnswer: string | number, coachSteps: string[]): string[] {
  if (type === "math") {
    return [
      "Find the numbers you need.",
      "Work out the calculation step by step.",
      `Check that ${String(correctAnswer)} answers the question.`,
    ];
  }
  if (type === "reading") {
    return [
      "Re-read the relevant part of the passage.",
      "Look for the matching clue.",
      `Choose the answer that best fits ${question || "the question"}.`,
    ];
  }
  if (type === "spelling") {
    return [
      "Say the sounds slowly.",
      "Blend the sounds together.",
      `Spell ${String(correctAnswer)} carefully.`,
    ];
  }
  return coachSteps.slice(0, 3);
}

function buildFallbackRetryPrompts(type: LessonQuestionType, learningFocus: string): string[] {
  if (type === "math") {
    return [
      "Let's slow down and look for the important numbers.",
      "Try the steps again and check your working.",
      "Use the hint and have another go.",
    ];
  }
  if (type === "reading") {
    return [
      "Let's re-read the passage together.",
      "Find the clue that matches the question.",
      "Choose the answer that fits best.",
    ];
  }
  if (type === "spelling") {
    return [
      "Say the sounds slowly, then blend them.",
      "Listen again and try the word once more.",
      `Use ${learningFocus || "the spelling pattern"} to help you.`,
    ];
  }
  return [
    "Try again with the clue in mind.",
    "Use the hint and have another go.",
    "Look carefully and choose the best answer.",
  ];
}

function buildFallbackReviewPrompt(type: LessonQuestionType, learningFocus: string): string {
  if (type === "math") return `Review ${learningFocus || "this maths question"} and practise the steps again.`;
  if (type === "reading") return `Review the passage and practise finding the clue again.`;
  if (type === "spelling") return `Review the spelling pattern and say the sounds again.`;
  return `Review ${learningFocus || "this question"} and practise it again.`;
}

function buildWeakSkillTags(item: Record<string, unknown>, context: LessonPayloadContext, questionType: LessonQuestionType): string[] {
  const tags = [
    text(item.skillFocus),
    text(item.topic),
    text(item.categoryHint),
    text(context.skillFocus),
    text(context.topic),
    questionType,
  ];
  return Array.from(new Set(tags.filter(Boolean)));
}

function resolveCorrectAnswer(item: Record<string, unknown>): string | number {
  const direct = item.correctAnswer ?? item.answer ?? item.solution ?? item.expectedAnswer;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const answers = Array.isArray(item.answers) ? item.answers : [];
  if (answers.length > 0) return toStringAnswer(answers[0]);

  const options = Array.isArray(item.options) ? item.options : Array.isArray(item.choices) ? item.choices : [];
  if (options.length > 0) return toStringAnswer(options[0]);

  if (text(item.word)) return text(item.word);
  if (text(item.question)) return text(item.question);
  if (text(item.prompt)) return text(item.prompt);
  return "";
}

function toStringAnswer(value: unknown): string | number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return value.trim();
  return text(value);
}

function normalizeOptionList(item: Record<string, unknown>, correctAnswer: string | number): string[] {
  const source = Array.isArray(item.options)
    ? item.options
    : Array.isArray(item.choices)
      ? item.choices
      : Array.isArray(item.answerOptions)
        ? item.answerOptions
        : [];
  const values = source.map((option) => text(option)).filter(Boolean);
  const answer = text(correctAnswer);
  if (answer && !values.some((value) => value.toLowerCase() === answer.toLowerCase())) {
    values.push(answer);
  }
  return Array.from(new Set(values));
}

function normalizeVisuals(input: {
  item: Record<string, unknown>;
  questionType: LessonQuestionType;
  learningFocus: string;
  question: string;
  correctAnswer: string | number;
  scaffoldVisual: ReturnType<typeof buildQuestionFormulaScaffold>["visual"];
}): LessonVisuals {
  const { item, questionType, learningFocus, question, correctAnswer, scaffoldVisual } = input;
  const rawType = text(item.visualType).toLowerCase();
  const resolvedType = rawType
    ? (rawType as LessonVisualType)
    : scaffoldVisual?.type ?? (questionType === "reading" ? "passage" : questionType === "math" ? "formula_card" : "none");
  const title = firstText(item.visualTitle, scaffoldVisual?.title, resolvedType === "passage" ? "Passage support" : "Visual support");
  const altText = firstText(item.visualAltText, scaffoldVisual?.altText, item.visualPrompt, question || learningFocus || "Question support");
  const prompt = firstText(item.visualPrompt, scaffoldVisual?.body?.[0], learningFocus || question || altText);
  const body = textArray(item.visualBody).length
    ? textArray(item.visualBody)
    : scaffoldVisual?.body?.length
      ? scaffoldVisual.body
      : prompt
        ? [prompt]
        : [];

  return {
    required: Boolean(item.visualRequired) || resolvedType !== "none" || Boolean(scaffoldVisual),
    type: resolvedType,
    title,
    altText,
    body,
    prompt: prompt || `Use the visual support for ${String(correctAnswer)}`,
  };
}

function buildNormalizedItem(input: {
  item: Record<string, unknown>;
  context: LessonPayloadContext;
  index: number;
  questionType: LessonQuestionType;
  question: string;
  passage?: string;
  correctAnswer: string | number;
  options: string[];
  learningFocus: string;
  hint: string;
  scaffold: ReturnType<typeof buildQuestionFormulaScaffold>;
  masterySignals: LessonMasterySignals;
}): NormalizedLessonItem {
  const { item, context, index, questionType, question, passage, correctAnswer, options, learningFocus, hint, scaffold, masterySignals } = input;
  const safeDifficulty = Math.max(1, Math.min(5, numberValue(item.difficulty ?? context.difficulty, 1)));
  const explanation = firstText(item.explanation, item.rationale, item.answerExplanation, item.workedSolution, buildFallbackExplanation(questionType, question, String(correctAnswer)));
  const workedSolution = firstText(item.workedSolution, item.solution, item.answerExplanation, explanation, buildFallbackExplanation(questionType, question, String(correctAnswer)));
  const coachSteps = textArray(item.coachSteps).length
    ? textArray(item.coachSteps)
    : buildFallbackCoachSteps(questionType, question, hint, learningFocus);
  const guidedSteps = textArray(item.guidedSteps).length
    ? textArray(item.guidedSteps)
    : (scaffold.keyInformation.length >= 3
      ? scaffold.keyInformation
      : buildFallbackGuidedSteps(questionType, question, correctAnswer, coachSteps));
  const retryPrompts = textArray(item.retryPrompts).length
    ? textArray(item.retryPrompts)
    : buildFallbackRetryPrompts(questionType, learningFocus);
  const reviewPrompt = firstText(item.reviewPrompt, buildFallbackReviewPrompt(questionType, learningFocus));
  const weakSkillTags = buildWeakSkillTags(item, context, questionType);
  const visuals = normalizeVisuals({
    item,
    questionType,
    learningFocus,
    question,
    correctAnswer,
    scaffoldVisual: scaffold.visual,
  });

  const normalized: NormalizedLessonItem = {
    id: String(item.id ?? `${questionType}-${index + 1}`),
    questionType,
    question,
    options,
    correctAnswer,
    explanation,
    hint,
    coachSteps,
    guidedSteps,
    workedSolution,
    visuals,
    learningFocus,
    retryPrompts,
    reviewPrompt,
    weakSkillTags,
    difficulty: safeDifficulty,
    masterySignals,
    prompt: question,
    type: String(item.type ?? questionType),
    word: firstText(item.word, questionType === "spelling" ? question : ""),
    passage,
    answer: correctAnswer,
    choices: options,
    skillFocus: firstText(item.skillFocus, learningFocus),
    topic: text(item.topic ?? context.topic),
    assessmentPrompt: firstText(item.assessmentPrompt, questionType === "spelling" ? "What word do you see on the screen?" : ""),
    supportPrompt: firstText(item.supportPrompt, coachSteps[0] ?? hint),
    tapPrompt: firstText(item.tapPrompt, questionType === "spelling" ? "Now type the word." : ""),
    missionGroup: firstText(item.missionGroup, weakSkillTags[0]),
    bridgeWord: text(item.bridgeWord),
    bridgeMode: text(item.bridgeMode),
    bridgeWordIndex: Number.isFinite(Number(item.bridgeWordIndex)) ? Number(item.bridgeWordIndex) : undefined,
    visualRequired: visuals.required,
    visualType: visuals.type,
    visualPrompt: visuals.prompt,
    visualAltText: visuals.altText,
    visualBody: visuals.body,
    visualTitle: visuals.title,
    visual: visuals,
    sentenceContext: text(item.sentenceContext),
    categoryHint: text(item.categoryHint),
    syllables: text(item.syllables),
    emoji: text(item.emoji),
    patterns: textArray(item.patterns),
    vocabularyWords: textArray(item.vocabularyWords),
    questions: Array.isArray(item.questions) ? item.questions : undefined,
    answerOptions: textArray(item.answerOptions),
    learningObjective: firstText(item.learningObjective),
    keyInformation: textArray(item.keyInformation),
    activityMode: text(item.activityMode),
  };

  return normalized;
}

function normalizeSingleItem(raw: Record<string, unknown>, context: LessonPayloadContext, index: number): NormalizedLessonItem | null {
  const questionType = inferQuestionType(raw, context);
  if (questionType === "reading" && Array.isArray(raw.questions) && raw.questions.length > 0) {
    return null;
  }

  const question = firstText(
    questionType === "spelling"
      ? firstText(raw.prompt, raw.question, raw.assessmentPrompt, `Spell ${text(raw.word ?? raw.answer ?? raw.prompt)}`)
      : firstText(raw.question, raw.prompt, raw.word),
  );
  const correctAnswer = resolveCorrectAnswer(raw);
  const learningFocus = firstText(raw.learningFocus, raw.skillFocus, context.skillFocus, raw.topic, buildFallbackLearningFocus(questionType, text(raw.skillFocus ?? context.skillFocus), text(raw.topic ?? context.topic)));
  const scaffold = buildQuestionFormulaScaffold({
    item: {
      ...raw,
      prompt: question,
      question,
      answer: correctAnswer,
      skillFocus: learningFocus,
      passage: text(raw.passage),
      visualPrompt: text(raw.visualPrompt),
      visualAltText: text(raw.visualAltText),
      visualType: text(raw.visualType),
    },
    section: questionType === "reading" ? "reading" : questionType === "spelling" ? "spelling" : "math",
    subjectLabel: context.subject ?? context.contentType ?? questionType,
  });
  const hint = firstText(raw.hint, scaffold.hint, buildFallbackHint(questionType, question, learningFocus));
  const options = normalizeOptionList(raw, correctAnswer);
  const passage = text(raw.passage);
  const masterySignals: LessonMasterySignals = {
    firstTryCorrect: Boolean(raw.firstTryCorrect ?? false),
    retryCorrect: Boolean(raw.retryCorrect ?? false),
    attemptCount: numberValue(raw.attemptCount, 0),
    hintsUsed: numberValue(raw.hintsUsed, 0),
    mastered: Boolean(raw.mastered ?? false),
    reviewed: Boolean(raw.reviewed ?? false),
  };

  return buildNormalizedItem({
    item: raw,
    context,
    index,
    questionType,
    question,
    passage: passage || undefined,
    correctAnswer,
    options,
    learningFocus,
    hint,
    scaffold,
    masterySignals,
  });
}

function expandReadingQuestions(raw: Record<string, unknown>, context: LessonPayloadContext, index: number): NormalizedLessonItem[] {
  const passage = text(raw.passage ?? raw.text ?? raw.body ?? raw.passageText);
  const questions = Array.isArray(raw.questions) ? raw.questions : [];
  if (!questions.length) return [];

  return questions
    .map((entry, questionIndex) => {
      const q = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      const question = firstText(q.question, q.prompt, raw.question, raw.prompt, passage ? "Read the passage and answer the question." : "Answer the question.");
      const correctAnswer = resolveCorrectAnswer({ ...raw, ...q, passage });
      const learningFocus = firstText(q.skillFocus, raw.skillFocus, context.skillFocus, context.topic, "Reading comprehension");
      const scaffold = buildQuestionFormulaScaffold({
        item: {
          ...raw,
          ...q,
          prompt: question,
          question,
          answer: correctAnswer,
          passage,
          skillFocus: learningFocus,
          visualPrompt: q.visualPrompt ?? raw.visualPrompt,
          visualAltText: q.visualAltText ?? raw.visualAltText,
        },
        section: "reading",
        subjectLabel: context.subject ?? context.contentType ?? "Reading",
      });
      const hint = firstText(q.hint, raw.hint, scaffold.hint, buildFallbackHint("reading", question, learningFocus));
      const options = normalizeOptionList({ ...raw, ...q }, correctAnswer);
      const masterySignals: LessonMasterySignals = {
        firstTryCorrect: Boolean(q.firstTryCorrect ?? raw.firstTryCorrect ?? false),
        retryCorrect: Boolean(q.retryCorrect ?? raw.retryCorrect ?? false),
        attemptCount: numberValue(q.attemptCount ?? raw.attemptCount, 0),
        hintsUsed: numberValue(q.hintsUsed ?? raw.hintsUsed, 0),
        mastered: Boolean(q.mastered ?? raw.mastered ?? false),
        reviewed: Boolean(q.reviewed ?? raw.reviewed ?? false),
      };

      return buildNormalizedItem({
        item: { ...raw, ...q },
        context,
        index: index + questionIndex,
        questionType: "reading",
        question,
        passage,
        correctAnswer,
        options,
        learningFocus,
        hint,
        scaffold,
        masterySignals,
      });
    })
    .filter((item): item is NormalizedLessonItem => Boolean(item));
}

export function normalizeLessonContentItems(rawContent: unknown, context: LessonPayloadContext = {}): NormalizedLessonItem[] {
  const rawItems = Array.isArray(rawContent)
    ? rawContent
    : rawContent && typeof rawContent === "object"
      ? [rawContent]
      : [];

  const normalized: NormalizedLessonItem[] = [];
  rawItems.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const raw = entry as Record<string, unknown>;
    const questionType = inferQuestionType(raw, context);
    if (questionType === "reading" && Array.isArray(raw.questions) && raw.questions.length > 0) {
      normalized.push(...expandReadingQuestions(raw, context, index));
      return;
    }
    const item = normalizeSingleItem(raw, context, index);
    if (item) normalized.push(item);
  });

  return normalized;
}

export function normalizeLessonContentJson(contentJson: string, context: LessonPayloadContext = {}): NormalizedLessonItem[] {
  try {
    return normalizeLessonContentItems(JSON.parse(contentJson) as unknown, context);
  } catch {
    return [];
  }
}