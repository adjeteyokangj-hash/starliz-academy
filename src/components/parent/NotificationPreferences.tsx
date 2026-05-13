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
  onUpdate: (prefs: NotificationPrefs) => void;
};

export default function NotificationPreferences({ 
  preferences, 
  onUpdate 
}: NotificationPreferencesProps) {
  const [prefs, setPrefs] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
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
        setSuccess(true);
        onUpdate(prefs);
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
      key: 'emailWeeklyReport',
      label: 'Weekly progress report',
      description: 'Receive a summary of your child\'s learning activity every Sunday',
    },
    {
      key: 'assignmentAlerts',
      label: 'Assignment alerts',
      description: 'Get notified when new assignments are available',
    },
    {
      key: 'lessonReminders',
      label: 'Lesson reminders',
      description: 'Receive reminders for scheduled lessons',
    },
    {
      key: 'rewardNotifications',
      label: 'Reward milestones',
      description: 'Celebrate when your child reaches rewards or achievements',
    },
    {
      key: 'productUpdates',
      label: 'Product updates',
      description: 'Learn about new features and improvements to StarLiz',
    },
  ];

  return (
    <div className="space-y-4">
      {success && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
          ✓ Preferences saved successfully
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {notificationOptions.map((option) => (
          <label
            key={option.key}
            className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4 cursor-pointer hover:bg-white/10 transition"
          >
            <input
              type="checkbox"
              checked={
                (prefs as Record<string, boolean>)[option.key] ?? false
              }
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
        disabled={saving}
        className="w-full"
      >
        {saving ? 'Saving...' : 'Save preferences'}
      </Button>
    </div>
  );
}
