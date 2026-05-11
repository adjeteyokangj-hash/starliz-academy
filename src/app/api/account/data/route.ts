import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";

export async function DELETE() {
  const { session, response } = await requireSession();
  if (!session) return response;

  await prisma.childProfile.deleteMany({ where: { parentId: session.userId } });
  await prisma.user.update({ where: { id: session.userId }, data: { activeChildId: null } });

  return NextResponse.json({ ok: true });
}
