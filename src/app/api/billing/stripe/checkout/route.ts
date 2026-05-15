import { NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getStripeClient } from "@/lib/stripe"
import { getPublicPricingPlans, planKeyFromPricingPlan } from "@/lib/pricing/service"
import { writeAuditLog } from "@/lib/audit"

const checkoutSchema = z.object({
  planId: z.string().min(1),
  returnUrl: z.string().optional(),
})

function getAppUrl(request: Request): string {
  const url = new URL(request.url)
  return process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? `${url.protocol}//${url.host}`
}

function resolveReturnUrl(returnUrl: string | undefined, appUrl: string): string {
  if (!returnUrl) return `${appUrl}/parent/billing`
  try {
    const requested = new URL(returnUrl)
    const base = new URL(appUrl)
    if (requested.origin !== base.origin) {
      return `${appUrl}/parent/billing`
    }
    return requested.toString()
  } catch {
    return `${appUrl}/parent/billing`
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid checkout payload." }, { status: 400 })
  }

  const planId = parsed.data.planId
  const requestedReturnUrl = parsed.data.returnUrl
  const activePlans = await getPublicPricingPlans()
  const selectedPlan = activePlans.find((entry) => entry.id === planId)

  if (!selectedPlan) {
    return NextResponse.json({ error: "Selected plan is unavailable." }, { status: 404 })
  }

  if (selectedPlan.interval === "custom") {
    return NextResponse.json({ error: "Unavailable online. Please contact us for this plan." }, { status: 400 })
  }

  if (!selectedPlan.stripePriceId) {
    return NextResponse.json({ error: "Unavailable online for this plan. Please contact us." }, { status: 400 })
  }

  const planKey = planKeyFromPricingPlan(selectedPlan)
  const childLimit = selectedPlan.childLimit
  const planName = selectedPlan.name

  const appUrl = getAppUrl(request)
  const safeReturnUrl = resolveReturnUrl(requestedReturnUrl, appUrl)

  try {
    await writeAuditLog({
      actorUserId: user.id,
      action: "billing.plan_change_attempted",
      entityType: "subscription",
      entityId: user.id,
      metadata: { planId: planId ?? null, planKey: planKey ?? null },
    })

    const stripe = await getStripeClient()
    if (!stripe) {
      return NextResponse.json(
        {
          error: "Stripe is not configured.",
          details: {
            hasStripeSecretKey: Boolean(process.env.STRIPE_SECRET_KEY),
            appUrl,
          },
        },
        { status: 503 },
      )
    }

    const existingSubscription = await prisma.subscription.findFirst({
      where: { parentId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, providerCustomerId: true, providerSubId: true },
    })

    await (existingSubscription
      ? prisma.subscription.update({
          where: { id: existingSubscription.id },
          data: {
            provider: "stripe",
            planKey,
            pricingPlanId: planId ?? null,
            status: "pending",
          },
        })
      : prisma.subscription.create({
          data: {
            parentId: user.id,
            provider: "stripe",
            planKey,
            pricingPlanId: planId ?? null,
            status: "pending",
          },
        }))

    const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: user.email,
    client_reference_id: user.id,
    line_items: [
      {
        quantity: 1,
        price: selectedPlan.stripePriceId,
      },
    ],
    success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: safeReturnUrl,
    metadata: {
      provider: "stripe",
      userId: user.id,
      parentId: user.id,
      planKey,
      childLimit: String(childLimit),
      app: "StarLiz Academy",
      pricingPlanId: planId ?? "",
      planName,
      planInterval: selectedPlan.interval,
    },
    subscription_data: {
      metadata: {
        provider: "stripe",
        userId: user.id,
        parentId: user.id,
        planKey,
        childLimit: String(childLimit),
        app: "StarLiz Academy",
        pricingPlanId: planId ?? "",
        planName,
        planInterval: selectedPlan.interval,
      },
    },
  })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start Stripe checkout."
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
