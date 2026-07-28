import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

function topKeys(parsed: unknown): string[] {
  if (!parsed || typeof parsed !== "object") return [typeof parsed];
  if (Array.isArray(parsed)) {
    const first = parsed[0];
    return [`array(${parsed.length})`, ...(first && typeof first === "object" ? Object.keys(first as object) : [])];
  }
  return Object.keys(parsed as object);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function activityKindLabel(activity: unknown): string {
  const record = asRecord(activity);
  if (!record) return typeof activity;
  const kind = record.kind ?? record.type;
  return kind == null ? typeof activity : String(kind);
}

async function main() {
  const rows = await prisma.aIContentCache.findMany({
    where: {
      OR: [
        { metadataJson: { contains: "short_learning" } },
        { metadataJson: { contains: "daytime" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: { id: true, contentType: true, topic: true, contentJson: true, metadataJson: true, status: true },
  });

  const byType: Record<string, { count: number; shapes: Record<string, number>; samples: unknown[] }> = {};
  for (const row of rows) {
    let parsed: unknown = null;
    try { parsed = JSON.parse(row.contentJson); } catch { parsed = { __parseError: true }; }
    let meta: Record<string, unknown> | null = null;
    try {
      const rawMeta: unknown = row.metadataJson ? JSON.parse(row.metadataJson) : null;
      meta = asRecord(rawMeta);
    } catch {
      meta = null;
    }
    const type = String(row.contentType || meta?.playableContentType || meta?.subject || "unknown");
    const keys = topKeys(parsed).join("|");
    if (!byType[type]) byType[type] = { count: 0, shapes: {}, samples: [] };
    byType[type].count += 1;
    byType[type].shapes[keys] = (byType[type].shapes[keys] ?? 0) + 1;
    if (byType[type].samples.length < 2 && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const o = parsed as Record<string, unknown>;
      byType[type].samples.push({
        id: row.id,
        topic: row.topic,
        keys: Object.keys(o),
        activityKinds: Array.isArray(o.activities) ? o.activities.map(activityKindLabel).slice(0, 8) : null,
        questionCount: Array.isArray(o.questions) ? o.questions.length : null,
        itemCount: Array.isArray(o.items) ? o.items.length : null,
        workedExampleCount: Array.isArray(o.workedExamples) ? o.workedExamples.length : null,
        hasExplanation: typeof o.explanation === "string",
        hasPassage: typeof o.passage === "string" || typeof o.readingPassage === "string",
        hasVocabulary: Array.isArray(o.vocabulary),
        generationStatus: o.generationStatus ?? null,
      });
    }
  }

  // Also get the specific UAT content
  const uat = await prisma.aIContentCache.findUnique({
    where: { id: "cms25eouy002osk4obx7cjzf2" },
    select: { id: true, contentType: true, contentJson: true },
  });
  let uatParsed: Record<string, unknown> | null = null;
  try {
    const raw: unknown = uat ? JSON.parse(uat.contentJson) : null;
    uatParsed = asRecord(raw);
  } catch {
    uatParsed = null;
  }

  console.log(JSON.stringify({
    scanned: rows.length,
    byType,
    uatContent: uatParsed ? {
      id: uat?.id,
      keys: Object.keys(uatParsed),
      explanation: String(uatParsed.explanation ?? "").slice(0, 160),
      learningObjective: uatParsed.learningObjective,
      activitiesLen: Array.isArray(uatParsed.activities) ? uatParsed.activities.length : undefined,
      questionsLen: Array.isArray(uatParsed.questions) ? uatParsed.questions.length : undefined,
      itemsLen: Array.isArray(uatParsed.items) ? uatParsed.items.length : undefined,
      workedExamplesLen: Array.isArray(uatParsed.workedExamples) ? uatParsed.workedExamples.length : undefined,
      firstWorkedExample: Array.isArray(uatParsed.workedExamples) ? uatParsed.workedExamples[0] : undefined,
      firstActivity: Array.isArray(uatParsed.activities) ? uatParsed.activities[0] : undefined,
      firstQuestion: Array.isArray(uatParsed.questions) ? uatParsed.questions[0] : undefined,
    } : null,
  }, null, 2));
}
main().finally(() => prisma.$disconnect());
