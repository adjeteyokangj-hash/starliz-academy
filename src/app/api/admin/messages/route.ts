import { NextRequest, NextResponse } from "next/server";
import type { AdminPermission } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { hasPermission } from "@/lib/rbac";

type MessageDb = typeof prisma & {
  parentMessageThread: {
    findMany: (...args: unknown[]) => Promise<unknown[]>;
    findUnique: (...args: unknown[]) => Promise<unknown | null>;
    upsert: (...args: unknown[]) => Promise<unknown>;
    update: (...args: unknown[]) => Promise<unknown>;
  };
  parentMessage: {
    findMany: (...args: unknown[]) => Promise<unknown[]>;
    create: (...args: unknown[]) => Promise<unknown>;
  };
};

const db = prisma as MessageDb;

const sendMessageSchema = z.object({
  channel: z.enum(["text", "whatsapp"]),
  to: z.string().trim().min(8).max(40),
  message: z.string().trim().min(1).max(1000),
  parentId: z.string().trim().min(1).optional(),
  mediaUrls: z.array(z.string().url()).max(5).optional(),
});

type MessageMeta = {
  channel: "text" | "whatsapp";
  to: string;
  parentId: string | null;
  parentEmail: string | null;
  message: string;
  mediaUrls: string[] | null;
  sid: string | null;
  status: string | null;
};

function isPublicHttpsUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    return true;
  } catch {
    return false;
  }
}

