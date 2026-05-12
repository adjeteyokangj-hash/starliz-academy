"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { StripeCheckoutButton } from "@/components/billing/StripeCheckoutButton"

type PricingInterval = "month" | "year" | "custom"
type PricingAudience = "individual" | "family" | "school" | "organisation"

type PricingPlan = {
  id: string
  name: string
  description: string
  price: number
  currency: string
  interval: PricingInterval
  audience: PricingAudience
  features: string[]
  priceNote: string | null
  badge: string | null
  ctaLabel: string
  ctaHref: string
  stripePriceId: string | null
  isActive: boolean
  isPopular: boolean
  sortOrder: number
}

type PublicPricingSectionProps = {
  compact?: boolean
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "GBP",
    maximumFractionDigits: 2,
  }).format(value)
}

function intervalLabel(interval: PricingInterval): string {
  if (interval === "year") return "/year"
  if (interval === "month") return "/month"
  return ""
}

function canUseStripeCheckout(plan: PricingPlan): boolean {
  return (plan.interval === "month" || plan.interval === "year") && !!plan.stripePriceId
}

export default function PublicPricingSection({ compact = false }: PublicPricingSectionProps) {
  const [plans, setPlans] = useState<PricingPlan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    void (async () => {
      const response = await fetch("/api/pricing", { credentials: "same-origin" })
      if (!active) return

      if (!response.ok) {
        setPlans([])
        setLoading(false)
        return
      }

      const payload = (await response.json()) as { plans: PricingPlan[] }
      setPlans(payload.plans ?? [])
      setLoading(false)
    })()

    return () => {
      active = false
    }
  }, [])

  const individualPlans = useMemo(() => {
    return plans.filter((plan) => plan.audience === "individual" || plan.audience === "family")
  }, [plans])

  const orgPlans = useMemo(() => {
    return plans.filter((plan) => plan.audience === "school" || plan.audience === "organisation")
  }, [plans])

  const headingSize = compact ? "text-3xl" : "text-4xl"

  return (
    <section id="pricing" className="scroll-mt-28 bg-slate-900/40 px-6 py-24">
      <div className="mx-auto max-w-6xl text-center">
        <h2 className={`${headingSize} font-black`}>Simple pricing. Real learning progress.</h2>
        <p className="mt-4 text-slate-400">Start with a free trial. No credit card required.</p>

        {loading && plans.length === 0 ? <p className="mt-8 text-sm text-slate-500">Loading pricing...</p> : null}

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {individualPlans.map((plan) => (
            <article
              key={plan.id}
              className={`relative flex flex-col rounded-3xl border p-8 text-left ${
                plan.isPopular
                  ? "border-blue-500 bg-linear-to-b from-blue-600/20 to-slate-900 shadow-xl shadow-blue-900/30"
                  : "border-slate-700 bg-slate-900"
              }`}
            >
              {plan.badge ? (
                <span className="absolute -top-3 left-6 rounded-full bg-blue-600 px-4 py-1 text-xs font-bold text-white">
                  {plan.badge}
                </span>
              ) : null}

              <h3 className="text-2xl font-black text-white">{plan.name}</h3>
              <p className="mt-2 min-h-12 text-sm text-slate-400">{plan.description}</p>

              <p className="mt-6 text-5xl font-black text-white">
                {formatCurrency(plan.price, plan.currency)}
                <span className="ml-1 text-lg font-medium text-slate-400">{intervalLabel(plan.interval)}</span>
              </p>

              {plan.priceNote ? (
                <p className="mt-2 text-sm font-semibold text-emerald-400">{plan.priceNote}</p>
              ) : plan.interval === "year" ? (
                <p className="mt-2 text-sm font-semibold text-emerald-400">Less than £0.25 per day</p>
              ) : null}

              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                {plan.features.map((feature) => (
                  <li key={`${plan.id}-${feature}`} className="flex items-start gap-2">
                    <span className="mt-0.5 text-blue-400">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                {canUseStripeCheckout(plan) ? (
                  <StripeCheckoutButton
                    planId={plan.id}
                    className="w-full rounded-xl bg-blue-600 px-6 py-3 text-center text-sm font-bold text-white transition hover:bg-blue-500"
                  >
                    {plan.ctaLabel || "Start Free Trial"}
                  </StripeCheckoutButton>
                ) : (
                  <Link
                    href={plan.ctaHref || "/signup"}
                    className="block w-full rounded-xl bg-blue-600 px-6 py-3 text-center text-sm font-bold text-white transition hover:bg-blue-500"
                  >
                    {plan.ctaLabel || "Start Free Trial"}
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-16 max-w-6xl rounded-3xl border border-slate-700 bg-slate-900/80 p-8 lg:p-10">
        <h3 className="text-3xl font-black text-white">Schools &amp; Organisations</h3>
        <p className="mt-3 max-w-3xl text-slate-300">
          Bring StarLiz Academy to your school, tutoring centre or learning organisation.
        </p>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <ul className="space-y-3 text-slate-300">
            <li className="flex items-start gap-2"><span className="text-blue-400">✓</span>Multi-student management</li>
            <li className="flex items-start gap-2"><span className="text-blue-400">✓</span>Teacher/admin dashboard</li>
            <li className="flex items-start gap-2"><span className="text-blue-400">✓</span>Safeguarding and reports</li>
            <li className="flex items-start gap-2"><span className="text-blue-400">✓</span>AI learning insights</li>
            <li className="flex items-start gap-2"><span className="text-blue-400">✓</span>Safeguarding-focused access controls</li>
            <li className="flex items-start gap-2"><span className="text-blue-400">✓</span>Custom onboarding support</li>
          </ul>

          <div className="rounded-2xl border border-slate-700 bg-slate-950 p-6 text-center lg:text-left">
            <p className="text-sm uppercase tracking-widest text-slate-400">Pricing</p>
            <p className="mt-2 text-4xl font-black text-white">Custom pricing</p>
            <p className="mt-3 text-sm text-slate-400">
              Flexible plans based on learner count, usage and support needs.
            </p>

            <Link
              href={orgPlans[0]?.ctaHref || "/contact"}
              className="mt-6 inline-block rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-500"
            >
              {orgPlans[0]?.ctaLabel || "Contact Us for School Pricing"}
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
