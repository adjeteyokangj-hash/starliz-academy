import { keyStageForYearGroup, normalizeKeyStage, normalizeYearGroup } from "@/lib/curriculum";

export type QuickLevelFinderStatus = "in_progress" | "completed";

export type QuickLevelFinderQuestion = {
  id: string;
  subject: string;
  strand: string | null;
  topic: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  difficulty: number;
  yearGroup: string;
  keyStage: string;
};

export type QuickLevelFinderResponse = {
  questionId: string;
  subject: string;
  correct: boolean;
  timeSpentMs: number;
  answeredAt: string;
};

export type QuickLevelFinderLevel = {
  accuracy: number;
  level: "below" | "secure" | "advanced";
};

export type QuickLevelFinderSession = {
  sessionId: string;
  status: QuickLevelFinderStatus;
  startedAt: string;
  completedAt: string | null;
  selectedSubjects: string[];
  scopedSubjects: string[];
  questions: QuickLevelFinderQuestion[];
  cursor: number;
  responses: QuickLevelFinderResponse[];
  levels: Record<string, QuickLevelFinderLevel>;
};

export type QuickLevelFinderPlacementProfile = {
  yearGroup: string;
  keyStage: string;
  confidence: number;
};

function parseObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed JSON and use defaults.
  }
  return {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function parseQuestion(value: unknown): QuickLevelFinderQuestion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const subject = typeof raw.subject === "string" ? raw.subject.trim().toLowerCase() : "";
  if (!id || !subject) return null;
  const strand = typeof raw.strand === "string" && raw.strand.trim() ? raw.strand.trim().toLowerCase() : null;
  const topic = typeof raw.topic === "string" && raw.topic.trim() ? raw.topic.trim() : subject;
  const prompt = typeof raw.prompt === "string" && raw.prompt.trim() ? raw.prompt.trim() : topic;
  const choicesRaw = Array.isArray(raw.choices)
    ? raw.choices
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
    : [];
  const choices = choicesRaw.length >= 2
    ? choicesRaw.slice(0, 4)
    : [
      "This option best answers the question.",
      "This option is partly related but incomplete.",
      "This option is not supported by the question.",
      "This option is incorrect for this topic.",
    ];
  const parsedCorrectIndex = typeof raw.correctIndex === "number" && Number.isFinite(raw.correctIndex)
    ? Math.round(raw.correctIndex)
    : 0;
  const correctIndex = Math.max(0, Math.min(choices.length - 1, parsedCorrectIndex));
  const difficultyRaw = typeof raw.difficulty === "number" && Number.isFinite(raw.difficulty) ? Math.round(raw.difficulty) : 3;
  const yearGroup = typeof raw.yearGroup === "string" && raw.yearGroup.trim() ? raw.yearGroup.trim() : "Year 1";
  const keyStage = typeof raw.keyStage === "string" && raw.keyStage.trim() ? raw.keyStage.trim() : "KS1";
  return {
    id,
    subject,
    strand,
    topic,
    prompt,
    choices,
    correctIndex,
    difficulty: Math.max(1, Math.min(5, difficultyRaw)),
    yearGroup,
    keyStage,
  };
}

function parseResponse(value: unknown): QuickLevelFinderResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const questionId = typeof raw.questionId === "string" ? raw.questionId.trim() : "";
  const subject = typeof raw.subject === "string" ? raw.subject.trim().toLowerCase() : "";
  if (!questionId || !subject) return null;

  const correct = Boolean(raw.correct);
  const timeSpentMs = typeof raw.timeSpentMs === "number" && Number.isFinite(raw.timeSpentMs)
    ? Math.max(0, Math.floor(raw.timeSpentMs))
    : 0;
  const answeredAt = typeof raw.answeredAt === "string" && raw.answeredAt.trim()
    ? raw.answeredAt
    : new Date().toISOString();

  return {
    questionId,
    subject,
    correct,
    timeSpentMs,
    answeredAt,
  };
}

function parseLevels(value: unknown): Record<string, QuickLevelFinderLevel> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, QuickLevelFinderLevel> = {};
  for (const [subject, levelValue] of Object.entries(value)) {
    if (!subject.trim()) continue;
    if (!levelValue || typeof levelValue !== "object" || Array.isArray(levelValue)) continue;
    const levelObj = levelValue as Record<string, unknown>;
    const accuracyRaw = levelObj.accuracy;
    const levelRaw = levelObj.level;
    const accuracy = typeof accuracyRaw === "number" && Number.isFinite(accuracyRaw)
      ? Math.max(0, Math.min(100, Math.round(accuracyRaw)))
      : 0;
    if (levelRaw !== "below" && levelRaw !== "secure" && levelRaw !== "advanced") continue;
    out[subject.trim().toLowerCase()] = { accuracy, level: levelRaw };
  }
  return out;
}

