import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { createBulkOnboardingBatch, executeBulkOnboardingBatch } from "@/lib/schools/trusts";

const createSchema = z.object({
  trustId: z.string().min(1).optional(),
  sourceType: z.enum(["csv", "api", "manual"]).optional(),
  fileRef: z.string().optional(),
  dryRun: z.boolean().optional(),
  rows: z.array(z.record(z.string(), z.unknown())).min(1),
});

const executeSchema = z.object({
  batchId: z.string().min(1),
});

export async function GET(request: NextRequest) {
  const { session, response } = await requireAdminPermission("MANAGE_USERS");
  if (!session) return response;

  const batchId = request.nextUrl.searchParams.get("batchId")?.trim() ?? "";
  const trustId = request.nextUrl.searchParams.get("trustId")?.trim() ?? "";

  if (batchId) {
    const batch = await prisma.bulkOnboardingBatch.findUnique({
      where: { id: batchId },
      include: {
        items: {
          orderBy: [{ rowNumber: "asc" }],
        },
      },
    });
    if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    return NextResponse.json({ batch });
  }

  const batches = await prisma.bulkOnboardingBatch.findMany({
    where: trustId ? { trustId } : undefined,
    include: {
      _count: { select: { items: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });

  return NextResponse.json({ batches });
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireAdminPermission("MANAGE_USERS");
  if (!session) return response;

  const body = await request.json().catch(() => null);
  const mode = body && typeof body.mode === "string" ? body.mode : "create";

  if (mode === "execute") {
    const parsed = executeSchema.safeParse(body.payload ?? body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
    }

    const batch = await executeBulkOnboardingBatch(parsed.data.batchId);
    return NextResponse.json({ batch });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const batch = await createBulkOnboardingBatch({
    trustId: parsed.data.trustId,
    createdByUserId: session.userId,
    sourceType: parsed.data.sourceType,
    fileRef: parsed.data.fileRef,
    dryRun: parsed.data.dryRun,
    rows: parsed.data.rows,
  });

  return NextResponse.json({ batch });
}
