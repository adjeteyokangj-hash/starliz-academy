import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import {
  mergeBlackBoxGateMetadata,
  parseContentMetadataJson,
} from "@/lib/ai/content-black-box-gate";

type Context = { params: Promise<{ journeyId: string; blockId: string }> };

const bodySchema = z.object({
  schoolId: z.string().min(1),
  contentJson: z.string().min(2),
});

export async function PATCH(request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response!;
  const { journeyId, blockId } = await context.params;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.contentJson);
  } catch {
    return NextResponse.json({ error: "contentJson must be valid JSON." }, { status: 400 });
  }
  if (
    (!Array.isArray(parsed) && (!parsed || typeof parsed !== "object"))
    || (Array.isArray(parsed) && parsed.length === 0)
  ) {
    return NextResponse.json({ error: "Content must contain at least one item." }, { status: 400 });
  }

  const journey = await prisma.shortLearningJourney.findFirst({
    where: { id: journeyId, schoolId: body.schoolId },
    select: { id: true, status: true },
  });
  if (!journey) return NextResponse.json({ error: "Journey not found." }, { status: 404 });
  if (journey.status === "published") {
    return NextResponse.json(
      { error: "Published content cannot be edited in place. Create a new review version." },
      { status: 409 },
    );
  }

  const block = await prisma.shortLearningJourneyBlock.findFirst({
    where: { id: blockId, journeyId, contentId: { not: null } },
  });
  if (!block?.contentId) {
    return NextResponse.json({ error: "Editable block not found." }, { status: 404 });
  }

  const content = await prisma.aIContentCache.findUnique({
    where: { id: block.contentId },
    select: { metadataJson: true },
  });
  if (!content) return NextResponse.json({ error: "Block content not found." }, { status: 404 });

  const now = new Date().toISOString();
  const metadata = mergeBlackBoxGateMetadata(parseContentMetadataJson(content.metadataJson), {
    manualAdminEdit: true,
    manualAdminEditedAt: now,
    manualAdminEditedBy: session.userId,
    blackBoxNeedsRerun: true,
    blackBoxStaleReason: "short_learning_manual_edit",
    blackBoxStaleAt: now,
    blackBoxLiveTest: {
      status: "needs_review",
      testedAt: now,
      reasons: ["Content changed. Re-run Black Box before approval and publication."],
    },
    blackBoxAdminVerification: {
      status: "pending",
      decision: "needs_changes",
      verifiedAt: null,
      verifiedBy: null,
    },
  });

  await prisma.$transaction([
    prisma.aIContentCache.update({
      where: { id: block.contentId },
      data: {
        contentJson: JSON.stringify(parsed),
        status: "generated",
        reviewedAt: null,
        approvedAt: null,
        publishedAt: null,
        metadataJson: JSON.stringify(metadata),
      },
    }),
    prisma.shortLearningJourneyBlock.update({
      where: { id: block.id },
      data: { reviewStatus: "awaiting_review" },
    }),
    prisma.shortLearningJourney.update({
      where: { id: journey.id },
      data: { status: "awaiting_review" },
    }),
  ]);

  await writeAuditLog({
    actorUserId: session.userId,
    action: "short_learning_content_edited",
    entityType: "short_learning_journey",
    entityId: journey.id,
    metadata: {
      schoolId: body.schoolId,
      blockId: block.id,
      contentId: block.contentId,
    },
  });

  return NextResponse.json({ ok: true, blockId: block.id, contentId: block.contentId });
}
