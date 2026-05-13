import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { validateAiContentQuality } from "@/lib/ai/content-quality";

const saveContentSchema = z.object({
  type: z.enum(["spelling", "math", "reading"]),
  ageGroup: z.string().optional(),
  keyStage: z.string().optional(),
  yearGroup: z.string().optional(),
  skillFocus: z.string().optional(),
  difficulty: z.number().int().min(1).max(10),
  topic: z.string().optional(),
  items: z.unknown(),
  status: z.enum(["generated", "review", "reviewed", "approved", "published", "rejected"]).default("generated"),
  model: z.string().optional(),
  prompt: z.string().optional(),
  estimatedCostPence: z.number().int().min(0).optional(),
});

function extractGeneratedItems(items: unknown): unknown {
  if (items && typeof items === "object" && !Array.isArray(items) && Array.isArray((items as Record<string, unknown>).items)) {
    return (items as Record<string, unknown>).items;
  }
  return items;
}

export async function GET(req: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { searchParams } = new URL(req.url);
  const contentType = searchParams.get("type") ?? undefined;
  const level = searchParams.get("level") ? Number(searchParams.get("level")) : undefined;
  const skillParam = searchParams.get("skill") ?? undefined;
  const keyStage = searchParams.get("keyStage") ?? undefined;
  const yearGroup = searchParams.get("yearGroup") ?? undefined;

  const items = await prisma.aIContentCache.findMany({
    where: {
      ...(contentType ? { contentType } : {}),
      ...(level !== undefined ? { level } : {}),
      ...(keyStage ? { keyStage } : {}),
      ...(yearGroup ? { yearGroup } : {}),
      ...(skillParam ? { OR: [{ skillFocus: { contains: skillParam } }, { skills: { contains: skillParam } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    items: items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      reviewedAt: item.reviewedAt?.toISOString() ?? null,
      approvedAt: item.approvedAt?.toISOString() ?? null,
      publishedAt: item.publishedAt?.toISOString() ?? null,
    })),
  });
}

export async function DELETE(req: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { id } = await req.json();
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await prisma.aIContentCache.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const body = saveContentSchema.parse(await req.json());
    const maxDifficulty = body.type === "reading" ? 10 : 5;
    if (body.difficulty > maxDifficulty) {
      return NextResponse.json(
        { error: `Difficulty must be between 1 and ${maxDifficulty} for ${body.type}.` },
        { status: 422 },
      );
    }
    const status = body.status === "review" ? "reviewed" : body.status;
    const contentItems = extractGeneratedItems(body.items);
    const quality = validateAiContentQuality({
      type: body.type,
      keyStage: body.keyStage,
      yearGroup: body.yearGroup,
      skillFocus: body.skillFocus,
      items: contentItems,
    });
    if (!quality.ok) {
      return NextResponse.json({ error: quality.error }, { status: 422 });
    }

    const item = await prisma.aIContentCache.create({
      data: {
        contentType: body.type,
        level: body.difficulty,
        topic: body.topic || body.skillFocus || body.ageGroup || "",
        contentJson: JSON.stringify(contentItems),
        status,
        reviewedAt: status === "reviewed" ? new Date() : undefined,
        approvedAt: status === "approved" || status === "published" ? new Date() : undefined,
        publishedAt: status === "published" ? new Date() : undefined,
        createdBy: session.email,
        model: body.model,
        prompt: body.prompt,
        keyStage: body.keyStage,
        yearGroup: body.yearGroup,
        skillFocus: body.skillFocus,
        estimatedCostPence: body.estimatedCostPence ?? 0,
        metadataJson: JSON.stringify({
          ageGroup: body.ageGroup,
          source: "ai-generator",
          version: 1,
          subject: body.type,
          yearGroup: body.yearGroup,
          keyStage: body.keyStage,
          skillFocus: body.skillFocus,
          difficulty: body.difficulty,
          topic: body.topic,
          qualityScore: (body.items as Record<string, unknown> | null)?.qualityScore ?? null,
          safetyStatus: (body.items as Record<string, unknown> | null)?.safetyStatus ?? null,
          approvalStatus: body.status,
          generatedPreview: body.items && typeof body.items === "object" && !Array.isArray(body.items) ? body.items : undefined,
        }),
      },
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "ai_content.saved",
      entityType: "AIContentCache",
      entityId: item.id,
      metadata: { type: body.type, status, ageGroup: body.ageGroup, keyStage: body.keyStage, yearGroup: body.yearGroup, skillFocus: body.skillFocus },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid content payload." }, { status: 400 });
  }
}
