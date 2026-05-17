import { getOpenAiApiKey } from "@/lib/api-key-config";
import { SKILL_MAP } from "@/lib/skills";

type LessonItem = Record<string, unknown>;

type BuildOptions = {
  studentId: string;
  actorUserId?: string;
};

type BuiltLesson = {
  assignmentId: string;
  lessonId: string;
  contentId: string;
  weakSkills: string[];
  reusedExisting: boolean;
};

const OPENAI_MODEL = "gpt-4o-mini";

function readingItemsFromPassage(params: { skill: string; label: string; difficulty: number }): LessonItem[] {
  return [
    {
      id: `reading-${params.skill}-1`,
      type: "reading",
      passage: "Lena packs a small red bag for school. She puts in a book, a pencil, and an apple.",
      prompt: "What does Lena put in her bag?",
      question: "What does Lena put in her bag?",
      answer: "a book, a pencil, and an apple",
      options: ["a toy car", "a book, a pencil, and an apple", "only a book"],
      hint: `Look for details linked to ${params.label}.`,
      skillFocus: params.label,
      difficulty: params.difficulty,
    },
  ];
}

function spellingItemsForSkill(params: { skill: string; label: string; difficulty: number }): LessonItem[] {
  const defaults = ["cat", "dog", "sun", "map", "pen"];
  const silentE = ["cake", "bike", "rope", "home", "cube"];
  const words = params.skill === "silent_e" ? silentE : defaults;
  return words.slice(0, 3).map((word, index) => ({
    id: `spelling-${params.skill}-${index + 1}`,
    type: "spelling",
    word,
    prompt: word,
    answer: word,
    hint: `Focus on ${params.label}.`,
    skillFocus: params.label,
    difficulty: params.difficulty,
  }));
}

function mathsItemsForSkill(params: { skill: string; label: string; difficulty: number }): LessonItem[] {
  return [
    {
      id: `math-${params.skill}-1`,
      type: "math",
      prompt: "7 + 2",
      question: "7 + 2",
      answer: 9,
      options: [8, 9, 10],
      hint: `Use ${params.label}.`,
      skillFocus: params.label,
      difficulty: params.difficulty,
    },
    {
      id: `math-${params.skill}-2`,
      type: "math",
      prompt: "10 - 3",
      question: "10 - 3",
      answer: 7,
      options: [6, 7, 8],
      hint: `Use ${params.label}.`,
      skillFocus: params.label,
      difficulty: params.difficulty,
    },
  ];
}

function buildStaticPracticeItems(weakSkills: string[], difficulty: number): LessonItem[] {
  const first = weakSkills[0] ?? "cvc";
  const second = weakSkills[1] ?? first;
  const firstDef = SKILL_MAP[first];
  const secondDef = SKILL_MAP[second];
  const bundle: LessonItem[] = [];

  if (!firstDef || firstDef.subject === "foundation" || firstDef.subject === "spelling") {
    bundle.push(...spellingItemsForSkill({ skill: first, label: firstDef?.label ?? first, difficulty }));
  }
  if (secondDef?.subject === "maths") {
    bundle.push(...mathsItemsForSkill({ skill: second, label: secondDef.label, difficulty }));
  }
  if (secondDef?.subject === "reading") {
    bundle.push(...readingItemsFromPassage({ skill: second, label: secondDef.label, difficulty }));
  }

  if (!bundle.length) {
    bundle.push(...spellingItemsForSkill({ skill: first, label: firstDef?.label ?? first, difficulty }));
  }

  return bundle;
}

function normalizeAiItems(raw: unknown, weakSkills: string[], difficulty: number): LessonItem[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is LessonItem => Boolean(item && typeof item === "object"))
      .map((item, index) => ({
        type: typeof item.type === "string" ? item.type : "spelling",
        id: String(item.id ?? `ai-${index + 1}`),
        skillFocus: String(item.skillFocus ?? SKILL_MAP[weakSkills[0]]?.label ?? weakSkills[0] ?? "practice"),
        difficulty: Number(item.difficulty ?? difficulty),
        ...item,
      }));
  }
  if (raw && typeof raw === "object") {
    const one = raw as LessonItem;
    return [{
      type: String(one.type ?? "spelling"),
      id: String(one.id ?? "ai-1"),
      skillFocus: String(one.skillFocus ?? SKILL_MAP[weakSkills[0]]?.label ?? weakSkills[0] ?? "practice"),
      difficulty: Number(one.difficulty ?? difficulty),
      ...one,
    }];
  }
  return [];
}

export async function generateTargetedItems(input: {
  weakSkills: string[];
  count?: number;
  difficulty?: number;
}): Promise<LessonItem[]> {
  const weakSkills = input.weakSkills.filter(Boolean).slice(0, 3);
  const difficulty = Math.max(1, Math.min(5, input.difficulty ?? 2));
  if (!weakSkills.length) {
    return buildStaticPracticeItems(["cvc"], difficulty);
  }

  const apiKey = await getOpenAiApiKey();
  if (!apiKey) {
    return buildStaticPracticeItems(weakSkills, difficulty);
  }

  const prompt = [
    "Generate child-friendly learning questions for ages 5-7.",
    `Target skills: ${weakSkills.join(", ")}`,
    `Difficulty: ${difficulty}`,
    "Include mixed item types where suitable: spelling, reading, maths.",
    "Return JSON array only.",
    "Each item should include: id, type, prompt or question, answer, optional options, skillFocus, difficulty.",
    `Create ${input.count ?? 5} items.`,
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.4,
        max_tokens: 1200,
        messages: [
          { role: "system", content: "You are an adaptive KS1 tutor. Return valid JSON only." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      return buildStaticPracticeItems(weakSkills, difficulty);
    }

    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = payload.choices?.[0]?.message?.content ?? "[]";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned) as unknown;
    const normalized = normalizeAiItems(parsed, weakSkills, difficulty);
    return normalized.length ? normalized : buildStaticPracticeItems(weakSkills, difficulty);
  } catch {
    return buildStaticPracticeItems(weakSkills, difficulty);
  }
}

export async function autoBuildLessonForStudent(input: BuildOptions): Promise<BuiltLesson> {
  void input;
  throw new Error("Automatic lesson generation is disabled. Admin must assign content manually.");
}
