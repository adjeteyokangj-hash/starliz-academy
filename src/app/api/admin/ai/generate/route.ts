import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { getOpenAiApiKey } from "@/lib/api-key-config";
import { validateAiContentQuality } from "@/lib/ai/content-quality";
import { SKILL_MAP, serializeSkills } from "@/lib/skills";
import { parseJsonWithRepair } from "@/lib/safe-json";
import {
  curriculumPathwayForYearGroup,
  GENERATION_CONTENT_TYPE_BY_SUBJECT,
  keyStageForYearGroup,
  normalizeExamBoard,
  normalizeYearGroup as normalizeCurriculumYearGroup,
  shouldApplyExamBoardTag,
  yearGroupsForKeyStage,
  ageGroupForYearGroup,
  isValidCurriculumPath,
  topicSuggestionsForSelection,
  type GenerationType,
  type Subject,
} from "@/lib/curriculum";

const BATCH_SIZE = 12;
const OPENAI_MODEL = "gpt-4o-mini";
const generationCache = new Map<string, { content: unknown; meta: Record<string, unknown> }>();
const generationRateLimit = new Map<string, { count: number; resetAt: number }>();

type PromptType = "spelling" | "maths" | "reading" | "punctuation" | "grammar" | "writing" | "science";

function isSupportedSubject(value: string): value is Subject {
  return Object.prototype.hasOwnProperty.call(GENERATION_CONTENT_TYPE_BY_SUBJECT, value);
}

function normalizeSubjectKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function mapSubjectToGenerationType(subject: Subject): GenerationType {
  return GENERATION_CONTENT_TYPE_BY_SUBJECT[subject];
}

function mapGenerationTypeToPromptType(type: GenerationType): PromptType {
  if (type === "science") return "science";
  if (type === "maths" || type === "exam-practice") return "maths";
  if (type === "reading" || type === "vocabulary" || type === "english-literature") return "reading";
  if (type === "punctuation") return "punctuation";
  if (type === "grammar") return "grammar";
  if (type === "writing" || type === "english-language") return "writing";
  return "spelling";
}

function mapGenerationTypeToValidatorType(type: GenerationType): "spelling" | "phonics" | "punctuation" | "grammar" | "writing" | "reading" | "maths" {
  if (type === "phonics") return "phonics";
  if (type === "spelling") return "spelling";
  if (type === "punctuation") return "punctuation";
  if (type === "grammar") return "grammar";
  if (type === "writing" || type === "english-language") return "writing";
  if (type === "reading" || type === "vocabulary" || type === "english-literature") return "reading";
  return "maths";
}

type GeneratedPreview = {
  title: string;
  subject: Subject;
  keyStage: string;
  yearGroup: string;
  curriculumPathway?: string;
  examBoard?: string | null;
  skillFocus: string;
  difficulty: number;
  topic: string;
  status: "draft";
  safetyStatus: "passed";
  qualityScore: number;
  voiceScript: string;
  imagePrompt: string;
  items: unknown[];
  metadata: {
    generationType: GenerationType;
    promptType: PromptType;
    parser: "reading-object" | "array-items";
  };
  curriculumContext: {
    pathway: string;
    examBoard: string | null;
    keyStage: string;
    yearGroup: string;
    subject: Subject;
    skillFocus: string;
    topic: string;
  };
};

const SYSTEM_PROMPT: Record<PromptType, string> = {
  spelling: `You are a UK phonics-and-spelling curriculum engine for England (Reception-Year 11 support where relevant).
Generate curriculum-grade spelling content using UK primary expectations.
Support phonics patterns, common exception words, suffixes, prefixes, silent letters, homophones and age-appropriate vocabulary.
For phonics phases, enforce progression strictly:
- Phase 2: simple VC/CVC words only (sat, pin, tap, cat, dog, mop, run)
- Phase 3: basic digraph/trigraph words (ship, chat, teeth, rain)
- Phase 4: adjacent consonants/blends (stop, clap, swim)
- Phase 5: split digraphs and alternative vowel sounds (make, bike, rope, tune)
Never include higher-phase words in lower phases.
Return a JSON array. Each item must follow this schema exactly:
{ "id": string, "word": string, "hint": string, "sentenceContext": string, "categoryHint": string, "syllables": string, "emoji": string, "yearGroup": string, "skillFocus": string, "phonicsStage": string | null, "difficulty": number }
Content type lock: spelling must not generate maths questions, number problems, reading passages, or comprehension questions.
Return ONLY valid JSON — no explanation, no markdown.`,

  maths: `You are a UK curriculum content creator for England.
Generate curriculum-grade KS1/KS2 maths questions.
Difficulty must increase by year group and level.
Return a JSON array. Each item must follow this schema exactly:
{ "id": string, "question": string, "answer": number, "explanation": string, "choices": number[], "yearGroup": string, "skillFocus": string, "difficulty": number, "topic": string }
Content type lock: maths must not generate spelling word lists or reading passages.
Return ONLY valid JSON — no explanation, no markdown.`,

  science: `You are a UK science curriculum content creator for England.
Generate curriculum-grade science questions for KS3/KS4 and GCSE pathway where requested.
For GCSE pathway (Years 10-11), support Biology, Chemistry, Physics and Combined Science framing.
Include exam-board-aware wording only when exam board is provided (AQA, OCR, Edexcel), and do not claim official approval.
Return a JSON array. Each item must follow this schema exactly:
{ "id": string, "question": string, "answer": string, "explanation": string, "choices": string[], "yearGroup": string, "skillFocus": string, "difficulty": number, "topic": string }
Content type lock: science must not generate spelling lists or unrelated reading passages.
Return ONLY valid JSON — no explanation, no markdown.`,

  reading: `You are a UK curriculum content creator for England.
Generate age-appropriate reading content.
Return a JSON object. It must follow this schema exactly:
{ "id": string, "title": string, "passage": string, "vocabularyWords": string[], "questions": [{ "question": string, "answer": string, "options": string[] }], "answers": string[], "yearGroup": string, "skillFocus": string, "difficulty": number }
Content type lock: reading must not generate spelling word lists, maths questions, or unrelated content.
Return ONLY valid JSON — no explanation, no markdown.`,

  punctuation: `You are a UK punctuation practice generator.
Return a JSON array of punctuation question items.
Each item must follow this schema exactly:
{ "id": string, "question": string, "answer": string, "options": string[], "explanation": string, "hint": string, "yearGroup": string, "skillFocus": string, "difficulty": number }
Content type lock: punctuation must not return spelling word lists or maths questions.
Return ONLY valid JSON — no explanation, no markdown.`,

  grammar: `You are a UK grammar practice generator.
Return a JSON array of grammar question items.
Each item must follow this schema exactly:
{ "id": string, "question": string, "answer": string, "options": string[], "explanation": string, "hint": string, "yearGroup": string, "skillFocus": string, "difficulty": number }
Content type lock: grammar must not return spelling word lists or maths questions.
Return ONLY valid JSON — no explanation, no markdown.`,

  writing: `You are a UK writing practice generator.
Return a JSON array of writing task items.
Each item must follow this schema exactly:
{ "id": string, "prompt": string, "answer": string, "options": string[], "explanation": string, "hint": string, "yearGroup": string, "skillFocus": string, "difficulty": number }
Content type lock: writing must not return spelling-only word lists or maths questions.
Return ONLY valid JSON — no explanation, no markdown.`,
};

