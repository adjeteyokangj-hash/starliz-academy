import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";

const schema = z.object({
  returnUrl: z.string().url().optional(),
});

function appOrigin(request: Request): string {
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

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid billing portal payload." }, { status: 400 });
  }

  const stripe = await getStripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const [profile, latestSubscription] = await Promise.all([
    prisma.parentProfile.findUnique({
      where: { userId: parentScope.parentId },
      select: { stripeCustomerId: true },
    }),
    prisma.subscription.findFirst({
      where: { parentId: parentScope.parentId },
      orderBy: { updatedAt: "desc" },
      select: { providerCustomerId: true },
    }),
  ]);

  const customerId = profile?.stripeCustomerId ?? latestSubscription?.providerCustomerId ?? null;
  if (!customerId) {
    return NextResponse.json({ error: "No Stripe customer found for this account." }, { status: 404 });
  }

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: parsed.data.returnUrl ?? `${appOrigin(request)}/parent/billing`,
    });

    return NextResponse.json({ url: portal.url });
  } catch {
    return NextResponse.json({ error: "Unable to start billing portal." }, { status: 502 });
  }
}
