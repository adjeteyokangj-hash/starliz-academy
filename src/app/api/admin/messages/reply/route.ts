import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { hasPermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import type { AdminPermission } from "@prisma/client";

const replySchema = z.object({
  threadId: z.string().trim().min(1),
  body: z.string().trim().min(1).max(2000),
});

export async function POST(request: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const adminProfile = await prisma.adminUser.findUnique({ where: { userId: session.userId } });
  if (!adminProfile) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (adminProfile.roleId && !(await hasPermission(adminProfile.id, "MANAGE_INBOX" as AdminPermission))) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = replySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { threadId, body: replyBody } = parsed.data;

  const thread = await prisma.parentMessageThread.findUnique({ where: { id: threadId } });
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Create the reply message
  const message = await prisma.parentMessage.create({
    data: {
      threadId,
      direction: "outbound",
      body: replyBody,
      fromAddress: "support@starlizacademy.com",
      toAddress: thread.contactAddress,
      actorUserId: session.userId,
      sentAt: new Date(),
    },
  });

  // Update thread: clear admin unread, increment parent unread, update timestamps
  await prisma.parentMessageThread.update({
    where: { id: threadId },
    data: {
      lastMessageAt: new Date(),
      lastOutboundAt: new Date(),
      unreadCount: 0,
      parentUnreadCount: { increment: 1 },
    },
  });

  await writeAuditLog({
    actorUserId: session.userId,
    action: "ADMIN_MESSAGE_REPLY_SENT",
    entityType: "ParentMessage",
    entityId: message.id,
    metadata: { threadId, toAddress: thread.contactAddress },
  });

  return NextResponse.json({ success: true, messageId: message.id }, { status: 201 });
}
