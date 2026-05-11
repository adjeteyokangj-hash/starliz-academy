import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email-provider";

type Channel = "email" | "sms" | "whatsapp";

type DispatchInput = {
  eventId: string;
  channel: Channel;
  recipient: string;
  subject?: string;
  message: string;
  actorUserId?: string;
};

async function sendTwilioMessage(channel: Exclude<Channel, "email">, to: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = channel === "whatsapp"
    ? process.env.TWILIO_WHATSAPP_FROM
    : process.env.TWILIO_SMS_FROM;

  if (!accountSid || !authToken || !from) {
    return {
      ok: false as const,
      reason: "TWILIO_PROVIDER_NOT_CONFIGURED",
      providerMessageId: null,
      providerStatus: null,
    };
  }

  const toValue = channel === "whatsapp" && !to.startsWith("whatsapp:") ? `whatsapp:${to}` : to;
  const fromValue = channel === "whatsapp" && !from.startsWith("whatsapp:") ? `whatsapp:${from}` : from;

  const form = new URLSearchParams();
  form.set("To", toValue);
  form.set("From", fromValue);
  form.set("Body", body);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  const payload = (await response.json().catch(() => null)) as {
    sid?: string;
    status?: string;
    message?: string;
  } | null;

  if (!response.ok) {
    return {
      ok: false as const,
      reason: payload?.message ?? "TWILIO_SEND_FAILED",
      providerMessageId: payload?.sid ?? null,
      providerStatus: payload?.status ?? null,
    };
  }

  return {
    ok: true as const,
    reason: null,
    providerMessageId: payload?.sid ?? null,
    providerStatus: payload?.status ?? null,
  };
}

export async function dispatchNotification(input: DispatchInput) {
  const delivery = await prisma.notificationDelivery.create({
    data: {
      eventId: input.eventId,
      channel: input.channel,
      recipient: input.recipient,
      attempts: 1,
      status: "pending",
      deliveredByUserId: input.actorUserId,
    },
  });

  let result:
    | { ok: true; providerMessageId: string | null; providerStatus: string | null; reason: null }
    | { ok: false; providerMessageId: string | null; providerStatus: string | null; reason: string };

  if (input.channel === "email") {
    const emailResult = await sendEmail({
      to: input.recipient,
      subject: input.subject ?? "StarLiz Notification",
      html: `<p>${input.message}</p>`,
      text: input.message,
    });

    if (!emailResult.ok) {
      result = {
        ok: false,
        reason: emailResult.reason,
        providerMessageId: null,
        providerStatus: null,
      };
    } else {
      result = {
        ok: true,
        reason: null,
        providerMessageId: emailResult.id,
        providerStatus: "queued",
      };
    }
  } else {
    result = await sendTwilioMessage(input.channel, input.recipient, input.message);
  }

  await prisma.notificationDelivery.update({
    where: { id: delivery.id },
    data: {
      status: result.ok ? "sent" : "failed",
      providerMessageId: result.providerMessageId,
      providerStatus: result.providerStatus,
      lastError: result.ok ? null : result.reason,
      sentAt: result.ok ? new Date() : null,
      deliveredAt: result.ok ? new Date() : null,
    },
  });

  return result;
}

export async function emitNotificationEvent(input: {
  eventType: string;
  schoolId?: string;
  trustId?: string;
  severity?: "info" | "warning" | "critical";
  dedupeKey?: string;
  payload: Record<string, unknown>;
}) {
  if (input.dedupeKey) {
    const existing = await prisma.notificationEvent.findFirst({
      where: {
        dedupeKey: input.dedupeKey,
      },
      orderBy: [{ createdAt: "desc" }],
    });
    if (existing) return existing;
  }

  return prisma.notificationEvent.create({
    data: {
      eventType: input.eventType,
      schoolId: input.schoolId,
      trustId: input.trustId,
      severity: input.severity ?? "info",
      dedupeKey: input.dedupeKey,
      payloadJson: JSON.stringify(input.payload),
      status: "pending",
    },
  });
}

export async function dispatchPendingNotificationEvents(limit = 20) {
  const events = await prisma.notificationEvent.findMany({
    where: { status: "pending" },
    orderBy: [{ createdAt: "asc" }],
    take: Math.max(1, Math.min(limit, 100)),
  });

  let processed = 0;
  for (const event of events) {
    processed += 1;
    const payload = JSON.parse(event.payloadJson || "{}") as Record<string, unknown>;

    const recipient = typeof payload.recipient === "string" ? payload.recipient : null;
    const channel = (payload.channel as Channel | undefined) ?? "email";
    const message = typeof payload.message === "string" ? payload.message : `Notification: ${event.eventType}`;
    const subject = typeof payload.subject === "string" ? payload.subject : undefined;

    if (!recipient) {
      await prisma.notificationEvent.update({
        where: { id: event.id },
        data: {
          status: "failed",
        },
      });
      continue;
    }

    const result = await dispatchNotification({
      eventId: event.id,
      channel,
      recipient,
      message,
      subject,
    });

    await prisma.notificationEvent.update({
      where: { id: event.id },
      data: {
        status: result.ok ? "dispatched" : "failed",
      },
    });
  }

  return processed;
}
