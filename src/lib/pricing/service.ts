import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { FALLBACK_PRICING_PLANS, type PricingPlanView } from "@/lib/pricing/fallback"

async function ensurePricingPlansSeeded(): Promise<void> {
  const existingCount = await prisma.pricingPlan.count()
  if (existingCount > 0) return

  await prisma.pricingPlan.createMany({
    data: FALLBACK_PRICING_PLANS.map((plan) => ({
      name: plan.name,
      description: plan.description,
      price: plan.price,
      currency: plan.currency,
      interval: plan.interval,
      audience: plan.audience,
      features: plan.features,
      priceNote: plan.priceNote,
      badge: plan.badge,
      ctaLabel: plan.ctaLabel,
      ctaHref: plan.ctaHref,
      stripePriceId: plan.stripePriceId,
      isActive: plan.isActive,
      isPopular: plan.isPopular,
      sortOrder: plan.sortOrder,
    })),
  })
}

function toFeatureList(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item)).filter(Boolean)
}

function mapPlan(plan: {
  id: string
  name: string
  description: string
  price: number
  currency: string
  interval: string
  audience: string
  features: Prisma.JsonValue
  priceNote: string | null
  badge: string | null
  ctaLabel: string
  ctaHref: string
  stripePriceId: string | null
  isActive: boolean
  isPopular: boolean
  sortOrder: number
}): PricingPlanView {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    price: plan.price,
    currency: plan.currency,
    interval: plan.interval as PricingPlanView["interval"],
    audience: plan.audience as PricingPlanView["audience"],
    features: toFeatureList(plan.features),
    priceNote: plan.priceNote,
    badge: plan.badge,
    ctaLabel: plan.ctaLabel,
    ctaHref: plan.ctaHref,
    stripePriceId: plan.stripePriceId,
    isActive: plan.isActive,
    isPopular: plan.isPopular,
    sortOrder: plan.sortOrder,
  }
}

function inferPlanFromLegacyKey(plans: PricingPlanView[], legacyPlanKey: string | null | undefined): PricingPlanView | null {
  const raw = (legacyPlanKey ?? "").trim().toLowerCase()
  if (!raw || raw === "free" || raw === "trial") return null

  const byName = (matcher: (name: string) => boolean) => plans.find((plan) => matcher(plan.name.trim().toLowerCase()))
  const firstByInterval = (interval: PricingPlanView["interval"]) => plans.find((plan) => plan.interval === interval)

  if (raw.includes("starter")) {
    return byName((name) => name.includes("starter")) ?? plans.find((plan) => plan.interval === "month" && plan.audience === "individual") ?? firstByInterval("month") ?? null
  }

  if (raw.includes("year") || raw.includes("annual")) {
    return byName((name) => name.includes("annual") || name.includes("year")) ?? firstByInterval("year") ?? null
  }

  if (raw.includes("pro") || raw.includes("family") || raw.includes("premium")) {
    return byName((name) => name.includes("pro") || name.includes("family") || name.includes("premium"))
      ?? plans.find((plan) => plan.interval === "month" && (plan.isPopular || plan.audience === "family"))
      ?? firstByInterval("month")
      ?? null
  }

  if (raw === "monthly") {
    return plans.find((plan) => plan.interval === "month" && plan.isPopular) ?? firstByInterval("month") ?? null
  }

  if (raw === "yearly") {
    return firstByInterval("year") ?? null
  }

  return null
}

export async function getPublicPricingPlans(): Promise<PricingPlanView[]> {
  await ensurePricingPlansSeeded()

  const plans = await prisma.pricingPlan.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  })

  if (!plans.length) return FALLBACK_PRICING_PLANS
  return plans.map(mapPlan)
}

export async function getAdminPricingPlans(): Promise<PricingPlanView[]> {
  await ensurePricingPlansSeeded()

  const plans = await prisma.pricingPlan.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  })

  return plans.map(mapPlan)
}

export async function resolveCurrentPricingPlan(options: {
  pricingPlanId?: string | null
  legacyPlanKey?: string | null
}): Promise<PricingPlanView | null> {
  await ensurePricingPlansSeeded()

  if (options.pricingPlanId) {
    const directPlan = await prisma.pricingPlan.findUnique({ where: { id: options.pricingPlanId } })
    if (directPlan) return mapPlan(directPlan)
  }

  const plans = await getPublicPricingPlans()
  return inferPlanFromLegacyKey(plans, options.legacyPlanKey)
}
