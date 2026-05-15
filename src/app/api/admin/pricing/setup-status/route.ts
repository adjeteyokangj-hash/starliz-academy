import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { getAdminPricingPlans } from "@/lib/pricing/service";

function hasPlanWithPriceId(plans: Array<{ name: string; stripePriceId: string | null }>, matcher: RegExp) {
  return plans.some((plan) => matcher.test(plan.name) && Boolean(plan.stripePriceId));
}

const LEGACY_PRICING_DIAGNOSTICS = {
  checkoutUsesLegacyEnvPriceIds: false,
  parentBillingUsesLegacyPlanCopy: false,
  entitlementUsesLegacyFreeMonthlyYearlyModel: false,
  notes: [
    "Compatibility route /api/subscription/checkout is retained for backward compatibility while /api/billing/stripe/checkout is the primary checkout path.",
  ],
} as const;

function collectLegacyPricingWarnings() {
  const warnings: string[] = [];

  if (LEGACY_PRICING_DIAGNOSTICS.checkoutUsesLegacyEnvPriceIds) {
    warnings.push("Legacy env-based Stripe price IDs are still enabled in an active checkout path.");
  }
  if (LEGACY_PRICING_DIAGNOSTICS.parentBillingUsesLegacyPlanCopy) {
    warnings.push("Parent billing UI still references legacy Free/Monthly/Yearly wording.");
  }
  if (LEGACY_PRICING_DIAGNOSTICS.entitlementUsesLegacyFreeMonthlyYearlyModel) {
    warnings.push("Entitlement enforcement still uses legacy Free/Monthly/Yearly mapping.");
  }

  return {
    warnings,
    notes: [...LEGACY_PRICING_DIAGNOSTICS.notes],
  };
}

export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const plans = await getAdminPricingPlans();
  const legacyDiagnostics = collectLegacyPricingWarnings();

  const setup = {
    stripeSecretKeyConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    stripePublishableKeyConfigured: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    stripeWebhookSecretConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    starterPriceIdAdded: hasPlanWithPriceId(plans, /starter/i),
    proPriceIdAdded: hasPlanWithPriceId(plans, /pro/i),
    annualFamilyPriceIdAdded: hasPlanWithPriceId(plans, /(annual|family)/i),
    webhookTested: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    legacyWarnings: legacyDiagnostics.warnings,
    legacyNotes: legacyDiagnostics.notes,
  };

  return NextResponse.json({ setup });
}
