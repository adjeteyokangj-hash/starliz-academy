/**
 * Stripe webhook handler for school subscriptions.
 *
 * Endpoint: POST /api/webhooks/stripe-school
 *
 * Handles:
 *   - customer.subscription.updated  → sync status, period, seats
 *   - customer.subscription.deleted  → mark cancelled
 *   - invoice.payment_succeeded      → activate / renew
 *   - invoice.payment_failed         → set past_due + grace period
 *
 * Set STRIPE_SCHOOL_WEBHOOK_SECRET in environment.
 * Register this endpoint in Stripe Dashboard → Webhooks.
 */

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { handleSchoolSubscriptionUpdate } from "@/lib/schools/billing";

export const runtime = "nodejs";

// Required for raw body access (Stripe signature verification)
export const dynamic = "force-dynamic";

async function getRawBody(request: Request): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function resolveSchoolId(customerId: string): Promise<string | null> {
  const licence = await prisma.schoolLicence.findFirst({
    where: { providerCustomerId: customerId },
    select: { schoolId: true },
  });
  return licence?.schoolId ?? null;
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_SCHOOL_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe-school-webhook] STRIPE_SCHOOL_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await getRawBody(request);
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Webhook signature verification failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const schoolId = await resolveSchoolId(customerId);
        if (!schoolId) break;

        // In Stripe v22+, current_period_end moved to SubscriptionItem
        const periodEnd = sub.items.data[0]?.current_period_end ?? 0;
        await handleSchoolSubscriptionUpdate({
          schoolId,
          subscriptionId: sub.id,
          status: event.type === "customer.subscription.deleted" ? "canceled" : sub.status,
          currentPeriodEnd: new Date(periodEnd * 1000),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        });
        break;
      }

      case "invoice.payment_succeeded": {
        const inv = event.data.object as Stripe.Invoice;
        const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
        if (!customerId) break;
        const schoolId = await resolveSchoolId(customerId);
        if (!schoolId) break;

        // In Stripe v22+, subscription reference moved to inv.parent.subscription_details.subscription
        const subRef = inv.parent?.subscription_details?.subscription;
        const subId = typeof subRef === "string" ? subRef : subRef?.id;
        if (!subId) break;

        const sub = await stripe.subscriptions.retrieve(subId);
        const periodEnd = sub.items.data[0]?.current_period_end ?? 0;
        await handleSchoolSubscriptionUpdate({
          schoolId,
          subscriptionId: sub.id,
          status: "active",
          currentPeriodEnd: new Date(periodEnd * 1000),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        });
        break;
      }

      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
        if (!customerId) break;
        const schoolId = await resolveSchoolId(customerId);
        if (!schoolId) break;

        // In Stripe v22+, subscription reference moved to inv.parent.subscription_details.subscription
        const subRef = inv.parent?.subscription_details?.subscription;
        const subId = typeof subRef === "string" ? subRef : subRef?.id;
        if (!subId) break;

        const sub = await stripe.subscriptions.retrieve(subId);
        const periodEnd = sub.items.data[0]?.current_period_end ?? 0;
        await handleSchoolSubscriptionUpdate({
          schoolId,
          subscriptionId: sub.id,
          status: "past_due",
          currentPeriodEnd: new Date(periodEnd * 1000),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        });
        break;
      }

      default:
        // Unhandled event type — silently acknowledged
        break;
    }
  } catch (err) {
    console.error("[stripe-school-webhook] Handler error:", err);
    return NextResponse.json({ error: "Internal webhook error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
