import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";

type Context = { params: Promise<{ journeyId: string }> };

const bodySchema = z.object({
  schoolId: z.string().min(1),
});

export async function POST(request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("APPROVE_CONTENT");
  if (!session) return response!;
  const { journeyId } = await context.params;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const journey = await prisma.shortLearningJourney.findFirst({
    where: { id: journeyId, schoolId: body.schoolId },
    include: { blocks: { where: { contentId: { not: null } }, select: { contentId: true } } },
  });
  if (!journey) return NextResponse.json({ error: "Journey not found." }, { status: 404 });
  if (journey.status !== "published") {
    return NextResponse.json({ error: "Journey is not published." }, { status: 409 });
  }

  const contentIds = journey.blocks.map((block) => block.contentId).filter(Boolean) as string[];
  await prisma.$transaction([
    prisma.shortLearningJourney.update({
      where: { id: journey.id },
      data: { status: "approved", publishedAt: null, publishedBy: null },
    }),
    prisma.aIContentCache.updateMany({
      where: { id: { in: contentIds } },
      data: { status: "approved", publishedAt: null },
    }),
  ]);

  await writeAuditLog({
    actorUserId: session.userId,
    action: "short_learning_content_unpublished",
    entityType: "short_learning_journey",
    entityId: journey.id,
    metadata: { schoolId: body.schoolId, version: journey.version },
  });

  return NextResponse.json({ ok: true, journeyId: journey.id, status: "approved" });
}
