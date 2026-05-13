import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { detectAndStoreWeakAreas } from "@/lib/ai/weak-area-detector";

export async function GET(request: Request) {
  const { session, response } = await requireAdminPermission("ai:run");
  if (!session) return response;

  const { searchParams } = new URL(request.url);
  const keyStage = searchParams.get("keyStage") ?? undefined;
  const yearGroup = searchParams.get("yearGroup") ?? undefined;

  const weakAreas = await prisma.weakArea.findMany({
    where: {
      status: { in: ["active", "improving"] },
      ...(keyStage ? { keyStage } : {}),
      ...(yearGroup ? { yearGroup } : {}),
    },
    orderBy: [{ status: "asc" }, { accuracy: "asc" }, { lastDetectedAt: "desc" }],
    take: 50,
    include: { student: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ weakAreas });
}

export async function POST() {
  const { session, response } = await requireAdminPermission("ai:run");
  if (!session) return response;

  const weakAreas = await detectAndStoreWeakAreas(session.userId);
  return NextResponse.json({ weakAreas });
}
