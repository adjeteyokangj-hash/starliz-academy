import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { hashPassword } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  password: z.string().min(8).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { id } = await params;

  try {
    const body = updateSchema.parse(await request.json());
    const data: Record<string, unknown> = {};
    if (body.name) data.name = body.name;
    if (body.email) data.email = body.email.toLowerCase();
    if (body.password) data.passwordHash = await hashPassword(body.password);

    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true },
    });

    await writeAuditLog({ actorUserId: session.userId, action: "admin.user.update", entityType: "user", entityId: id });

    return NextResponse.json({ admin: user });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { id } = await params;

  if (id === session.userId) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });
  await writeAuditLog({ actorUserId: session.userId, action: "admin.user.delete", entityType: "user", entityId: id });

  return NextResponse.json({ ok: true });
}
