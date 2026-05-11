import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type MessageDb = typeof prisma & {
  parentMessageThread: {
    upsert: (...args: unknown[]) => Promise<unknown>;
    update: (...args: unknown[]) => Promise<unknown>;
  };
  parentMessage: {
    create: (...args: unknown[]) => Promise<unknown>;
  };
};

const db = prisma as MessageDb;

function parseMediaUrls(form: FormData): string[] {
  const count = Number(form.get("NumMedia") ?? "0");
  if (!Number.isFinite(count) || count <= 0) return [];

  const urls: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const value = form.get(`MediaUrl${i}`);
    if (typeof value === "string" && value.trim()) {
      urls.push(value.trim());
    }
  }
  return urls;
}

function normalizeContactAddress(raw: string): string {
  return raw.replace(/^whatsapp:/i, "").trim();
}

function twimlEmpty(): NextResponse {
  return new NextResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) return twimlEmpty();

  const fromRaw = String(form.get("From") ?? "").trim();
  const toRaw = String(form.get("To") ?? "").trim();
  const body = String(form.get("Body") ?? "").trim();
  const sid = String(form.get("MessageSid") ?? "").trim();
  const status = String(form.get("MessageStatus") ?? "received").trim();

  if (!fromRaw || !toRaw) return twimlEmpty();

  const channel = fromRaw.startsWith("whatsapp:") || toRaw.startsWith("whatsapp:") ? "whatsapp" : "text";
  const contactAddress = normalizeContactAddress(fromRaw);

  const thread = (await db.parentMessageThread.upsert({
    where: { channel_contactAddress: { channel, contactAddress } },
    update: {
      unreadCount: { increment: 1 },
      lastMessageAt: new Date(),
      lastInboundAt: new Date(),
    },
    create: {
      channel,
      contactAddress,
      unreadCount: 1,
      lastMessageAt: new Date(),
      lastInboundAt: new Date(),
    },
  })) as { id: string };

  const mediaUrls = parseMediaUrls(form);

  try {
    await db.parentMessage.create({
      data: {
        threadId: thread.id,
        direction: "inbound",
        body,
        fromAddress: fromRaw,
        toAddress: toRaw,
        providerSid: sid || null,
        providerStatus: status || "received",
        mediaUrlsJson: mediaUrls.length ? JSON.stringify(mediaUrls) : null,
        receivedAt: new Date(),
      },
    });
  } catch {
    // Twilio may retry webhook delivery; ignore duplicate insert attempts.
  }

  await db.parentMessageThread.update({
    where: { id: thread.id },
    data: {
      lastMessageAt: new Date(),
      lastInboundAt: new Date(),
    },
  });

  return twimlEmpty();
}
