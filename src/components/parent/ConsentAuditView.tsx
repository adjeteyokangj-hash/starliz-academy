'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';

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
  auditHistory?: ConsentAuditEntry[];
  onAccept: () => void;
  onWithdraw: () => void;
};

export default function ConsentAuditView({
  accepted,
  version,
  acceptedAt,
  withdrawnAt,
  auditHistory = [],
  onAccept,
  onWithdraw,
}: ConsentAuditViewProps) {
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  async function handleAccept() {
    setSaving(true);
    try {
      const response = await fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accepted: true, version: version ?? 'v1' }),
      });

      if (response.ok) {
        onAccept();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleWithdraw() {
    if (!confirm('Are you sure you want to withdraw consent? This may affect your child&apos;s access to features.')) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/consent/withdraw', {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        onWithdraw();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Consent Status Card */}
      <div className={`rounded-3xl border p-6 ${
        accepted
          ? 'border-green-500/30 bg-green-500/10'
          : 'border-yellow-500/30 bg-yellow-500/10'
      }`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className={`text-lg font-bold ${accepted ? 'text-green-400' : 'text-yellow-400'}`}>
              {accepted ? '✓ Consent Accepted' : '⚠ Consent Pending'}
            </h3>
            <p className={`mt-2 text-sm ${accepted ? 'text-green-200' : 'text-yellow-200'}`}>
              {accepted
                ? 'You have accepted the latest terms and conditions.'
                : 'Please review and accept the terms and conditions to continue.'}
            </p>

            <div className="mt-4 space-y-1 text-sm">
              <p className="text-slate-300">
                Version: <span className="font-semibold text-white">{version || 'N/A'}</span>
              </p>
              {acceptedAt && (
                <p className="text-slate-300">
                  Accepted: <span className="font-semibold text-white">{new Date(acceptedAt).toLocaleString()}</span>
                </p>
              )}
              {withdrawnAt && (
                <p className="text-slate-300">
                  Withdrawn: <span className="font-semibold text-white">{new Date(withdrawnAt).toLocaleString()}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {!accepted && (
              <Button
                onClick={handleAccept}
                disabled={saving}
                className="bg-green-600 hover:bg-green-700"
              >
                {saving ? 'Accepting...' : 'Accept'}
              </Button>
            )}

            {accepted && (
              <Button
                onClick={handleWithdraw}
                disabled={saving}
                className="bg-red-600 hover:bg-red-700"
              >
                {saving ? 'Withdrawing...' : 'Withdraw'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Consent Terms Summary */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
        <h3 className="text-lg font-bold text-white mb-4">Terms and Conditions</h3>
        <div className="prose prose-invert max-w-none text-sm text-slate-300">
          <p>
            By accepting these terms, you agree to allow StarLiz Academy to:
          </p>
          <ul className="mt-2 space-y-2 ml-4">
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
      </div>

      {/* Audit History */}
      {auditHistory.length > 0 && (
        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full text-left flex items-center justify-between"
          >
            <h3 className="text-lg font-bold text-white">Consent Audit History</h3>
            <span className={`text-slate-400 transition ${showDetails ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {showDetails && (
            <div className="mt-4 space-y-3">
              {auditHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-white/10 bg-white/5 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {entry.status === 'accepted' ? '✓' : '✗'} {entry.status === 'accepted' ? 'Accepted' : 'Withdrawn'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Version {entry.version} • {new Date(entry.timestamp).toLocaleString()}
                      </p>
                    </div>
                    {entry.ipAddress && (
                      <p className="text-xs text-slate-500">{entry.ipAddress}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