export function parseQuickLevelFinderSession(raw: string | null | undefined): QuickLevelFinderSession | null {
  const profile = parseObject(raw);
  const quick = profile.quickLevelFinder;
  if (!quick || typeof quick !== "object" || Array.isArray(quick)) return null;

  const value = quick as Record<string, unknown>;
  const sessionId = typeof value.sessionId === "string" ? value.sessionId.trim() : "";
  const status = value.status === "completed" ? "completed" : value.status === "in_progress" ? "in_progress" : null;
  const startedAt = typeof value.startedAt === "string" && value.startedAt.trim()
    ? value.startedAt
    : new Date().toISOString();
  const completedAt = typeof value.completedAt === "string" && value.completedAt.trim() ? value.completedAt : null;
  const selectedSubjects = asStringArray(value.selectedSubjects);
  const scopedSubjects = asStringArray(value.scopedSubjects);
  const questions = Array.isArray(value.questions)
    ? value.questions.map(parseQuestion).filter((item): item is QuickLevelFinderQuestion => item !== null)
    : [];
  const responses = Array.isArray(value.responses)
    ? value.responses.map(parseResponse).filter((item): item is QuickLevelFinderResponse => item !== null)
    : [];
  const levels = parseLevels(value.levels);
  const cursorRaw = typeof value.cursor === "number" && Number.isFinite(value.cursor) ? Math.floor(value.cursor) : 0;
  const cursor = Math.max(0, Math.min(questions.length, cursorRaw));

  if (!sessionId || !status || !questions.length || !selectedSubjects.length) return null;

  return {
    sessionId,
    status,
    startedAt,
    completedAt,
    selectedSubjects,
    scopedSubjects,
    questions,
    cursor,
    responses,
    levels,
  };
}

export function upsertQuickLevelFinderSession(
  existingJson: string | null | undefined,
  session: QuickLevelFinderSession,
): string {
  const profile = parseObject(existingJson);
  const next = {
    ...profile,
    quickLevelFinder: session,
  };
  return JSON.stringify(next);
}

export function parseQuickLevelFinderRetestEnabled(raw: string | null | undefined): boolean {
  const profile = parseObject(raw);
  return profile.quickLevelFinderRetestEnabled === true;
}

export function upsertQuickLevelFinderRetestEnabled(
  existingJson: string | null | undefined,
  enabled: boolean,
): string {
  const profile = parseObject(existingJson);
  const next = {
    ...profile,
    quickLevelFinderRetestEnabled: enabled,
  };
  return JSON.stringify(next);
}

export function questionRangeBySubjectCount(count: number): { min: number; max: number } {
  if (count <= 3) return { min: 18, max: 24 };
  if (count === 4) return { min: 24, max: 32 };
  return { min: 25, max: 35 };
}

export function autoQuickLevelFinderSubjectsForYearGroup(yearGroup: string | null | undefined): string[] {
  const normalizedYear = normalizeYearGroup(yearGroup) ?? "Year 1";
  const yearNumber = yearGroupNumber(normalizedYear);

  if (yearNumber <= 6) {
    return ["maths", "reading", "spelling"];
  }

  return ["maths", "english", "science"];
}

