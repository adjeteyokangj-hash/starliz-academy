import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { adminResourceDelegates, adminResourceSchemas, isAdminResource } from "@/lib/admin-resources";

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
    const data = schema.parse(await request.json());
    const record = await delegate.update({ where: { id }, data });
    await writeAuditLog({
      actorUserId: session.userId,
      action: `${resource}.update`,
      entityType: resource,
      entityId: id,
    });
    return NextResponse.json({ record });
  } catch {
    return NextResponse.json({ error: "Invalid resource payload." }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ resource: string; id: string }> }) {
  const { session, response } = await requireAdminPermission("content:delete");
  if (!session) return response;

  const { resource, id } = await params;
  const delegate = getDelegate(resource);
  if (!delegate) return NextResponse.json({ error: "Unknown admin resource." }, { status: 404 });

  await delegate.delete({ where: { id } });
  await writeAuditLog({
    actorUserId: session.userId,
    action: `${resource}.delete`,
    entityType: resource,
    entityId: id,
  });
  return NextResponse.json({ ok: true });
}
