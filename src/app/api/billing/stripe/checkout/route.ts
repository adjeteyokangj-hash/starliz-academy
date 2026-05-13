import { NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getStripeClient } from "@/lib/stripe"
import { SUBSCRIPTION_PLANS, type SubscriptionPlanKey } from "@/lib/subscription-plans"
import { writeAuditLog } from "@/lib/audit"

const checkoutSchema = z.object({
  planKey: z.string().optional(),
  planId: z.string().optional(),
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
  const requestedPlanKey = parsed.data.planKey as SubscriptionPlanKey | undefined
  const requestedReturnUrl = parsed.data.returnUrl

  let planKey: string | undefined = requestedPlanKey
  let unitAmount = 0
  let currency = "gbp"
  let interval: "month" | "year" = "month"
  let childLimit = 1
  let planName = "Starter"
  let priceId: string | undefined

  if (planId) {
    const dynamicPlan = await prisma.pricingPlan.findUnique({ where: { id: planId } })
    if (!dynamicPlan || !dynamicPlan.isActive) {
      return NextResponse.json({ error: "Selected plan is unavailable." }, { status: 404 })
    }

    if (dynamicPlan.interval === "custom") {
      return NextResponse.json({ error: "This plan uses custom pricing. Please contact support." }, { status: 400 })
    }

    if (!dynamicPlan.stripePriceId) {
      return NextResponse.json({ error: "This plan is not configured for Stripe checkout yet. Please contact support." }, { status: 400 })
    }

    const normalizedName = dynamicPlan.name.trim().toLowerCase()
    if (normalizedName.includes("starter")) planKey = "starter"
    else if (normalizedName.includes("annual") || dynamicPlan.interval === "year") planKey = "premium_yearly"
    else if (normalizedName.includes("pro")) planKey = "family"
    else if (normalizedName.includes("family")) planKey = "family"
    else planKey = "premium"

    unitAmount = Math.round(dynamicPlan.price * 100)
    currency = dynamicPlan.currency.toLowerCase()
    interval = dynamicPlan.interval
    childLimit = dynamicPlan.audience === "individual" ? 1 : 6
    planName = dynamicPlan.name
    priceId = dynamicPlan.stripePriceId
  } else {
    const fallbackPlan = requestedPlanKey ? SUBSCRIPTION_PLANS[requestedPlanKey] : null
    if (!requestedPlanKey || !fallbackPlan) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 })
    }

    planKey = requestedPlanKey
    unitAmount = fallbackPlan.price
    currency = fallbackPlan.currency
    interval = fallbackPlan.interval
    childLimit = fallbackPlan.childLimit
    planName = fallbackPlan.name
  }

  const appUrl = getAppUrl(request)
  const safeReturnUrl = resolveReturnUrl(requestedReturnUrl, appUrl)

  console.info("[billing.checkout] request", {
    parentId: user.id,
    planId: planId ?? null,
    priceId: priceId ?? null,
    hasStripeSecretKey: Boolean(process.env.STRIPE_SECRET_KEY),
    appUrl,
  })

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
            planKey: planKey ?? "starter",
            pricingPlanId: planId ?? null,
            status: "pending",
          },
        })
      : prisma.subscription.create({
          data: {
            parentId: user.id,
            provider: "stripe",
            planKey: planKey ?? "starter",
            pricingPlanId: planId ?? null,
            status: "pending",
          },
        }))

    const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: user.email,
    client_reference_id: user.id,
    line_items: priceId
      ? [
          {
            quantity: 1,
            price: priceId,
          },
        ]
      : [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: unitAmount,
              recurring: {
                interval,
              },
              product_data: {
                name: `StarLiz Academy ${planName}`,
                description: `Includes up to ${childLimit} child profile(s).`,
              },
            },
          },
        ],
    success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: safeReturnUrl,
    metadata: {
      provider: "stripe",
      userId: user.id,
      parentId: user.id,
      planKey: planKey ?? "starter",
      childLimit: String(childLimit),
      app: "StarLiz Academy",
      pricingPlanId: planId ?? "",
    },
    subscription_data: {
      metadata: {
        provider: "stripe",
        userId: user.id,
        parentId: user.id,
        planKey: planKey ?? "starter",
        childLimit: String(childLimit),
        app: "StarLiz Academy",
        pricingPlanId: planId ?? "",
      },
    },
  })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start Stripe checkout."
    console.error("[billing.checkout] failed", {
      parentId: user.id,
      planId: planId ?? null,
      priceId: priceId ?? null,
      hasStripeSecretKey: Boolean(process.env.STRIPE_SECRET_KEY),
      appUrl,
      message,
    })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