export function quickLevelFinderQuestionRangeForYearGroup(yearGroup: string | null | undefined): { min: number; max: number } {
  const normalizedYear = normalizeYearGroup(yearGroup) ?? "Year 1";
  const yearNumber = yearGroupNumber(normalizedYear);

  if (yearNumber <= 2) {
    return { min: 9, max: 9 };
  }

  if (yearNumber <= 9) {
    return { min: 12, max: 12 };
  }

  return { min: 15, max: 15 };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string): () => number {
  let state = hashString(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function shuffleWithSeed<T>(items: T[], seed: string): T[] {
  const out = [...items];
  const random = seededRandom(seed);
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [out[index], out[swapIndex]] = [out[swapIndex], out[index]];
  }
  return out;
}

function normalizeSubjectKey(rawKey: string): { subject: string; strand: string | null } {
  const normalized = rawKey.trim().toLowerCase();
  if (!normalized) return { subject: "general", strand: null };
  if (!normalized.includes(":")) return { subject: normalized, strand: null };
  const [subject, strandRaw] = normalized.split(":", 2);
  return { subject, strand: strandRaw || null };
}

// Maps literal subject names (reading, spelling, grammar, vocabulary) to english + strand.
export function normaliseSubjectStrandForQlf(subject: string, strand: string | null): { subject: string; strand: string | null } {
  switch (subject.trim().toLowerCase()) {
    case "reading":
      return { subject: "english", strand: "reading" };
    case "spelling":
      return { subject: "english", strand: "spelling" };
    case "grammar":
      return { subject: "english", strand: "grammar" };
    case "vocabulary":
      return { subject: "english", strand: "vocabulary" };
    default:
      return { subject: subject.trim().toLowerCase(), strand };
  }
}

function yearGroupNumber(value: string | null | undefined): number {
  const normalized = normalizeYearGroup(value);
  if (!normalized) return 1;
  if (normalized === "Reception") return 0;
  const match = normalized.match(/^Year\s+(\d{1,2})$/i);
  if (!match) return 1;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(11, parsed)) : 1;
}

function difficultyBandForYearGroup(yearGroup: string | null | undefined): number {
  const year = yearGroupNumber(yearGroup);
  if (year <= 2) return 1;
  if (year <= 4) return 2;
  if (year <= 6) return 3;
  if (year <= 9) return 4;
  return 5;
}

function difficultyForIndex(baseDifficulty: number, index: number): number {
  const offsets = [0, 1, -1, 0, 1, -1];
  return Math.max(1, Math.min(5, baseDifficulty + offsets[index % offsets.length]));
}

const BLOCKED_PLACEHOLDER_PHRASES = [
  "Subject check",
  "Which answer is most accurate for this topic",
  "The evidence-based answer",
  "The answer with the longest sentence",
  "The answer with unusual punctuation",
  "The first answer shown",
] as const;

export function containsBlockedPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return BLOCKED_PLACEHOLDER_PHRASES.some((phrase) => lower.includes(phrase.toLowerCase()));
}

export function questionHasBlockedContent(q: QuickLevelFinderQuestion): boolean {
  return (
    containsBlockedPhrase(q.topic) ||
    containsBlockedPhrase(q.prompt) ||
    q.choices.some((c) => containsBlockedPhrase(c))
  );
}

