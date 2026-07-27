'use client';

import { useMemo, useState } from 'react';
import Button from '@/components/ui/Button';

type BillingCardProps = {
  country: string;
  subscriptionProvider: string;
  currentPlanId: string | null;
  planName: string;
  currentPricePence: number;
  currentCurrency: string;
  currentInterval: 'month' | 'year' | 'custom';
  status: string;
  statusLabel?: string;
  statusTone?: 'ok' | 'warning' | 'danger' | 'neutral';
  statusDetail?: string;
  cancelScheduled?: boolean;
  accessEndsAt?: string | null;
  canManageBilling?: boolean;
  paymentFailed?: boolean;
  childrenUsed: number;
  childLimit: number;
  upgradeRequired: boolean;
  reason: string | null;
  renewalDate: string | null;
  trialEndsAt: string | null;
  stripeCustomerId: string | null;
  commercialNotes?: string[];
  plans: Array<{
    id: string;
    key: string;
    name: string;
    interval: 'month' | 'year' | 'custom';
    price: number;
    currency: string;
    badge: string | null;
    stripePriceId: string | null;
    changeType?: 'current' | 'upgrade' | 'downgrade' | 'switch';
  }>;
  onSubscriptionChanged?: () => void;
};

function toneClass(tone: BillingCardProps['statusTone']) {
  if (tone === 'ok') return 'text-green-400';
  if (tone === 'warning') return 'text-amber-300';
  if (tone === 'danger') return 'text-rose-300';
  return 'text-slate-300';
}

