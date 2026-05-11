import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";

type ParentThread = {
  id: string;
  channel: "text" | "whatsapp";
  contactAddress: string;
  contactLabel: string | null;
  unreadCount: number;
  lastMessageAt: Date;
};

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ threads: [] });
  }

  const threads = (await prisma.parentMessageThread.findMany({
    where: { parentId: parentScope.parentId },
    orderBy: { lastMessageAt: "desc" },
    take: 25,
  })) as ParentThread[];

  const latestMessages = new Map<string, { body: string; direction: "inbound" | "outbound" }>();
  if (threads.length) {
    const messages = await prisma.parentMessage.findMany({
      where: { threadId: { in: threads.map((thread) => thread.id) } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    for (const message of messages as Array<{ threadId: string; body: string; direction: "inbound" | "outbound" }>) {
      if (!latestMessages.has(message.threadId)) {
        latestMessages.set(message.threadId, { body: message.body, direction: message.direction });
      }
    }
  }

  return NextResponse.json({
    threads: threads.map((thread) => ({
      id: thread.id,
      channel: thread.channel,
      contactAddress: thread.contactAddress,
      contactLabel: thread.contactLabel,
      unreadCount: thread.unreadCount,
      lastMessageAt: thread.lastMessageAt.toISOString(),
      lastMessage: latestMessages.get(thread.id)?.body ?? "",
      lastDirection: latestMessages.get(thread.id)?.direction ?? "outbound",
    })),
  });
}