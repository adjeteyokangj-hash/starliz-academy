import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { buildBlackBoxGateFailure, hasPassedBlackBoxGate } from "@/lib/ai/content-black-box-gate";
import { analyzeContentSessionSlots, getIncompleteSlotsReason } from "@/lib/session-slot-validation";
import { analyzeSessionSlotDuplicates } from "@/lib/session-slot-duplicates";
import { summarizeQuestionDuplicatesForContent } from "@/lib/question-duplicate-detection";

type Context = { params: Promise<{ id: string }> };

type PublishableContentRecord = {
  id: string;
  status: string;
  metadataJson: string | null;
  contentType: string;
  keyStage?: string | null;
  yearGroup?: string | null;
  contentJson: string;
};

type PublishedContentRecord = {
  id: string;
  status: string;
  publishedAt: Date | null;
};

type HistoricalContentRecord = {
  id: string;
  status: string;
  contentType?: string;
  keyStage?: string | null;
  yearGroup?: string | null;
  contentJson: string;
};

type AdminContentPublishDeps = {
  requireAdmin: typeof requireAdmin;
  findContent: (id: string) => Promise<PublishableContentRecord | null>;
  findHistoricalContent: () => Promise<HistoricalContentRecord[]>;
  updateContentToPublished: (id: string) => Promise<PublishedContentRecord>;
};

async function defaultFindContent(id: string): Promise<PublishableContentRecord | null> {
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

async function defaultUpdateContentToPublished(id: string): Promise<PublishedContentRecord> {
  return prisma.aIContentCache.update({
    where: { id },
    data: {
      status: "published",
      publishedAt: new Date(),
    },
    select: { id: true, status: true, publishedAt: true },
  });
}

const defaultDeps: AdminContentPublishDeps = {
  requireAdmin,
  findContent: defaultFindContent,
  findHistoricalContent: defaultFindHistoricalContent,
  updateContentToPublished: defaultUpdateContentToPublished,
};

export async function handleAdminContentPublishPost(
  _request: Request,
  context: Context,
  deps: AdminContentPublishDeps = defaultDeps,
) {
  const { session, response } = await deps.requireAdmin();
  if (!session) return response;

  const { id } = await context.params;

  const content = await deps.findContent(id);

  if (!content) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  if (!["reviewed", "approved", "published"].includes(content.status)) {
    return NextResponse.json(
      { error: `Cannot publish content with status "${content.status}". Status must be "reviewed", "approved", or "published".` },
      { status: 422 },
    );
  }

  if (!hasPassedBlackBoxGate(content.metadataJson)) {
    return NextResponse.json(buildBlackBoxGateFailure(), { status: 409 });
  }

  const slotValidation = analyzeContentSessionSlots({
    contentJson: content.contentJson,
    contentType: content.contentType,
    metadataJson: content.metadataJson,
  });

  if (!slotValidation.isSessionComplete) {
    return NextResponse.json({ error: getIncompleteSlotsReason(slotValidation.missingSlots) }, { status: 422 });
  }

  const duplicateValidation = analyzeSessionSlotDuplicates({
    contentJson: content.contentJson,
    contentType: content.contentType,
    metadataJson: content.metadataJson,
  });
  if (duplicateValidation.hasExactDuplicates) {
    return NextResponse.json({
      error: `Publishing blocked: ${duplicateValidation.exactCount} exact duplicate question pair${duplicateValidation.exactCount === 1 ? "" : "s"} found.`,
    }, { status: 422 });
  }

  const allRecords = await deps.findHistoricalContent();
  const globalDuplicateValidation = summarizeQuestionDuplicatesForContent({
    contentId: content.id,
    contentStatus: content.status,
    contentSubject: content.contentType,
    contentYearGroup: content.yearGroup,
    contentKeyStage: content.keyStage,
    contentJson: content.contentJson,
    historicalRecords: allRecords
      .filter((record) => record.id !== id)
      .map((record) => ({
        contentId: record.id,
        contentStatus: record.status,
        contentSubject: record.contentType,
        contentYearGroup: record.yearGroup,
        contentKeyStage: record.keyStage,
        contentJson: record.contentJson,
      })),
  });
  if (globalDuplicateValidation.hasDuplicates) {
    return NextResponse.json({
      error: "Publishing blocked: global duplicate questions remain. Replace or edit the duplicate slots before publishing.",
      duplicateMatches: globalDuplicateValidation.matches,
    }, { status: 422 });
  }

  const updated = await deps.updateContentToPublished(id);

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    publishedAt: updated.publishedAt?.toISOString(),
    duplicateWarnings: duplicateValidation.nearCount + duplicateValidation.samePatternCount > 0
      ? [{
          nearDuplicates: duplicateValidation.nearCount,
          samePatternDuplicates: duplicateValidation.samePatternCount,
          duplicateSlots: duplicateValidation.duplicateSlotsCount,
        }]
      : [],
  });
}

export async function POST(request: Request, context: Context) {
  return handleAdminContentPublishPost(request, context);
}
