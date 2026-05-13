'use client';

import { useMemo, useState } from 'react';
import Button from '@/components/ui/Button';

type BillingCardProps = {
  currentPlanId: string | null;
  planName: string;
  status: string;
  childrenUsed: number;
  childLimit: number;
  upgradeRequired: boolean;
  reason: string | null;
  renewalDate: string | null;
  trialEndsAt: string | null;
  stripeCustomerId: string | null;
  plans: Array<{
    id: string;
    key: string;
    name: string;
    interval: 'month' | 'year' | 'custom';
    price: number;
    currency: string;
    badge: string | null;
    stripePriceId: string | null;
  }>;
};

export default function BillingCard({ 
  currentPlanId,
  planName, 
  status, 
  childrenUsed, 
  childLimit, 
  upgradeRequired, 
  reason,
  renewalDate,
  trialEndsAt,
  stripeCustomerId,
  plans,
}: BillingCardProps) {
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  const availableCheckoutPlans = useMemo(
    () => plans.filter((plan) => plan.interval !== 'custom' && Boolean(plan.stripePriceId)),
    [plans],
  );
  const billingSetupPending = availableCheckoutPlans.length === 0;
  const activeOrTrial = status === 'active' || status === 'trialing';

  const suggestedPlan = useMemo(
    () => availableCheckoutPlans.find((plan) => plan.id !== currentPlanId) ?? availableCheckoutPlans[0] ?? null,
    [availableCheckoutPlans, currentPlanId],
  );

  const currencyFormat = (value: number, currency: string) => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.toUpperCase() }).format(value);
  };

  async function startCheckout(plan: BillingCardProps['plans'][number]) {
    if (!plan.stripePriceId) {
      setCheckoutError('Stripe price ID missing in admin pricing settings.');
      return;
    }

    setCheckoutError(null);
    setLoadingPlanId(plan.id);

    try {
      const response = await fetch('/api/billing/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          planId: plan.id,
          planKey: plan.key,
          returnUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/parent/billing`
        }),
      });

      const data = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;

      if (!response.ok || !data?.url) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[parent.billing] checkout failed response', data);
        }
        throw new Error(data?.error ?? 'Failed to start checkout.');
      }
      
      window.location.href = data.url;
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[parent.billing] checkout error:', error);
      }
      setCheckoutError(error instanceof Error ? error.message : 'Failed to start checkout. Please try again.');
    } finally {
      setLoadingPlanId(null);
    }
  }

  async function handleManageSubscription() {
    setPortalError(null);
    setOpeningPortal(true);

    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          returnUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/parent/billing`
        }),
      });

      const data = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;

      if (!response.ok || !data?.url) {
        throw new Error(data?.error ?? 'Failed to open billing portal.');
      }
      
      window.location.href = data.url;
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[parent.billing] portal error:', error);
      }
      setPortalError(error instanceof Error ? error.message : 'Failed to manage subscription. Please try again.');
    } finally {
      setOpeningPortal(false);
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 p-6">
      <div className="mb-4">
        <h3 className="text-2xl font-bold text-white">{planName}</h3>
        <p className={`mt-1 text-sm font-semibold ${status === 'active' ? 'text-green-400' : 'text-yellow-400'}`}>
          {status === 'active' ? '✓ Active' : 'Pending'}
        </p>
      </div>

      <div className="grid gap-3 mb-6 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs uppercase tracking-widest text-slate-400">Children</p>
          <p className="mt-1 text-lg font-bold text-white">{childrenUsed}/{childLimit}</p>
          <p className="mt-1 text-xs text-slate-400">{childLimit - childrenUsed} available</p>
        </div>

        {trialEndsAt && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs uppercase tracking-widest text-slate-400">Trial</p>
            <p className="mt-1 text-sm font-semibold text-cyan-400">
              {new Date(trialEndsAt).toLocaleDateString()}
            </p>
            <p className="mt-1 text-xs text-slate-400">Trial period</p>
          </div>
        )}

        {renewalDate && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs uppercase tracking-widest text-slate-400">Renewal</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {new Date(renewalDate).toLocaleDateString()}
            </p>
            <p className="mt-1 text-xs text-slate-400">Next billing date</p>
          </div>
        )}
      </div>

      {billingSetupPending ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-sm font-semibold text-amber-300">Billing setup pending</p>
          <p className="mt-1 text-sm text-amber-100">Online payments are not live yet. Plan changes will be available once billing is activated.</p>
          <p className="mt-1 text-xs text-amber-100/90">Billing upgrades are not live yet. Please contact StarLiz Academy support to change plan.</p>
        </div>
      ) : null}

      {!billingSetupPending && upgradeRequired && reason && (
        <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3">
          <p className="text-sm font-semibold text-yellow-400">⚠ Upgrade required</p>
          <p className="mt-1 text-sm text-yellow-200">{reason}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {!billingSetupPending && upgradeRequired && suggestedPlan && (
          <Button onClick={() => void startCheckout(suggestedPlan)} className="bg-cyan-600 hover:bg-cyan-700" disabled={loadingPlanId !== null}>
            Upgrade Plan
          </Button>
        )}

        {!billingSetupPending && !upgradeRequired && suggestedPlan ? (
          <Button onClick={() => void startCheckout(suggestedPlan)} className="bg-indigo-600 hover:bg-indigo-700" disabled={loadingPlanId !== null}>
            Change Plan
          </Button>
        ) : null}

        {activeOrTrial ? (
          <Button 
            onClick={stripeCustomerId ? handleManageSubscription : undefined}
            disabled={openingPortal || !stripeCustomerId}
            className="bg-slate-700 hover:bg-slate-600"
          >
            {openingPortal ? 'Opening...' : 'Manage Subscription'}
          </Button>
        ) : null}

        {!billingSetupPending && !stripeCustomerId && !upgradeRequired && (
          <p className="text-sm text-slate-400">
            You&apos;re on the free plan. {childrenUsed >= childLimit ? 'Upgrade to add more children.' : 'Upgrade to unlock advanced features.'}
          </p>
        )}
      </div>

      {checkoutError ? (
        <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {checkoutError}
        </p>
      ) : null}

      {portalError ? (
        <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {portalError}
        </p>
      ) : null}

      {plans.length > 0 ? (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {plans
            .filter((plan) => plan.interval !== 'custom')
            .map((plan) => (
              <button
                key={plan.id}
                type="button"
                disabled={!plan.stripePriceId || loadingPlanId !== null}
                onClick={() => { if (plan.stripePriceId) void startCheckout(plan); }}
                className={`rounded-xl border p-3 text-left text-sm transition ${
                  !plan.stripePriceId
                    ? 'cursor-not-allowed border-white/5 bg-white/[0.02] opacity-50'
                    : plan.id === currentPlanId
                    ? 'border-cyan-400 bg-cyan-400/10'
                    : 'border-white/10 bg-white/5 hover:border-white/30'
                }`}
              >
                <p className={`font-semibold ${plan.stripePriceId ? 'text-white' : 'text-slate-500'}`}>{plan.name}</p>
                <p className="mt-1 text-slate-400">
                  {currencyFormat(plan.price, plan.currency)} / {plan.interval}
                </p>
                {plan.badge ? <p className="mt-1 text-xs text-cyan-300">{plan.badge}</p> : null}
                {!plan.stripePriceId ? (
                  <p className="mt-1 text-xs text-slate-500 italic">Plan not available yet - missing Stripe price ID.</p>
                ) : null}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}
