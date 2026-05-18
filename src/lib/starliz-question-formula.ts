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
  word?: unknown;
  hint?: unknown;
  skillFocus?: unknown;
  passage?: unknown;
  visualPrompt?: unknown;
  visualAltText?: unknown;
  visualType?: unknown;
  given?: unknown;
  keyInformation?: unknown;
};

type CircuitQuestionData = {
  voltage: string;
  resistance: string;
};

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
}): string {
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

  return {
    learningFocus,
    keyInformation,
    hint: text(item.hint) || null,
    unitLabel: null,
    visual: text(item.visualPrompt) || text(item.visualAltText)
      ? {
          type: text(item.passage) ? "passage" : "formula_card",
          title: text(item.visualType) || "Visual support",
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
  const { section, item, prompt, expected, attempt, inReviewRound } = input;
  const circuit = extractCircuitQuestionData(item);

  if (section === "math" && circuit) {
    if (attempt <= 1 && !inReviewRound) {
      return `Not quite. Let's find the important numbers first.\n\nVoltage = ${circuit.voltage}\nResistance = ${circuit.resistance}\n\nWhich formula helps us find current?`;
    }

    return `Almost. We use Ohm's Law.\n\nCurrent = Voltage ÷ Resistance\n\nNow put the numbers in:\nCurrent = ${numberPart(circuit.voltage)} ÷ ${numberPart(circuit.resistance)}\n\nWhat is ${numberPart(circuit.voltage)} ÷ ${numberPart(circuit.resistance)}?`;
  }

  if (section === "math") {
    if (attempt <= 1 && !inReviewRound) {
      return `Not quite. Let's find the important numbers first.\n\nQuestion: ${prompt || "Maths question"}\n\nLook for the numbers and choose the operation you need.`;
    }

    return `Almost. Let's solve it step by step.\n\nQuestion: ${prompt || "Maths question"}\n\nSet up the calculation carefully before you answer.`;
  }

  if (section === "reading") {
    if (attempt <= 1 && !inReviewRound) {
      return "Not quite. Let's look for the key words first.\n\nRead the question again and find the matching clue in the passage.";
    }

    return `Almost. Read the clue again and match it to the passage.\n\nThen choose the answer that fits best: ${expected}.`;
  }

  return `Good try. Let's learn it together, then try again.\n\nNow answer ${expected} again.`;
}

export function buildFinalRevealMessage(input: {
  section: LessonFlowSection;
  item: QuestionFormulaSource;
  prompt: string;
  expected: string;
}): string {
  const { section, item, prompt, expected } = input;
  const circuit = extractCircuitQuestionData(item);

  if (section === "math" && circuit) {
    const voltageNumber = numberPart(circuit.voltage);
    const resistanceNumber = numberPart(circuit.resistance);
    return `The correct answer is ${expected}.\n\nCurrent = Voltage ÷ Resistance\nCurrent = ${voltageNumber} ÷ ${resistanceNumber}\nCurrent = ${expected}\n\nSo the current flowing through the circuit is ${expected}.`;
  }

  if (section === "reading") {
    return `The correct answer is ${expected}.\n\nGo back to the question and match each key word to the passage. That shows why ${expected} is the best answer.`;
  }

  return `The correct answer is ${expected}.\n\nQuestion: ${prompt || "This question"}\nAnswer: ${expected}`;
}

export function buildWorkedSuccessMessage(input: {
  section: LessonFlowSection;
  item: QuestionFormulaSource;
  prompt: string;
  expected: string;
}): string {
  const { section, item, prompt, expected } = input;
  const circuit = extractCircuitQuestionData(item);

  if (section === "math" && circuit) {
    const voltageNumber = numberPart(circuit.voltage);
    const resistanceNumber = numberPart(circuit.resistance);
    return `Great! The answer is ${expected}.\n\nWe use Ohm's Law:\nCurrent = Voltage ÷ Resistance\n\nThe battery is ${circuit.voltage} and the resistor is ${circuit.resistance}.\n\nSo:\n${voltageNumber} ÷ ${resistanceNumber} = ${numberPart(expected)}\n\nSo the current flowing through the circuit is ${expected}.`;
  }

  if (section === "reading") {
    return `Great! The answer is ${expected}.\n\nWe find the best answer by reading the question carefully, spotting the key clue, and matching it to the passage.`;
  }

  if (section === "spelling") {
    return `Great! The correct spelling is ${expected}.\n\nSay each sound slowly, then blend them together to spell the word.`;
  }

  return `Great! The answer is ${expected}.\n\nWe solve the question step by step and check that the method fits the question: ${prompt || "this question"}.`;
}