function cleanTopic(topic: string, type: PromptType) {
  if (type === "spelling") {
    return topic.replace(/fractions?|maths?|mathematics|numbers?|addition|subtraction|multiplication|division/gi, "").replace(/\s+/g, " ").trim();
  }
  if (type === "maths") {
    return topic.replace(/spelling|phonics|silent e|reading passage|comprehension/gi, "").replace(/\s+/g, " ").trim();
  }
  if (type === "reading") {
    return topic.replace(/spelling words?|maths? questions?|fractions?/gi, "").replace(/\s+/g, " ").trim();
  }
  return topic.trim();
}

function normalizeYearGroup(yearGroup: string, keyStage: string) {
  const normalized = normalizeCurriculumYearGroup(yearGroup);
  if (normalized) return normalized;
  const options = yearGroupsForKeyStage(keyStage);
  return options[0] ?? "Year 1";
}

function buildUserPrompt(
  type: PromptType,
  subject: Subject,
  level: number,
  topic: string,
  ageGroup: string,
  count: number,
  keyStage: string,
  yearGroup: string,
  skillFocus: string,
  examBoard?: string | null,
  excludeWords: string[] = [],
  targetSkills: string[] = [],
  weakAreas: string[] = [],
): string {
  const skillInstruction = targetSkills.length
    ? `\nSKILL TARGETING: Focus content on these skills: ${targetSkills.join(", ")}.`
    : "";
  const weakInstruction = weakAreas.length
    ? `\nWEAK AREAS: The student struggles with: ${weakAreas.join(", ")}. Include supportive practice for these.`
    : "";
  const cleanedTopic = cleanTopic(topic, type);
  const followUpInstruction = /focus practice/i.test(topic)
    ? `

FOLLOW-UP PRACTICE:
- The student struggled with: ${topic}
- Generate targeted practice focused on the same pattern.
- Use similar word/question patterns, but do not duplicate the exact weak words unless needed for one review item.
- Keep wording encouraging and parent-friendly.`
    : "";
  const safeYearGroup = normalizeYearGroup(yearGroup || ageGroup, keyStage);
  if (subject === "punctuation") {
    return `Generate ${count} UK Year ${safeYearGroup.replace("Year ", "")} punctuation practice items.
Selection context:
- Key stage: ${keyStage}
- Year group: ${safeYearGroup}
- Subject: punctuation
- Skill focus: ${skillFocus || "Commas in lists"}
- Topic/theme: ${cleanedTopic || skillFocus || "punctuation practice"}
- Difficulty range: 1-5, selected ${level}

Expected content type:
- sentence editing and multiple-choice punctuation questions

Question format:
- short prompt sentence or mini-context
- include one clear punctuation target

Answer format:
- include a correct answer string and a brief explanation

Safety rules:
- age-appropriate school-safe language
- no harmful, violent, or adult themes

Curriculum note:
- keep examples aligned with UK KS2 punctuation expectations for the selected skill

Return JSON array only using this schema:
{
  "id": string,
  "question": string,
  "answer": string,
  "options": string[],
  "explanation": string,
  "hint": string,
  "yearGroup": "${safeYearGroup}",
  "skillFocus": "${skillFocus}",
  "difficulty": ${level}
}${skillInstruction}${weakInstruction}${followUpInstruction}`;
  }

  if (type === "spelling") {
    const stageLower = (skillFocus || "").toLowerCase();
    const phonicsInstruction = stageLower.startsWith("phase 2")
      ? "- Phase 2 strict rule: only simple VC/CVC words. No split digraphs, no magic-e, no advanced vowel teams."
      : stageLower.startsWith("phase 3")
        ? "- Phase 3 strict rule: use basic digraph/trigraph words only (e.g. sh/ch/th/ng/ai/ee/oa)."
        : stageLower.startsWith("phase 4")
          ? "- Phase 4 strict rule: include adjacent consonants/blends (e.g. stop, clap, swim)."
          : stageLower.startsWith("phase 5")
            ? "- Phase 5 strict rule: allow split digraphs and alternative vowel sounds."
            : "";
    return `
You are generating UK KS1 spelling content.

STRICT RULES:
- Key stage: ${keyStage}
- Year group: ${safeYearGroup}
- Skill focus: ${skillFocus || "Silent e"}
- Difficulty: ${level}
- Theme: ${cleanedTopic || skillFocus || "silent e"}
- All words MUST follow the skill exactly
- For "Silent e": every word MUST end with "e" and follow vowel-consonant-e pattern (examples: make, bike, rope)
- ${phonicsInstruction || "Match selected spelling progression exactly."}
- DO NOT include words like sneak, climb, bread, or any irregular patterns
- NO duplicates
- Avoid these words: ${excludeWords.join(", ") || "none"}
- Do not return maths questions, fractions, number problems, reading passages, or explanations${skillInstruction}${weakInstruction}

OUTPUT:
- ${count} items EXACTLY
- JSON array only

Each item must include:
{
  "id": string,
  "word": string,
  "hint": string,
  "sentenceContext": string,
  "categoryHint": string,
  "syllables": string,
  "emoji": string,
  "yearGroup": "${safeYearGroup}",
  "skillFocus": "${skillFocus || "Silent e"}",
  "difficulty": ${level}
}${followUpInstruction}`.trim();
  }
  if (type === "maths") {
    return `Generate ${count} KS1/KS2-style maths questions for ${keyStage}, ${safeYearGroup}, difficulty ${level}.
Skill focus: ${skillFocus || "Number bonds"}.
Topic: ${cleanedTopic || skillFocus || "mixed arithmetic"}.
Include answers and multiple choice options.
Difficulty must increase appropriately for the selected year group and level.
Return JSON with: id, question, answer, explanation, choices, yearGroup, skillFocus, difficulty and topic.
Do not return spelling words or reading passages.${skillInstruction}${weakInstruction}${followUpInstruction}`;
  }
  if (type === "science") {
    const isGcse = safeYearGroup === "Year 10" || safeYearGroup === "Year 11" || keyStage === "KS4";
    const boardLine = isGcse
      ? `Exam board context: ${examBoard || "general GCSE (no board selected)"}.`
      : "Exam board context: not required for this stage.";
    return `Generate ${count} UK science questions for ${keyStage}, ${safeYearGroup}, difficulty ${level}.
Subject: ${subject}.
Skill focus: ${skillFocus || "Scientific reasoning"}.
Topic: ${cleanedTopic || skillFocus || "science practice"}.
${boardLine}
${isGcse ? "GCSE mode guidance: include exam technique, structured response clarity, and calculation interpretation when relevant." : "KS3 mode guidance: keep explanations concise and concept-focused."}
Return JSON array with: id, question, answer, explanation, choices, yearGroup, skillFocus, difficulty, topic.
Do not return spelling word lists, unrelated reading passages, or non-science content.${skillInstruction}${weakInstruction}${followUpInstruction}`;
  }
  if (type === "punctuation") {
    return `Generate ${count} UK punctuation practice items for ${keyStage}, ${safeYearGroup}, difficulty ${level}.
Skill focus: ${skillFocus || "Sentence punctuation"}.
Topic/theme: ${cleanedTopic || skillFocus || "punctuation practice"}.
Return JSON array with: id, question, answer, options, explanation, hint, yearGroup, skillFocus, difficulty.
Do not return spelling word lists, reading passages, or maths questions.${skillInstruction}${weakInstruction}${followUpInstruction}`;
  }
  if (type === "grammar") {
    return `Generate ${count} UK grammar practice items for ${keyStage}, ${safeYearGroup}, difficulty ${level}.
Skill focus: ${skillFocus || "Grammar accuracy"}.
Topic/theme: ${cleanedTopic || skillFocus || "grammar practice"}.
Return JSON array with: id, question, answer, options, explanation, hint, yearGroup, skillFocus, difficulty.
Do not return spelling-only word lists, reading passages, or maths questions.${skillInstruction}${weakInstruction}${followUpInstruction}`;
  }
  if (type === "writing") {
    return `Generate ${count} UK writing practice tasks for ${keyStage}, ${safeYearGroup}, difficulty ${level}.
Skill focus: ${skillFocus || "Sentence composition"}.
Topic/theme: ${cleanedTopic || skillFocus || "writing practice"}.
Return JSON array with: id, prompt, answer, options, explanation, hint, yearGroup, skillFocus, difficulty.
Do not return isolated spelling word lists or maths questions.${skillInstruction}${weakInstruction}${followUpInstruction}`;
  }
  if (type === "reading") {
    return `Generate a short reading passage for ${keyStage}, ${safeYearGroup}, difficulty ${level}.
Skill focus: ${skillFocus || "Retrieval questions"}.
Theme/topic: ${cleanedTopic || "friendly adventure"}.
Include comprehension questions.
Return JSON with: id, title, passage, vocabularyWords, questions, answers, yearGroup, skillFocus and difficulty.
Do not return spelling word lists or maths questions.${skillInstruction}${weakInstruction}${followUpInstruction}`;
  }
  return "";
}

