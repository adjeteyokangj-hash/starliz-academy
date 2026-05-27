import { NextResponse } from "next/server"
import { z } from "zod"
import { requireSession } from "@/lib/api_guard"
import { resolveParentScope } from "@/lib/parent_scope"
import { prisma } from "@/lib/db"
import { getPaymentApiKey } from "@/lib/api-key-config"
import { getPublicPricingPlans, planKeyFromPricingPlan } from "@/lib/pricing/service"
import {
  getPaymentAvailabilityMessage,
  isProviderAvailableForCountry,
  resolveCurrencyForCountry,
  resolvePreferredProviderWithFallback,
  resolveBillingRegion,
  type BillingProvider,
} from "@/lib/billing/payment-routing"

const checkoutSchema = z.object({
  planId: z.string().min(1).optional(),
  planKey: z.enum(["monthly", "yearly"]).optional(),
  provider: z.enum(["revolut", "paystack", "stripe", "manual"]).optional(),
  returnUrl: z.string().optional(),
  countryCode: z.string().trim().min(2).max(32).optional(),
})

function getOrigin(request: Request): string {
  const url = new URL(request.url)
  return process.env.NEXT_PUBLIC_APP_URL ?? `${url.protocol}//${url.host}`
}

function normalizeReturnUrl(request: Request, returnUrl?: string): string {
  const origin = getOrigin(request)
  if (!returnUrl) return `${origin}/parent/billing`
  try {
    const url = new URL(returnUrl)
    if (url.origin !== origin) return `${origin}/parent/billing`
    return url.toString()
  } catch {
    return `${origin}/parent/billing`
  }
}

async function resolveCheckoutPlan(planId: string | undefined, planKey: "monthly" | "yearly" | undefined) {
  const plans = await getPublicPricingPlans()
  if (planId) {
    return plans.find((plan) => plan.id === planId) ?? null
  }

  if (planKey === "yearly") {
    return plans.find((plan) => plan.interval === "year") ?? null
  }

  return plans.find((plan) => plan.interval === "month" && plan.isPopular) ?? plans.find((plan) => plan.interval === "month") ?? null
}

async function upsertPendingSubscription(parentId: string, payload: {
  provider: BillingProvider
  status: string
  planId: string | null
  planKey: string
  providerCustomerId?: string | null
  providerSubId?: string | null
}) {
  const existing = await prisma.subscription.findFirst({
    where: { parentId },
    orderBy: { updatedAt: "desc" },
  })

  const data = {
    provider: payload.provider,
    status: payload.status,
    pricingPlanId: payload.planId,
    planKey: payload.planKey,
    providerCustomerId: payload.providerCustomerId ?? existing?.providerCustomerId ?? null,
    providerSubId: payload.providerSubId ?? existing?.providerSubId ?? null,
  }

  if (existing) {
    await prisma.subscription.update({ where: { id: existing.id }, data })
    return
  }

  await prisma.subscription.create({
    data: {
      parentId,
      ...data,
    },
  })
}

async function startStripeCheckout(input: {
  request: Request
  parentId: string
  parentEmail: string
  plan: NonNullable<Awaited<ReturnType<typeof resolveCheckoutPlan>>>
  returnUrl?: string
}) {
  if (!input.plan.stripePriceId) {
    return NextResponse.json({ error: "Unavailable online for this plan. Please contact us." }, { status: 400 })
  }

  const stripeSecret = await getPaymentApiKey()
  if (!stripeSecret) {
    return NextResponse.json({ error: "Stripe billing is not configured for this environment." }, { status: 503 })
  }

  const origin = getOrigin(input.request)
  const form = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": input.plan.stripePriceId,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/subscription/success`,
    cancel_url: normalizeReturnUrl(input.request, input.returnUrl),
    customer_email: input.parentEmail,
    "metadata[parentId]": input.parentId,
    "metadata[planKey]": planKeyFromPricingPlan(input.plan),
    "metadata[pricingPlanId]": input.plan.id,
    "metadata[provider]": "stripe",
  })

  const checkout = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  })

  if (!checkout.ok) {
    return NextResponse.json({ error: "Unable to start Stripe checkout." }, { status: 502 })
  }

  const payload = await checkout.json() as { url?: string; id?: string; customer?: string }
  await upsertPendingSubscription(input.parentId, {
    provider: "stripe",
    status: "pending",
    planId: input.plan.id,
    planKey: planKeyFromPricingPlan(input.plan),
    providerCustomerId: payload.customer ? String(payload.customer) : null,
    providerSubId: payload.id ? String(payload.id) : null,
  })

  return NextResponse.json({ ok: true, provider: "stripe", checkoutUrl: payload.url ?? null })
}

