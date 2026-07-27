/**
 * Apply consumer PricingPlan.stripePriceId values from env.
 * Usage:
 *   STRIPE_MONTHLY_PRICE_ID=price_xxx STRIPE_YEARLY_PRICE_ID=price_yyy npx tsx scripts/apply-stripe-price-ids.ts
 * Optional dry run:
 *   DRY_RUN=1 npx tsx scripts/apply-stripe-price-ids.ts
 *
 * Does not invent price IDs. Does not enable billing.
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd());

const dryRun = String(process.env.DRY_RUN ?? "").trim() === "1";
const monthly = (process.env.STRIPE_MONTHLY_PRICE_ID ?? "").trim();
const yearly = (process.env.STRIPE_YEARLY_PRICE_ID ?? "").trim();

if (!monthly && !yearly) {
  console.error("BLOCKED: set STRIPE_MONTHLY_PRICE_ID and/or STRIPE_YEARLY_PRICE_ID");
  process.exit(2);
}

const prisma = new PrismaClient();

async function main() {
  const plans = await prisma.pricingPlan.findMany({
    where: { isActive: true, interval: { in: ["month", "year"] } },
    select: { id: true, name: true, interval: true, stripePriceId: true, audience: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  console.log("PLAN_INVENTORY=" + plans.length);
  for (const plan of plans) {
    const target =
      plan.interval === "month" && monthly
        ? monthly
        : plan.interval === "year" && yearly
          ? yearly
          : null;
    if (!target) {
      console.log(`SKIP ${plan.name} interval=${plan.interval} current=${plan.stripePriceId ? "set" : "null"}`);
      continue;
    }
    if (plan.stripePriceId === target) {
      console.log(`OK ${plan.name} already mapped`);
      continue;
    }
    if (dryRun) {
      console.log(`DRY_RUN ${plan.name} ${plan.interval} -> ${target.slice(0, 12)}...`);
      continue;
    }
    await prisma.pricingPlan.update({
      where: { id: plan.id },
      data: { stripePriceId: target },
    });
    console.log(`UPDATED ${plan.name} ${plan.interval}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });