import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { handlePaymentWebhook } from "@/lib/subscriptions/webhook-handler";

function secureCompare(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

function verifyFallbackSignature(rawBody: string, signature: string | null): { ok: boolean; reason?: string } {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return { ok: true };
  if (!signature) return { ok: false, reason: "Missing webhook signature." };

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.includes("=") ? signature.split("=").pop() ?? "" : signature;
  return secureCompare(expected, provided)
    ? { ok: true }
    : { ok: false, reason: "Invalid webhook signature." };
}

function verifyStripeSignature(rawBody: string, signature: string | null): { ok: boolean; reason?: string } {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return { ok: true };
  if (!signature) return { ok: false, reason: "Missing Stripe signature." };

  const pieces = signature.split(",").map((piece) => piece.trim());
  const timestamp = pieces.find((piece) => piece.startsWith("t="))?.slice(2);
  const versions = pieces
    .filter((piece) => piece.startsWith("v1="))
    .map((piece) => piece.slice(3))
    .filter(Boolean);

  if (!timestamp || !versions.length) {
    return { ok: false, reason: "Invalid Stripe signature format." };
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");
  const valid = versions.some((candidate) => secureCompare(expected, candidate));
  return valid ? { ok: true } : { ok: false, reason: "Invalid Stripe signature." };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const stripeSignature = request.headers.get("stripe-signature");
  const paystackSignature = request.headers.get("x-paystack-signature");
  const fallbackSignature = request.headers.get("x-signature");

  if (paystackSignature) {
    return NextResponse.json(
      { error: "Paystack webhooks are reserved for future Ghana support." },
      { status: 501 },
    );
  }

  const stripeCheck = verifyStripeSignature(rawBody, stripeSignature);
  if (!stripeCheck.ok) {
    return NextResponse.json({ error: stripeCheck.reason ?? "Invalid webhook signature." }, { status: 401 });
  }

  const fallbackCheck = verifyFallbackSignature(rawBody, fallbackSignature);
  if (!fallbackCheck.ok) {
    return NextResponse.json({ error: fallbackCheck.reason ?? "Invalid webhook signature." }, { status: 401 });
  }

  try {
    const event = JSON.parse(rawBody);
    const result = await handlePaymentWebhook(event);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
}
