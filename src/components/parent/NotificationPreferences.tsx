'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';

type NotificationPrefs = {
  emailWeeklyReport: boolean;
  assignmentAlerts: boolean;
  lessonReminders: boolean;
  rewardNotifications: boolean;
  productUpdates: boolean;
};

type NotificationPreferencesProps = {
  preferences: NotificationPrefs;
  ready?: boolean;
  onUpdate: (prefs: NotificationPrefs) => void;
};

const ESSENTIAL_NOTICES = [
  {
    label: 'Billing and payment notices',
    description: 'Payment failures, retries, grace periods, cancellations and access-end dates. These cannot be turned off.',
  },
  {
    label: 'Security and account notices',
    description: 'Sign-in, password and account-security alerts. These cannot be turned off.',
  },
];

export default function NotificationPreferences({ 
  preferences, 
  ready = true,
  onUpdate 
}: NotificationPreferencesProps) {
  const [prefs, setPrefs] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!ready) {
      setError('Preferences are still loading. Please wait a moment and try again.');
      return;
    }
    setSaving(true);
    setSuccess(false);
    setError(null);

    try {
      const response = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notifications: prefs }),
      });

      if (response.ok) {
        const payload = (await response.json().catch(() => null)) as { notifications?: NotificationPrefs } | null;
        const saved = payload?.notifications ?? prefs;
        setPrefs(saved);
        setSuccess(true);
        onUpdate(saved);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? 'Unable to save preferences. Please try again.');
      }
    } catch {
      setError('Unable to save preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const notificationOptions = [
    {
      key: 'emailWeeklyReport' as const,
      label: 'Weekly progress report',
      description: 'Optional summary of your child\'s learning activity.',
    },
    {
      key: 'assignmentAlerts' as const,
      label: 'Assignment alerts',
      description: 'Optional notice when new assignments are available.',
    },
    {
      key: 'lessonReminders' as const,
      label: 'Lesson and Short Learning reminders',
      description: 'Optional reminders for scheduled lessons and Short Learning sessions.',
    },
    {
      key: 'rewardNotifications' as const,
      label: 'Reward and session milestones',
      description: 'Optional notices for rewards and session-completion style updates.',
    },
    {
      key: 'productUpdates' as const,
      label: 'Product updates',
      description: 'Optional product and feature announcements (marketing).',
    },
  ];

  return (
    <div className="space-y-4">
      {!ready ? (
        <p className="text-sm text-slate-400">Loading your saved preferences…</p>
      ) : null}

      {success && (
        <div role="status" aria-live="polite" className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
          Preferences saved successfully
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm font-semibold text-white">Essential notices</p>
        <p className="mt-1 text-xs text-slate-400">
          These are always sent when relevant. Toggles below only control optional messages.
        </p>
        <ul className="mt-3 space-y-2">
          {ESSENTIAL_NOTICES.map((item) => (
            <li key={item.label} className="text-sm text-slate-300">
              <span className="font-semibold text-white">{item.label}</span>
              <span className="block text-xs text-slate-400">{item.description}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Optional notices</p>
        {notificationOptions.map((option) => (
          <label
            key={option.key}
            className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4 cursor-pointer hover:bg-white/10 transition"
          >
            <input
              type="checkbox"
              disabled={!ready || saving}
              checked={prefs[option.key]}
              onChange={(e) =>
                setPrefs({
                  ...prefs,
                  [option.key]: e.target.checked,
                })
              }
              className="mt-1"
            />
            <div className="flex-1">
              <p className="font-semibold text-white">{option.label}</p>
              <p className="text-sm text-slate-400">{option.description}</p>
            </div>
          </label>
        ))}
      </div>

      <Button 
        onClick={handleSave} 
        disabled={saving || !ready}
        className="w-full"
      >
        {saving ? 'Saving...' : 'Save preferences'}
      </Button>
    </div>
  );
}
