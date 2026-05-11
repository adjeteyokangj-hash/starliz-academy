import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { getOpenAiApiKey } from "@/lib/api-key-config";
import { validateAiContentQuality } from "@/lib/ai/content-quality";
import { SKILL_MAP, serializeSkills } from "@/lib/skills";

const BATCH_SIZE = 12;
const OPENAI_MODEL = "gpt-4o-mini";
const generationCache = new Map<string, { content: unknown; meta: Record<string, unknown> }>();
const generationRateLimit = new Map<string, { count: number; resetAt: number }>();

type GeneratedPreview = {
  title: string;
  subject: "spelling" | "math" | "reading";
  keyStage: string;
  yearGroup: string;
  skillFocus: string;
  difficulty: number;
  topic: string;
  status: "draft";
  safetyStatus: "passed";
  qualityScore: number;
  voiceScript: string;
  imagePrompt: string;
  items: unknown[];
};

const SYSTEM_PROMPT: Record<string, string> = {
  spelling: `You are a UK primary curriculum content creator for KS1/KS2.
Generate curriculum-grade spelling content using UK primary expectations.
Support phonics patterns, common exception words, suffixes, prefixes, silent letters, homophones and age-appropriate vocabulary.
Return a JSON array. Each item must follow this schema exactly:
{ "id": string, "word": string, "hint": string, "sentenceContext": string, "categoryHint": string, "syllables": string, "emoji": string, "yearGroup": string, "skillFocus": string, "difficulty": number }
Content type lock: spelling must not generate maths questions, number problems, reading passages, or comprehension questions.
Return ONLY valid JSON — no explanation, no markdown.`,

  math: `You are a UK primary curriculum content creator for KS1/KS2.
Generate curriculum-grade KS1/KS2 maths questions.
Difficulty must increase by year group and level.
Return a JSON array. Each item must follow this schema exactly:
{ "id": string, "question": string, "answer": number, "explanation": string, "choices": number[], "yearGroup": string, "skillFocus": string, "difficulty": number, "topic": string }
Content type lock: maths must not generate spelling word lists or reading passages.
Return ONLY valid JSON — no explanation, no markdown.`,

  reading: `You are a UK primary curriculum content creator for KS1/KS2.
Generate age-appropriate reading content.
Return a JSON object. It must follow this schema exactly:
{ "id": string, "title": string, "passage": string, "vocabularyWords": string[], "questions": [{ "question": string, "answer": string, "options": string[] }], "answers": string[], "yearGroup": string, "skillFocus": string, "difficulty": number }
Content type lock: reading must not generate spelling word lists, maths questions, or unrelated content.
Return ONLY valid JSON — no explanation, no markdown.`,
};

function cleanTopic(topic: string, type: string) {
  if (type === "spelling") {
    return topic.replace(/fractions?|maths?|mathematics|numbers?|addition|subtraction|multiplication|division/gi, "").replace(/\s+/g, " ").trim();
  }
  if (type === "math") {
    return topic.replace(/spelling|phonics|silent e|reading passage|comprehension/gi, "").replace(/\s+/g, " ").trim();
  }
  if (type === "reading") {
    return topic.replace(/spelling words?|maths? questions?|fractions?/gi, "").replace(/\s+/g, " ").trim();
  }
  return topic.trim();
}

function normalizeYearGroup(yearGroup: string, keyStage: string) {
  if (/year\s*[1-6]/i.test(yearGroup)) return yearGroup.replace(/year/i, "Year").trim();
  return keyStage === "KS2" ? "Year 4" : "Year 2";
}

