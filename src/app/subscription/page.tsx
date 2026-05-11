"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Navbar from "@/components/layout/Navbar";

type PricingInterval = "month" | "year" | "custom";
type PricingAudience = "individual" | "family" | "school" | "organisation";

type PricingPlan = {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: PricingInterval;
  audience: PricingAudience;
  features: string[];
  badge: string | null;
  ctaLabel: string;
  ctaHref: string;
  stripePriceId: string | null;
  isActive: boolean;
  isPopular: boolean;
  sortOrder: number;
};

type SubscriptionPayload = {
  subscription: {
    id: string | null;
    pricingPlanId: string | null;
    planKey: "free" | "monthly" | "yearly";
    planName: string;
    status: string;
    badge: string;
    provider: string;
    childLimit: number;
    childrenUsed: number;
    upgradeRequired: boolean;
    reason: string | null;
    trialEndsAt: string | null;
    renewalDate: string | null;
    paymentFailed: boolean;
  };
};

function statusPill(status: string): { label: string; className: string } {
  const normalized = status.toLowerCase();
  if (normalized === "active") return { label: "Active", className: "bg-emerald-100 text-emerald-700" };
  if (normalized === "trialing") return { label: "Trial", className: "bg-amber-100 text-amber-700" };
  if (normalized === "past_due") return { label: "Past Due", className: "bg-rose-100 text-rose-700" };
  if (normalized === "cancelled") return { label: "Cancelled", className: "bg-slate-200 text-slate-700" };
  return { label: "Failed Payment", className: "bg-rose-100 text-rose-700" };
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

function intervalLabel(interval: PricingInterval): string {
  if (interval === "year") return " / year";
  if (interval === "month") return " / month";
  return "";
}

export default function SubscriptionPage() {
  const [nowTs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [data, setData] = useState<SubscriptionPayload | null>(null);
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>([]);

  useEffect(() => {
    const load = async () => {
      const [subscriptionResponse, pricingResponse] = await Promise.all([
        fetch("/api/subscription", { credentials: "include" }),
        fetch("/api/pricing", { credentials: "same-origin" }),
      ]);

      if (!subscriptionResponse.ok) {
        setError("Unable to load subscription details.");
        setLoading(false);
        return;
      }

      if (!pricingResponse.ok) {
        setError("Unable to load pricing plans.");
        setLoading(false);
        return;
      }

      const payload = (await subscriptionResponse.json()) as SubscriptionPayload;
      const pricingPayload = (await pricingResponse.json()) as { plans: PricingPlan[] };

      setData(payload);
      setPricingPlans(pricingPayload.plans ?? []);
      setLoading(false);
    };
    void load();
  }, []);

  async function openCheckout(planId: string) {
    setSaving(true);
    setError(null);
    setMessage("Redirecting to secure payment...");
    try {
      const response = await fetch("/api/billing/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ planId }),
      });

      if (response.status === 401) {
        window.location.assign("/signup");
        return;
      }

      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to start checkout.");
        return;
      }

      if (payload.url) {
        window.location.assign(payload.url);
        return;
      }

      setError("Unable to start checkout.");
    } catch {
      setError("Unable to start checkout.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-background" />;
  }

  const status = statusPill(data?.subscription.status ?? "active");
  const trialEndsInDays = data?.subscription.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(data.subscription.trialEndsAt).getTime() - nowTs) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="rounded-3xl bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Billing</p>
          <h1 className="mt-2 text-2xl font-black text-slate-900">Subscription</h1>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span className="rounded-full bg-indigo-100 px-3 py-1 font-bold text-indigo-700">Current Plan: {data?.subscription.badge ?? "Free"}</span>
            <span className={`rounded-full px-3 py-1 font-bold ${status.className}`}>Status: {status.label}</span>
            <span className="rounded-full bg-teal-100 px-3 py-1 font-bold text-teal-700">Children: {data?.subscription.childrenUsed ?? 0}/{data?.subscription.childLimit ?? 1}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-bold text-slate-700">Provider: Stripe</span>
            <span className="rounded-full bg-cyan-100 px-3 py-1 font-bold text-cyan-700">Region: UK launch</span>
            {data?.subscription.renewalDate ? <span className="rounded-full bg-amber-100 px-3 py-1 font-bold text-amber-700">Renews {new Date(data.subscription.renewalDate).toLocaleDateString()}</span> : null}
            {data?.subscription.paymentFailed ? <span className="rounded-full bg-rose-100 px-3 py-1 font-bold text-rose-700">Payment issue detected</span> : null}
          </div>
          <p className="mt-3 text-sm text-slate-600">Paystack support planned for future regions.</p>
          <p className="text-sm font-semibold text-slate-700">Secure payments powered by Stripe.</p>
          {trialEndsInDays !== null && data?.subscription.status.toLowerCase() === "trialing" ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              Trial ends in {trialEndsInDays} day{trialEndsInDays === 1 ? "" : "s"}.
            </p>
          ) : null}
          {data?.subscription.status.toLowerCase() === "past_due" || data?.subscription.paymentFailed ? (
            <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">
              Payment failed - update card to keep learning uninterrupted.
            </p>
          ) : null}
          {data?.subscription.status.toLowerCase() === "cancelled" ? (
            <p className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-700">
              Your subscription is cancelled. You can re-upgrade anytime.
            </p>
          ) : null}
          {data?.subscription.reason === "CHILD_LIMIT_REACHED" ? (
            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              You have reached your child limit for this plan. Upgrade to add more children.
            </p>
          ) : null}
          {error ? <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p> : null}
          {message ? <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p> : null}
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {pricingPlans.map((plan) => {
            const usesStripe = (plan.interval === "month" || plan.interval === "year") && !!plan.stripePriceId;
            const isCurrent = data?.subscription.pricingPlanId === plan.id;

            return (
              <article key={plan.id} className={`rounded-3xl border p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)] ${isCurrent ? "border-emerald-300 bg-emerald-50/50" : plan.isPopular ? "border-indigo-300 bg-indigo-50/40" : "border-slate-200 bg-white"}`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-black text-slate-900">{plan.name}</h2>
                  {isCurrent ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-700">Current</span>
                  ) : plan.badge ? <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-indigo-700">{plan.badge}</span> : null}
                </div>
                <p className="mt-2 text-sm text-slate-600">{plan.description}</p>
                <div className="mt-4">
                  <p className="text-2xl font-black text-slate-900">
                    {plan.interval === "custom" ? "Custom pricing" : `${formatCurrency(plan.price, plan.currency)}${intervalLabel(plan.interval)}`}
                  </p>
                </div>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {plan.features.map((feature) => (
                    <li key={feature} className="rounded-xl bg-slate-50 px-3 py-2">• {feature}</li>
                  ))}
                </ul>
                <div className="mt-5">
                  {isCurrent ? (
                    <button disabled className="w-full cursor-not-allowed rounded-xl bg-emerald-100 px-4 py-2.5 text-sm font-black text-emerald-700">
                      Current Plan
                    </button>
                  ) : usesStripe ? (
                    <button onClick={() => void openCheckout(plan.id)} disabled={saving} className="w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-black text-white hover:bg-teal-500 disabled:opacity-50">
                      {saving ? "Redirecting to secure payment..." : (plan.ctaLabel || "Upgrade")}
                    </button>
                  ) : (
                    <Link href={plan.ctaHref || "/contact"} className="block w-full rounded-xl bg-slate-900 px-4 py-2.5 text-center text-sm font-black text-white hover:bg-slate-800">
                      {plan.ctaLabel || "Contact Us"}
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
