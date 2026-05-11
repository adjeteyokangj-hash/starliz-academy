import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/api_guard"

const pricingPlanUpdate = z.object({
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
  isActive: z.boolean(),
  isPopular: z.boolean(),
  sortOrder: z.number().int(),
})

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function PUT(request: Request, context: RouteContext) {
  const { session, response } = await requireAdmin()
  if (!session) return response

  const { id } = await context.params

  try {
    const parsed = pricingPlanUpdate.parse(await request.json())

    const updated = await prisma.pricingPlan.update({
      where: { id },
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

    return NextResponse.json({ plan: updated })
  } catch {
    return NextResponse.json({ error: "Invalid pricing update payload." }, { status: 400 })
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  const { session, response } = await requireAdmin()
  if (!session) return response

  const { id } = await context.params

  try {
    await prisma.pricingPlan.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unable to delete pricing plan." }, { status: 400 })
  }
}