function deterministicFallbackPrompt(
  subject: string,
  strand: string | null,
  yearGroup: string,
  index: number,
): { topic: string; prompt: string; choices: string[]; correctIndex: number } {
  const yr = yearGroup;
  const normStrand = strand ?? subject;

  if (subject === "english") {
    if (normStrand === "reading" || normStrand === "comprehension") {
      const opts = [
        { topic: "Reading check", prompt: `${yr} Reading: In the phrase "She was over the moon," what does "over the moon" mean?`, choices: ["Very happy", "Floating in space", "Very tired", "Looking at the sky"], correctIndex: 0 },
        { topic: "Reading check", prompt: `${yr} Reading: What is the main purpose of a glossary in a non-fiction book?`, choices: ["To explain key words and terms", "To list the author's awards", "To show the book's index", "To provide extra illustrations"], correctIndex: 0 },
        { topic: "Reading check", prompt: `${yr} Reading: If a character is described as "beaming," how do they most likely feel?`, choices: ["Very happy", "Very worried", "Very tired", "Very cold"], correctIndex: 0 },
      ];
      return opts[index % opts.length];
    }
    if (normStrand === "spelling" || normStrand === "phonics") {
      const opts = [
        { topic: "Spelling check", prompt: `${yr} Spelling: Which of these words is spelled correctly?`, choices: ["necessary", "necesary", "neccessary", "necassary"], correctIndex: 0 },
        { topic: "Spelling check", prompt: `${yr} Spelling: Which word is spelled correctly?`, choices: ["friend", "freind", "frend", "feiend"], correctIndex: 0 },
        { topic: "Spelling check", prompt: `${yr} Spelling: Choose the correctly spelled word.`, choices: ["because", "becaus", "becauze", "becouse"], correctIndex: 0 },
      ];
      return opts[index % opts.length];
    }
    if (normStrand === "grammar") {
      const opts = [
        { topic: "Grammar check", prompt: `${yr} Grammar: Which sentence uses capital letters correctly?`, choices: ["On Monday, we visited London.", "on monday, we visited london.", "On monday, we visited London.", "on Monday, we visited london."], correctIndex: 0 },
        { topic: "Grammar check", prompt: `${yr} Grammar: Which word is an adjective in "The tiny bird sang sweetly"?`, choices: ["tiny", "bird", "sang", "sweetly"], correctIndex: 0 },
      ];
      return opts[index % opts.length];
    }
    if (normStrand === "vocabulary") {
      const opts = [
        { topic: "Vocabulary check", prompt: `${yr} Vocabulary: What does the word "enormous" mean?`, choices: ["Very large", "Very small", "Very loud", "Very fast"], correctIndex: 0 },
        { topic: "Vocabulary check", prompt: `${yr} Vocabulary: Which word is an antonym of "brave"?`, choices: ["cowardly", "strong", "bold", "fearless"], correctIndex: 0 },
      ];
      return opts[index % opts.length];
    }
    const opts = [
      { topic: "English check", prompt: `${yr} English: Which sentence is punctuated correctly?`, choices: ["Let's go to the park.", "Lets go to the park.", "Let's go to the Park.", "lets go to the park."], correctIndex: 0 },
      { topic: "English check", prompt: `${yr} English: Which word is a noun in "The dog barked loudly"?`, choices: ["dog", "barked", "loudly", "The"], correctIndex: 0 },
    ];
    return opts[index % opts.length];
  }

  if (subject === "maths") {
    const opts = [
      { topic: "Maths check", prompt: `${yr} Maths: What is 8 × 7?`, choices: ["56", "54", "63", "48"], correctIndex: 0 },
      { topic: "Maths check", prompt: `${yr} Maths: What is 144 ÷ 12?`, choices: ["12", "11", "13", "10"], correctIndex: 0 },
      { topic: "Maths check", prompt: `${yr} Maths: Which of these is a prime number?`, choices: ["13", "15", "16", "18"], correctIndex: 0 },
    ];
    return opts[index % opts.length];
  }

  if (subject === "science") {
    const opts = [
      { topic: "Science check", prompt: `${yr} Science: Which organ pumps blood around the body?`, choices: ["Heart", "Lungs", "Brain", "Liver"], correctIndex: 0 },
      { topic: "Science check", prompt: `${yr} Science: What is the chemical symbol for water?`, choices: ["H2O", "CO2", "O2", "NaCl"], correctIndex: 0 },
    ];
    return opts[index % opts.length];
  }

  const label = subject.charAt(0).toUpperCase() + subject.slice(1).replace(/-/g, " ");
  return {
    topic: `${label} check`,
    prompt: `${yr} ${label}: Choose the most accurate answer for this topic.`,
    choices: [
      "This answer is supported by the topic.",
      "This answer is not related to the topic.",
      "This answer contradicts the topic.",
      "This answer is about a different subject.",
    ],
    correctIndex: 0,
  };
}

export function sanitiseQuestion(q: QuickLevelFinderQuestion, questionIndex: number): QuickLevelFinderQuestion {
  const { subject, strand } = normaliseSubjectStrandForQlf(q.subject, q.strand);
  const normalised: QuickLevelFinderQuestion = subject !== q.subject || strand !== q.strand
    ? { ...q, subject, strand }
    : q;
  if (!questionHasBlockedContent(normalised)) return normalised;
  const fallback = deterministicFallbackPrompt(subject, strand, normalised.yearGroup, questionIndex);
  console.warn(`[qlf-sanitise] Repaired blocked question ${q.id} (${q.yearGroup} ${subject}:${strand ?? "general"})`);
  return {
    ...normalised,
    topic: fallback.topic,
    prompt: fallback.prompt,
    choices: fallback.choices,
    correctIndex: fallback.correctIndex,
  };
}

