import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";

/**
 * GET /api/content/browse?subject=spelling&level=1
 * Returns up to 30 approved/published AIContentCache items for the parent to assign.
 * Parents only — auth-guarded.
 */
export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const url = new URL(request.url);
  const subject = url.searchParams.get("subject") ?? undefined;
  const levelParam = url.searchParams.get("level");
  const level = levelParam ? parseInt(levelParam, 10) : undefined;

  const items = await prisma.aIContentCache.findMany({
    where: {
      status: { in: ["approved", "published"] },
      ...(subject ? { contentType: subject } : {}),
      ...(level !== undefined && !isNaN(level) ? { level } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      contentType: true,
      level: true,
      topic: true,
      skillFocus: true,
      keyStage: true,
      yearGroup: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      subject: item.contentType,
      level: item.level,
      title: item.skillFocus || item.topic || `${item.contentType} practice`,
      topic: item.topic,
      keyStage: item.keyStage,
      yearGroup: item.yearGroup,
      createdAt: item.createdAt.toISOString(),
    })),
  });
}
