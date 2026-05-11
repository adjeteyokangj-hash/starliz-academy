"use client"

import { useEffect, useMemo, useState } from "react"
import AdminSectionCard from "@/components/admin/AdminSectionCard"

type PricingInterval = "month" | "year" | "custom"
type PricingAudience = "individual" | "family" | "school" | "organisation"

type Plan = {
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

const INTERVAL_OPTIONS: PricingInterval[] = ["month", "year", "custom"]
const AUDIENCE_OPTIONS: PricingAudience[] = ["individual", "family", "school", "organisation"]

function toFeatureText(features: string[]): string {
  return features.join("\n")
}

function fromFeatureText(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function emptyPlan(sortOrder = 0): Omit<Plan, "id"> {
  return {
    name: "",
    description: "",
    price: 0,
    currency: "GBP",
    interval: "month",
    audience: "individual",
    features: [],
    priceNote: null,
    badge: null,
    ctaLabel: "Start Free Trial",
    ctaHref: "/signup",
    stripePriceId: null,
    isActive: true,
    isPopular: false,
    sortOrder,
  }
}

export default function AdminPricingPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [draft, setDraft] = useState<Omit<Plan, "id">>(emptyPlan())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const maxSort = useMemo(() => {
    return plans.length ? Math.max(...plans.map((plan) => plan.sortOrder)) : 0
  }, [plans])

  async function loadPlans() {
    try {
      const response = await fetch("/api/admin/pricing", { credentials: "include" })
      if (!response.ok) {
        setError("Unable to load pricing plans.")
        setLoading(false)
        return
      }

      const payload = (await response.json()) as { plans: Plan[] }
      setPlans(payload.plans ?? [])
      setLoading(false)
    } catch {
      setError("Unable to load pricing plans.")
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true

    fetch("/api/admin/pricing", { credentials: "include" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to load pricing plans.")
        }
        return response.json() as Promise<{ plans: Plan[] }>
      })
      .then((payload) => {
        if (!active) return
        setPlans(payload.plans ?? [])
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setError("Unable to load pricing plans.")
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  function patchPlan(id: string, partial: Partial<Plan>) {
    setPlans((current) => current.map((plan) => (plan.id === id ? { ...plan, ...partial } : plan)))
  }

  async function createPlan() {
    setSaving("new")
    setError(null)
    setMessage(null)

    try {
      const response = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(draft),
      })

      if (!response.ok) {
        setError("Unable to create pricing plan.")
        return
      }

      setMessage("Pricing plan created.")
      setDraft(emptyPlan(maxSort + 10))
      await loadPlans()
    } catch {
      setError("Unable to create pricing plan.")
    } finally {
      setSaving(null)
    }
  }

  async function savePlan(plan: Plan) {
    setSaving(plan.id)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch(`/api/admin/pricing/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(plan),
      })

      if (!response.ok) {
        setError(`Unable to save ${plan.name}.`)
        return
      }

      setMessage(`Saved ${plan.name}.`)
      await loadPlans()
    } catch {
      setError(`Unable to save ${plan.name}.`)
    } finally {
      setSaving(null)
    }
  }

  async function deletePlan(id: string) {
    setSaving(id)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch(`/api/admin/pricing/${id}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (!response.ok) {
        setError("Unable to delete pricing plan.")
        return
      }

      setMessage("Pricing plan deleted.")
      await loadPlans()
    } catch {
      setError("Unable to delete pricing plan.")
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-6">
      <AdminSectionCard title="Pricing Plans" eyebrow="Billing">
        <p className="text-sm text-slate-400">
          Manage public pricing without code changes. Stripe is launch provider for UK billing, with room for Paystack later.
        </p>
      </AdminSectionCard>

      <AdminSectionCard title="Create New Plan" className="space-y-4">
        {error ? <p className="rounded-xl border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
        {message ? <p className="rounded-xl border border-emerald-500/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">{message}</p> : null}

        <PlanEditor
          plan={{ id: "new", ...draft }}
          onChange={(partial) => setDraft((current) => ({ ...current, ...partial }))}
          saveLabel={saving === "new" ? "Creating..." : "Add Plan"}
          onSave={() => void createPlan()}
          disableDelete
          saving={saving === "new"}
        />
      </AdminSectionCard>

      <AdminSectionCard title="Existing Plans">
        {loading ? <p className="text-sm text-slate-400">Loading pricing plans...</p> : null}
        {!loading && plans.length === 0 ? <p className="text-sm text-slate-400">No plans yet.</p> : null}

        <div className="space-y-4">
          {plans.map((plan) => (
            <PlanEditor
              key={plan.id}
              plan={plan}
              onChange={(partial) => patchPlan(plan.id, partial)}
              saveLabel={saving === plan.id ? "Saving..." : "Save Changes"}
              onSave={() => void savePlan(plan)}
              onDelete={() => void deletePlan(plan.id)}
              saving={saving === plan.id}
            />
          ))}
        </div>
      </AdminSectionCard>
    </div>
  )
}

type PlanEditorProps = {
  plan: Plan
  onChange: (partial: Partial<Plan>) => void
  onSave: () => void
  onDelete?: () => void
  saveLabel: string
  saving: boolean
  disableDelete?: boolean
}

function PlanEditor({ plan, onChange, onSave, onDelete, saveLabel, saving, disableDelete = false }: PlanEditorProps) {
  return (
    <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-semibold text-slate-400">Name
          <input
            value={plan.name}
            onChange={(event) => onChange({ name: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
        </label>

        <label className="text-xs font-semibold text-slate-400">Price
          <input
            type="number"
            step="0.01"
            min="0"
            value={Number.isFinite(plan.price) ? plan.price : 0}
            onChange={(event) => onChange({ price: Number(event.target.value) || 0 })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
        </label>

        <label className="text-xs font-semibold text-slate-400">Currency
          <input
            value={plan.currency}
            onChange={(event) => onChange({ currency: event.target.value.toUpperCase() })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
        </label>

        <label className="text-xs font-semibold text-slate-400">Sort Order
          <input
            type="number"
            value={plan.sortOrder}
            onChange={(event) => onChange({ sortOrder: Number(event.target.value) || 0 })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
        </label>

        <label className="text-xs font-semibold text-slate-400">Interval
          <select
            value={plan.interval}
            onChange={(event) => onChange({ interval: event.target.value as PricingInterval })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          >
            {INTERVAL_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>

        <label className="text-xs font-semibold text-slate-400">Audience
          <select
            value={plan.audience}
            onChange={(event) => onChange({ audience: event.target.value as PricingAudience })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          >
            {AUDIENCE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>

        <label className="text-xs font-semibold text-slate-400">Badge
          <input
            value={plan.badge ?? ""}
            onChange={(event) => onChange({ badge: event.target.value.trim() || null })}
            placeholder="Most Popular / Best Value"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
        </label>

        <label className="text-xs font-semibold text-slate-400">CTA Label
          <input
            value={plan.ctaLabel}
            onChange={(event) => onChange({ ctaLabel: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
        </label>

        <label className="text-xs font-semibold text-slate-400">CTA Href
          <input
            value={plan.ctaHref}
            onChange={(event) => onChange({ ctaHref: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
        </label>

        <label className="text-xs font-semibold text-slate-400 xl:col-span-2">Stripe Price ID
          <input
            value={plan.stripePriceId ?? ""}
            onChange={(event) => onChange({ stripePriceId: event.target.value.trim() || null })}
            placeholder="price_..."
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
        </label>
      </div>

      <label className="mt-3 block text-xs font-semibold text-slate-400">Description
        <textarea
          value={plan.description}
          onChange={(event) => onChange({ description: event.target.value })}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        />
      </label>

      <label className="mt-3 block text-xs font-semibold text-slate-400">Price Note (optional)
        <input
          value={plan.priceNote ?? ""}
          onChange={(event) => onChange({ priceNote: event.target.value.trim() || null })}
          placeholder="Less than £0.25 per day"
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        />
      </label>

      <label className="mt-3 block text-xs font-semibold text-slate-400">Features (one per line)
        <textarea
          value={toFeatureText(plan.features)}
          onChange={(event) => onChange({ features: fromFeatureText(event.target.value) })}
          rows={5}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
        <label className="inline-flex items-center gap-2 text-slate-300">
          <input
            type="checkbox"
            checked={plan.isActive}
            onChange={(event) => onChange({ isActive: event.target.checked })}
          />
          Active
        </label>
        <label className="inline-flex items-center gap-2 text-slate-300">
          <input
            type="checkbox"
            checked={plan.isPopular}
            onChange={(event) => onChange({ isPopular: event.target.checked })}
          />
          Most Popular / Best Value
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          {saveLabel}
        </button>

        {!disableDelete ? (
          <button
            onClick={onDelete}
            disabled={saving}
            className="rounded-lg border border-rose-500/60 px-4 py-2 text-sm font-bold text-rose-200 hover:bg-rose-950/40 disabled:opacity-50"
          >
            Delete Plan
          </button>
        ) : null}
      </div>
    </article>
  )
}