function questionPromptFor(input: {
  subject: string;
  strand: string | null;
  yearGroup: string;
  keyStage: string;
  difficulty: number;
  index: number;
  subjectIndex: number;
}): { topic: string; prompt: string; choices: string[]; correctIndex: number } {
  const templateSeed = `${input.subject}:${input.strand ?? "general"}:${input.yearGroup}:${input.keyStage}`;
  const yearText = input.yearGroup.replace("Year ", "Year ");
  const strand = input.strand ?? null;

  function withChoices(topic: string, prompt: string, choices: string[], correctIndex = 0) {
    return {
      topic,
      prompt,
      choices,
      correctIndex,
    };
  }

  function pickTemplate(templates: Array<{ topic: string; prompt: string; choices: string[]; correctIndex: number }>) {
    const ordered = shuffleWithSeed(templates, `${templateSeed}:templates`);
    return ordered[input.subjectIndex % ordered.length];
  }

  if (input.subject === "english") {
    if (strand === "reading" || strand === "comprehension" || strand === "vocabulary") {
      const template = pickTemplate([
        {
          topic: "Inference and evidence",
          prompt: `${yearText} English reading: In the sentence "Mia grabbed an umbrella before leaving because clouds were dark," why did Mia take the umbrella?`,
          choices: [
            "She expected rain.",
            "She wanted shade from the sun.",
            "She forgot her coat.",
            "She was carrying books.",
          ],
          correctIndex: 0,
        },
        {
          topic: "Vocabulary and meaning",
          prompt: `${yearText} English reading: What does the word "reluctant" most nearly mean in this context: "He was reluctant to speak in front of the class"?`,
          choices: [
            "Unwilling",
            "Excited",
            "Confused",
            "Prepared",
          ],
          correctIndex: 0,
        },
        {
          topic: "Author intent",
          prompt: `${yearText} English reading: Why might an author end a chapter with a cliffhanger?`,
          choices: [
            "To make the reader want to continue.",
            "To explain every detail immediately.",
            "To shorten the story.",
            "To avoid conflict.",
          ],
          correctIndex: 0,
        },
      ]);
      return withChoices(template.topic, template.prompt, template.choices, template.correctIndex);
    }
    if (strand === "spelling" || strand === "phonics") {
      const template = pickTemplate([
        {
          topic: "Spelling pattern",
          prompt: `${yearText} English spelling: Which spelling is correct?`,
          choices: ["definitely", "definately", "defanitely", "defenetly"],
          correctIndex: 0,
        },
        {
          topic: "Phonics blend",
          prompt: `${yearText} English phonics: Which word contains the "igh" sound?`,
          choices: ["light", "lift", "lint", "list"],
          correctIndex: 0,
        },
      ]);
      return withChoices(template.topic, template.prompt, template.choices, template.correctIndex);
    }
    if (strand === "grammar") {
      const template = pickTemplate([
        {
          topic: "Punctuation",
          prompt: `${yearText} English grammar: Which sentence is punctuated correctly?`,
          choices: [
            "After dinner, we finished our homework.",
            "After dinner we, finished our homework.",
            "After dinner we finished, our homework.",
            "After dinner we finished our homework",
          ],
          correctIndex: 0,
        },
        {
          topic: "Word classes",
          prompt: `${yearText} English grammar: In "The small dog barked loudly," which word is an adverb?`,
          choices: ["loudly", "small", "dog", "barked"],
          correctIndex: 0,
        },
      ]);
      return withChoices(template.topic, template.prompt, template.choices, template.correctIndex);
    }
    if (strand === "writing") {
      const template = pickTemplate([
        {
          topic: "Sentence improvement",
          prompt: `${yearText} English writing: Which revision is clearest? "The boy ran quick to the bus."`,
          choices: [
            "The boy ran quickly to the bus.",
            "The boy run quick to bus.",
            "Boy ran quick bus.",
            "The boy quickly bus ran.",
          ],
          correctIndex: 0,
        },
        {
          topic: "Paragraph structure",
          prompt: `${yearText} English writing: Which sentence works best as a topic sentence for a paragraph about recycling?`,
          choices: [
            "Recycling helps reduce waste and protect the environment.",
            "I have a blue bin.",
            "Plastic bottles are made in factories.",
            "Yesterday was sunny.",
          ],
          correctIndex: 0,
        },
      ]);
      return withChoices(template.topic, template.prompt, template.choices, template.correctIndex);
    }
    if (strand === "speaking-listening") {
      return withChoices(
        "Oracy and explanation",
        `${yearText} Speaking and listening: In a class discussion, which response shows active listening?`,
        [
          "I agree with your point because the text gives similar evidence.",
          "I am right, and everyone else is wrong.",
          "That is boring, next topic.",
          "I was not listening, can we finish?",
        ],
        0,
      );
    }
    const template = pickTemplate([
      {
        topic: "Verb agreement",
        prompt: `${yearText} English: Which sentence uses the correct verb form?`,
        choices: [
          "She has finished her homework.",
          "She have finished her homework.",
          "She finishing her homework.",
          "She finish her homework yesterday.",
        ],
        correctIndex: 0,
      },
      {
        topic: "Tense control",
        prompt: `${yearText} English: Which sentence is in the past tense and grammatically correct?`,
        choices: [
          "They walked to school in the rain.",
          "They walk to school yesterday.",
          "They walking to school yesterday.",
          "They has walked to school.",
        ],
        correctIndex: 0,
      },
      {
        topic: "Sentence accuracy",
        prompt: `${yearText} English: Which sentence is written correctly?`,
        choices: [
          "The children were excited for the trip.",
          "The children was excited for the trip.",
          "The children is excited for the trip yesterday.",
          "The children be excited for the trip.",
        ],
        correctIndex: 0,
      },
      {
        topic: "Modal verbs",
        prompt: `${yearText} English: Which sentence uses a modal verb correctly?`,
        choices: [
          "You should revise your notes before the test.",
          "You should revises your notes before the test.",
          "You should revised your notes before the test.",
          "You should revising your notes before the test.",
        ],
        correctIndex: 0,
      },
      {
        topic: "Clause clarity",
        prompt: `${yearText} English: Which sentence has a clear main clause and correct punctuation?`,
        choices: [
          "Although it was late, we finished the project.",
          "Although it was late we finished, the project.",
          "Although was late, we finished the project.",
          "Although it was late we finished the project",
        ],
        correctIndex: 0,
      },
    ]);
    return withChoices(template.topic, template.prompt, template.choices, template.correctIndex);
  }

  if (input.subject === "maths") {
    const template = pickTemplate([
      {
        topic: input.difficulty >= 4 ? "Reasoning and problem solving" : "Calculation and number",
        prompt: `${yearText} Maths: What is 15% of 200?`,
        choices: ["30", "20", "15", "40"],
        correctIndex: 0,
      },
      {
        topic: input.difficulty >= 4 ? "Algebra reasoning" : "Number patterns",
        prompt: `${yearText} Maths: Solve 3(x - 2) = 18. What is x?`,
        choices: ["8", "6", "10", "12"],
        correctIndex: 0,
      },
      {
        topic: input.difficulty >= 4 ? "Ratio and proportion" : "Fractions and ratio",
        prompt: `${yearText} Maths: A ratio is 2:3 and the total is 25. What is the larger part?`,
        choices: ["15", "10", "12.5", "20"],
        correctIndex: 0,
      },
      {
        topic: input.difficulty >= 4 ? "Geometry and angle reasoning" : "Shape and angle basics",
        prompt: `${yearText} Maths: The angles in a triangle add up to 180. Two angles are 35 and 65. What is the third angle?`,
        choices: ["80", "90", "70", "60"],
        correctIndex: 0,
      },
      {
        topic: input.difficulty >= 4 ? "Data interpretation" : "Statistics basics",
        prompt: `${yearText} Maths: A class scores are 10, 12, 12, 14, 17. What is the median?`,
        choices: ["12", "13", "14", "10"],
        correctIndex: 0,
      },
    ]);
    return withChoices(template.topic, template.prompt, template.choices, template.correctIndex);
  }

  if (input.subject === "science") {
    const template = pickTemplate([
      {
        topic: "Cell biology",
        prompt: `${yearText} Science: Which cell structure controls what enters and leaves the cell?`,
        choices: ["Cell membrane", "Nucleus", "Mitochondria", "Ribosome"],
        correctIndex: 0,
      },
      {
        topic: "Chemical change",
        prompt: `${yearText} Science: Which process is a chemical change?`,
        choices: ["Rusting iron", "Melting ice", "Boiling water", "Cutting paper"],
        correctIndex: 0,
      },
      {
        topic: "Forces",
        prompt: `${yearText} Science: What happens to speed when a constant force acts on an object with little friction?`,
        choices: ["It increases", "It decreases", "It stays zero", "It instantly stops"],
        correctIndex: 0,
      },
      {
        topic: "Energy transfer",
        prompt: `${yearText} Science: Which statement best describes energy transfer in a torch?`,
        choices: ["Chemical energy in the battery becomes light energy.", "Light energy becomes chemical energy.", "Sound energy becomes electrical energy.", "Heat energy becomes mass."],
        correctIndex: 0,
      },
      {
        topic: "States of matter",
        prompt: `${yearText} Science: Which process changes a gas directly into a liquid?`,
        choices: ["Condensation", "Evaporation", "Melting", "Sublimation"],
        correctIndex: 0,
      },
    ]);
    return withChoices(template.topic, template.prompt, template.choices, template.correctIndex);
  }

  if (input.subject === "history") {
    return withChoices(
      input.difficulty >= 4 ? "Source and evidence" : "Historical knowledge",
      `${yearText} History: answer a question about people, events, or evidence.`,
      [
        "Choose the answer best supported by historical evidence.",
        "Choose the answer with the newest date.",
        "Choose the answer with the longest name.",
        "Choose the answer mentioning a king or queen.",
      ],
    );
  }

  if (input.subject === "geography") {
    return withChoices(
      input.difficulty >= 4 ? "Map and climate reasoning" : "Place and environment",
      `${yearText} Geography: answer a question about places, maps, or the environment.`,
      [
        "Choose the option that best matches map evidence and physical processes.",
        "Choose the place with the longest coastline name.",
        "Choose the coldest answer by default.",
        "Choose the option with the most capital letters.",
      ],
    );
  }

  if (input.subject === "computing") {
    return withChoices(
      input.difficulty >= 4 ? "Algorithms and logic" : "Digital basics",
      `${yearText} Computing: choose the best answer about coding, logic, or online safety.`,
      [
        "Choose the step sequence that produces a correct and safe outcome.",
        "Choose the sequence with the most steps.",
        "Choose any sequence that starts with 'if'.",
        "Choose the option with the longest variable name.",
      ],
    );
  }

  if (input.subject === "french" || input.subject === "spanish" || input.subject === "german" || input.subject === "mandarin") {
    const template = pickTemplate([
      {
        topic: "Sentence building",
        prompt: `${yearText} ${input.subject}: What is the best translation of "I am going to school"?`,
        choices: [
          "Je vais a l'ecole.",
          "Je suis a l'ecole hier.",
          "Je va ecole.",
          "Je vais de l'ecole.",
        ],
        correctIndex: 0,
      },
      {
        topic: "Vocabulary",
        prompt: `${yearText} ${input.subject}: What does "bonjour" mean?`,
        choices: ["Hello", "Goodbye", "Thank you", "Please"],
        correctIndex: 0,
      },
      {
        topic: "Grammar",
        prompt: `${yearText} ${input.subject}: Choose the correct phrase for "we have" in French.`,
        choices: ["nous avons", "nous etre", "nous va", "nous suis"],
        correctIndex: 0,
      },
    ]);
    return withChoices(template.topic, template.prompt, template.choices, template.correctIndex);
  }

  if (input.subject === "citizenship-pshe" || input.subject === "pe-health") {
    return withChoices(
      input.difficulty >= 4 ? "Scenario reasoning" : "Core knowledge",
      `${yearText} ${input.subject}: answer a scenario-based question about healthy choices or responsible decisions.`,
      [
        "Choose the option that is safe, respectful, and evidence-based.",
        "Choose the fastest option regardless of risk.",
        "Choose the option with the strongest opinion.",
        "Choose the option with the shortest sentence.",
      ],
    );
  }

  const safe = deterministicFallbackPrompt(input.subject, input.strand, input.yearGroup, input.subjectIndex);
  return withChoices(safe.topic, safe.prompt, safe.choices, safe.correctIndex);
}

