import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { attachSchoolToTrust, createTrust, updateTrust } from "@/lib/schools/trusts";

const createTrustSchema = z.object({
  name: z.string().trim().min(2),
  code: z.string().trim().min(2),
  headquartersRegion: z.string().trim().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const attachSchema = z.object({
  trustId: z.string().min(1),
  schoolId: z.string().min(1),
  roleInTrust: z.string().trim().optional(),
});

const updateTrustSchema = z.object({
  trustId: z.string().min(1),
  name: z.string().trim().min(2).optional(),
  code: z.string().trim().min(2).optional(),
  headquartersRegion: z.string().trim().optional(),
  status: z.string().trim().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const { session, response } = await requireAdminPermission("MANAGE_USERS");
  if (!session) return response;

  const trustId = request.nextUrl.searchParams.get("trustId")?.trim() ?? "";

  if (trustId) {
    const trust = await prisma.trust.findUnique({
      where: { id: trustId },
      include: {
        schoolMemberships: {
          include: { school: true },
          orderBy: [{ createdAt: "desc" }],
        },
        adminMemberships: {
          include: { user: { select: { id: true, email: true, name: true } } },
          orderBy: [{ createdAt: "desc" }],
        },
      },
    });

    if (!trust) return NextResponse.json({ error: "Trust not found" }, { status: 404 });
    return NextResponse.json({ trust });
  }

  const trusts = await prisma.trust.findMany({
    include: {
      _count: {
        select: {
          schoolMemberships: true,
          adminMemberships: true,
          bulkBatches: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json({ trusts });
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireAdminPermission("MANAGE_USERS");
  if (!session) return response;

  const body = await request.json().catch(() => null);
  const mode = body && typeof body.mode === "string" ? body.mode : "create";

  if (mode === "attachSchool") {
    const parsed = attachSchema.safeParse(body.payload ?? body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
    }
    const membership = await attachSchoolToTrust(parsed.data);
    return NextResponse.json({ membership });
  }

  if (mode === "update") {
    const parsed = updateTrustSchema.safeParse(body.payload ?? body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
    }

    const trust = await updateTrust(parsed.data);
    return NextResponse.json({ trust });
  }

  const parsed = createTrustSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const trust = await createTrust(parsed.data);
  return NextResponse.json({ trust });
}
