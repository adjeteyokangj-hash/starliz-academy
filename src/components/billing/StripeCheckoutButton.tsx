"use client"

import { useState } from "react"
import { trackUsageEvent } from "@/lib/admin-tracking"

type StripeCheckoutButtonProps = {
  planKey?: string
  planId?: string
  className?: string
  children?: React.ReactNode
}

export function StripeCheckoutButton({
  planKey,
  planId,
  className = "rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700",
  children = "Start with Stripe",
}: StripeCheckoutButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function startCheckout() {
    setLoading(true)
    setError(null)

    try {
      void trackUsageEvent({
        type: "checkout_started",
        area: "pricing",
        feature: planId ?? planKey ?? "pricing",
      })

      const response = await fetch("/api/billing/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ planKey, planId }),
      })

      if (response.status === 401) {
        window.location.href = "/signup"
        return
      }

      const data = (await response.json()) as { url?: string; error?: string }

      if (data.url) {
        window.location.href = data.url
        return
      }

      setError(data.error ?? "Unable to start checkout.")
    } catch {
      setError("Unable to start checkout.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={startCheckout}
        disabled={loading}
        className={className}
      >
        {loading ? "Starting..." : children}
      </button>
      {error ? <p className="mt-3 text-sm font-semibold text-rose-300">{error}</p> : null}
    </div>
  )
}
