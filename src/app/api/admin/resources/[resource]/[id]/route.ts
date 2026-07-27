import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { adminResourceDelegates, adminResourceSchemas, isAdminResource } from "@/lib/admin-resources";
import { applyStoreItemPolicy, enrichStoreItemsWithPolicy, splitStoreItemWrite } from "@/lib/store_item_db";

type Delegate = {
  findUnique(args: unknown): Promise<unknown | null>;
  update(args: unknown): Promise<{ id: string }>;
  delete(args: unknown): Promise<{ id: string }>;
};

function getDelegate(resource: string): Delegate | null {
  if (!isAdminResource(resource)) return null;
  const delegateName = adminResourceDelegates[resource];
  return (prisma as unknown as Record<string, Delegate>)[delegateName] ?? null;
}

export async function GET(_: Request, { params }: { params: Promise<{ resource: string; id: string }> }) {
  const { session, response } = await requireAdminPermission("content:view");
  if (!session) return response;

  const { resource, id } = await params;
  const delegate = getDelegate(resource);
  if (!delegate) return NextResponse.json({ error: "Unknown admin resource." }, { status: 404 });

  const record = await delegate.findUnique({ where: { id } });
  if (!record) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (resource === "store") {
    const [enriched] = await enrichStoreItemsWithPolicy([record as { id: string }]);
    return NextResponse.json({ record: enriched });
  }
  return NextResponse.json({ record });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ resource: string; id: string }> }) {
  const { session, response } = await requireAdminPermission("content:edit");
  if (!session) return response;

  const { resource, id } = await params;
  const delegate = getDelegate(resource);
  if (!delegate || !isAdminResource(resource)) {
    return NextResponse.json({ error: "Unknown admin resource." }, { status: 404 });
  }

  try {
    const schema = adminResourceSchemas[resource].partial();
    const parsed = schema.parse(await request.json());
    if (resource === "store") {
      const { base, policy } = splitStoreItemWrite(parsed as Record<string, unknown>);
      const record = Object.keys(base).length
        ? await prisma.storeItem.update({ where: { id }, data: base as never })
        : await prisma.storeItem.findUniqueOrThrow({ where: { id } });
      await applyStoreItemPolicy(id, policy);
      await writeAuditLog({
        actorUserId: session.userId,
        action: `${resource}.update`,
        entityType: resource,
        entityId: id,
      });
      const [enriched] = await enrichStoreItemsWithPolicy([record]);
      return NextResponse.json({ record: enriched });
    }

    const record = await delegate.update({ where: { id }, data: parsed });
    await writeAuditLog({
      actorUserId: session.userId,
      action: `${resource}.update`,
      entityType: resource,
      entityId: id,
    });

    const nextStatus =
      typeof (parsed as { status?: unknown }).status === "string"
        ? (parsed as { status: string }).status.toLowerCase()
        : null;
    if (resource === "support" && nextStatus && ["archived", "closed", "resolved"].includes(nextStatus)) {
      await writeAuditLog({
        actorUserId: session.userId,
        action: "support_ticket_archived",
        entityType: resource,
        entityId: id,
        metadata: { status: nextStatus },
      });
    }
    return NextResponse.json({ record });
  } catch (error) {
    console.error(`[admin/${resource}] PATCH failed`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid resource payload." },
      { status: 400 },
    );
  }
}

/**
 * Resources whose records must be retained rather than hard-deleted. Support
 * tickets carry communication history that must survive for audit/retention, so
 * they are closed/archived through PATCH (status) instead of destructive delete.
 */
const RETENTION_PROTECTED_RESOURCES = new Set(["support"]);

export async function DELETE(_: Request, { params }: { params: Promise<{ resource: string; id: string }> }) {
  const { session, response } = await requireAdminPermission("content:delete");
  if (!session) return response;

  const { resource, id } = await params;
  const delegate = getDelegate(resource);
  if (!delegate) return NextResponse.json({ error: "Unknown admin resource." }, { status: 404 });

  if (RETENTION_PROTECTED_RESOURCES.has(resource)) {
    await writeAuditLog({
      actorUserId: session.userId,
      action: "support_ticket_delete_rejected",
      entityType: resource,
      entityId: id,
      metadata: { reason: "retention_protected" },
    });
    return NextResponse.json(
      {
        error:
          "Support tickets cannot be permanently deleted. Close or archive the ticket to preserve its history.",
      },
      { status: 409 },
    );
  }

  await delegate.delete({ where: { id } });
  await writeAuditLog({
    actorUserId: session.userId,
    action: `${resource}.delete`,
    entityType: resource,
    entityId: id,
  });
  return NextResponse.json({ ok: true });
}
