'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import ParentCollapsibleCard from '@/components/parent/ParentCollapsibleCard';

type ConsentAuditEntry = {
  id: string;
  status: 'accepted' | 'withdrawn';
  version: string;
  timestamp: string;
  ipAddress?: string;
};

type ConsentAuditViewProps = {
  accepted: boolean;
  version: string | null;
  acceptedAt: string | null;
  withdrawnAt: string | null;
  aiDisclosure?: {
    summary: string;
    appliesTo: string[];
    safeguards: string[];
    parentControls: string[];
    reviewStatus: string;
    reviewedAt: string;
  } | null;
  auditHistory?: ConsentAuditEntry[];
  onAccept: () => void;
  onWithdraw: () => void;
};

export default function ConsentAuditView({
  accepted,
  version,
  acceptedAt,
  withdrawnAt,
  aiDisclosure,
  auditHistory = [],
  onAccept,
  onWithdraw,
}: ConsentAuditViewProps) {
  const [saving, setSaving] = useState(false);

  async function handleAccept() {
    setSaving(true);
    try {
      const response = await fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accepted: true, version: version ?? 'v1' }),
      });
      if (response.ok) onAccept();
    } finally {
      setSaving(false);
    }
  }

  async function handleWithdraw() {
    if (!confirm("Are you sure you want to withdraw consent? This may affect your child's access to features.")) {
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/consent/withdraw', {
        method: 'POST',
        credentials: 'include',
      });
      if (response.ok) onWithdraw();
    } finally {
      setSaving(false);
    }
  }

  const statusActions = (
    <div className="flex flex-col gap-2">
      {!accepted ? (
        <Button onClick={handleAccept} disabled={saving} className="bg-green-600 hover:bg-green-700">
          {saving ? 'Accepting...' : 'Accept'}
        </Button>
      ) : (
        <Button onClick={handleWithdraw} disabled={saving} className="bg-red-600 hover:bg-red-700">
          {saving ? 'Withdrawing...' : 'Withdraw'}
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <ParentCollapsibleCard
        title={accepted ? 'Consent Accepted' : 'Consent Pending'}
        description={
          accepted
            ? 'You have accepted the latest terms and conditions.'
            : 'Please review and accept the terms and conditions to continue.'
        }
        className={
          accepted
            ? 'border-green-500/30 bg-green-500/10'
            : 'border-yellow-500/30 bg-yellow-500/10'
        }
        storageKey="parent-consent:status"
        headerExtra={statusActions}
      >
        <div className="space-y-1 text-sm">
          <p className="text-slate-300">
            Version: <span className="font-semibold text-white">{version || 'N/A'}</span>
          </p>
          {acceptedAt ? (
            <p className="text-slate-300">
              Accepted: <span className="font-semibold text-white">{new Date(acceptedAt).toLocaleString()}</span>
            </p>
          ) : null}
          {withdrawnAt ? (
            <p className="text-slate-300">
              Withdrawn: <span className="font-semibold text-white">{new Date(withdrawnAt).toLocaleString()}</span>
            </p>
          ) : null}
        </div>
      </ParentCollapsibleCard>

      <ParentCollapsibleCard
        title="Terms and Conditions"
        description="What you agree to when using StarLiz Academy."
        storageKey="parent-consent:terms"
      >
        <div className="prose prose-invert max-w-none text-sm text-slate-300">
          <p>By accepting these terms, you agree to allow StarLiz Academy to:</p>
          <ul className="mt-2 ml-4 space-y-2">
            <li>Collect and process learning data from your child&apos;s activities</li>
            <li>Use AI-powered analytics to personalize learning experiences</li>
            <li>Send progress reports and educational updates</li>
            <li>Store data securely in compliance with GDPR and UK data protection laws</li>
            <li>Communicate with you about your child&apos;s educational progress</li>
          </ul>
          <p className="mt-4">
            Your child&apos;s data will never be sold or shared with third parties. You can withdraw consent at any time.
          </p>
        </div>
      </ParentCollapsibleCard>

      {aiDisclosure ? (
        <ParentCollapsibleCard
          title="AI Use Disclosure"
          description={aiDisclosure.summary}
          className="border-cyan-500/20 bg-cyan-500/10"
          storageKey="parent-consent:ai-disclosure"
        >
          <p className="text-xs text-cyan-100/80">
            Review status: {aiDisclosure.reviewStatus} • Reviewed at: {aiDisclosure.reviewedAt}
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase text-cyan-100/80">Applies to</p>
              <ul className="mt-2 space-y-1 text-xs text-cyan-50/90">
                {aiDisclosure.appliesTo.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-cyan-100/80">Safeguards</p>
              <ul className="mt-2 space-y-1 text-xs text-cyan-50/90">
                {aiDisclosure.safeguards.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-cyan-100/80">Parent controls</p>
              <ul className="mt-2 space-y-1 text-xs text-cyan-50/90">
                {aiDisclosure.parentControls.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </ParentCollapsibleCard>
      ) : null}

      {auditHistory.length > 0 ? (
        <ParentCollapsibleCard
          title="Consent Audit History"
          description="Previous accept and withdraw events."
          storageKey="parent-consent:audit"
          defaultOpen={false}
        >
          <div className="space-y-3">
            {auditHistory.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {entry.status === 'accepted' ? '✓ Accepted' : '✗ Withdrawn'}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Version {entry.version} • {new Date(entry.timestamp).toLocaleString()}
                    </p>
                  </div>
                  {entry.ipAddress ? <p className="text-xs text-slate-500">{entry.ipAddress}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </ParentCollapsibleCard>
      ) : null}
    </div>
  );
}