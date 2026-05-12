import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { writeAuditLog } from "@/lib/audit";

type ParentThread = {
  id: string;
  channel: "text" | "whatsapp";
  contactAddress: string;
  contactLabel: string | null;
  unreadCount: number;
  parentUnreadCount: number;
  lastMessageAt: Date;
};

const sendSchema = z.object({
  subject: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(2000),
});

export async function GET(request: NextRequest) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ threads: [], messages: [] });
  }

  const threadId = request.nextUrl.searchParams.get("threadId")?.trim() ?? "";

  const threads = (await prisma.parentMessageThread.findMany({
    where: { parentId: parentScope.parentId },
    orderBy: { lastMessageAt: "desc" },
    take: 25,
  })) as ParentThread[];

  // Mark parent's unread as 0 when they visit their thread
  if (threadId && threads.some((t) => t.id === threadId)) {
    await prisma.parentMessageThread.update({
      where: { id: threadId },
      data: { parentUnreadCount: 0 },
    });
  }

  const latestMessages = new Map<string, { body: string; direction: "inbound" | "outbound" }>();
  if (threads.length) {
    const msgs = await prisma.parentMessage.findMany({
      where: { threadId: { in: threads.map((t) => t.id) } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    for (const msg of msgs as Array<{ threadId: string; body: string; direction: "inbound" | "outbound" }>) {
      if (!latestMessages.has(msg.threadId)) {
        latestMessages.set(msg.threadId, { body: msg.body, direction: msg.direction });
      }
    }
  }

  // Fetch full message history for the selected thread
  let threadMessages: Array<{
    id: string;
    direction: "inbound" | "outbound";
    body: string;
    actorUserId: string | null;
    createdAt: string;
  }> = [];

  const activeThreadId = threadId || threads[0]?.id;
  if (activeThreadId) {
    const msgs = (await prisma.parentMessage.findMany({
      where: { threadId: activeThreadId },
      orderBy: { createdAt: "asc" },
      take: 200,
    })) as Array<{
      id: string;
      direction: "inbound" | "outbound";
      body: string;
      actorUserId: string | null;
      createdAt: Date;
    }>;
    threadMessages = msgs.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      actorUserId: m.actorUserId,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  return NextResponse.json({
    threads: threads.map((t) => ({
      id: t.id,
      channel: t.channel,
      contactAddress: t.contactAddress,
      contactLabel: t.contactLabel,
      unreadCount: t.unreadCount,
      parentUnreadCount: t.parentUnreadCount,
      lastMessageAt: t.lastMessageAt.toISOString(),
      lastMessage: latestMessages.get(t.id)?.body ?? "",
      lastDirection: latestMessages.get(t.id)?.direction ?? "outbound",
    })),
    selectedThreadId: activeThreadId ?? null,
    messages: threadMessages,
  });
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent profile not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { subject, body: messageBody } = parsed.data;
  const fullBody = subject ? `[${subject}]\n${messageBody}` : messageBody;

  // Get parent email for contact address
  const parentUser = await prisma.user.findUnique({
    where: { id: parentScope.parentId },
    select: { email: true, name: true },
  });
  if (!parentUser) {
    return NextResponse.json({ error: "Parent not found" }, { status: 404 });
  }

  const contactAddress = parentUser.email;
  const channel = "text" as const;

  // Upsert the thread for this parent
  const thread = await prisma.parentMessageThread.upsert({
    where: { channel_contactAddress: { channel, contactAddress } },
    update: {
      parentId: parentScope.parentId,
      parentEmail: parentUser.email,
      contactLabel: parentUser.name ?? parentUser.email,
      lastMessageAt: new Date(),
      lastInboundAt: new Date(),
      unreadCount: { increment: 1 },
    },
    create: {
      channel,
      contactAddress,
      parentId: parentScope.parentId,
      parentEmail: parentUser.email,
      contactLabel: parentUser.name ?? parentUser.email,
      lastMessageAt: new Date(),
      lastInboundAt: new Date(),
      unreadCount: 1,
      parentUnreadCount: 0,
    },
  });

  const message = await prisma.parentMessage.create({
    data: {
      threadId: thread.id,
      direction: "inbound",
      body: fullBody,
      fromAddress: parentUser.email,
      toAddress: "support@starlizacademy.com",
      actorUserId: session.userId,
      sentAt: new Date(),
    },
  });

  await writeAuditLog({
    actorUserId: session.userId,
    action: "PARENT_MESSAGE_SENT",
    entityType: "ParentMessage",
    entityId: message.id,
    metadata: { threadId: thread.id, subject: subject ?? null },
  });

  return NextResponse.json({ success: true, messageId: message.id, threadId: thread.id }, { status: 201 });
}