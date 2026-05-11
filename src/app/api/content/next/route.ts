import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { canUseFeature } from "@/lib/subscriptions/enforcement";

type CacheRecord = {
  id: string;
  contentType: string;
  level: number;
  topic: string;
  contentJson: string;
  usedCount: number;
};

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function parseExclude(raw: string | null): Set<string> {
  if (!raw) return new Set<string>();
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set<string>();
    return new Set(arr.map((v) => String(v)));
  } catch {
    return new Set<string>();
  }
}

function normalizeSpellingItem(item: unknown, fallbackLevel: number): Record<string, unknown> | null {
  if (!item || typeof item !== "object") return null;
  const data = item as Record<string, unknown>;
  const word = String(data.word ?? "").trim();
  if (!word) return null;
  const normalizedLevel = Number(data.level ?? fallbackLevel);
  return {
    id: String(data.id ?? `ai-spelling-${word.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`),
    word,
    level: Math.max(1, Math.min(5, Number.isFinite(normalizedLevel) ? normalizedLevel : fallbackLevel)),
    hint: String(data.hint ?? `The word is about ${String(data.categoryHint ?? "a topic")}.`),
    categoryHint: String(data.categoryHint ?? "word practice"),
    syllables: String(data.syllables ?? "1"),
    sentenceContext: String(data.sentenceContext ?? `Can you spell ${word}?`),
    emoji: String(data.emoji ?? "✨"),
    patterns: Array.isArray(data.patterns)
      ? data.patterns.map((v) => String(v)).filter(Boolean)
      : [word.slice(0, 2).toLowerCase()].filter(Boolean),
  };
}

function normalizeMathItem(item: unknown, fallbackLevel: number): Record<string, unknown> | null {
  if (!item || typeof item !== "object") return null;
  const data = item as Record<string, unknown>;
  const prompt = String(data.prompt ?? data.question ?? "").trim();
  const answer = Number(data.answer);
  if (!prompt || Number.isNaN(answer)) return null;

  const hints = Array.isArray(data.hints)
    ? data.hints.map((v) => String(v)).filter(Boolean)
    : [String(data.hint ?? "Try breaking this into smaller steps.")];

  const providedChoices = Array.isArray(data.choices)
    ? data.choices.map((v) => Number(v)).filter((v) => Number.isFinite(v))
    : [];

  const choices = providedChoices.length
    ? Array.from(new Set([...providedChoices, answer])).slice(0, 4)
    : [answer - 2, answer - 1, answer, answer + 1].filter((v, idx, arr) => Number.isFinite(v) && arr.indexOf(v) === idx).slice(0, 4);

  const normalizedLevel = Number(data.level ?? fallbackLevel);
  return {
    id: String(data.id ?? `ai-math-${Math.abs(answer)}-${prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`),
    prompt,
    answer,
    topic: String(data.topic ?? data.type ?? "mixed"),
    hints: hints.length ? hints : ["Try breaking this into smaller steps."],
    choices,
    level: Math.max(1, Math.min(5, Number.isFinite(normalizedLevel) ? normalizedLevel : fallbackLevel)),
  };
}

function normalize(type: string, item: unknown, level: number): Record<string, unknown> | null {
  if (type === "spelling") return normalizeSpellingItem(item, level);
  if (type === "math") return normalizeMathItem(item, level);
  return null;
}

function findUsableItem(records: CacheRecord[], type: string, level: number, excludeIds: Set<string>): { cacheId: string; item: Record<string, unknown> } | null {
  for (const record of records) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(record.contentJson);
    } catch {
      continue;
    }

    const items = asArray(parsed);
    for (const item of items) {
      const normalized = normalize(type, item, level);
      if (!normalized) continue;
      const id = String(normalized.id ?? "");
      if (!id || excludeIds.has(id)) continue;
      return { cacheId: record.id, item: normalized };
    }
  }
  return null;
}

export async function GET(req: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const access = await canUseFeature(session.userId, "learning");
  if (!access.allowed) {
    return NextResponse.json({ error: "Subscription upgrade required.", access }, { status: 402 });
  }

  const { searchParams } = new URL(req.url);
  const type = String(searchParams.get("type") ?? "");
  const level = Number(searchParams.get("level") ?? "1");
  const excludeIds = parseExclude(searchParams.get("exclude"));

  if (!["spelling", "math"].includes(type)) {
    return NextResponse.json({ error: "Unsupported type" }, { status: 400 });
  }

  const safeLevel = Math.max(1, Math.min(5, Number.isFinite(level) ? level : 1));

  const records = await prisma.aIContentCache.findMany({
    where: { contentType: type, level: safeLevel, status: { in: ["approved", "published"] } },
    orderBy: [{ usedCount: "asc" }, { createdAt: "desc" }],
    take: 50,
  });

  const picked = findUsableItem(records, type, safeLevel, excludeIds);
  if (!picked) {
    return NextResponse.json({ item: null, source: "static" });
  }

  await prisma.aIContentCache.update({
    where: { id: picked.cacheId },
    data: { usedCount: { increment: 1 } },
  });

  return NextResponse.json({ item: picked.item, source: "ai-cache" });
}