async function startPaystackCheckout(input: {
  request: Request
  parentId: string
  parentEmail: string
  plan: NonNullable<Awaited<ReturnType<typeof resolveCheckoutPlan>>>
  countryCode: string | null | undefined
}) {
  const secret = process.env.PAYSTACK_SECRET_KEY
  if (!secret) {
    return NextResponse.json({ error: "Paystack is not configured for this environment." }, { status: 503 })
  }

  const callbackUrl = `${getOrigin(input.request)}/subscription/success`
  const amount = Math.max(1, Math.round(input.plan.price * 100))
  const currency = resolveCurrencyForCountry(input.countryCode)

  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.parentEmail,
      amount,
      currency,
      callback_url: callbackUrl,
      metadata: {
        provider: "paystack",
        parentId: input.parentId,
        planKey: planKeyFromPricingPlan(input.plan),
        pricingPlanId: input.plan.id,
      },
    }),
  })

  if (!response.ok) {
    return NextResponse.json({ error: "Unable to start Paystack checkout." }, { status: 502 })
  }

  const payload = await response.json() as {
    status?: boolean
    data?: { authorization_url?: string; reference?: string }
  }

  const checkoutUrl = payload.data?.authorization_url ?? null
  const reference = payload.data?.reference ?? null

  await upsertPendingSubscription(input.parentId, {
    provider: "paystack",
    status: "pending",
    planId: input.plan.id,
    planKey: planKeyFromPricingPlan(input.plan),
    providerSubId: reference,
  })

  return NextResponse.json({ ok: true, provider: "paystack", checkoutUrl, reference })
}

async function startRevolutCheckout(input: {
  request: Request
  parentId: string
  parentEmail: string
  plan: NonNullable<Awaited<ReturnType<typeof resolveCheckoutPlan>>>
  countryCode: string | null | undefined
  returnUrl?: string
}) {
  const apiKey = process.env.REVOLUT_MERCHANT_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "Revolut is not configured for this environment." }, { status: 503 })
  }

  const apiBaseUrl = process.env.REVOLUT_API_BASE_URL ?? "https://merchant.revolut.com/api"
  const amountMinor = Math.max(1, Math.round(input.plan.price * 100))
  const currency = resolveCurrencyForCountry(input.countryCode)
  const checkoutReturn = normalizeReturnUrl(input.request, input.returnUrl)

  const response = await fetch(`${apiBaseUrl}/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Revolut-Api-Version": "2024-09-01",
    },
    body: JSON.stringify({
      amount: amountMinor,
      currency,
      description: `${input.plan.name} subscription`,
      metadata: {
        provider: "revolut",
        parentId: input.parentId,
        email: input.parentEmail,
        planKey: planKeyFromPricingPlan(input.plan),
        pricingPlanId: input.plan.id,
      },
      redirect_url: checkoutReturn,
    }),
  })

  if (!response.ok) {
    return NextResponse.json({ error: "Unable to start Revolut checkout." }, { status: 502 })
  }

  const payload = await response.json() as {
    id?: string
    checkout_url?: string
    public_id?: string
  }

  await upsertPendingSubscription(input.parentId, {
    provider: "revolut",
    status: "pending",
    planId: input.plan.id,
    planKey: planKeyFromPricingPlan(input.plan),
    providerSubId: payload.id ?? payload.public_id ?? null,
  })

  return NextResponse.json({ ok: true, provider: "revolut", checkoutUrl: payload.checkout_url ?? null })
}

export async function POST(request: Request) {
  const { session, response } = await requireSession()
  if (!session) return response

  const parentScope = await resolveParentScope(session)
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 })
  }

  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 })
  }

  const plan = await resolveCheckoutPlan(parsed.data.planId, parsed.data.planKey)
  if (!plan) {
    return NextResponse.json({ error: "No active pricing plan available for this selection." }, { status: 404 })
  }

  const parentProfile = await prisma.parentProfile.findUnique({
    where: { userId: parentScope.parentId },
    select: { country: true },
  })

  const selectedCountry = parsed.data.countryCode ?? parentProfile?.country ?? "UK"
  const billingRegion = resolveBillingRegion(selectedCountry)
  const resolvedProvider = parsed.data.provider ?? resolvePreferredProviderWithFallback(selectedCountry)

  if (!isProviderAvailableForCountry(resolvedProvider, selectedCountry)) {
    return NextResponse.json({
      error: getPaymentAvailabilityMessage(selectedCountry),
      provider: resolvedProvider,
      region: billingRegion,
    }, { status: 403 })
  }

  if (billingRegion.status !== "live") {
    return NextResponse.json({
      error: getPaymentAvailabilityMessage(selectedCountry),
      provider: resolvedProvider,
      region: billingRegion,
    }, { status: 403 })
  }

  if (resolvedProvider === "manual") {
    await upsertPendingSubscription(parentScope.parentId, {
      provider: "manual",
      status: "manual_review",
      planId: plan.id,
      planKey: planKeyFromPricingPlan(plan),
    })

    return NextResponse.json({
      ok: true,
      provider: "manual",
      message: "Manual billing review has been created for this account.",
    })
  }

  if (resolvedProvider === "paystack") {
    return startPaystackCheckout({
      request,
      parentId: parentScope.parentId,
      parentEmail: parentScope.parentEmail,
      plan,
      countryCode: selectedCountry,
    })
  }

  if (resolvedProvider === "revolut") {
    return startRevolutCheckout({
      request,
      parentId: parentScope.parentId,
      parentEmail: parentScope.parentEmail,
      plan,
      countryCode: selectedCountry,
      returnUrl: parsed.data.returnUrl,
    })
  }

  return startStripeCheckout({
    request,
    parentId: parentScope.parentId,
    parentEmail: parentScope.parentEmail,
    plan,
    returnUrl: parsed.data.returnUrl,
  })
}
