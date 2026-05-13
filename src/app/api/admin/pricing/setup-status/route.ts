import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { getAdminPricingPlans } from "@/lib/pricing/service";

function hasPlanWithPriceId(plans: Array<{ name: string; stripePriceId: string | null }>, matcher: RegExp) {
  return plans.some((plan) => matcher.test(plan.name) && Boolean(plan.stripePriceId));
}

export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const plans = await getAdminPricingPlans();

  const setup = {
    stripeSecretKeyConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    stripePublishableKeyConfigured: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    stripeWebhookSecretConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    starterPriceIdAdded: hasPlanWithPriceId(plans, /starter/i),
    proPriceIdAdded: hasPlanWithPriceId(plans, /pro/i),
    annualFamilyPriceIdAdded: hasPlanWithPriceId(plans, /(annual|family)/i),
    webhookTested: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
  };

  return NextResponse.json({ setup });
}
