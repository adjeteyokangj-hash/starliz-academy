'use client';

import Button from '@/components/ui/Button';

type BillingCardProps = {
  planName: string;
  status: string;
  childrenUsed: number;
  childLimit: number;
  upgradeRequired: boolean;
  reason: string | null;
  renewalDate: string | null;
  trialEndsAt: string | null;
  stripeCustomerId: string | null;
};

export default function BillingCard({ 
  planName, 
  status, 
  childrenUsed, 
  childLimit, 
  upgradeRequired, 
  reason,
  renewalDate,
  trialEndsAt,
  stripeCustomerId,
}: BillingCardProps) {
  const currencyFormat = (value: number) => {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value / 100);
  };

  async function handleUpgrade() {
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          returnUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/parent/billing`
        }),
      });
      
      if (!response.ok) throw new Error('Failed to create checkout session');
      
      const { url } = await response.json();
      if (url) window.location.href = url;
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to start upgrade. Please try again.');
    }
  }

  async function handleManageSubscription() {
    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          returnUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/parent/billing`
        }),
      });
      
      if (!response.ok) throw new Error('Failed to create portal session');
      
      const { url } = await response.json();
      if (url) window.location.href = url;
    } catch (error) {
      console.error('Portal error:', error);
      alert('Failed to manage subscription. Please try again.');
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

      {upgradeRequired && reason && (
        <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3">
          <p className="text-sm font-semibold text-yellow-400">⚠ Upgrade required</p>
          <p className="mt-1 text-sm text-yellow-200">{reason}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {upgradeRequired && (
          <Button onClick={handleUpgrade} className="bg-cyan-600 hover:bg-cyan-700">
            Upgrade Plan
          </Button>
        )}

        {stripeCustomerId && (
          <Button 
            onClick={handleManageSubscription}
            className="bg-slate-700 hover:bg-slate-600"
          >
            Manage Billing
          </Button>
        )}

        {!stripeCustomerId && !upgradeRequired && (
          <p className="text-sm text-slate-400">
            You&apos;re on the free plan. {childrenUsed >= childLimit ? 'Upgrade to add more children.' : 'Upgrade to unlock advanced features.'}
          </p>
        )}
      </div>
    </div>
  );
}
