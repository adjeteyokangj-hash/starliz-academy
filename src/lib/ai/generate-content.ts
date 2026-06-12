import { prisma } from "@/lib/db";
import { tagDifficulty, tagTopic } from "./difficulty-tagger";
import { findCachedPrompt } from "./prompt-cache";

type GenerateInput = {
  type: "spelling" | "math" | "reading";
  level: number;
  topic: string;
  count?: number;
  createdBy?: string;
};

const STARTER_LIBRARY_TYPES = ["spelling", "math", "reading"] as const;
const ACTIVE_CONTENT_STATUSES = ["draft", "reviewed", "approved", "published"] as const;

export type StarterLibraryGap = {
  type: (typeof STARTER_LIBRARY_TYPES)[number];
  currentCount: number;
  minimumExpectedCount: number;
  missingCount: number;
};

function fallbackContent({ type, level, topic, count = 8 }: GenerateInput) {
  if (type === "math") {
    return Array.from({ length: count }, (_, index) => {
      const a = level + index + 1;
      const b = level + 2;
      return { id: `auto-math-${level}-${index}`, prompt: `${a} + ${b} = ?`, answer: a + b, topic: topic || "addition", level, hints: ["Count on using your fingers or a number line."] };
    });
  }
  if (type === "reading") {
    return {
      id: `auto-reading-${level}-${Date.now()}`,
      title: topic || "A New Adventure",
      passage: `This short passage helps children practise reading about ${topic || "a friendly adventure"}.`,
      level,
      questions: [{ question: "What is this passage about?", options: [topic || "an adventure", "a recipe", "a map"], correctIndex: 0 }],
    };
  }
  const base = (topic || "star words").replace(/[^a-zA-Z ]/g, "").split(/\s+/).filter(Boolean);
  const words = base.length ? base : ["star", "shine", "learn", "brave", "smile", "sound", "spell", "bright"];
  return Array.from({ length: count }, (_, index) => {
    const word = words[index % words.length].toLowerCase();
    return { id: `auto-spelling-${word}-${index}`, word, level, hint: `Listen for the sounds in ${word}.`, categoryHint: tagTopic(topic), sentenceContext: `Can you spell ${word}?`, syllables: "1", emoji: "⭐", patterns: [word.slice(0, 2)] };
  });
}

export async function generateDraftContent(input: GenerateInput) {
  const maxLevel = input.type === "reading" ? 10 : 5;
  const level = Math.max(1, Math.min(maxLevel, input.level || tagDifficulty(input.topic)));
  const cached = await findCachedPrompt(input.type, level, input.topic);
  if (cached) return { reused: true, record: cached };

  const content = fallbackContent({ ...input, level });
  const record = await prisma.aIContentCache.create({
    data: {
      contentType: input.type,
      level,
      topic: input.topic,
      contentJson: JSON.stringify(content),
      createdBy: input.createdBy ?? "automation",
      status: "draft",
    },
  });

  return { reused: false, record };
}

export async function autoFillLowContentLibrary(minPerType = 5) {
  const created = [];
  for (const type of STARTER_LIBRARY_TYPES) {
    const count = await prisma.aIContentCache.count({ where: { contentType: type, status: { in: [...ACTIVE_CONTENT_STATUSES] } } });
    if (count < minPerType) {
      const generated = await generateDraftContent({ type, level: 1, topic: "automatic starter content", count: minPerType - count });
      created.push({ type, id: generated.record.id, reused: generated.reused, previousCount: count, minimumExpectedCount: minPerType });
    }
  }
  return created;
}

export async function detectStarterLibraryGaps(minPerType = 5): Promise<StarterLibraryGap[]> {
  const gaps: StarterLibraryGap[] = [];
  for (const type of STARTER_LIBRARY_TYPES) {
    const currentCount = await prisma.aIContentCache.count({
      where: { contentType: type, status: { in: [...ACTIVE_CONTENT_STATUSES] } },
    });
    gaps.push({
      type,
      currentCount,
      minimumExpectedCount: minPerType,
      missingCount: Math.max(0, minPerType - currentCount),
    });
  }
  return gaps;
}