function formatEnGb(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function BillingCard({ 
  country,
  subscriptionProvider,
  currentPlanId,
  planName, 
  currentPricePence,
  currentCurrency,
  currentInterval,
  status, 
  statusLabel,
  statusTone,
  statusDetail,
  cancelScheduled,
  accessEndsAt,
  canManageBilling = true,
  paymentFailed,
  childrenUsed, 
  childLimit, 
  upgradeRequired, 
  reason,
  renewalDate,
  trialEndsAt,
  stripeCustomerId,
  commercialNotes,
  plans,
  onSubscriptionChanged,
}: BillingCardProps) {
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [intervalFilter, setIntervalFilter] = useState<'month' | 'year'>('month');

  const availableCheckoutPlans = useMemo(
    () => plans.filter((plan) => plan.interval !== 'custom' && Boolean(plan.stripePriceId)),
    [plans],
  );
  const billingSetupPending = availableCheckoutPlans.length === 0;
  const displayLabel = statusLabel ?? (status === 'active' || status === 'trialing' ? 'Active' : status.replaceAll('_', ' '));
  const displayTone = statusTone ?? (status === 'active' || status === 'trialing' ? 'ok' : paymentFailed ? 'danger' : 'neutral');
  const isCancelScheduled = Boolean(cancelScheduled);
  const canCancel =
    !isCancelScheduled
    && (status === 'active' || status === 'trialing' || status === 'past_due');
  const showPortal =
    canManageBilling
    && subscriptionProvider === 'stripe'
    && Boolean(stripeCustomerId)
    && (status === 'active' || status === 'trialing' || status === 'past_due' || status === 'unpaid' || status === 'incomplete' || isCancelScheduled || Boolean(paymentFailed));
  const showResubscribe =
    status === 'cancelled' || status === 'expired' || status === 'inactive' || status === 'blocked'
      ? !isCancelScheduled
      : false;

  const suggestedPlan = useMemo(
    () => availableCheckoutPlans.find((plan) => plan.id !== currentPlanId) ?? availableCheckoutPlans[0] ?? null,
    [availableCheckoutPlans, currentPlanId],
  );

  const currencyFormat = (value: number, currency: string) => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.toUpperCase() }).format(value);
  };

  const plansByInterval = useMemo(
    () => plans.filter((plan) => plan.interval === intervalFilter),
    [plans, intervalFilter],
  );

  async function startCheckout(plan: BillingCardProps['plans'][number]) {
    setCheckoutError(null);
    setLoadingPlanId(plan.id);

    try {
      const response = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          planId: plan.id,
          provider: 'stripe',
          returnUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/parent/billing`,
          countryCode: country,
        }),
      });

      const data = (await response.json().catch(() => null)) as { checkoutUrl?: string; url?: string; error?: string } | null;

      const checkoutUrl = data?.checkoutUrl ?? data?.url;
      if (!response.ok || !checkoutUrl) {
        throw new Error(data?.error ?? 'Failed to start checkout.');
      }
      
      window.location.href = checkoutUrl;
    } catch (error) {
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
      setPortalError(error instanceof Error ? error.message : 'Failed to manage subscription. Please try again.');
    } finally {
      setOpeningPortal(false);
    }
  }

  async function runSubscriptionAction(action: 'cancel_at_period_end' | 'reactivate') {
    setActionError(null);
    setActionMessage(null);
    setActionBusy(true);
    try {
      const response = await fetch('/api/subscription', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
        accessEndsAt?: string | null;
      } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? 'Unable to update subscription.');
      }
      setCancelConfirmOpen(false);
      setActionMessage(data?.message ?? (action === 'reactivate' ? 'Subscription reactivated.' : 'Cancellation scheduled.'));
      onSubscriptionChanged?.();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to update subscription.');
    } finally {
      setActionBusy(false);
    }
  }

  const accessEndLabel = formatEnGb(accessEndsAt) ?? formatEnGb(renewalDate);

  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 p-6">
      <div className="mb-4">
        <h3 className="text-2xl font-bold text-white">{planName}</h3>
        <p className={`mt-1 text-sm font-semibold ${toneClass(displayTone)}`}>
          {displayLabel}
        </p>
        {statusDetail ? (
          <p className="mt-2 text-sm text-slate-300">{statusDetail}</p>
        ) : null}
      </div>

      <div className="grid gap-3 mb-6 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs uppercase tracking-widest text-slate-400">Children</p>
          <p className="mt-1 text-lg font-bold text-white">{childrenUsed}/{childLimit}</p>
          <p className="mt-1 text-xs text-slate-400">{Math.max(0, childLimit - childrenUsed)} available</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs uppercase tracking-widest text-slate-400">Current price</p>
          <p className="mt-1 text-lg font-bold text-white">
            {currentPricePence > 0
              ? `${currencyFormat(currentPricePence / 100, currentCurrency)} / ${currentInterval}`
              : 'Free'}
          </p>
        </div>

        {trialEndsAt && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs uppercase tracking-widest text-slate-400">Trial</p>
            <p className="mt-1 text-sm font-semibold text-cyan-400">
              {formatEnGb(trialEndsAt)}
            </p>
            <p className="mt-1 text-xs text-slate-400">Trial ends</p>
          </div>
        )}

        {isCancelScheduled && accessEndLabel ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs uppercase tracking-widest text-slate-400">Access ends</p>
            <p className="mt-1 text-sm font-semibold text-white">{accessEndLabel}</p>
            <p className="mt-1 text-xs text-slate-400">Paid period end — not an instant cut-off</p>
          </div>
        ) : renewalDate ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs uppercase tracking-widest text-slate-400">Renewal</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {formatEnGb(renewalDate)}
            </p>
            <p className="mt-1 text-xs text-slate-400">Next billing date</p>
          </div>
        ) : null}
      </div>

      {(commercialNotes?.length ?? 0) > 0 ? (
        <ul className="mb-4 space-y-1 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
          {commercialNotes!.map((note) => (
            <li key={note}>• {note}</li>
          ))}
        </ul>
      ) : (
        <ul className="mb-4 space-y-1 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
          <li>• Cancel at the end of the current billing period — access stays until then.</li>
          <li>• No cancellation fee. No automatic pro-rata refund for unused days.</li>
          <li>• Plan changes use checkout or the billing portal — not a direct status change.</li>
        </ul>
      )}

      {billingSetupPending ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-sm font-semibold text-amber-300">Billing setup pending</p>
          <p className="mt-1 text-sm text-amber-100">Online payments are not live yet. Plan changes will be available once billing is activated.</p>
        </div>
      ) : null}

      {!billingSetupPending && upgradeRequired && reason && (
        <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3">
          <p className="text-sm font-semibold text-yellow-400">Upgrade required</p>
          <p className="mt-1 text-sm text-yellow-200">{reason}</p>
        </div>
      )}

      {paymentFailed || status === 'past_due' || status === 'unpaid' || status === 'incomplete' ? (
        <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
          <p className="text-sm font-semibold text-rose-200">Payment needs attention</p>
          <p className="mt-1 text-sm text-rose-100/90">
            Update your payment method to keep or restore access. This is not an automatic refund or instant cancellation.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {!billingSetupPending && (upgradeRequired || showResubscribe) && suggestedPlan && (
          <Button onClick={() => void startCheckout(suggestedPlan)} className="bg-cyan-600 hover:bg-cyan-700" disabled={loadingPlanId !== null}>
            {showResubscribe ? 'Resubscribe' : 'Upgrade plan'}
          </Button>
        )}

        {!billingSetupPending && !upgradeRequired && !showResubscribe && suggestedPlan ? (
          <Button onClick={() => void startCheckout(suggestedPlan)} className="bg-indigo-600 hover:bg-indigo-700" disabled={loadingPlanId !== null}>
            Change plan
          </Button>
        ) : null}

        {showPortal ? (
          <Button 
            onClick={handleManageSubscription}
            disabled={openingPortal}
            className="bg-slate-700 hover:bg-slate-600"
          >
            {openingPortal ? 'Opening...' : paymentFailed || status === 'past_due' ? 'Update payment method' : 'Manage billing'}
          </Button>
        ) : null}

        {canCancel && !billingSetupPending ? (
          <Button
            onClick={() => {
              setCancelConfirmOpen(true);
              setActionError(null);
              setActionMessage(null);
            }}
            disabled={actionBusy}
            className="bg-transparent border border-white/20 hover:bg-white/5"
          >
            Cancel subscription
          </Button>
        ) : null}

        {isCancelScheduled ? (
          <Button
            onClick={() => void runSubscriptionAction('reactivate')}
            disabled={actionBusy}
            className="bg-emerald-700 hover:bg-emerald-600"
          >
            {actionBusy ? 'Working…' : 'Keep my subscription'}
          </Button>
        ) : null}
      </div>

      {cancelConfirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-confirm-title"
          className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
        >
          <p id="cancel-confirm-title" className="text-sm font-semibold text-amber-100">Confirm cancellation</p>
          <p className="mt-2 text-sm text-amber-50/90">
            Cancellation takes effect at the end of the current billing period
            {accessEndLabel ? ` (${accessEndLabel})` : ''}. Access continues until then. There is no cancellation fee and no automatic pro-rata refund.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              onClick={() => void runSubscriptionAction('cancel_at_period_end')}
              disabled={actionBusy}
              className="bg-amber-600 hover:bg-amber-500"
            >
              {actionBusy ? 'Scheduling…' : 'Confirm cancel at period end'}
            </Button>
            <Button
              onClick={() => setCancelConfirmOpen(false)}
              disabled={actionBusy}
              className="bg-slate-700 hover:bg-slate-600"
            >
              Keep subscription
            </Button>
          </div>
        </div>
      ) : null}

      {checkoutError ? (
        <p role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {checkoutError}
        </p>
      ) : null}

      {portalError ? (
        <p role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {portalError}
        </p>
      ) : null}

      {actionError ? (
        <p role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {actionError}
        </p>
      ) : null}

      {actionMessage ? (
        <p role="status" aria-live="polite" className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          {actionMessage}
        </p>
      ) : null}

      {plans.length > 0 && !isCancelScheduled ? (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <div className="sm:col-span-2 flex gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setIntervalFilter('month')}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${intervalFilter === 'month' ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-white/5'}`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setIntervalFilter('year')}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${intervalFilter === 'year' ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-white/5'}`}
            >
              Yearly
            </button>
          </div>

          {plansByInterval
            .map((plan) => (
              <button
                key={plan.id}
                type="button"
                disabled={loadingPlanId !== null || billingSetupPending}
                onClick={() => { void startCheckout(plan); }}
                className={`rounded-xl border p-3 text-left text-sm transition ${
                  plan.id === currentPlanId
                    ? 'border-cyan-400 bg-cyan-400/10'
                    : 'border-white/10 bg-white/5 hover:border-white/30'
                }`}
              >
                <p className="font-semibold text-white">{plan.name}</p>
                <p className="mt-1 text-slate-400">
                  {currencyFormat(plan.price, plan.currency)} / {plan.interval}
                </p>
                {plan.badge ? <p className="mt-1 text-xs text-cyan-300">{plan.badge}</p> : null}
                {plan.changeType && plan.changeType !== 'current' ? (
                  <p className="mt-1 text-xs text-slate-300">{plan.changeType === 'upgrade' ? 'Upgrade option' : plan.changeType === 'downgrade' ? 'Downgrade option' : 'Switch plan'}</p>
                ) : null}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}