export function buildQuestionPlan(input: {
  scopedSubjects: string[];
  count: number;
  yearGroup?: string | null;
  keyStage?: string | null;
  sessionId?: string | null;
}): QuickLevelFinderQuestion[] {
  if (!input.scopedSubjects.length || input.count <= 0) return [];

  const baseDifficulty = difficultyBandForYearGroup(input.yearGroup);
  const subjectPool = shuffleWithSeed(input.scopedSubjects, `${input.sessionId ?? "session"}:subjects:${input.yearGroup ?? "Year 1"}`)
    .map((rawKey) => {
      const { subject, strand } = normalizeSubjectKey(rawKey);
      return normaliseSubjectStrandForQlf(subject, strand);
    });
  const questions: QuickLevelFinderQuestion[] = [];
  const scopeCounts: Record<string, number> = {};

  for (let index = 0; index < input.count; index += 1) {
    const scope = subjectPool[index % subjectPool.length];
    const scopeKey = `${scope.subject}:${scope.strand ?? "general"}`;
    const subjectIndex = scopeCounts[scopeKey] ?? 0;
    scopeCounts[scopeKey] = subjectIndex + 1;
    const difficulty = difficultyForIndex(baseDifficulty, index);
    const promptData = questionPromptFor({
      subject: scope.subject,
      strand: scope.strand,
      yearGroup: input.yearGroup ?? "Year 1",
      keyStage: input.keyStage ?? keyStageForYearGroup(input.yearGroup ?? "Year 1"),
      difficulty,
      index,
      subjectIndex,
    });
    questions.push(sanitiseQuestion({
      id: `qlf-q-${index + 1}`,
      subject: scope.subject,
      strand: scope.strand,
      topic: promptData.topic,
      prompt: promptData.prompt,
      choices: promptData.choices,
      correctIndex: promptData.correctIndex,
      difficulty,
      yearGroup: input.yearGroup ?? "Year 1",
      keyStage: input.keyStage ?? keyStageForYearGroup(input.yearGroup ?? "Year 1"),
    }, index));
  }

  return shuffleWithSeed(questions, `${input.sessionId ?? "session"}:questions:${input.count}`);
}

