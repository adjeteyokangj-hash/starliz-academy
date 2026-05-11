import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";

const updateParentSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
});

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("parents:write");
  if (!session) return response;

  const { id } = await context.params;
  const parent = await prisma.user.findFirst({
    where: { id, role: "parent" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      activeChildId: true,
      createdAt: true,
      updatedAt: true,
      children: {
        where: { archived: false },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          age: true,
          yearGroup: true,
          level: true,
          stars: true,
          xp: true,
          streak: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!parent) {
    return NextResponse.json({ error: "Parent not found." }, { status: 404 });
  }

  return NextResponse.json({
    parent: {
      ...parent,
      createdAt: parent.createdAt.toISOString(),
      updatedAt: parent.updatedAt.toISOString(),
      children: parent.children.map((child) => ({ ...child, updatedAt: child.updatedAt.toISOString() })),
    },
  });
}

export async function PATCH(request: Request, context: Context) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { id } = await context.params;
  try {
    const body = updateParentSchema.parse(await request.json());
    const parent = await prisma.user.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.email ? { email: body.email.toLowerCase() } : {}),
      },
      select: { id: true, name: true, email: true, role: true },
    });

    if (parent.role !== "parent") {
      return NextResponse.json({ error: "Target user is not a parent." }, { status: 400 });
    }

    await writeAuditLog({
      actorUserId: session.userId,
      action: "updated",
      entityType: "parent",
      entityId: parent.id,
      metadata: body,
    });

    return NextResponse.json({ parent });
  } catch {
    return NextResponse.json({ error: "Invalid parent update." }, { status: 400 });
  }
}