async function requestOpenAiJson(apiKey: string, systemPrompt: string, userPrompt: string) {
  const openAIResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 2000,
    }),
  });

  const rawProviderBody = await openAIResponse.text();
  const providerPayload = parseJsonWithRepair<Record<string, unknown>>(rawProviderBody);
  if (!openAIResponse.ok) {
    console.error("OpenAI error:", rawProviderBody);
    throw new Error(`OpenAI request failed with status ${openAIResponse.status}`);
  }
  if (!providerPayload.success) {
    throw new Error("OpenAI returned a non-JSON payload.");
  }

  const choices = providerPayload.data.choices as Array<{ message?: { content?: string } }> | undefined;
  const rawContent = choices?.[0]?.message?.content ?? "";
  if (!String(rawContent).trim()) {
    throw new Error("OpenAI returned an empty content payload.");
  }

  const repaired = parseJsonWithRepair(rawContent);
  if (!repaired.success) {
    throw new Error(`Generation failed due to malformed AI output. Stages: ${repaired.diagnostics.stagesTried.join(" -> ")}`);
  }

  return {
    rawContent,
    parsed: repaired.data,
    repairDiagnostics: repaired.diagnostics,
  };
}

function estimateCost(count: number) {
  const tokensPerItem = 60;
  const totalTokens = count * tokensPerItem;
  const estimatedCost = (totalTokens / 1000) * 0.002;
  return {
    estimatedTokens: totalTokens,
    estimatedCostPence: Math.max(1, Math.round(estimatedCost * 100)),
  };
}

