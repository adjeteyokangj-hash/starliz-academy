import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  canApprovePlayableLesson,
  parsePlayableLessonContent,
} from "../src/lib/schools/parse-playable-lesson-content";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

const JOURNEY_ID = "cms25doot0028sk4om9nijcoo";
const BLOCK_ID = "cms25eoz2002qsk4o3ovmtcvq";
const CONTENT_ID = "cms25eouy002osk4obx7cjzf2";

async function main() {
  const journey = await prisma.shortLearningJourney.findUnique({
    where: { id: JOURNEY_ID },
    include: { blocks: { orderBy: { order: "asc" } } },
  });
  if (!journey) throw new Error("UAT journey not found");

  const block = journey.blocks.find((b) => b.id === BLOCK_ID);
  if (!block) throw new Error("UAT block not found");
  if (block.contentId !== CONTENT_ID) throw new Error(`Unexpected contentId ${block.contentId}`);

  const content = await prisma.aIContentCache.findUnique({ where: { id: CONTENT_ID } });
  if (!content) throw new Error("UAT content not found");

  const parsed = parsePlayableLessonContent(content.contentJson, {
    contentType: content.contentType,
    subject: journey.subject,
    skillFocus: journey.topic,
    topic: content.topic,
  });

  const academic = journey.blocks.filter((b) => b.daytimeStage);
  const structural = journey.blocks.filter((b) => !b.daytimeStage);

  const academicParsed = [] as Array<Record<string, unknown>>;
  for (const b of academic) {
    if (!b.contentId) {
      academicParsed.push({ order: b.order, title: b.title, ok: false, reason: "missing contentId" });
      continue;
    }
    const row = await prisma.aIContentCache.findUnique({ where: { id: b.contentId } });
    const result = parsePlayableLessonContent(row?.contentJson, {
      contentType: row?.contentType,
      subject: journey.subject,
      topic: journey.topic,
    });
    academicParsed.push({
      order: b.order,
      title: b.title,
      reviewStatus: b.reviewStatus,
      ok: result.ok,
      hasBody: result.ok ? result.hasReviewableBody : false,
      questions: result.ok ? result.questions.length : 0,
      activities: result.ok ? result.activities.length : 0,
      canApproveBody: canApprovePlayableLesson(result),
    });
  }

  const english = await prisma.aIContentCache.findFirst({
    where: {
      contentType: "reading",
      metadataJson: { contains: "short_learning" },
      contentJson: { contains: "passage" },
    },
    orderBy: { createdAt: "desc" },
  });
  const englishParsed = english
    ? parsePlayableLessonContent(english.contentJson, { contentType: "reading", subject: "english" })
    : null;

  const checks = {
    objective: parsed.ok && Boolean(parsed.learningObjective?.toLowerCase().includes("multiplication")),
    explanation: parsed.ok && Boolean(parsed.explanation?.length),
    workedExamples: parsed.ok && parsed.workedExamples.length >= 1,
    activitiesFive: parsed.ok && parsed.activities.length === 5,
    questions: parsed.ok && parsed.questions.length >= 1,
    answers: parsed.ok && parsed.questions.every((q) => q.answer.length > 0),
    hintsBreakdown: parsed.ok && parsed.questions.some((q) => q.hints.length && q.breakdown),
    structuralCount: structural.length,
    structuralTypes: structural.map((b) => b.blockType),
    journeyNotPublished: journey.status !== "published",
    academicUnapproved: academic.every((b) => b.reviewStatus !== "approved"),
    englishOk: englishParsed ? englishParsed.ok && Boolean(englishParsed.passage?.text) : null,
    canApproveUatBody: canApprovePlayableLesson(parsed),
  };

  console.log(JSON.stringify({
    journey: { id: journey.id, status: journey.status, subject: journey.subject, topic: journey.topic },
    block: { id: block.id, title: block.title, order: block.order, contentId: block.contentId },
    uatParsed: parsed.ok ? {
      learningObjective: parsed.learningObjective,
      explanation: parsed.explanation?.slice(0, 120),
      workedExamples: parsed.workedExamples.length,
      activities: parsed.activities.map((a) => a.kind),
      questions: parsed.questions.length,
      firstAnswer: parsed.questions[0]?.answer,
      firstHints: parsed.questions[0]?.hints.length,
      hasBreakdown: Boolean(parsed.questions[0]?.breakdown),
    } : parsed,
    academicParsed,
    checks,
    published: false,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });