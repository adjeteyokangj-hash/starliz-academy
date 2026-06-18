import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { buildBlackBoxGateFailure, hasPassedBlackBoxGate } from "@/lib/ai/content-black-box-gate";
import { summarizeQuestionDuplicatesForContent } from "@/lib/question-duplicate-detection";

type Context = { params: Promise<{ id: string }> };

type ReviewableContentRecord = {
  id: string;
  status: string;
  metadataJson: string | null;
  contentType?: string;
  keyStage?: string | null;
  yearGroup?: string | null;
  contentJson: string;
};

type ReviewedContentRecord = {
  id: string;
  status: string;
  reviewedAt: Date | null;
};

type HistoricalContentRecord = {
  id: string;
  status: string;
  contentType?: string;
  keyStage?: string | null;
  yearGroup?: string | null;
  contentJson: string;
};

type AdminContentReviewDeps = {
  requireAdmin: typeof requireAdmin;
  findContent: (id: string) => Promise<ReviewableContentRecord | null>;
  findHistoricalContent: () => Promise<HistoricalContentRecord[]>;
  updateContentToReviewed: (id: string) => Promise<ReviewedContentRecord>;
};

async function defaultFindContent(id: string): Promise<ReviewableContentRecord | null> {
  return prisma.aIContentCache.findUnique({
    where: { id },
    select: { id: true, status: true, metadataJson: true, contentType: true, keyStage: true, yearGroup: true, contentJson: true },
  });
}

async function defaultFindHistoricalContent(): Promise<HistoricalContentRecord[]> {
  return prisma.aIContentCache.findMany({
    select: { id: true, status: true, contentType: true, keyStage: true, yearGroup: true, contentJson: true },
    orderBy: { createdAt: "asc" },
  });
}

async function defaultUpdateContentToReviewed(id: string): Promise<ReviewedContentRecord> {
  return prisma.aIContentCache.update({
    where: { id },
    data: {
      status: "reviewed",
      reviewedAt: new Date(),
    },
    select: { id: true, status: true, reviewedAt: true },
  });
}

const defaultDeps: AdminContentReviewDeps = {
  requireAdmin,
  findContent: defaultFindContent,
  findHistoricalContent: defaultFindHistoricalContent,
  updateContentToReviewed: defaultUpdateContentToReviewed,
};

export async function handleAdminContentReviewPost(
  _request: Request,
  context: Context,
  deps: AdminContentReviewDeps = defaultDeps,
) {
  const { session, response } = await deps.requireAdmin();
  if (!session) return response;

  const { id } = await context.params;

  const content = await deps.findContent(id);

  if (!content) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  if (!["draft", "generated"].includes(content.status)) {
    return NextResponse.json(
      { error: `Content is already "${content.status}" and does not need review.` },
      { status: 422 },
    );
  }

  if (!hasPassedBlackBoxGate(content.metadataJson)) {
    return NextResponse.json(buildBlackBoxGateFailure(), { status: 409 });
  }

  const allRecords = await deps.findHistoricalContent();
  const globalDuplicateValidation = summarizeQuestionDuplicatesForContent({
    contentId: content.id,
    contentStatus: content.status,
    contentSubject: content.contentType ?? null,
    contentYearGroup: content.yearGroup,
    contentKeyStage: content.keyStage,
    contentJson: content.contentJson,
    historicalRecords: allRecords
      .filter((record) => record.id !== id)
      .map((record) => ({
        contentId: record.id,
        contentStatus: record.status,
        contentSubject: record.contentType ?? null,
        contentYearGroup: record.yearGroup,
        contentKeyStage: record.keyStage,
        contentJson: record.contentJson,
      })),
  });
  if (globalDuplicateValidation.hasDuplicates) {
    return NextResponse.json({
      error: "Review blocked: global duplicate questions remain. Replace or edit the duplicate slots before approving.",
      duplicateMatches: globalDuplicateValidation.matches,
    }, { status: 422 });
  }

  const updated = await deps.updateContentToReviewed(id);

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    reviewedAt: updated.reviewedAt?.toISOString(),
  });
}

export async function POST(request: Request, context: Context) {
  return handleAdminContentReviewPost(request, context);
}