async function writeAuditLogSafely(input: Parameters<typeof writeAuditLog>[0]) {
  try {
    await writeAuditLog(input);
  } catch (error) {
    console.error("Failed to write AI generation audit log:", error);
  }
}

function cacheKey(input: Record<string, unknown>) {
  return JSON.stringify(input);
}

function checkGenerationRateLimit(adminId: string) {
  const now = Date.now();
  const current = generationRateLimit.get(adminId);
  if (!current || current.resetAt < now) {
    generationRateLimit.set(adminId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= 12) return false;
  current.count += 1;
  return true;
}

function readingObjectToItems(value: unknown): unknown[] {
  const data = value as Record<string, unknown>;
  const questions = Array.isArray(data.questions) ? data.questions : [];
  return questions.map((question, index) => {
    const q = question as Record<string, unknown>;
    const answer = String(q.answer ?? "");
    const options = Array.isArray(q.options) ? q.options.map((option) => String(option)) : [];
    return {
      id: String(data.id ?? `reading-${index + 1}`) + `-${index + 1}`,
      type: "reading",
      passage: String(data.passage ?? ""),
      prompt: String(q.question ?? ""),
      question: String(q.question ?? ""),
      answer,
      options: Array.from(new Set([...options, answer])).filter(Boolean),
      explanation: "The answer is found in the passage.",
      hint: "Re-read the passage and look for matching words.",
      yearGroup: String(data.yearGroup ?? ""),
      skillFocus: String(data.skillFocus ?? ""),
      difficulty: Number(data.difficulty ?? 1),
    };
  });
}

function normalizePreviewItems(
  generationType: GenerationType,
  promptType: PromptType,
  sourceSubject: Subject,
  content: unknown,
  metadata: { yearGroup: string; skillFocus: string; difficulty: number; topic: string },
): unknown[] {
  if (promptType === "reading" && !Array.isArray(content) && content && typeof content === "object") {
    return readingObjectToItems(content).map((item) => ({
      ...(item as Record<string, unknown>),
      yearGroup: metadata.yearGroup,
      skillFocus: metadata.skillFocus,
      difficulty: metadata.difficulty,
    }));
  }
  const records = Array.isArray(content) ? content : content && typeof content === "object" ? [content] : [];
  return records.map((item, index) => {
    const data = item as Record<string, unknown>;
    if (generationType === "punctuation" || generationType === "grammar" || generationType === "writing" || generationType === "english-language") {
      return {
        ...data,
        id: String(data.id ?? `lang-${index + 1}`),
        type: generationType,
        yearGroup: metadata.yearGroup,
        skillFocus: metadata.skillFocus,
        difficulty: metadata.difficulty,
        prompt: String(data.prompt ?? data.question ?? data.sentence ?? ""),
        question: String(data.question ?? data.prompt ?? ""),
        answer: String(data.answer ?? ""),
        options: Array.isArray(data.options) ? data.options : [],
        sentence: String(data.sentence ?? data.sentenceContext ?? ""),
        explanation: String(data.explanation ?? "Explain the language choice clearly."),
        hint: String(data.hint ?? "Read the sentence and apply the selected language skill."),
      };
    }

    if (generationType === "spelling" || generationType === "phonics") {
      return {
        ...data,
        type: generationType,
        yearGroup: metadata.yearGroup,
        skillFocus: metadata.skillFocus,
        difficulty: metadata.difficulty,
        prompt: String(data.word ?? ""),
        answer: String(data.word ?? ""),
        sentence: String(data.sentenceContext ?? data.sentence ?? ""),
        explanation: String(data.explanation ?? `Practise the ${data.skillFocus ?? "spelling"} pattern.`),
        hint: String(data.hint ?? "Listen carefully and think about the sounds."),
      };
    }

    if (generationType === "science") {
      return {
        ...data,
        type: generationType,
        yearGroup: metadata.yearGroup,
        skillFocus: metadata.skillFocus,
        difficulty: metadata.difficulty,
        topic: metadata.topic || metadata.skillFocus || String(data.topic ?? "science"),
        prompt: String(data.prompt ?? data.question ?? ""),
        question: String(data.question ?? data.prompt ?? ""),
        answer: String(data.answer ?? ""),
        options: Array.isArray(data.choices)
          ? data.choices.map((value) => String(value))
          : Array.isArray(data.options)
            ? data.options.map((value) => String(value))
            : [],
        explanation: String(data.explanation ?? "Use scientific evidence and method to justify your answer."),
        hint: String(data.hint ?? "Identify key command words and use precise scientific vocabulary."),
      };
    }

    if (promptType === "maths") {
      return {
        ...data,
        type: generationType,
        yearGroup: metadata.yearGroup,
        skillFocus: metadata.skillFocus,
        difficulty: metadata.difficulty,
        topic: metadata.topic || metadata.skillFocus || String(data.topic ?? "maths"),
        prompt: String(data.prompt ?? data.question ?? ""),
        question: String(data.question ?? data.prompt ?? ""),
        answer: data.answer,
        options: Array.isArray(data.choices) ? data.choices : Array.isArray(data.options) ? data.options : [],
        explanation: String(data.explanation ?? "Use the steps to solve the problem."),
        hint: String(data.hint ?? "Break the question into smaller parts."),
      };
    }

    return {
      ...data,
      id: String(data.id ?? `reading-${index + 1}`),
      type: sourceSubject,
      yearGroup: metadata.yearGroup,
      skillFocus: metadata.skillFocus,
      difficulty: metadata.difficulty,
    };
  });
}

function buildGeneratedPreview({
  subject,
  generationType,
  promptType,
  keyStage,
  yearGroup,
  curriculumPathway,
  examBoard,
  skillFocus,
  difficulty,
  topic,
  content,
}: {
  subject: Subject;
  generationType: GenerationType;
  promptType: PromptType;
  keyStage: string;
  yearGroup: string;
  curriculumPathway: string;
  examBoard: string | null;
  skillFocus: string;
  difficulty: number;
  topic: string;
  content: unknown;
}): GeneratedPreview {
  const items = normalizePreviewItems(generationType, promptType, subject, content, { yearGroup, skillFocus, difficulty, topic });
  const safeTopic = topic || skillFocus || generationType;
  const titleSuffix = promptType === "maths" ? "questions" : promptType === "science" ? "science set" : promptType === "reading" ? "reading set" : "practice";
  return {
    title: `${yearGroup} ${skillFocus || subject} ${titleSuffix}`,
    subject,
    keyStage,
    yearGroup,
    curriculumPathway,
    examBoard,
    skillFocus,
    difficulty,
    topic: safeTopic,
    status: "draft",
    safetyStatus: "passed",
    qualityScore: Math.min(100, Math.max(70, 82 + Math.min(12, items.length))),
    voiceScript: `Today we are practising ${skillFocus || subject}. Listen carefully, try your best, and use hints when you need them.`,
    imagePrompt: `Friendly UK curriculum illustration for ${yearGroup} ${subject} lesson about ${safeTopic}. Bright, safe, learner-friendly style.`,
    items,
    metadata: {
      generationType,
      promptType,
      parser: promptType === "reading" ? "reading-object" : "array-items",
    },
    curriculumContext: {
      pathway: curriculumPathway,
      examBoard,
      keyStage,
      yearGroup,
      subject,
      skillFocus,
      topic: safeTopic,
    },
  };
}

function buildFallbackPreview(input: {
  subject: Subject;
  generationType: GenerationType;
  promptType: PromptType;
  keyStage: string;
  yearGroup: string;
  curriculumPathway: string;
  examBoard: string | null;
  skillFocus: string;
  difficulty: number;
  topic: string;
  reason: string;
}): GeneratedPreview {
  const safeTopic = input.topic || input.skillFocus || input.subject;
  const placeholderItem = {
    id: "fallback-preview-1",
    type: input.generationType,
    prompt: `${input.skillFocus || "Practice"}: preview unavailable`,
    question: `${input.skillFocus || "Practice"}: preview unavailable`,
    answer: "Awaiting regenerated content",
    options: ["Retry generation", "Adjust skill focus", "Select another topic"],
    explanation: `Automatic fallback preview shown. Reason: ${input.reason}`,
    hint: "Use admin diagnostics and retry after adjusting topic, skill focus, or exam board.",
    yearGroup: input.yearGroup,
    skillFocus: input.skillFocus,
    difficulty: input.difficulty,
    topic: safeTopic,
    status: "pending",
  };

  return {
    title: `${input.yearGroup} ${input.skillFocus || input.subject} fallback preview`,
    subject: input.subject,
    keyStage: input.keyStage,
    yearGroup: input.yearGroup,
    curriculumPathway: input.curriculumPathway,
    examBoard: input.examBoard,
    skillFocus: input.skillFocus,
    difficulty: input.difficulty,
    topic: safeTopic,
    status: "draft",
    safetyStatus: "passed",
    qualityScore: 40,
    voiceScript: `We could not complete generation for ${input.skillFocus || input.subject}. Please review diagnostics and retry.`,
    imagePrompt: `Educational placeholder card for ${input.yearGroup} ${input.subject} ${safeTopic}.`,
    items: [placeholderItem],
    metadata: {
      generationType: input.generationType,
      promptType: input.promptType,
      parser: input.promptType === "reading" ? "reading-object" : "array-items",
    },
    curriculumContext: {
      pathway: input.curriculumPathway,
      examBoard: input.examBoard,
      keyStage: input.keyStage,
      yearGroup: input.yearGroup,
      subject: input.subject,
      skillFocus: input.skillFocus,
      topic: safeTopic,
    },
  };
}

function normalizeSpellingItems(items: unknown[], yearGroup: string, skillFocus: string, level: number, topic: string) {
  return items.map((item, index) => {
    const data = item as Record<string, unknown>;
    const word = String(data.word ?? "").trim().toLowerCase();
    const categoryHint = String(data.categoryHint ?? "").trim() || topic || skillFocus || "general";
    return {
      ...data,
      id: String(data.id ?? `spell-${level}-${word || index + 1}`),
      word,
      hint: String(data.hint ?? "").trim(),
      sentenceContext: String(data.sentenceContext ?? "").trim(),
      categoryHint,
      syllables: String(data.syllables ?? "1").trim(),
      emoji: String(data.emoji ?? "🔤").trim(),
      yearGroup,
      skillFocus,
      difficulty: level,
    };
  });
}

function isSilentEFocus(skillFocus: string): boolean {
  return /silent\s*-?\s*e/i.test(skillFocus);
}

function hardCleanSpellingItems(items: unknown[], skillFocus: string): {
  cleaned: unknown[];
  removedWords: string[];
  fixesApplied: string[];
} {
  const seen = new Set<string>();
  const cleaned: unknown[] = [];
  const removedWords: string[] = [];
  const fixesApplied: string[] = [];
  const enforceSilentE = isSilentEFocus(skillFocus);

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const data = item as Record<string, unknown>;
    const key = String(data.word ?? "").trim().toLowerCase();
    if (!key) continue;

    if (seen.has(key)) {
      removedWords.push(key);
      fixesApplied.push(`Removed duplicate: ${key}`);
      continue;
    }

    if (enforceSilentE && !key.endsWith("e")) {
      removedWords.push(key);
      fixesApplied.push(`Removed non silent-e word: ${key}`);
      continue;
    }

    seen.add(key);
    cleaned.push({ ...data, word: key });
  }

  return { cleaned, removedWords, fixesApplied };
}