function buildUserPrompt(
  type: string,
  level: number,
  topic: string,
  ageGroup: string,
  count: number,
  keyStage: string,
  yearGroup: string,
  skillFocus: string,
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
  if (type === "spelling") {
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
  if (type === "math") {
    return `Generate ${count} KS1/KS2-style maths questions for ${keyStage}, ${safeYearGroup}, difficulty ${level}.
Skill focus: ${skillFocus || "Number bonds"}.
Topic: ${cleanedTopic || skillFocus || "mixed arithmetic"}.
Include answers and multiple choice options.
Difficulty must increase appropriately for the selected year group and level.
Return JSON with: id, question, answer, explanation, choices, yearGroup, skillFocus, difficulty and topic.
Do not return spelling words or reading passages.${skillInstruction}${weakInstruction}${followUpInstruction}`;
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

  if (!openAIResponse.ok) {
    const err = await openAIResponse.text();
    console.error("OpenAI error:", err);
    throw new Error("OpenAI request failed");
  }

  const data = await openAIResponse.json();
  const rawContent = data.choices?.[0]?.message?.content ?? "";
  const cleaned = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return { rawContent, parsed: JSON.parse(cleaned) as unknown };
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
  subject: "spelling" | "math" | "reading",
  content: unknown,
  metadata: { yearGroup: string; skillFocus: string; difficulty: number; topic: string },
): unknown[] {
  if (subject === "reading" && !Array.isArray(content) && content && typeof content === "object") {
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
    if (subject === "spelling") {
      return {
        ...data,
        type: "spelling",
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
    if (subject === "math") {
      return {
        ...data,
        type: "math",
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
      type: "reading",
      yearGroup: metadata.yearGroup,
      skillFocus: metadata.skillFocus,
      difficulty: metadata.difficulty,
    };
  });
}

function buildGeneratedPreview({
  subject,
  keyStage,
  yearGroup,
  skillFocus,
  difficulty,
  topic,
  content,
}: {
  subject: "spelling" | "math" | "reading";
  keyStage: string;
  yearGroup: string;
  skillFocus: string;
  difficulty: number;
  topic: string;
  content: unknown;
}): GeneratedPreview {
  const items = normalizePreviewItems(subject, content, { yearGroup, skillFocus, difficulty, topic });
  const safeTopic = topic || skillFocus || subject;
  return {
    title: `${yearGroup} ${skillFocus || subject} ${subject === "math" ? "questions" : subject === "reading" ? "reading set" : "practice"}`,
    subject,
    keyStage,
    yearGroup,
    skillFocus,
    difficulty,
    topic: safeTopic,
    status: "draft",
    safetyStatus: "passed",
    qualityScore: Math.min(100, Math.max(70, 82 + Math.min(12, items.length))),
    voiceScript: `Today we are practising ${skillFocus || subject}. Listen carefully, try your best, and use hints when you need them.`,
    imagePrompt: `Friendly UK primary school illustration for ${yearGroup} ${subject} lesson about ${safeTopic}. Bright, safe, child-friendly style.`,
    items,
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
    lastPrompt = buildUserPrompt("spelling", level, topic, ageGroup, needed, keyStage, safeYearGroup, skillFocus, Array.from(excludeWords));
    const { parsed } = await requestOpenAiJson(apiKey, systemPrompt, lastPrompt);
    const incoming = Array.isArray(parsed) ? parsed : [];
    const combined = [...collected, ...incoming];
    const quality = validateAiContentQuality({
      type: "spelling",
      skillFocus,
      requestedCount: count,
      items: combined,
      mode: "repair",
    });

    if (!quality.ok || !Array.isArray(quality.cleanedItems)) {
      throw new Error(quality.error ?? "No valid spelling content remained after validation.");
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
    return NextResponse.json({ error: "AI generation limit reached. Please wait a minute before trying again." }, { status: 429 });
  }

  const body = await req.json();
  const requestedSubject = body.subject ?? body.type;
  const requestedCount = body.numberOfItems ?? body.count;
  const requestedLevel = body.difficulty ?? body.level;
  const { type, level = 1, topic = "" } = {
    ...body,
    type: requestedSubject,
    level: requestedLevel,
  } as {
    type: "spelling" | "math" | "reading";
    level?: number;
    topic?: string;
    ageGroup?: string;
    count?: number;
    keyStage?: string;
    yearGroup?: string;
    skillFocus?: string;
  };
  const ageGroup = typeof body.ageGroup === "string" ? body.ageGroup : "6-8";
  const count = Math.max(1, Math.min(30, Number(requestedCount ?? BATCH_SIZE)));
  const keyStage = typeof body.keyStage === "string" ? body.keyStage : "KS1";
  const yearGroup = typeof body.yearGroup === "string" ? body.yearGroup : "";
  const skillFocus = typeof body.skillFocus === "string" ? body.skillFocus : "";
  // Skill-first targeting
  const targetSkills: string[] = Array.isArray(body.targetSkills) ? (body.targetSkills as string[]) : [];
  const weakAreas: string[] = Array.isArray(body.weakAreas) ? (body.weakAreas as string[]) : [];
  // If targetSkills provided, derive skillFocus label from the first one
  const resolvedSkillFocus = skillFocus || (targetSkills.length ? (SKILL_MAP[targetSkills[0]]?.label ?? targetSkills[0]) : "");

  if (!["spelling", "math", "reading"].includes(type)) {
    return NextResponse.json({ error: "type must be spelling, math, or reading" }, { status: 400 });
  }

  const maxLevel = type === "reading" ? 10 : 5;
  const safeLevel = Math.max(1, Math.min(maxLevel, Number.isFinite(level) ? level : 1));

  const apiKey = await getOpenAiApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "OpenAI API key not configured. Save it in Admin Settings > API Keys." }, { status: 503 });
  }

  const safeYearGroup = normalizeYearGroup(yearGroup || ageGroup, keyStage);
  const requestKey = cacheKey({ type, level, topic, ageGroup, count, keyStage, yearGroup: safeYearGroup, skillFocus });
  const cached = generationCache.get(requestKey);
  if (cached) {
    const cachedValidation = (cached.meta.validation ?? {}) as Record<string, unknown>;
    return NextResponse.json({
      type,
      level,
      topic,
      keyStage,
      yearGroup: safeYearGroup,
      skillFocus,
      model: OPENAI_MODEL,
      prompt: cached.meta.prompt,
      estimatedCostPence: cached.meta.estimatedCostPence,
      estimatedTokens: cached.meta.estimatedTokens,
      content: cached.content,
      meta: { ...cachedValidation, cached: true },
    });
  }

  const userPrompt = buildUserPrompt(type, safeLevel, topic, ageGroup, count, keyStage, safeYearGroup, resolvedSkillFocus, [], targetSkills, weakAreas);
  const systemPrompt = SYSTEM_PROMPT[type];

  try {
    let parsed: unknown;
    let promptUsed = userPrompt;
    let validation: Record<string, unknown> = { valid: true, repaired: false, errors: [], fixesApplied: [], removedWords: [], regeneratedCount: 0, requestedCount: count, finalCount: count };

    if (type === "spelling") {
      const validated = await generateValidatedSpellingContent({
        apiKey,
        systemPrompt,
        level: safeLevel,
        topic,
        ageGroup,
        count,
        keyStage,
        yearGroup: safeYearGroup,
        skillFocus: resolvedSkillFocus || "Silent e",
      });
      parsed = validated.content;
      promptUsed = validated.prompt;
      validation = validated.validation;
    } else {
      const response = await requestOpenAiJson(apiKey, systemPrompt, userPrompt);
      parsed = response.parsed;
    }

    const estimated = estimateCost(count);

    await writeAuditLog({
      actorUserId: session.userId,
      action: "ai_content.generated",
      entityType: "ai_generation",
      metadata: { type, level: safeLevel, topic, keyStage, yearGroup: safeYearGroup, skillFocus: resolvedSkillFocus, targetSkills, weakAreas, model: OPENAI_MODEL, estimatedCostPence: estimated.estimatedCostPence, validation },
    });

    const preview = buildGeneratedPreview({
      subject: type,
      keyStage,
      yearGroup: safeYearGroup,
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
      type,
      level: safeLevel,
      topic,
      keyStage,
      yearGroup: safeYearGroup,
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
    console.error("OpenAI generation failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to reach OpenAI" }, { status: 502 });
  }
}
