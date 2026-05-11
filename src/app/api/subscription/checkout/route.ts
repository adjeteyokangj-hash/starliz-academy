import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { getPlan, normalizePlanKey } from "@/lib/subscriptions/plans";

const checkoutSchema = z.object({
  planKey: z.enum(["monthly", "yearly"]),
  provider: z.enum(["stripe", "paystack"]).default("stripe"),
});

function getOrigin(request: Request): string {
  const url = new URL(request.url);
  return process.env.NEXT_PUBLIC_APP_URL ?? `${url.protocol}//${url.host}`;
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  try {
    const body = checkoutSchema.parse(await request.json());
    const plan = getPlan(body.planKey);

    if (body.provider === "paystack") {
      return NextResponse.json({
        error: "Paystack checkout is reserved for future Ghana support.",
        provider: "paystack",
      }, { status: 501 });
    }

    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    const monthlyPrice = process.env.STRIPE_MONTHLY_PRICE_ID;
    const yearlyPrice = process.env.STRIPE_YEARLY_PRICE_ID;
    const priceId = body.planKey === "yearly" ? yearlyPrice : monthlyPrice;

    if (!stripeSecret || !priceId) {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Stripe billing is not fully configured." }, { status: 503 });
      }

      const existing = await prisma.subscription.findFirst({ where: { parentId: parentScope.parentId }, orderBy: { updatedAt: "desc" } });
      if (existing) {
        await prisma.subscription.update({
          where: { id: existing.id },
          data: {
            provider: "stripe",
            planKey: normalizePlanKey(body.planKey),
            status: "active",
          },
        });
      } else {
        await prisma.subscription.create({
          data: {
            parentId: parentScope.parentId,
            provider: "stripe",
            planKey: normalizePlanKey(body.planKey),
            status: "active",
          },
        });
      }

      return NextResponse.json({
        ok: true,
        simulated: true,
        message: "Stripe keys are not configured. Subscription switched in non-production test mode.",
      });
    }

    const origin = getOrigin(request);
    const form = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      success_url: `${origin}/subscription/success`,
      cancel_url: `${origin}/subscription/cancel`,
      customer_email: parentScope.parentEmail,
      "metadata[parentId]": parentScope.parentId,
      "metadata[planKey]": plan.key,
      "metadata[provider]": "stripe",
    });

    const checkout = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    if (!checkout.ok) {
      return NextResponse.json({ error: "Unable to start Stripe checkout." }, { status: 502 });
    }

    const payload = await checkout.json() as { url?: string; id?: string; customer?: string };

    const existing = await prisma.subscription.findFirst({ where: { parentId: parentScope.parentId }, orderBy: { updatedAt: "desc" } });
    const updateData = {
      provider: "stripe",
      planKey: plan.key,
      status: "trialing",
      providerCustomerId: payload.customer ? String(payload.customer) : existing?.providerCustomerId ?? null,
      providerSubId: payload.id ? String(payload.id) : existing?.providerSubId ?? null,
    };
    if (existing) {
      await prisma.subscription.update({ where: { id: existing.id }, data: updateData });
    } else {
      await prisma.subscription.create({ data: { parentId: parentScope.parentId, ...updateData } });
    }

    return NextResponse.json({ ok: true, checkoutUrl: payload.url ?? null });
  } catch {
    return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
  }
}
