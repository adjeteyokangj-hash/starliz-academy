export type LessonFlowSection = "spelling" | "math" | "reading";

export type QuestionAttemptSummary = {
  attempts: number;
  outcome: "pending" | "correct" | "final_wrong";
  score: number | null;
  usedHints: boolean;
};

export type QuestionVisualSupport = {
  type: "diagram" | "formula_card" | "passage";
  title: string;
  altText: string;
  body: string[];
};

export type QuestionFormulaScaffold = {
  learningFocus: string;
  keyInformation: string[];
  hint: string | null;
  unitLabel: string | null;
  visual: QuestionVisualSupport | null;
};

type QuestionFormulaSource = {
  prompt?: unknown;
  question?: unknown;
  answer?: unknown;
  explanation?: unknown;
  rationale?: unknown;
  answerExplanation?: unknown;
  workedSolution?: unknown;
  word?: unknown;
  hint?: unknown;
  skillFocus?: unknown;
  passage?: unknown;
  visualPrompt?: unknown;
  visualAltText?: unknown;
  visualType?: unknown;
  given?: unknown;
  keyInformation?: unknown;
  keyWords?: unknown;
  keywords?: unknown;
  coachHint?: unknown;
};

type CircuitQuestionData = {
  voltage: string;
  resistance: string;
};

export type QuestionIntent =
  | "formula_application"
  | "word_problem_calculation"
  | "comparison_reasoning"
  | "conceptual_reasoning"
  | "sequence_ordering"
  | "pattern_recognition"
  | "diagram_interpretation"
  | "general";

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function linesFromValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => text(entry)).filter(Boolean);
  }
  const single = text(value);
  return single ? [single] : [];
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const result = text(value);
    if (result) return result;
  }
  return "";
}

function explanationText(item: QuestionFormulaSource): string {
  return firstText(item.explanation, item.rationale, item.answerExplanation, item.workedSolution);
}

function keywordsFromItem(item: QuestionFormulaSource): string[] {
  return [...linesFromValue(item.keyWords), ...linesFromValue(item.keywords)].slice(0, 6);
}

function isScienceCircuitQuestion(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return lower.includes("circuit") || lower.includes("resistance") || lower.includes("current") || lower.includes("voltage") || lower.includes("ohm");
}

function scienceParallelCircuitExplanation(prompt: string, expected: string): string | null {
  const lower = prompt.toLowerCase();
  if (!lower.includes("parallel circuit") || !lower.includes("removed")) return null;
  return [
    "In a parallel circuit, each resistor gives the current another path.",
    "More paths means lower total resistance.",
    "If one resistor is removed, there are fewer paths for current to take.",
    "Fewer paths means the total resistance goes up.",
    `Therefore, ${expected.toLowerCase().startsWith("the ") ? expected : `the answer is ${expected}`}.`,
  ].join("\n");
}

