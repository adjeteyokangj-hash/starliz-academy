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

type SessionResult = Awaited<ReturnType<typeof requireSession>>;
type ParentScope = Awaited<ReturnType<typeof resolveParentScope>>;

type ParentMessagesGetDeps = {
  requireSession: () => Promise<SessionResult>;
  resolveParentScope: (session: NonNullable<SessionResult["session"]>) => Promise<ParentScope>;
  listThreads: (parentId: string) => Promise<ParentThread[]>;
  clearParentUnread: (threadId: string) => Promise<void>;
  listLatestMessages: (threadIds: string[]) => Promise<Array<{ threadId: string; body: string; direction: "inbound" | "outbound" }>>;
  listThreadMessages: (input: { threadId: string; parentId: string }) => Promise<Array<{
    id: string;
    direction: "inbound" | "outbound";
    body: string;
    actorUserId: string | null;
    createdAt: Date;
  }>>;
  writeAuditLog: typeof writeAuditLog;
};

const defaultGetDeps: ParentMessagesGetDeps = {
  requireSession,
  resolveParentScope,
  listThreads: async (parentId) =>
    (await prisma.parentMessageThread.findMany({
      where: { parentId },
      orderBy: { lastMessageAt: "desc" },
      take: 25,
    })) as ParentThread[],
  clearParentUnread: async (threadId) => {
    await prisma.parentMessageThread.update({
      where: { id: threadId },
      data: { parentUnreadCount: 0 },
    });
  },
  listLatestMessages: async (threadIds) => {
    if (!threadIds.length) return [];
    return (await prisma.parentMessage.findMany({
      where: { threadId: { in: threadIds } },
      orderBy: { createdAt: "desc" },
      take: 200,
    })) as Array<{ threadId: string; body: string; direction: "inbound" | "outbound" }>;
  },
  listThreadMessages: async ({ threadId, parentId }) =>
    (await prisma.parentMessage.findMany({
      where: {
        threadId,
        thread: { parentId },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    })) as Array<{
      id: string;
      direction: "inbound" | "outbound";
      body: string;
      actorUserId: string | null;
      createdAt: Date;
    }>,
  writeAuditLog,
};

export async function handleParentMessagesGet(
  request: NextRequest,
  deps: ParentMessagesGetDeps = defaultGetDeps,
) {
  const { session, response } = await deps.requireSession();
  if (!session) return response!;

  const parentScope = await deps.resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ threads: [], messages: [] });
  }

  const threadId = request.nextUrl.searchParams.get("threadId")?.trim() ?? "";
  const threads = await deps.listThreads(parentScope.parentId);

  if (threadId && threads.some((t) => t.id === threadId)) {
    await deps.clearParentUnread(threadId);
  }

  const latestMessages = new Map<string, { body: string; direction: "inbound" | "outbound" }>();
  const latestRows = await deps.listLatestMessages(threads.map((t) => t.id));
  for (const msg of latestRows) {
    if (!latestMessages.has(msg.threadId)) {
      latestMessages.set(msg.threadId, { body: msg.body, direction: msg.direction });
    }
  }

  let threadMessages: Array<{
    id: string;
    direction: "inbound" | "outbound";
    body: string;
    createdAt: string;
  }> = [];

  const requestedThreadId = threadId || threads[0]?.id || "";
  const ownsRequestedThread = Boolean(
    requestedThreadId && threads.some((t) => t.id === requestedThreadId),
  );

  if (threadId && !ownsRequestedThread) {
    await deps.writeAuditLog({
      actorUserId: session.userId,
      action: "message_access_denied",
      entityType: "ParentMessageThread",
      entityId: threadId,
      metadata: { parentId: parentScope.parentId },
    });
    return NextResponse.json({ error: "Thread not found." }, { status: 404 });
  }

  const activeThreadId = ownsRequestedThread ? requestedThreadId : null;
  if (activeThreadId) {
    const msgs = await deps.listThreadMessages({
      threadId: activeThreadId,
      parentId: parentScope.parentId,
    });
    threadMessages = msgs.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
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
    selectedThreadId: activeThreadId,
    messages: threadMessages,
  });
}

export async function GET(request: NextRequest) {
  return handleParentMessagesGet(request);
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

  const parentUser = await prisma.user.findUnique({
    where: { id: parentScope.parentId },
    select: { email: true, name: true },
  });
  if (!parentUser) {
    return NextResponse.json({ error: "Parent not found" }, { status: 404 });
  }

  const contactAddress = parentUser.email;
  const channel = "text" as const;

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
