import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { runContentBlackBoxTest } from "@/lib/ai/content-black-box-test";
import {
  mergeBlackBoxGateMetadata,
  parseContentMetadataJson,
} from "@/lib/ai/content-black-box-gate";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { id } = await context.params;

  const content = await prisma.aIContentCache.findUnique({
    where: { id },
    select: {
      id: true,
      contentType: true,
      level: true,
      topic: true,
      skillFocus: true,
      contentJson: true,
      metadataJson: true,
      status: true,
    },
  });

  if (!content) {
    return NextResponse.json({ error: "Content not found." }, { status: 404 });
  }

  const metadata = parseContentMetadataJson(content.metadataJson);

  let parsedItems: unknown;
  try {
    parsedItems = JSON.parse(content.contentJson) as unknown;
  } catch {
    return NextResponse.json({ error: "Content JSON is invalid." }, { status: 400 });
  }

  const metadataQuestionType = typeof metadata.questionType === "string" ? metadata.questionType.toLowerCase().trim() : "";
  const questionType = [
    "multiple choice",
    "free response",
    "reading response",
    "spelling word",
  ].includes(metadataQuestionType)
    ? metadataQuestionType
    : null;

  const blackBoxContentTest = runContentBlackBoxTest({
    subject: String(metadata.subject ?? metadata.contentType ?? content.contentType),
    strand: typeof metadata.strand === "string" ? metadata.strand : null,
    keyStage: typeof metadata.keyStage === "string" ? metadata.keyStage : null,
    yearGroup: typeof metadata.yearGroup === "string" ? metadata.yearGroup : null,
    level: typeof metadata.difficulty === "number" ? metadata.difficulty : content.level,
    difficulty: typeof metadata.difficulty === "number" ? metadata.difficulty : content.level,
    topic: content.topic,
    skillFocus: content.skillFocus,
    questionType,
    items: parsedItems,
  });

  const storedBlackBoxContentTest = {
    decision: blackBoxContentTest.decision,
    score: Math.round(blackBoxContentTest.passRate * 100),
    maxScore: 100,
    rawScore: blackBoxContentTest.score,
    rawMaxScore: blackBoxContentTest.maxScore,
    passRate: blackBoxContentTest.passRate,
    reasons: blackBoxContentTest.reasons,
    itemChecks: blackBoxContentTest.itemResults.map((result) => ({
      itemIndex: result.index,
      score: Math.round((result.score / result.maxScore) * 100),
      maxScore: 100,
      rawScore: result.score,
      rawMaxScore: result.maxScore,
      passRate: Number((result.score / result.maxScore).toFixed(3)),
      declaredLevel: result.declaredLevel,
      estimatedLevel: result.estimatedLevel,
      recommendedLevel: result.recommendedLevel,
      levelDelta: result.levelDelta,
      levelRecommendation: result.levelRecommendation,
      reasons: result.reasons,
      checks: Object.fromEntries(result.dimensions.map((dimension) => [
        dimension.dimension,
        {
          score: dimension.score,
          maxScore: dimension.maxScore,
          passed: dimension.passed,
          reasons: dimension.reasons,
        },
      ])),
    })),
    recommendation: blackBoxContentTest.recommendation ?? null,
    recalculatedAt: new Date().toISOString(),
  };

  const nextMetadata = mergeBlackBoxGateMetadata(metadata, {
    blackBoxContentTest: storedBlackBoxContentTest,
    blackBoxContentRetestedAt: new Date().toISOString(),
    blackBoxContentRetestedBy: session.userId,
  });

  const updated = await prisma.aIContentCache.update({
    where: { id: content.id },
    data: {
      metadataJson: JSON.stringify(nextMetadata),
    },
    select: {
      id: true,
      status: true,
      metadataJson: true,
    },
  });

  await writeAuditLog({
    actorUserId: session.userId,
    action: "ai_content.black_box.retest",
    entityType: "AIContentCache",
    entityId: content.id,
    metadata: {
      decision: blackBoxContentTest.decision,
      score: storedBlackBoxContentTest.score,
    },
  });

  return NextResponse.json({
    item: updated,
    blackBoxContentTest: storedBlackBoxContentTest,
  });
}