async function generateValidatedSpellingContent({
  apiKey,
  systemPrompt,
  generationType,
  level,
  topic,
  ageGroup,
  count,
  keyStage,
  yearGroup,
  skillFocus,
}: {
  apiKey: string;
  systemPrompt: string;
  generationType: "spelling" | "phonics";
  level: number;
  topic: string;
  ageGroup: string;
  count: number;
  keyStage: string;
  yearGroup: string;
  skillFocus: string;
}) {
  const safeYearGroup = normalizeYearGroup(yearGroup || ageGroup, keyStage);
  const collected: unknown[] = [];
  const excludeWords = new Set<string>();
  const errors = new Set<string>();
  const fixesApplied = new Set<string>();
  const removedWords = new Set<string>();
  let regeneratedCount = 0;
  let lastPrompt = "";

  for (let attempt = 0; attempt < 4 && collected.length < count; attempt += 1) {
    const needed = count - collected.length;
    lastPrompt = buildUserPrompt("spelling", "spelling", level, topic, ageGroup, needed, keyStage, safeYearGroup, skillFocus, null, Array.from(excludeWords));
    const { parsed } = await requestOpenAiJson(apiKey, systemPrompt, lastPrompt);
    const incoming = Array.isArray(parsed) ? parsed : [];
    const combined = [...collected, ...incoming];
    const quality = validateAiContentQuality({
      type: generationType,
      skillFocus,
      requestedCount: count,
      items: combined,
      mode: "repair",
    });

    if (!quality.ok || !Array.isArray(quality.cleanedItems)) {
      throw new Error(quality.error ?? `No valid ${generationType} content remained after validation.`);
    }

    const normalized = normalizeSpellingItems(quality.cleanedItems, safeYearGroup, skillFocus, level, topic);
    const hardCleaned = hardCleanSpellingItems(normalized, skillFocus);
    for (const fix of hardCleaned.fixesApplied) fixesApplied.add(fix);
    for (const word of hardCleaned.removedWords) removedWords.add(word);
    const cleaned = hardCleaned.cleaned;
    collected.length = 0;
    collected.push(...cleaned.slice(0, count));

    for (const item of cleaned) {
      const word = String((item as Record<string, unknown>).word ?? "").trim().toLowerCase();
      if (word) excludeWords.add(word);
    }

    for (const error of quality.meta?.errors ?? []) errors.add(error);
    for (const fix of quality.meta?.fixesApplied ?? []) fixesApplied.add(fix);
    for (const word of quality.meta?.removedWords ?? []) removedWords.add(word);
    if (attempt > 0 && cleaned.length > regeneratedCount) {
      regeneratedCount += needed;
    }
  }

  const finalClean = hardCleanSpellingItems(collected, skillFocus);
  if (finalClean.cleaned.length < count) {
    throw new Error(`Unable to generate ${count} valid ${skillFocus || "spelling"} items after auto-repair.`);
  }
  for (const fix of finalClean.fixesApplied) fixesApplied.add(fix);
  for (const word of finalClean.removedWords) removedWords.add(word);

  return {
    content: finalClean.cleaned.slice(0, count),
    prompt: lastPrompt,
    validation: {
      valid: true,
      repaired: errors.size > 0 || fixesApplied.size > 0,
      errors: Array.from(errors),
      fixesApplied: [
        ...Array.from(fixesApplied),
        ...(regeneratedCount > 0 ? [`Regenerated ${regeneratedCount} replacement ${regeneratedCount === 1 ? "word" : "words"}`] : []),
      ],
      removedWords: Array.from(removedWords),
      regeneratedCount,
      requestedCount: count,
      finalCount: count,
    },
  };
}

