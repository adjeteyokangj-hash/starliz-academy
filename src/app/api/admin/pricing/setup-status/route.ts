import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/lib/api_guard";
import { getAdminPricingPlans } from "@/lib/pricing/service";

function hasPlanWithPriceId(plans: Array<{ name: string; stripePriceId: string | null }>, matcher: RegExp) {
  return plans.some((plan) => matcher.test(plan.name) && Boolean(plan.stripePriceId));
}

async function collectLegacyPricingWarnings() {
  const root = process.cwd();
  const checks: Array<{ file: string; token: string; message: string }> = [
    {
      file: "src/app/api/subscription/checkout/route.ts",
      token: "STRIPE_MONTHLY_PRICE_ID",
      message: "Legacy env-based monthly/yearly Stripe IDs are still referenced by /api/subscription/checkout.",
    },
    {
      file: "src/app/api/subscription/route.ts",
      token: "z.enum([\"free\", \"monthly\", \"yearly\"])",
      message: "Legacy Free/Monthly/Yearly plan keys are still referenced by /api/subscription.",
    },
    {
      file: "src/components/parent/BillingCard.tsx",
      token: "You&apos;re on the free plan",
      message: "Legacy free-plan copy is still present in parent billing UI.",
    },
  ];

  const warnings: string[] = [];
  for (const check of checks) {
    try {
      const content = await readFile(path.join(root, check.file), "utf8");
      if (content.includes(check.token)) warnings.push(check.message);
    } catch {
      warnings.push(`Unable to scan ${check.file} for legacy pricing checks.`);
    }
  }

  return warnings;
}

export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const plans = await getAdminPricingPlans();
  const legacyWarnings = await collectLegacyPricingWarnings();

  const setup = {
    stripeSecretKeyConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    stripePublishableKeyConfigured: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    stripeWebhookSecretConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    starterPriceIdAdded: hasPlanWithPriceId(plans, /starter/i),
    proPriceIdAdded: hasPlanWithPriceId(plans, /pro/i),
    annualFamilyPriceIdAdded: hasPlanWithPriceId(plans, /(annual|family)/i),
    webhookTested: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    legacyWarnings,
  };

  return NextResponse.json({ setup });
}
