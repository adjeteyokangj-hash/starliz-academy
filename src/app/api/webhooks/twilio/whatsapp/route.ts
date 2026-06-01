import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
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

type TwilioWebhookDeps = {
  db: MessageDb;
  authToken?: string;
};

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

function secureCompare(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

function normalizeTwilioUrl(request: Request): string {
  return new URL(request.url).toString();
}

function buildTwilioPayloadBase(url: string, form: FormData): string {
  const parts = Array.from(form.entries())
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([key, value]) => [key, value] as const)
    .sort((a, b) => {
      if (a[0] === b[0]) return a[1].localeCompare(b[1]);
      return a[0].localeCompare(b[0]);
    });

  let base = url;
  for (const [key, value] of parts) {
    base += `${key}${value}`;
  }
  return base;
}

export function verifyTwilioWebhookSignature(input: {
  requestUrl: string;
  form: FormData;
  signature: string | null;
  authToken: string | null | undefined;
}): { ok: true } | { ok: false; reason: string; status: number } {
  const authToken = (input.authToken ?? "").trim();
  if (!authToken) {
    return { ok: false, reason: "Twilio webhook auth token is not configured.", status: 503 };
  }

  const signature = (input.signature ?? "").trim();
  if (!signature) {
    return { ok: false, reason: "Missing Twilio signature.", status: 401 };
  }

  const payloadBase = buildTwilioPayloadBase(input.requestUrl, input.form);
  const expected = createHmac("sha1", authToken).update(payloadBase).digest("base64");

  if (!secureCompare(expected, signature)) {
    return { ok: false, reason: "Invalid Twilio signature.", status: 401 };
  }

  return { ok: true };
}

export async function handleTwilioWhatsappWebhook(
  request: Request,
  deps: TwilioWebhookDeps = { db, authToken: process.env.TWILIO_AUTH_TOKEN },
) {
  const form = await request.formData().catch(() => null);
  if (!form) return twimlEmpty();

  const verification = verifyTwilioWebhookSignature({
    requestUrl: normalizeTwilioUrl(request),
    form,
    signature: request.headers.get("x-twilio-signature"),
    authToken: deps.authToken,
  });

  if (!verification.ok) {
    return NextResponse.json({ error: verification.reason }, { status: verification.status });
  }

  const fromRaw = String(form.get("From") ?? "").trim();
  const toRaw = String(form.get("To") ?? "").trim();
  const body = String(form.get("Body") ?? "").trim();
  const sid = String(form.get("MessageSid") ?? "").trim();
  const status = String(form.get("MessageStatus") ?? "received").trim();

  if (!fromRaw || !toRaw) return twimlEmpty();

  const channel = fromRaw.startsWith("whatsapp:") || toRaw.startsWith("whatsapp:") ? "whatsapp" : "text";
  const contactAddress = normalizeContactAddress(fromRaw);

  const thread = (await deps.db.parentMessageThread.upsert({
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
    await deps.db.parentMessage.create({
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

  await deps.db.parentMessageThread.update({
    where: { id: thread.id },
    data: {
      lastMessageAt: new Date(),
      lastInboundAt: new Date(),
    },
  });

  return twimlEmpty();
}

export async function POST(request: Request) {
  return handleTwilioWhatsappWebhook(request);
}