export async function POST(req: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  if (!checkGenerationRateLimit(session.userId)) {
    return NextResponse.json({ success: false, error: "AI generation limit reached. Please wait a minute before trying again." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({
      success: false,
      error: "Invalid JSON payload for AI generation request.",
      details: { category: "validation", stage: "request-body" },
    }, { status: 400 });
  }
  const requestedSubject = (body.subject ?? body.type) as string;
  const normalizedSubject = normalizeSubjectKey(String(requestedSubject ?? ""));
  if (!isSupportedSubject(normalizedSubject)) {
    return NextResponse.json({
      success: false,
      error: `Unsupported subject: ${requestedSubject || "(empty)"}.`,
      details: {
        category: "unsupported_subject",
        supportedSubjects: Object.keys(GENERATION_CONTENT_TYPE_BY_SUBJECT),
      },
    }, { status: 422 });
  }
  const sourceSubject = normalizedSubject as Subject;
  const requestedCount = body.numberOfItems ?? body.count;
  const requestedLevel = body.difficulty ?? body.level;
  const rawYearGroup = typeof body.yearGroup === "string" ? body.yearGroup : "Year 1";

  const generationType = mapSubjectToGenerationType(sourceSubject);
  const promptType = mapGenerationTypeToPromptType(generationType);
  const validatorType = mapGenerationTypeToValidatorType(generationType);
  const level = typeof requestedLevel === "number" ? requestedLevel : Number(requestedLevel);
  const topic = typeof body.topic === "string" ? body.topic : "";
  const ageGroup = typeof body.ageGroup === "string" ? body.ageGroup : ageGroupForYearGroup(rawYearGroup);
  const count = Math.max(1, Math.min(30, Number(requestedCount ?? BATCH_SIZE)));
  const keyStage = typeof body.keyStage === "string" ? body.keyStage : "KS1";
  const yearGroup = typeof body.yearGroup === "string" ? body.yearGroup : "";
  const requestedCurriculumPathway = typeof body.curriculumPathway === "string"
    ? body.curriculumPathway
    : curriculumPathwayForYearGroup(yearGroup);
  const requestedExamBoard = typeof body.examBoard === "string" ? body.examBoard : null;
  const skillFocus = typeof body.skillFocus === "string" ? body.skillFocus : "";
  // Skill-first targeting
  const targetSkills: string[] = Array.isArray(body.targetSkills) ? (body.targetSkills as string[]) : [];
  const weakAreas: string[] = Array.isArray(body.weakAreas) ? (body.weakAreas as string[]) : [];
  // If targetSkills provided, derive skillFocus label from the first one
  const resolvedSkillFocus = skillFocus || (targetSkills.length ? (SKILL_MAP[targetSkills[0]]?.label ?? targetSkills[0]) : "");

  const maxLevel = 5;
  const safeLevel = Math.max(1, Math.min(maxLevel, Number.isFinite(level) ? level : 1));
  const safeYearGroup = normalizeYearGroup(yearGroup || ageGroup, keyStage);
  const safeKeyStage = keyStageForYearGroup(safeYearGroup);
  const safeCurriculumPathway = requestedCurriculumPathway || curriculumPathwayForYearGroup(safeYearGroup);
  const safeExamBoard = shouldApplyExamBoardTag({
    yearGroup: safeYearGroup,
    keyStage: safeKeyStage,
    curriculumPathway: safeCurriculumPathway,
    subject: sourceSubject,
  }) ? normalizeExamBoard(requestedExamBoard) : null;

  const pathValidation = isValidCurriculumPath({
    yearGroup: safeYearGroup,
    subject: sourceSubject,
    skillFocus: resolvedSkillFocus,
    topic: topic,
  });
  if (!pathValidation.ok) {
    const mappedTopics = topicSuggestionsForSelection({
      yearGroup: safeYearGroup,
      subject: sourceSubject,
      skillFocus: resolvedSkillFocus,
    });
    return NextResponse.json({
      success: false,
      error: pathValidation.reason,
      details: {
        category: "unsupported_path",
        yearGroup: safeYearGroup,
        keyStage: safeKeyStage,
        subject: sourceSubject,
        pathway: safeCurriculumPathway,
        examBoard: safeExamBoard,
        skillFocus: resolvedSkillFocus,
        mappedTopics,
      },
    }, { status: 422 });
  }

  const apiKey = await getOpenAiApiKey();
  if (!apiKey) {
    return NextResponse.json({
      success: false,
      error: "OpenAI API key not configured. Save it in Admin Settings > API Keys.",
      details: {
        category: "missing_env",
        stage: "provider-config",
      },
    }, { status: 503 });
  }

  const generationDiagnostics = {
    yearGroup: safeYearGroup,
    keyStage: safeKeyStage,
    subject: sourceSubject,
    pathway: safeCurriculumPathway,
    examBoard: safeExamBoard,
    skillFocus: resolvedSkillFocus,
    generationType,
    promptBuilder: promptType,
    parserUsed: promptType === "reading" ? "reading-object" : "array-items",
  };
  console.info("[admin-ai-generate]", generationDiagnostics);

  const requestKey = cacheKey({ generationType, promptType, level, topic, ageGroup, count, keyStage: safeKeyStage, yearGroup: safeYearGroup, curriculumPathway: safeCurriculumPathway, examBoard: safeExamBoard, skillFocus });
  const cached = generationCache.get(requestKey);
  if (cached) {
    const cachedValidation = (cached.meta.validation ?? {}) as Record<string, unknown>;
    return NextResponse.json({
      success: true,
      type: promptType,
      generationType,
      level,
      topic,
      keyStage: safeKeyStage,
      yearGroup: safeYearGroup,
      curriculumPathway: safeCurriculumPathway,
      examBoard: safeExamBoard,
      skillFocus,
      model: OPENAI_MODEL,
      prompt: cached.meta.prompt,
      estimatedCostPence: cached.meta.estimatedCostPence,
      estimatedTokens: cached.meta.estimatedTokens,
      content: cached.content,
      meta: { ...cachedValidation, cached: true },
    });
  }

  const userPrompt = buildUserPrompt(promptType, sourceSubject, safeLevel, topic, ageGroup, count, safeKeyStage, safeYearGroup, resolvedSkillFocus, safeExamBoard, [], targetSkills, weakAreas);
  const systemPrompt = SYSTEM_PROMPT[promptType];

  try {
    let parsed: unknown;
    let promptUsed = userPrompt;
    let validation: Record<string, unknown> = { valid: true, repaired: false, errors: [], fixesApplied: [], removedWords: [], regeneratedCount: 0, requestedCount: count, finalCount: count };

    const strictSpellingValidation = generationType === "spelling" || generationType === "phonics";
    if (strictSpellingValidation) {
      const validated = await generateValidatedSpellingContent({
        apiKey,
        systemPrompt,
        generationType,
        level: safeLevel,
        topic,
        ageGroup,
        count,
        keyStage: safeKeyStage,
        yearGroup: safeYearGroup,
        skillFocus: resolvedSkillFocus || "Silent e",
      });
      parsed = validated.content;
      promptUsed = validated.prompt;
      validation = validated.validation;
    } else {
      const response = await requestOpenAiJson(apiKey, systemPrompt, userPrompt);
      parsed = response.parsed;
      const quality = validateAiContentQuality({
        type: validatorType,
        keyStage: safeKeyStage,
        yearGroup: safeYearGroup,
        skillFocus: resolvedSkillFocus,
        requestedCount: count,
        items: parsed,
      });
      if (!quality.ok) {
        throw new Error(quality.error ?? `Invalid ${generationType} content.`);
      }
      parsed = quality.cleanedItems ?? parsed;
      validation = {
        ...(quality.meta as Record<string, unknown>),
        repairDiagnostics: response.repairDiagnostics,
      };
    }

    const estimated = estimateCost(count);

    await writeAuditLogSafely({
      actorUserId: session.userId,
      action: "ai_content.generated",
      entityType: "ai_generation",
      metadata: { type: promptType, generationType, level: safeLevel, topic, keyStage: safeKeyStage, yearGroup: safeYearGroup, skillFocus: resolvedSkillFocus, targetSkills, weakAreas, model: OPENAI_MODEL, estimatedCostPence: estimated.estimatedCostPence, validation },
    });

    const preview = buildGeneratedPreview({
      subject: sourceSubject,
      generationType,
      promptType,
      keyStage: safeKeyStage,
      yearGroup: safeYearGroup,
      curriculumPathway: safeCurriculumPathway,
      examBoard: safeExamBoard,
      skillFocus: resolvedSkillFocus,
      difficulty: safeLevel,
      topic,
      content: parsed,
    });

    generationCache.set(requestKey, {
      content: preview,
      meta: {
        prompt: promptUsed,
        estimatedCostPence: estimated.estimatedCostPence,
        estimatedTokens: estimated.estimatedTokens,
        validation,
      },
    });

    return NextResponse.json({
      success: true,
      type: promptType,
      generationType,
      level: safeLevel,
      topic,
      keyStage: safeKeyStage,
      yearGroup: safeYearGroup,
      curriculumPathway: safeCurriculumPathway,
      examBoard: safeExamBoard,
      skillFocus: resolvedSkillFocus,
      skills: serializeSkills(targetSkills.length ? targetSkills : []),
      model: OPENAI_MODEL,
      prompt: promptUsed,
      estimatedCostPence: estimated.estimatedCostPence,
      estimatedTokens: estimated.estimatedTokens,
      content: preview,
      meta: validation,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to parse AI response";
    const lowered = errorMessage.toLowerCase();
    const category = lowered.includes("not configured")
      ? "missing_env"
      : lowered.includes("unsupported") || lowered.includes("not mapped")
        ? "unsupported_path"
        : lowered.includes("malformed") || lowered.includes("parse")
          ? "parser_schema_failure"
          : lowered.includes("openai")
            ? "provider_failure"
            : lowered.includes("validation") || lowered.includes("invalid")
              ? "validation_error"
              : "generation_error";
    console.error("OpenAI generation failed:", error);
    await writeAuditLogSafely({
      actorUserId: session.userId,
      action: "ai_content.malformed_generation",
      entityType: "ai_generation",
      metadata: {
        model: OPENAI_MODEL,
        subject: sourceSubject,
        keyStage: safeKeyStage,
        yearGroup: safeYearGroup,
        skillFocus: resolvedSkillFocus,
        prompt: userPrompt,
        error: errorMessage,
        category,
        diagnostics: generationDiagnostics,
      },
    });

    if (category === "parser_schema_failure" || category === "provider_failure") {
      const fallbackPreview = buildFallbackPreview({
        subject: sourceSubject,
        generationType,
        promptType,
        keyStage: safeKeyStage,
        yearGroup: safeYearGroup,
        curriculumPathway: safeCurriculumPathway,
        examBoard: safeExamBoard,
        skillFocus: resolvedSkillFocus,
        difficulty: safeLevel,
        topic,
        reason: errorMessage,
      });
      return NextResponse.json({
        success: true,
        warning: "Generated fallback preview due to provider/parser failure.",
        type: promptType,
        generationType,
        level: safeLevel,
        topic,
        keyStage: safeKeyStage,
        yearGroup: safeYearGroup,
        curriculumPathway: safeCurriculumPathway,
        examBoard: safeExamBoard,
        skillFocus: resolvedSkillFocus,
        model: OPENAI_MODEL,
        prompt: userPrompt,
        estimatedCostPence: estimateCost(count).estimatedCostPence,
        estimatedTokens: estimateCost(count).estimatedTokens,
        content: fallbackPreview,
        meta: {
          valid: false,
          repaired: true,
          errors: [errorMessage],
          fixesApplied: ["Fallback preview generated"],
          removedWords: [],
          regeneratedCount: 0,
          requestedCount: count,
          finalCount: 1,
          fallback: true,
          category,
          diagnostics: generationDiagnostics,
        },
      });
    }

    const status = category === "validation_error" || category === "unsupported_path" ? 422 : category === "missing_env" ? 503 : 502;
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: {
          category,
          provider: "openai",
          model: OPENAI_MODEL,
          stage: "generation",
          diagnostics: generationDiagnostics,
        },
      },
      { status },
    );
  }
}