function parseMediaUrls(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function normalizeContactAddress(raw: string): string {
  return raw.replace(/^whatsapp:/i, "").trim();
}

function asTwilioAddress(channel: "text" | "whatsapp", raw: string): string {
  if (channel !== "whatsapp") return raw;
  return raw.startsWith("whatsapp:") ? raw : `whatsapp:${raw}`;
}

async function ensureMessagingAccess(userId: string) {
  const adminProfile = await prisma.adminUser.findUnique({ where: { userId } });
  if (!adminProfile) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  // Legacy/seed admin with no role gets bypass access
  if (adminProfile.roleId && !(await hasPermission(adminProfile.id, "MANAGE_INBOX" as AdminPermission))) {
    return { ok: false, response: NextResponse.json({ error: "Permission denied" }, { status: 403 }) };
  }

  return { ok: true, adminProfile };
}

export async function GET(request: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const access = await ensureMessagingAccess(session.userId);
  if (!access.ok) return access.response;

  const threads = (await db.parentMessageThread.findMany({
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  })) as Array<{
    id: string;
    channel: "text" | "whatsapp";
    contactAddress: string;
    contactLabel: string | null;
    parentId: string | null;
    parentEmail: string | null;
    unreadCount: number;
    lastMessageAt: Date;
  }>;

  const requestedThreadId = request.nextUrl.searchParams.get("threadId")?.trim() ?? "";
  const selectedThreadId = (requestedThreadId && threads.some((thread) => thread.id === requestedThreadId))
    ? requestedThreadId
    : (threads[0]?.id ?? null);

  const latestByThread = new Map<string, { body: string; direction: "inbound" | "outbound" }>();
  if (threads.length) {
    const latestCandidates = (await db.parentMessage.findMany({
      where: { threadId: { in: threads.map((thread) => thread.id) } },
      orderBy: { createdAt: "desc" },
      take: 800,
    })) as Array<{
      threadId: string;
      body: string;
      direction: "inbound" | "outbound";
    }>;

    for (const row of latestCandidates) {
      if (!latestByThread.has(row.threadId)) {
        latestByThread.set(row.threadId, { body: row.body, direction: row.direction });
      }
    }
  }

  const messages = selectedThreadId
    ? ((await db.parentMessage.findMany({
        where: { threadId: selectedThreadId },
        orderBy: { createdAt: "asc" },
        take: 200,
      })) as Array<{
        id: string;
        threadId: string;
        direction: "inbound" | "outbound";
        body: string;
        fromAddress: string;
        toAddress: string;
        providerSid: string | null;
        providerStatus: string | null;
        mediaUrlsJson: string | null;
        createdAt: Date;
      }>)
    : [];

  return NextResponse.json({
    threads,
    selectedThreadId,
    messages: messages.map((row) => ({
      id: row.id,
      threadId: row.threadId,
      direction: row.direction,
      body: row.body,
      fromAddress: row.fromAddress,
      toAddress: row.toAddress,
      providerSid: row.providerSid,
      providerStatus: row.providerStatus,
      mediaUrls: parseMediaUrls(row.mediaUrlsJson),
      createdAt: row.createdAt.toISOString(),
    })),
    history: [],
    legacy: false,
    legacyAudit: false,
    items: threads.map((thread) => {
      const last = latestByThread.get(thread.id);
      return {
        id: thread.id,
        channel: thread.channel,
        to: thread.contactAddress,
        contactLabel: thread.contactLabel,
        parentId: thread.parentId,
        parentEmail: thread.parentEmail,
        unreadCount: thread.unreadCount,
        lastMessageAt: thread.lastMessageAt.toISOString(),
        lastMessage: last?.body ?? "",
        lastDirection: last?.direction ?? "outbound",
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const access = await ensureMessagingAccess(session.userId);
  if (!access.ok) return access.response;

  const body = await request.json().catch(() => null);
  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { channel, to, message, parentId, mediaUrls } = parsed.data;

  if (mediaUrls?.length) {
    const invalid = mediaUrls.find((url) => !isPublicHttpsUrl(url));
    if (invalid) {
      return NextResponse.json(
        { error: "Attachments must use public HTTPS URLs reachable by Twilio (no localhost, local paths, or blob URLs)." },
        { status: 400 },
      );
    }
  }

  let parentEmail: string | null = null;
  if (parentId) {
    const parent = await prisma.user.findFirst({
      where: { id: parentId, role: "parent" },
      select: { email: true },
    });

    if (!parent) {
      return NextResponse.json({ error: "Parent not found" }, { status: 404 });
    }
    parentEmail = parent.email;
  }

  const contactAddress = normalizeContactAddress(to);

  const thread = (await db.parentMessageThread.upsert({
    where: { channel_contactAddress: { channel, contactAddress } },
    update: {
      parentId: parentId ?? undefined,
      parentEmail: parentEmail ?? undefined,
      lastMessageAt: new Date(),
      lastOutboundAt: new Date(),
    },
    create: {
      channel,
      contactAddress,
      parentId: parentId ?? null,
      parentEmail,
      lastMessageAt: new Date(),
      lastOutboundAt: new Date(),
    },
  })) as { id: string };

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const smsFrom = process.env.TWILIO_SMS_FROM;
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken) {
    return NextResponse.json(
      { error: "Twilio credentials are missing. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN." },
      { status: 400 },
    );
  }

  const from = channel === "whatsapp" ? whatsappFrom : smsFrom;
  if (!from) {
    return NextResponse.json(
      { error: channel === "whatsapp" ? "Set TWILIO_WHATSAPP_FROM first." : "Set TWILIO_SMS_FROM first." },
      { status: 400 },
    );
  }

  const toValue = asTwilioAddress(channel, contactAddress);
  const fromValue = asTwilioAddress(channel, from);

  const form = new URLSearchParams();
  form.set("To", toValue);
  form.set("From", fromValue);
  form.set("Body", message);
  if (mediaUrls?.length) {
    mediaUrls.forEach((url) => form.append("MediaUrl", url));
  }

  const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  const twilioJson = (await twilioRes.json().catch(() => null)) as { sid?: string; status?: string; message?: string; code?: number } | null;

  if (!twilioRes.ok) {
    await db.parentMessage.create({
      data: {
        threadId: thread.id,
        direction: "outbound",
        body: message,
        fromAddress: fromValue,
        toAddress: toValue,
        providerStatus: twilioJson?.status ?? "failed",
        mediaUrlsJson: mediaUrls?.length ? JSON.stringify(mediaUrls) : null,
        actorUserId: session.userId,
        sentAt: new Date(),
      },
    });

    return NextResponse.json(
      { error: twilioJson?.message ?? "Provider error while sending message." },
      { status: 502 },
    );
  }

  const savedMessage = (await db.parentMessage.create({
    data: {
      threadId: thread.id,
      direction: "outbound",
      body: message,
      fromAddress: fromValue,
      toAddress: toValue,
      providerSid: twilioJson?.sid ?? null,
      providerStatus: twilioJson?.status ?? null,
      mediaUrlsJson: mediaUrls?.length ? JSON.stringify(mediaUrls) : null,
      actorUserId: session.userId,
      sentAt: new Date(),
    },
  })) as { id: string };

  await db.parentMessageThread.update({
    where: { id: thread.id },
    data: {
      lastMessageAt: new Date(),
      lastOutboundAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: session.userId,
      action: "SEND_PARENT_MESSAGE",
      entityType: "parent_message",
      entityId: parentId ?? null,
      metadataJson: JSON.stringify({
        channel,
        to,
        parentId: parentId ?? null,
        parentEmail,
        message,
        mediaUrls: mediaUrls ?? null,
        sid: twilioJson?.sid ?? null,
        status: twilioJson?.status ?? null,
      } satisfies MessageMeta),
    },
  });

  return NextResponse.json({
    success: true,
    threadId: thread.id,
    messageId: savedMessage.id,
    providerSid: twilioJson?.sid ?? null,
    providerStatus: twilioJson?.status ?? null,
  });
}

const markReadSchema = z.object({
  threadId: z.string().trim().min(1),
});

export async function PATCH(request: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const access = await ensureMessagingAccess(session.userId);
  if (!access.ok) return access.response;

  const body = await request.json().catch(() => null);
  const parsed = markReadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  await db.parentMessageThread.update({
    where: { id: parsed.data.threadId },
    data: { unreadCount: 0 },
  });

  return NextResponse.json({ success: true });
}