function buildConceptExplanation(input: {
  section: LessonFlowSection;
  item: QuestionFormulaSource;
  prompt: string;
  expected: string;
}): string {
  const { section, item, prompt, expected } = input;
  const directExplanation = explanationText(item);
  if (directExplanation) return directExplanation;

  const keyInformation = linesFromValue(item.keyInformation);
  const keywords = keywordsFromItem(item);
  const learningFocus = text(item.skillFocus);
  const intent = classifyQuestionIntent({ section, item, prompt });

  if (section === "math" && isScienceCircuitQuestion(prompt)) {
    const circuitExplanation = scienceParallelCircuitExplanation(prompt, expected);
    if (circuitExplanation) return circuitExplanation;
  }

  if (section === "math" && isSeriesResistancePrompt(prompt)) {
    const values = extractSeriesResistanceValues(prompt);
    if (values.length >= 2) {
      return [
        `Great! The answer is ${expected}.`,
        "In a series circuit, total resistance is the sum of all resistors.",
        `R_total = ${values.join(" + ")}`,
        `R_total = ${expected}`,
      ].join("\n");
    }
  }

  if (section === "math") {
    const formulaLine = firstText(item.coachHint, item.hint);
    const promptLine = prompt ? `Question: ${prompt}` : "Question: work through the calculation carefully.";
    return [
      `Great! The answer is ${expected}.`,
      promptLine,
      formulaLine || intent === "formula_application" || intent === "word_problem_calculation"
        ? `Formula: ${formulaLine || "Choose the correct formula and substitute the numbers."}`
        : null,
      keyInformation.length ? `Key information: ${keyInformation.join("; ")}` : null,
      `Work it out step by step, then check that ${expected} fits the question.`,
    ].filter((line): line is string => Boolean(line)).join("\n");
  }

  if (section === "reading") {
    return [
      `Great! The answer is ${expected}.`,
      prompt ? `The question is asking you to match the clue in the passage: ${prompt}` : "The question is asking you to match the clue in the passage.",
      keywords.length ? `Key words: ${keywords.join(", ")}.` : null,
      `Use the clue, the passage and the meaning of the words to show why ${expected} is the best answer.`,
    ].filter((line): line is string => Boolean(line)).join("\n");
  }


  if (section === "spelling") {
    return [
      `Great! The correct spelling is ${expected}.`,
      learningFocus ? learningFocus : null,
      "Say each sound slowly, then blend them together to spell the word.",
    ].filter((line): line is string => Boolean(line)).join("\n");
  }

  return [
    `Great! The answer is ${expected}.`,
    prompt ? `We solve the question step by step: ${prompt}` : null,
    keyInformation.length ? `Key information: ${keyInformation.join("; ")}` : null,
    keywords.length ? `Key words: ${keywords.join(", ")}.` : null,
    "Check the method carefully and make sure it matches the question.",
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function buildCoachBreakdown(input: {
  section: LessonFlowSection;
  item: QuestionFormulaSource;
  prompt: string;
}): string {
  const { section, item, prompt } = input;
  const keyInformation = linesFromValue(item.keyInformation);
  const keywords = keywordsFromItem(item);
  const circuit = extractCircuitQuestionData(item);
  const intent = classifyQuestionIntent(input);

  if (section === "math" && circuit) {
      return [
        "We need to find the current.",
        "Use Power = Voltage × Current.",
        "Rearrange it: Current = Power ÷ Voltage.",
        `Put in the numbers: Current = ${numberPart(circuit.voltage)} ÷ ${numberPart(circuit.resistance)}.`,
        "Now work out the calculation and choose the matching answer.",
      ].join("\n");
  }

  if (section === "math" && isSeriesResistancePrompt(prompt)) {
    const values = extractSeriesResistanceValues(prompt);
    if (values.length >= 2) {
      return [
        "This is a series circuit question.",
        "In series, resistances add together.",
        `Set it up: R_total = ${values.join(" + ")}`,
        "Now add them carefully and choose the matching total resistance.",
      ].join("\n");
    }
  }

  if (intent === "comparison_reasoning") {
    return [
      "Read the key words carefully.",
      keywords.length ? `Key words: ${keywords.join(", ")}.` : "Key words: before, after, and what changed.",
      prompt ? `What is the question asking? ${prompt}` : null,
      "Compare what is happening before and after the change.",
      "Use the science idea, not a guess, to choose the best answer.",
    ].filter((line): line is string => Boolean(line)).join("\n");
  }

  if (section === "math" && (intent === "formula_application" || intent === "word_problem_calculation")) {
    return [
      "Find what the question wants first.",
      prompt ? `Question: ${prompt}` : null,
      keyInformation.length ? `Given values: ${keyInformation.join("; ")}` : null,
      "Pick the formula or operation that links those values.",
      "Substitute numbers carefully, then calculate.",
    ].filter((line): line is string => Boolean(line)).join("\n");
  }

  if (section === "reading") {
    return [
      "Read the question again and find the clue that matches the passage.",
      keywords.length ? `Key words: ${keywords.join(", ")}.` : null,
      "Use the clue in the text, then choose the answer that fits best.",
    ].filter((line): line is string => Boolean(line)).join("\n");
  }

  return [
    prompt ? `What is this question asking? ${prompt}` : "What is this question asking?",
    keyInformation.length ? `Key information: ${keyInformation.join("; ")}` : null,
    "Look for the rule or pattern before you answer.",
    "Use the coach steps, then choose the best answer.",
  ].filter((line): line is string => Boolean(line)).join("\n");
}
function questionText(item: QuestionFormulaSource): string {
  return text(item.prompt) || text(item.question) || text(item.word);
}

function extractCircuitQuestionData(item: QuestionFormulaSource): CircuitQuestionData | null {
  const prompt = questionText(item);
  const lower = prompt.toLowerCase();
  const mentionsCurrent = lower.includes("current");
  const mentionsVoltage = lower.includes("voltage") || /\d+(?:\.\d+)?\s*v\b/i.test(prompt);
  const mentionsResistance = lower.includes("resistance") || /\d+(?:\.\d+)?\s*(?:Ω|ohm|ohms)/i.test(prompt);

  if (!mentionsCurrent || !mentionsVoltage || !mentionsResistance) {
    return null;
  }

  const voltageMatch = prompt.match(/(\d+(?:\.\d+)?)\s*v\b/i);
  const resistanceMatch = prompt.match(/(\d+(?:\.\d+)?)\s*(Ω|ohm|ohms)/i);
  if (!voltageMatch || !resistanceMatch) {
    return null;
  }

  return {
    voltage: `${voltageMatch[1]}V`,
    resistance: `${resistanceMatch[1]}Ω`,
  };
}

function numberPart(value: string): string {
  const match = value.match(/\d+(?:\.\d+)?/);
  return match?.[0] ?? value;
}

export function scoreForResolvedQuestion(attempts: number, correct: boolean): number {
  if (!correct) return 0;
  if (attempts <= 1) return 100;
  if (attempts === 2) return 70;
  return 50;
}

export function computeAttemptWeightedScore(progress: Record<string, QuestionAttemptSummary>): number {
  const scores = Object.values(progress)
    .map((entry) => entry.score)
    .filter((value): value is number => typeof value === "number");
  if (!scores.length) return 0;
  return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
}

export function buildTutorPanelPrompt(options: {
  voiceEnabled: boolean;
  microphoneVisible: boolean;
  speechListening?: boolean;
  coachOpen?: boolean;
  feedbackMode?: "none" | "continue" | "retry" | "skip_choice" | null;
  hasAnswerOptions?: boolean;
  correctAnswerVisible?: boolean;
  answerSubmitted?: boolean;
}): string {
  if (options.correctAnswerVisible || options.feedbackMode === "continue") {
    return "Great work. Read the explanation, then click Continue for the next question.";
  }
  if (options.feedbackMode === "retry") {
    return options.speechListening ? "Try the steps again. I’ll help you get it." : "Try the steps again. Use the hint and have another go.";
  }
  if (options.coachOpen) {
    return "Use the coach steps, then choose the best answer.";
  }
  if (options.hasAnswerOptions && !options.answerSubmitted) {
    return "Need help? Click Coach me to break the question down.";
  }
  if (options.voiceEnabled && options.microphoneVisible) {
    return options.speechListening ? "Let's try this together." : "Tap the microphone and say your answer.";
  }
  return "Need help? Use the answer box or choose an option below.";
}

export function buildRestoredLessonMessage(): string {
  return "Welcome back! Let's carry on from where you stopped.";
}

export function buildQuestionFormulaScaffold(input: {
  item: QuestionFormulaSource;
  section: LessonFlowSection;
  subjectLabel: string;
}): QuestionFormulaScaffold {
  const { item, section, subjectLabel } = input;
  const circuit = extractCircuitQuestionData(item);
  const keyInformation = [
    ...linesFromValue(item.given),
    ...linesFromValue(item.keyInformation),
  ];
  const subject = subjectLabel || (section === "math" ? "Maths" : section === "reading" ? "Reading" : "Spelling");
  const learningFocus = text(item.skillFocus)
    ? `Today we are practising ${text(item.skillFocus)}.`
    : section === "math"
      ? `Today we are practising ${subject.toLowerCase()} thinking step by step.`
      : section === "reading"
        ? "Today we are practising reading carefully and finding the best clue."
        : "Today we are practising sounding out and spelling carefully.";

  if (circuit) {
    return {
      learningFocus: "Let's practise using Ohm's Law. Look for the voltage and the resistance.",
      keyInformation: [
        `Voltage = ${circuit.voltage}`,
        `Resistance = ${circuit.resistance}`,
        "Find: Current = ?",
      ],
      hint: "Use Ohm's Law: Current = Voltage ÷ Resistance",
      unitLabel: "A",
      visual: {
        type: "diagram",
        title: "Circuit diagram",
        altText: `${circuit.voltage} battery connected to a ${circuit.resistance} resistor, with current labelled I = ?`,
        body: [
          `[${circuit.voltage} Battery] ---> [${circuit.resistance} Resistor]`,
          "        Current I = ?",
        ],
      },
    };
  }

  const visualType = text(item.passage) ? "passage" : "formula_card";

  return {
    learningFocus,
    keyInformation,
    hint: text(item.hint) || null,
    unitLabel: null,
    visual: text(item.visualPrompt) || text(item.visualAltText)
      ? {
          type: visualType,
          title: text(item.visualType) || (visualType === "formula_card" ? "Formula help" : "Visual support"),
          altText: text(item.visualAltText) || text(item.visualPrompt) || "Question support",
          body: [text(item.visualPrompt) || text(item.visualAltText)].filter(Boolean),
        }
      : null,
  };
}

export function buildProgressiveSupportMessage(input: {
  section: LessonFlowSection;
  item: QuestionFormulaSource;
  prompt: string;
  expected: string;
  attempt: number;
  inReviewRound: boolean;
}): string {
  const { section, item, prompt, attempt, inReviewRound } = input;
  const circuit = extractCircuitQuestionData(item);
  const keyInformation = linesFromValue(item.keyInformation);
  const formulaLine = firstText(item.coachHint, item.hint);
  const intent = classifyQuestionIntent({ section, item, prompt });

  if (section === "math" && circuit) {
    if (attempt <= 1 && !inReviewRound) {
      return `Not quite. Let's find the important numbers first.\n\nVoltage = ${circuit.voltage}\nResistance = ${circuit.resistance}\n\nWhich formula helps us find current?`;
    }

    return [
      "Almost. We use Ohm's Law.",
      "Current = Voltage ÷ Resistance",
      `Now put the numbers in: Current = ${numberPart(circuit.voltage)} ÷ ${numberPart(circuit.resistance)}`,
      `Work out ${numberPart(circuit.voltage)} ÷ ${numberPart(circuit.resistance)} and choose the matching answer.`,
    ].join("\n");
  }

  if (section === "math" && isSeriesResistancePrompt(prompt)) {
    const values = extractSeriesResistanceValues(prompt);
    if (values.length >= 2) {
      if (attempt <= 1 && !inReviewRound) {
        return [
          "Not quite. In a series circuit we add resistances.",
          `Start with: R_total = ${values.join(" + ")}`,
          "Now add those values carefully.",
        ].join("\n");
      }
      return [
        "Almost. Keep the same series rule.",
        `R_total = ${values.join(" + ")}`,
        "Add them and select the matching total resistance.",
      ].join("\n");
    }
  }

  if (section === "math") {
    if (attempt <= 1 && !inReviewRound) {
      return [
        "Not quite. Let's find the important numbers first.",
        prompt ? `Question: ${prompt}` : "Question: maths problem",
        formulaLine || intent === "formula_application" || intent === "word_problem_calculation"
          ? `Formula: ${formulaLine || "Choose the formula that connects the values in the question."}`
          : null,
        "Look for the numbers and choose the operation you need.",
      ].join("\n");
    }

    return [
      "Almost. Let's solve it step by step.",
      prompt ? `Question: ${prompt}` : "Question: maths problem",
      formulaLine ? `Formula: ${formulaLine}` : "Find the formula or rule that matches the question.",
      keyInformation.length ? `Numbers to use: ${keyInformation.join("; ")}` : "Put the numbers into the formula.",
      "Now calculate the final answer and choose the matching option.",
    ].join("\n");
  }

  if (section === "reading") {
    if (attempt <= 1 && !inReviewRound) {
      return [
        "Not quite. Let's look for the key words first.",
        "Read the question again and find the matching clue in the passage.",
      ].join("\n");
    }

    return [
      "Almost. Read the clue again and match it to the passage.",
      "Think about which answer best fits the evidence in the text.",
    ].join("\n");
  }

  return [
    "Good try. Let's learn it together, then try again.",
    "Find the key information, then use it to choose the answer.",
  ].join("\n");
}

export function buildFinalRevealMessage(input: {
  section: LessonFlowSection;
  item: QuestionFormulaSource;
  prompt: string;
  expected: string;
}): string {
  const { section, item, prompt, expected } = input;
  const explanation = buildConceptExplanation({ section, item, prompt, expected });

  if (section === "math") {
    const circuit = extractCircuitQuestionData(item);
    if (circuit) {
      const voltageNumber = numberPart(circuit.voltage);
      const resistanceNumber = numberPart(circuit.resistance);
      return [
        `The correct answer is ${expected}.`,
        "Current = Voltage ÷ Resistance",
        `Current = ${voltageNumber} ÷ ${resistanceNumber}`,
        `Current = ${expected}`,
        explanation,
      ].join("\n\n");
    }

    return [
      `The correct answer is ${expected}.`,
      explanation,
    ].join("\n\n");
  }

  if (section === "reading") {
    return [
      `The correct answer is ${expected}.`,
      explanation,
    ].join("\n\n");
  }

  return [
    `The correct answer is ${expected}.`,
    explanation,
  ].join("\n\n");
}

export function buildWorkedSuccessMessage(input: {
  section: LessonFlowSection;
  item: QuestionFormulaSource;
  prompt: string;
  expected: string;
}): string {
  const { section, item, expected } = input;
  const explanation = buildConceptExplanation(input);

  if (section === "math") {
    const circuit = extractCircuitQuestionData(item);
    if (circuit) {
      const voltageNumber = numberPart(circuit.voltage);
      const resistanceNumber = numberPart(circuit.resistance);
      return [
        `Great! The answer is ${expected}.`,
        "We use Ohm's Law:",
        "Current = Voltage ÷ Resistance",
        `The battery is ${circuit.voltage} and the resistor is ${circuit.resistance}.`,
        `So ${voltageNumber} ÷ ${resistanceNumber} = ${numberPart(expected)}.`,
        `So the current flowing through the circuit is ${expected}.`,
      ].join("\n\n");
    }
  }

  if (section === "spelling") {
    return [
      `Great! The correct spelling is ${expected}.`,
      "Say each sound slowly, then blend them together to spell the word.",
    ].join("\n\n");
  }

  return explanation.startsWith("Great!")
    ? explanation
    : [`Great! The answer is ${expected}.`, explanation].join("\n\n");
}

export function buildCoachSupportMessage(input: {
  section: LessonFlowSection;
  item: QuestionFormulaSource;
  prompt: string;
}): string {
  return buildCoachBreakdown(input);
}

function isSeriesResistancePrompt(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return lower.includes("series") && lower.includes("resistance");
}

function extractSeriesResistanceValues(prompt: string): string[] {
  const matches = [...prompt.matchAll(/(\d+(?:\.\d+)?)\s*(?:Ω|ohm|ohms)/gi)];
  return matches.map((match) => match[1] ?? "").filter(Boolean);
}

export function classifyQuestionIntent(input: {
  section: LessonFlowSection;
  item: QuestionFormulaSource;
  prompt: string;
}): QuestionIntent {
  const lower = input.prompt.toLowerCase();
  const hasNumbers = /\d/.test(input.prompt);
  const asksToCalculate = /(calculate|work out|find|determine|solve|total|sum|difference|product|quotient)/i.test(lower);
  const hasFormulaWords = /(formula|equation|ohm|resistance|voltage|current|rate|area|perimeter|series|parallel)/i.test(lower);

  if (/(diagram|graph|chart|table|pictured|shown|image)/i.test(lower)) {
    return "diagram_interpretation";
  }
  if (/(compare|difference|before and after|increase|decrease|changes|what happens|happens when|happens if)/i.test(lower)) {
    return "comparison_reasoning";
  }
  if (/(why|explain|reason)/i.test(lower)) {
    return "conceptual_reasoning";
  }
  if (/(order|sequence|first|next|then|arrange)/i.test(lower)) {
    return "sequence_ordering";
  }
  if (/(pattern|next number|rule)/i.test(lower)) {
    return "pattern_recognition";
  }
  if (asksToCalculate && (hasNumbers || hasFormulaWords)) {
    return "formula_application";
  }
  if (hasNumbers && /(how many|how much|altogether|left|remain|shared equally)/i.test(lower)) {
    return "word_problem_calculation";
  }
  if (input.section === "math" && hasNumbers && hasFormulaWords) {
    return "formula_application";
  }
  return "general";
}