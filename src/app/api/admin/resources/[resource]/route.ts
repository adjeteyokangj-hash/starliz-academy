import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { adminResourceDelegates, adminResourceSchemas, adminResourceSearchFields, isAdminResource } from "@/lib/admin-resources";

type Delegate = {
  findMany(args?: unknown): Promise<unknown[]>;
  create(args: unknown): Promise<{ id: string }>;
};

function getDelegate(resource: string): Delegate | null {
  if (!isAdminResource(resource)) return null;
  const delegateName = adminResourceDelegates[resource];
  return (prisma as unknown as Record<string, Delegate>)[delegateName] ?? null;
}

export async function GET(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  const { session, response } = await requireAdminPermission("content:view");
  if (!session) return response;

  const { resource } = await params;
  const delegate = getDelegate(resource);
  if (!delegate || !isAdminResource(resource)) {
    return NextResponse.json({ error: "Unknown admin resource." }, { status: 404 });
  }

  const search = new URL(request.url).searchParams.get("search")?.trim();
  const searchFields = adminResourceSearchFields[resource];
  const records = await delegate.findMany({
    where: search
      ? {
          OR: searchFields.map((field) => ({ [field]: { contains: search } })),
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ records });
}

export async function POST(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  const { session, response } = await requireAdminPermission("content:edit");
  if (!session) return response;

  const { resource } = await params;
  const delegate = getDelegate(resource);
  if (!delegate || !isAdminResource(resource)) {
    return NextResponse.json({ error: "Unknown admin resource." }, { status: 404 });
  }

  try {
    const data = adminResourceSchemas[resource].parse(await request.json());
    const record = await delegate.create({ data });
    await writeAuditLog({
      actorUserId: session.userId,
      action: `${resource}.create`,
      entityType: resource,
      entityId: record.id,
    });
    return NextResponse.json({ record }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid resource payload." }, { status: 400 });
  }
}