function levelFromAccuracy(accuracy: number): "below" | "secure" | "advanced" {
  if (accuracy >= 80) return "advanced";
  if (accuracy >= 55) return "secure";
  return "below";
}

function yearOrdinalFromGroup(value: string | null | undefined): number | null {
  const normalized = normalizeYearGroup(value);
  if (!normalized) return null;
  if (normalized === "Reception") return 1;
  const match = normalized.match(/^Year\s+(\d{1,2})$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(1, Math.min(11, Math.round(parsed)));
}

function yearGroupFromOrdinal(value: number): string {
  const clamped = Math.max(1, Math.min(11, Math.round(value)));
  return `Year ${clamped}`;
}

function baseOrdinalFromKeyStage(value: string | null | undefined): number {
  const stage = normalizeKeyStage(value);
  if (stage === "EYFS" || stage === "KS1") return 2;
  if (stage === "KS2") return 5;
  if (stage === "KS3") return 8;
  if (stage === "KS4") return 10;
  return 5;
}

function placementSignalScore(level: QuickLevelFinderLevel): number {
  let score = level.level === "advanced" ? 1 : level.level === "secure" ? 0 : -1;
  if (level.accuracy >= 90) score += 0.5;
  if (level.accuracy <= 25) score -= 0.5;
  return score;
}

function yearShiftFromSignal(signal: number): number {
  if (signal <= -1.1) return -2;
  if (signal <= -0.35) return -1;
  if (signal >= 1.1) return 2;
  if (signal >= 0.35) return 1;
  return 0;
}

export function inferQuickLevelFinderPlacementProfile(input: {
  levels: Record<string, QuickLevelFinderLevel>;
  baselineYearGroup?: string | null;
  baselineKeyStage?: string | null;
}): QuickLevelFinderPlacementProfile | null {
  const levelEntries = Object.values(input.levels ?? {});
  if (!levelEntries.length) return null;

  const signalSum = levelEntries.reduce((total, level) => total + placementSignalScore(level), 0);
  const signalAverage = signalSum / levelEntries.length;

  const baselineOrdinal = yearOrdinalFromGroup(input.baselineYearGroup) ?? baseOrdinalFromKeyStage(input.baselineKeyStage);
  const shiftedOrdinal = baselineOrdinal + yearShiftFromSignal(signalAverage);
  const yearGroup = yearGroupFromOrdinal(shiftedOrdinal);
  const keyStage = keyStageForYearGroup(yearGroup);
  const confidence = Math.max(
    50,
    Math.min(98, Math.round(58 + Math.abs(signalAverage) * 20 + Math.min(levelEntries.length, 8) * 3)),
  );

  return {
    yearGroup,
    keyStage,
    confidence,
  };
}

export function deriveQuickLevelFinderLevels(session: Pick<QuickLevelFinderSession, "responses" | "scopedSubjects">): Record<string, QuickLevelFinderLevel> {
  const aggregate: Record<string, { total: number; correct: number }> = {};

  for (const subject of session.scopedSubjects) {
    aggregate[subject] = { total: 0, correct: 0 };
  }

  for (const response of session.responses) {
    const subject = response.subject;
    if (!aggregate[subject]) {
      aggregate[subject] = { total: 0, correct: 0 };
    }
    aggregate[subject].total += 1;
    if (response.correct) {
      aggregate[subject].correct += 1;
    }
  }

  const levels: Record<string, QuickLevelFinderLevel> = {};
  for (const [subject, stats] of Object.entries(aggregate)) {
    const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
    levels[subject] = {
      accuracy,
      level: levelFromAccuracy(accuracy),
    };
  }

  return levels;
}

export function quickLevelFinderPlacementCompleted(raw: string | null | undefined): boolean {
  const session = parseQuickLevelFinderSession(raw);
  return session?.status === "completed";
}

export function quickLevelFinderResponseCount(raw: string | null | undefined): number {
  const session = parseQuickLevelFinderSession(raw);
  return session?.responses.length ?? 0;
}
