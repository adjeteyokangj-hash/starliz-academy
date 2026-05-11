import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/api_guard"
import { getAdminPricingPlans } from "@/lib/pricing/service"

const pricingPlanInput = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  price: z.number().min(0),
  currency: z.string().min(3).max(8).default("GBP"),
  interval: z.enum(["month", "year", "custom"]),
  audience: z.enum(["individual", "family", "school", "organisation"]),
  features: z.array(z.string()).default([]),
  priceNote: z.string().nullable().optional(),
  badge: z.string().nullable().optional(),
  ctaLabel: z.string().min(1),
  ctaHref: z.string().min(1),
  stripePriceId: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  isPopular: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
})

export async function GET() {
  const { session, response } = await requireAdmin()
  if (!session) return response

  const plans = await getAdminPricingPlans()
  return NextResponse.json({ plans })
}

export async function POST(request: Request) {
  const { session, response } = await requireAdmin()
  if (!session) return response

  try {
    const parsed = pricingPlanInput.parse(await request.json())

    const created = await prisma.pricingPlan.create({
      data: {
        name: parsed.name,
        description: parsed.description,
        price: parsed.price,
        currency: parsed.currency,
        interval: parsed.interval,
        audience: parsed.audience,
        features: parsed.features,
        priceNote: parsed.priceNote ?? null,
        badge: parsed.badge ?? null,
        ctaLabel: parsed.ctaLabel,
        ctaHref: parsed.ctaHref,
        stripePriceId: parsed.stripePriceId ?? null,
        isActive: parsed.isActive,
        isPopular: parsed.isPopular,
        sortOrder: parsed.sortOrder,
      },
    })

    return NextResponse.json({ plan: created }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Invalid pricing payload." }, { status: 400 })
  }
}
