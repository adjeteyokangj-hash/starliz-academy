import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";

async function listCanonicalWeakAreas(input: { keyStage?: string; yearGroup?: string }) {
  return prisma.weakArea.findMany({
    where: {
      status: { in: ["active", "improving"] },
      ...(input.keyStage ? { keyStage: input.keyStage } : {}),
      ...(input.yearGroup ? { yearGroup: input.yearGroup } : {}),
    },
    orderBy: [{ status: "asc" }, { accuracy: "asc" }, { lastDetectedAt: "desc" }],
    take: 50,
    include: { student: { select: { id: true, name: true } } },
  });
}

export async function GET(request: Request) {
  const { session, response } = await requireAdminPermission("ai:run");
  if (!session) return response;

  const { searchParams } = new URL(request.url);
  const keyStage = searchParams.get("keyStage") ?? undefined;
  const yearGroup = searchParams.get("yearGroup") ?? undefined;

  const weakAreas = await listCanonicalWeakAreas({ keyStage, yearGroup });
  return NextResponse.json({ weakAreas });
}

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("ai:run");
  if (!session) return response;

  const { searchParams } = new URL(request.url);
  const keyStage = searchParams.get("keyStage") ?? undefined;
  const yearGroup = searchParams.get("yearGroup") ?? undefined;

  const weakAreas = await listCanonicalWeakAreas({ keyStage, yearGroup });
  return NextResponse.json({
    weakAreas,
    recalculated: false,
    source: "canonical_learning_activity",
    message: "Weak areas are maintained by canonical learning activity writes; legacy ProgressRecord recalculation is disabled.",
  });
}
