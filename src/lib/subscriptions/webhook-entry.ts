import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { handlePaymentWebhook } from "@/lib/subscriptions/webhook-handler";

const DEFAULT_STRIPE_TIMESTAMP_TOLERANCE_SECONDS = 300;
const DEFAULT_REVOLUT_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production";
}

function getStripeTimestampToleranceSeconds(): number {
  const raw = Number.parseInt(process.env.STRIPE_WEBHOOK_TOLERANCE_SECONDS ?? "", 10);
  if (!Number.isFinite(raw) || raw < 0) {
    return DEFAULT_STRIPE_TIMESTAMP_TOLERANCE_SECONDS;
  }
  return raw;
}

export function isWebhookFallbackSignatureEnabledInRuntime(env: Record<string, string | undefined> = process.env): boolean {
  const raw = String(env.PAYMENT_WEBHOOK_ALLOW_FALLBACK_SIGNATURE ?? "").trim().toLowerCase();
  const enabled = raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  const isProd = String(env.NODE_ENV ?? "").trim() === "production";
  if (isProd) return enabled;
  return enabled || raw === "";
}

function secureCompare(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

function verifyFallbackSignature(rawBody: string, signature: string | null): { ok: boolean; reason?: string } {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) {
    return isProductionEnvironment()
      ? { ok: false, reason: "Payment webhook fallback secret is not configured." }
      : { ok: true };
  }
  if (!signature) return { ok: false, reason: "Missing webhook signature." };

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.includes("=") ? signature.split("=").pop() ?? "" : signature;
  return secureCompare(expected, provided)
    ? { ok: true }
    : { ok: false, reason: "Invalid webhook signature." };
}

function verifyStripeSignature(rawBody: string, signature: string | null): { ok: boolean; reason?: string } {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return isProductionEnvironment()
      ? { ok: false, reason: "Stripe webhook secret is not configured." }
      : { ok: true };
  }
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

  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampSeconds)) {
    return { ok: false, reason: "Invalid Stripe signature timestamp." };
  }
  const toleranceSeconds = getStripeTimestampToleranceSeconds();
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) {
    return { ok: false, reason: "Stripe signature timestamp outside tolerance." };
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");
  const valid = versions.some((candidate) => secureCompare(expected, candidate));
  return valid ? { ok: true } : { ok: false, reason: "Invalid Stripe signature." };
}

function verifyPaystackSignature(rawBody: string, signature: string | null): { ok: boolean; reason?: string } {
  const secret = process.env.PAYSTACK_WEBHOOK_SECRET;
  if (!secret) {
    return isProductionEnvironment()
      ? { ok: false, reason: "Paystack webhook secret is not configured." }
      : { ok: true };
  }
  if (!signature) return { ok: false, reason: "Missing Paystack signature." };
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  return secureCompare(expected, signature)
    ? { ok: true }
    : { ok: false, reason: "Invalid Paystack signature." };
}

export function verifyRevolutSignature(
  rawBody: string,
  signature: string | null,
  requestTimestamp: string | null,
): { ok: boolean; reason?: string } {
  const secret = process.env.REVOLUT_WEBHOOK_SECRET;
  if (!secret) {
    return isProductionEnvironment()
      ? { ok: false, reason: "Revolut webhook secret is not configured." }
      : { ok: true };
  }
  if (!signature) return { ok: false, reason: "Missing Revolut signature." };
  if (!requestTimestamp) return { ok: false, reason: "Missing Revolut request timestamp." };

  const timestampMs = Number.parseInt(requestTimestamp, 10);
  if (!Number.isFinite(timestampMs)) {
    return { ok: false, reason: "Invalid Revolut request timestamp." };
  }

  if (Math.abs(Date.now() - timestampMs) > DEFAULT_REVOLUT_TIMESTAMP_TOLERANCE_MS) {
    return { ok: false, reason: "Revolut signature timestamp outside tolerance." };
  }

  const payloadToSign = `v1.${requestTimestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(payloadToSign).digest("hex");
  const candidates = signature.split(",").map((piece) => piece.trim()).filter(Boolean);
  const valid = candidates.some((candidate) => {
    const provided = candidate.includes("=") ? candidate.split("=").pop() ?? "" : candidate;
    return secureCompare(expected, provided);
  });

  return valid ? { ok: true } : { ok: false, reason: "Invalid Revolut signature." };
}

async function parseWebhookPayload(rawBody: string) {
  try {
    const event = JSON.parse(rawBody);
    return await handlePaymentWebhook(event);
  } catch {
    return null;
  }
}

function formatWebhookResponse(result: unknown, wrapReceived: boolean): Response {
  return NextResponse.json(wrapReceived ? { received: true, result } : result);
}

export async function processRevolutWebhookRequest(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("revolut-signature");
  const timestamp = request.headers.get("revolut-request-timestamp");
  const verification = verifyRevolutSignature(rawBody, signature, timestamp);

  if (!verification.ok) {
    return NextResponse.json({ error: verification.reason ?? "Invalid webhook signature." }, { status: 401 });
  }

  const result = await parseWebhookPayload(rawBody);
  if (!result) {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  return formatWebhookResponse(result, true);
}

export async function processPaymentWebhookRequest(request: Request, options: { allowFallbackSignature: boolean }): Promise<Response> {
  const rawBody = await request.text();
  const stripeSignature = request.headers.get("stripe-signature");
  const paystackSignature = request.headers.get("x-paystack-signature");
  const revolutSignature = request.headers.get("revolut-signature");
  const revolutTimestamp = request.headers.get("revolut-request-timestamp");
  const fallbackSignature = request.headers.get("x-signature");
  const runtimeFallbackAllowed = options.allowFallbackSignature && isWebhookFallbackSignatureEnabledInRuntime(process.env);

  if (!stripeSignature && !paystackSignature && !revolutSignature && !fallbackSignature) {
    return NextResponse.json({ error: "Missing webhook signature." }, { status: 401 });
  }

  if (revolutSignature || revolutTimestamp) {
    const revolutCheck = verifyRevolutSignature(rawBody, revolutSignature, revolutTimestamp);
    if (!revolutCheck.ok) {
      return NextResponse.json({ error: revolutCheck.reason ?? "Invalid webhook signature." }, { status: 401 });
    }
  } else if (paystackSignature) {
    const paystackCheck = verifyPaystackSignature(rawBody, paystackSignature);
    if (!paystackCheck.ok) {
      return NextResponse.json({ error: paystackCheck.reason ?? "Invalid webhook signature." }, { status: 401 });
    }
  } else if (stripeSignature) {
    const stripeCheck = verifyStripeSignature(rawBody, stripeSignature);
    if (!stripeCheck.ok) {
      return NextResponse.json({ error: stripeCheck.reason ?? "Invalid webhook signature." }, { status: 401 });
    }
  } else if (runtimeFallbackAllowed && fallbackSignature) {
    const fallbackCheck = verifyFallbackSignature(rawBody, fallbackSignature);
    if (!fallbackCheck.ok) {
      return NextResponse.json({ error: fallbackCheck.reason ?? "Invalid webhook signature." }, { status: 401 });
    }
  } else {
    return NextResponse.json(
      { error: "Unsupported signature strategy. Configure provider-specific signature headers." },
      { status: 401 },
    );
  }

  const result = await parseWebhookPayload(rawBody);
  if (!result) {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  return formatWebhookResponse(result, runtimeFallbackAllowed);
}