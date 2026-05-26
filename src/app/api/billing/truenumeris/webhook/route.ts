import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTrueNumerisWebhookSecret } from "@/lib/truenumeris/config";

function secureCompare(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = getTrueNumerisWebhookSecret();
  if (!secret) return false;
  if (!signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.includes("=") ? signature.split("=").pop() ?? "" : signature;
  return secureCompare(expected, provided);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-truenumeris-signature");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid TrueNumeris webhook signature." }, { status: 401 });
  }

  let payload: {
    eventType?: string;
    reference?: string;
    status?: string;
    message?: string;
  };

  try {
    payload = JSON.parse(rawBody) as {
      eventType?: string;
      reference?: string;
      status?: string;
      message?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  if (payload.reference) {
    await prisma.financialSyncEvent.updateMany({
      where: { paymentReference: payload.reference },
      data: {
        syncStatus: payload.status === "ok" ? "synced" : "failed",
        syncedAt: payload.status === "ok" ? new Date() : null,
        errorMessage: payload.status === "ok" ? null : payload.message ?? "Webhook reported failure",
      },
    });
  }

  return NextResponse.json({ ok: true });
}
