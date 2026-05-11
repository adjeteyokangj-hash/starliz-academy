import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";

const createSchema = z.object({
  subject: z.string().trim().min(1).max(255),
  message: z.string().trim().max(5000).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const tickets = await prisma.supportTicket.findMany({
    where: { parentId: parentScope.parentId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ tickets });
}

export async function POST(req: NextRequest) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      parentId: parentScope.parentId,
      subject: parsed.data.subject,
      message: parsed.data.message ?? null,
      priority: parsed.data.priority,
      status: "open",
    },
  });

  return NextResponse.json({ ticket }, { status: 201 });
}
