import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { FALLBACK_PRICING_PLANS, type PricingPlanView } from "@/lib/pricing/fallback"
import { getPublicCountryProfile } from "@/lib/public-country-profiles"

export type PublicPricingPlanView = Pick<
  PricingPlanView,
  | "name"
  | "description"
  | "price"
  | "currency"
  | "interval"
  | "audience"
  | "features"
  | "childLimit"
  | "priceNote"
  | "badge"
  | "ctaLabel"
  | "ctaHref"
  | "isPopular"
> & {
  countryCode: string
  countryName: string
  regionStatus: "live" | "coming_soon"
  checkoutEnabled: boolean
  paymentProvider: string
}

type StoredPricingFeatures = {
  bullets?: unknown
  childLimit?: unknown
}

function sanitizePublicPricingString(value: string): string {
  return value
    .replaceAll("AI adapts to your child daily", "Adaptive support follows your child's progress")
    .replaceAll("AI learning insights", "Progress insights")
    .replaceAll("Parent, student, admin and school platform plans", "Family, learner and school-ready plans")
}

function sanitizePublicPricingPlan(plan: PricingPlanView): PricingPlanView {
  return {
    ...plan,
    name: sanitizePublicPricingString(plan.name),
    description: sanitizePublicPricingString(plan.description),
    features: plan.features.map((feature) => sanitizePublicPricingString(feature)),
    badge: plan.badge ? sanitizePublicPricingString(plan.badge) : plan.badge,
    ctaLabel: sanitizePublicPricingString(plan.ctaLabel),
  }
}

function toPublicPricingPlan(plan: PricingPlanView, options?: {
  countryCode?: string
  countryName?: string
  regionStatus?: "live" | "coming_soon"
  checkoutEnabled?: boolean
  paymentProvider?: string
  currency?: string
}): PublicPricingPlanView {
  return {
    name: plan.name,
    description: plan.description,
    price: plan.price,
    currency: options?.currency ?? plan.currency,
    interval: plan.interval,
    audience: plan.audience,
    features: plan.features,
    childLimit: plan.childLimit,
    priceNote: plan.priceNote,
    badge: plan.badge,
    ctaLabel: plan.ctaLabel,
    ctaHref: plan.ctaHref,
    isPopular: plan.isPopular,
    countryCode: options?.countryCode ?? "uk",
    countryName: options?.countryName ?? "United Kingdom",
    regionStatus: options?.regionStatus ?? "live",
    checkoutEnabled: options?.checkoutEnabled ?? true,
    paymentProvider: options?.paymentProvider ?? "revolut",
  }
}

function defaultChildLimitForAudience(audience: PricingPlanView["audience"]): number {
  if (audience === "individual") return 1
  if (audience === "family") return 4
  if (audience === "school" || audience === "organisation") return 100
  return 1
}

function parseStoredFeatures(value: Prisma.JsonValue): { features: string[]; childLimit: number | null } {
  if (Array.isArray(value)) {
    return {
      features: value.map((item) => String(item)).filter(Boolean),
      childLimit: null,
    }
  }

  if (!value || typeof value !== "object") {
    return { features: [], childLimit: null }
  }

  const typed = value as StoredPricingFeatures
  const bullets = Array.isArray(typed.bullets)
    ? typed.bullets.map((item) => String(item)).filter(Boolean)
    : []
  const childLimit = typeof typed.childLimit === "number" && Number.isFinite(typed.childLimit)
    ? Math.max(1, Math.floor(typed.childLimit))
    : null

  return { features: bullets, childLimit }
}

function featuresToStorage(features: string[], childLimit: number): Prisma.InputJsonValue {
  return {
    bullets: features,
    childLimit,
  }
}

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
      features: featuresToStorage(plan.features, plan.childLimit),
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
  const parsedFeatures = parseStoredFeatures(plan.features)
  const audience = plan.audience as PricingPlanView["audience"]
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    price: plan.price,
    currency: plan.currency,
    interval: plan.interval as PricingPlanView["interval"],
    audience,
    features: parsedFeatures.features,
    childLimit: parsedFeatures.childLimit ?? defaultChildLimitForAudience(audience),
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

  if (raw.includes("standard") || raw.includes("monthly")) {
    return byName((name) => name.includes("standard") || name.includes("monthly"))
      ?? plans.find((plan) => plan.interval === "month" && plan.audience === "family")
      ?? firstByInterval("month")
      ?? null
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

  if (raw.includes("enterprise") || raw.includes("custom") || raw.includes("school") || raw.includes("organisation")) {
    return byName((name) => name.includes("enterprise") || name.includes("school") || name.includes("organisation") || name.includes("custom"))
      ?? plans.find((plan) => plan.interval === "custom")
      ?? plans.find((plan) => plan.audience === "school" || plan.audience === "organisation")
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

  if (!plans.length) return FALLBACK_PRICING_PLANS.map(sanitizePublicPricingPlan)
  return plans.map(mapPlan).map(sanitizePublicPricingPlan)
}

export async function getPublicPricingListing(): Promise<PublicPricingPlanView[]> {
  return getPublicPricingListingForCountry("uk")
}

export async function getPublicPricingListingForCountry(countryCodeOrName: string | null | undefined): Promise<PublicPricingPlanView[]> {
  const profile = getPublicCountryProfile(countryCodeOrName)
  if (!profile.pricingEnabled) return []

  const plans = await getPublicPricingPlans()
  return plans.map((plan) => {
    const ctaHref = profile.checkoutEnabled ? plan.ctaHref : "/contact"
    const ctaLabel = profile.checkoutEnabled ? plan.ctaLabel : "Contact Us"
    return toPublicPricingPlan(
      {
        ...plan,
        ctaHref,
        ctaLabel,
      },
      {
        countryCode: profile.countryCode,
        countryName: profile.countryName,
        regionStatus: profile.status,
        checkoutEnabled: profile.checkoutEnabled,
        paymentProvider: profile.paymentProvider,
        currency: profile.currency,
      },
    )
  })
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

export function toPricingFeaturesStorage(input: {
  features: string[]
  childLimit: number
}): Prisma.InputJsonValue {
  return featuresToStorage(input.features, Math.max(1, Math.floor(input.childLimit || 1)))
}

export function planKeyFromPricingPlan(plan: Pick<PricingPlanView, "id" | "name">): string {
  const slug = plan.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
  return `pricing:${slug || plan.id}`
}
