import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";

type Context = { params: Promise<{ journeyId: string }> };

export async function GET(_request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response!;
  const { journeyId } = await context.params;

  const journey = await prisma.shortLearningJourney.findUnique({
    where: { id: journeyId },
    include: {
      school: { select: { id: true, name: true } },
      blocks: { orderBy: { order: "asc" } },
    },
  });
  if (!journey) {
    return NextResponse.json({ error: "Journey not found." }, { status: 404 });
  }

  const contentIds = journey.blocks.map((b) => b.contentId).filter(Boolean) as string[];
  const contents = contentIds.length
    ? await prisma.aIContentCache.findMany({
        where: { id: { in: contentIds } },
        select: {
          id: true,
          status: true,
          contentType: true,
          topic: true,
          yearGroup: true,
          skillFocus: true,
          model: true,
          metadataJson: true,
          contentJson: true,
        },
      })
    : [];
  const byId = Object.fromEntries(contents.map((c) => [c.id, c]));

  return NextResponse.json({
    ok: true,
    journey: {
      ...journey,
      blocks: journey.blocks.map((b) => ({
        ...b,
        content: b.contentId ? byId[b.contentId] ?? null : null,
      })),
    },
  });
}

const patchSchema = z.object({
  schoolId: z.string().min(1),
  action: z.enum(["request_changes", "set_topic"]).optional(),
  topic: z.string().trim().max(180).optional(),
  note: z.string().trim().max(1000).optional(),
});

export async function PATCH(request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response!;
  const { journeyId } = await context.params;

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const journey = await prisma.shortLearningJourney.findFirst({
    where: { id: journeyId, schoolId: body.schoolId },
  });
  if (!journey) {
    return NextResponse.json({ error: "Journey not found." }, { status: 404 });
  }
  if (journey.status === "published") {
    return NextResponse.json(
      { error: "Published journeys cannot be edited silently. Unpublish or regenerate a new version." },
      { status: 409 },
    );
  }

  const data: { status?: string; topic?: string } = {};
  if (body.action === "request_changes") data.status = "changes_requested";
  if (body.topic !== undefined) data.topic = body.topic;

  const updated = await prisma.shortLearningJourney.update({
    where: { id: journeyId },
    data,
    include: { blocks: { orderBy: { order: "asc" } } },
  });

  await writeAuditLog({
    actorUserId: session.userId,
    action: body.action === "request_changes"
      ? "short_learning_content_changes_requested"
      : "short_learning_content_edited",
    entityType: "short_learning_journey",
    entityId: journeyId,
    metadata: { schoolId: body.schoolId, note: body.note ?? null },
  });

  return NextResponse.json({ ok: true, journey: updated });
}
