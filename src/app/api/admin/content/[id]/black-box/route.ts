import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { runContentBlackBoxTest } from "@/lib/ai/content-black-box-test";
import {
  clearBlackBoxStaleMetadata,
  mergeBlackBoxGateMetadata,
  parseContentMetadataJson,
} from "@/lib/ai/content-black-box-gate";

type Context = { params: Promise<{ id: string }> };

type BlackBoxRouteContentRecord = {
  id: string;
  contentType: string;
  level: number;
  topic: string;
  skillFocus: string | null;
  contentJson: string;
  metadataJson: string | null;
  status: string;
};

type BlackBoxRouteUpdatedRecord = {
  id: string;
  status: string;
  metadataJson: string | null;
};

type AdminContentBlackBoxDeps = {
  requireAdmin: typeof requireAdmin;
  findContent: (id: string) => Promise<BlackBoxRouteContentRecord | null>;
  updateContentMetadata: (id: string, metadataJson: string) => Promise<BlackBoxRouteUpdatedRecord>;
  runContentBlackBoxTest: typeof runContentBlackBoxTest;
  writeAuditLog: typeof writeAuditLog;
  now: () => Date;
};

async function defaultFindContent(id: string): Promise<BlackBoxRouteContentRecord | null> {
  return prisma.aIContentCache.findUnique({
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
}

async function defaultUpdateContentMetadata(id: string, metadataJson: string): Promise<BlackBoxRouteUpdatedRecord> {
  return prisma.aIContentCache.update({
    where: { id },
    data: { metadataJson },
    select: {
      id: true,
      status: true,
      metadataJson: true,
    },
  });
}

const defaultDeps: AdminContentBlackBoxDeps = {
  requireAdmin: (() => requireAdminPermission("MANAGE_CONTENT")) as typeof requireAdmin,
  findContent: defaultFindContent,
  updateContentMetadata: defaultUpdateContentMetadata,
  runContentBlackBoxTest,
  writeAuditLog,
  now: () => new Date(),
};

async function handleAdminContentBlackBoxPost(
  _request: Request,
  context: Context,
  deps: AdminContentBlackBoxDeps = defaultDeps,
) {
  const { session, response } = await deps.requireAdmin();
  if (!session) return response;

  const { id } = await context.params;

  const content = await deps.findContent(id);

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

  const blackBoxContentTest = deps.runContentBlackBoxTest({
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

  const testedAt = deps.now().toISOString();
  const score = Math.round(blackBoxContentTest.passRate * 100);
  const storedBlackBoxContentTest = {
    decision: blackBoxContentTest.decision,
    score,
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
    recalculatedAt: testedAt,
  };

  const clearedStale = clearBlackBoxStaleMetadata(metadata);
  const nextMetadata = mergeBlackBoxGateMetadata(clearedStale, {
    blackBoxContentTest: storedBlackBoxContentTest,
    blackBoxContentRetestedAt: testedAt,
    blackBoxContentRetestedBy: session.userId,
    blackBoxLiveTest: {
      status: blackBoxContentTest.decision === "REJECT" ? "failed" : "passed",
      score,
      reasons: blackBoxContentTest.reasons,
      testedAt,
    },
    blackBoxRuntimeTest: {
      status: "not_run",
      reasons: ["Runtime simulation pending. Save admin verification to run runtime test."],
      testedAt,
    },
    blackBoxAdminVerification: {
      status: "pending",
      decision: "needs_changes",
      notes: "Awaiting admin verification after Black Box re-run.",
      verifiedAt: null,
      verifiedBy: null,
    },
  });

  const updated = await deps.updateContentMetadata(content.id, JSON.stringify(nextMetadata));

  await deps.writeAuditLog({
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

export async function POST(_request: Request, context: Context) {
  return handleAdminContentBlackBoxPost(_request, context);
}
