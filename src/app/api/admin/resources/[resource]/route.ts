import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { adminResourceDelegates, adminResourceSchemas, adminResourceSearchFields, isAdminResource } from "@/lib/admin-resources";
import { ensureCatalogItemsInDb } from "@/app/api/shop/_helpers";
import { applyStoreItemPolicy, enrichStoreItemsWithPolicy, splitStoreItemWrite } from "@/lib/store_item_db";

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

  if (resource === "store") {
    try {
      await ensureCatalogItemsInDb();
    } catch (error) {
      console.error("[admin/store] catalog seed failed", error);
    }
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
    take: 200,
  });

  if (resource === "store") {
    const enriched = await enrichStoreItemsWithPolicy(records as Array<{ id: string }>);
    return NextResponse.json({ records: enriched });
  }

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
    const parsed = adminResourceSchemas[resource].parse(await request.json());
    if (resource === "store") {
      const { base, policy } = splitStoreItemWrite(parsed as Record<string, unknown>);
      const record = await prisma.storeItem.create({ data: base as never });
      await applyStoreItemPolicy(record.id, {
        rewardType: policy.rewardType ?? "digital",
        approvalMode: policy.approvalMode ?? "none",
        stockTotal: policy.stockTotal ?? null,
      });
      await writeAuditLog({
        actorUserId: session.userId,
        action: `${resource}.create`,
        entityType: resource,
        entityId: record.id,
      });
      const [enriched] = await enrichStoreItemsWithPolicy([record]);
      return NextResponse.json({ record: enriched }, { status: 201 });
    }

    const record = await delegate.create({ data: parsed });
    await writeAuditLog({
      actorUserId: session.userId,
      action: `${resource}.create`,
      entityType: resource,
      entityId: record.id,
    });
    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    console.error(`[admin/${resource}] POST failed`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid resource payload." },
      { status: 400 },
    );
  }
}
