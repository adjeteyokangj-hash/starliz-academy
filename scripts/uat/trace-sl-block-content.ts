import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

function previewItems(contentJson: string): unknown[] {
  try {
    const parsed = JSON.parse(contentJson);
    return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
  } catch {
    return [];
  }
}

function summarizeValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    return value.length > 240 ? `${value.slice(0, 240)}…[${value.length} chars]` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      sample: value.slice(0, 2).map((item) => summarizeValue(item, depth + 1)),
    };
  }
  if (typeof value === "object" && depth < 2) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 20)
        .map(([k, v]) => [k, summarizeValue(v, depth + 1)]),
    );
  }
  return typeof value;
}

function looksLikeLessonBody(parsed: unknown): Record<string, boolean | number | string> {
  const blob = JSON.stringify(parsed ?? {}).toLowerCase();
  const keys =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.keys(parsed as object)
      : Array.isArray(parsed) && parsed[0] && typeof parsed[0] === "object"
        ? Object.keys(parsed[0] as object)
        : [];
  const has = (re: RegExp) => re.test(blob) || keys.some((k) => re.test(k.toLowerCase()));
  return {
    topLevelShape: Array.isArray(parsed)
      ? `array(${parsed.length})`
      : parsed && typeof parsed === "object"
        ? `object(${keys.join(",")})`
        : typeof parsed,
    hasExplanation: has(/explanation|teacher.?explain|teaching.?point|concept.?intro|intro(duction)?/),
    hasWorkedExample: has(/worked.?example|example|modelled|modeled/),
    hasQuestions: has(/question|warm.?up|guided|practice|challenge|prompt/),
    hasAnswers: has(/answer|expected|solution|mark.?scheme|correct/),
    hasActivities: has(/activit|task|exercise|scaffold/),
    hasTutorHints: has(/hint|tutor|scaffold|progressive.?help/),
    hasValidator: has(/validator|machine.?check|health|qa/),
    contentJsonChars: blob.length,
    keySample: keys.slice(0, 30).join("|"),
  };
}

async function main() {
  const block = await prisma.shortLearningJourneyBlock.findFirst({
    where: {
      contentId: { not: null },
      daytimeStage: { not: null },
      blockType: { in: ["lesson", "recap", "challenge", "review"] },
      OR: [
        { title: { contains: "Lesson block", mode: "insensitive" } },
        { blockType: "lesson" },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      journeyId: true,
      order: true,
      title: true,
      blockType: true,
      learningObjective: true,
      reviewStatus: true,
      contentId: true,
      daytimeStage: true,
      journey: {
        select: {
          id: true,
          subject: true,
          yearGroup: true,
          topic: true,
          status: true,
          durationMinutes: true,
        },
      },
    },
  });

  if (!block?.contentId) {
    console.log(
      JSON.stringify(
        { found: false, reason: "No academic ShortLearningJourneyBlock with contentId" },
        null,
        2,
      ),
    );
    return;
  }

  const content = await prisma.aIContentCache.findUnique({
    where: { id: block.contentId },
    select: {
      id: true,
      status: true,
      contentType: true,
      topic: true,
      model: true,
      yearGroup: true,
      skillFocus: true,
      contentJson: true,
      metadataJson: true,
      prompt: true,
      createdAt: true,
    },
  });

  let parsed: unknown = null;
  let parseError: string | null = null;
  try {
    parsed = content ? JSON.parse(content.contentJson) : null;
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }

  let metadata: unknown = null;
  try {
    metadata = content?.metadataJson ? JSON.parse(content.metadataJson) : null;
  } catch {
    metadata = { parseFailed: true, chars: content?.metadataJson?.length ?? 0 };
  }

  const reviewPreview = content ? previewItems(content.contentJson) : [];
  const signals = looksLikeLessonBody(parsed);

  const parsedObj =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;

  console.log(
    JSON.stringify(
      {
        found: true,
        block: {
          id: block.id,
          journeyId: block.journeyId,
          order: block.order,
          title: block.title,
          blockType: block.blockType,
          daytimeStage: block.daytimeStage,
          learningObjective: block.learningObjective,
          reviewStatus: block.reviewStatus,
          contentId: block.contentId,
          journey: block.journey,
        },
        contentLibrary: content
          ? {
              id: content.id,
              status: content.status,
              contentType: content.contentType,
              topic: content.topic,
              yearGroup: content.yearGroup,
              skillFocus: content.skillFocus,
              model: content.model,
              contentJsonChars: content.contentJson.length,
              promptChars: content.prompt?.length ?? 0,
              createdAt: content.createdAt,
              parseError,
              lessonBodySignals: signals,
              metadataSummary: summarizeValue(metadata),
              contentSummary: summarizeValue(parsed),
              firstQuestion: summarizeValue(
                Array.isArray(parsedObj?.questions) ? parsedObj.questions[0] : null,
              ),
              firstActivity: summarizeValue(
                Array.isArray(parsedObj?.activities) ? parsedObj.activities[0] : null,
              ),
              firstItem: summarizeValue(
                Array.isArray(parsedObj?.items) ? parsedObj.items[0] : null,
              ),
            }
          : null,
        reviewPage: {
          loadsContentViaApi: true,
          rendersFullLesson: false,
          rendersOnly: [
            "block.title",
            "block.learningObjective",
            "block.reviewStatus",
            "content.status/contentType/model",
            "previewItems(contentJson) = Array.isArray ? first 3 items : []",
          ],
          previewItemsReturned: reviewPreview.length,
          previewWouldShow: reviewPreview.length > 0,
          previewSample: summarizeValue(reviewPreview),
        },
        verdictHint:
          content &&
          !parseError &&
          (signals.hasExplanation || signals.hasQuestions || signals.hasWorkedExample)
            ? "A_likely_full_content_exists_ui_truncates"
            : content && content.contentJson.length < 200
              ? "B_likely_metadata_only"
              : "needs_human_read_of_contentSummary",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
