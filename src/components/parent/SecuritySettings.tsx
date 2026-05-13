'use client';

import { FormEvent, useState } from 'react';
import Button from '@/components/ui/Button';

type SecuritySettingsProps = {
  currentName: string;
  lastPasswordChangedAt?: string | null;
  onUpdate: () => void;
};

function passwordStrength(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) return { score, label: 'Weak' };
  if (score <= 4) return { score, label: 'Medium' };
  return { score, label: 'Strong' };
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  let result = '';
  for (let i = 0; i < 14; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export default function SecuritySettings({ currentName, lastPasswordChangedAt, onUpdate }: SecuritySettingsProps) {
  const [nameDraft, setNameDraft] = useState(currentName);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const validatePassword = (password: string) => {
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(password)) return 'Password must contain uppercase letters';
    if (!/[a-z]/.test(password)) return 'Password must contain lowercase letters';
    if (!/[0-9]/.test(password)) return 'Password must contain numbers';
    return null;
  };

  async function handleNameSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setNameError(null);
    setNameSuccess(false);

    try {
      if (!nameDraft.trim()) {
        setNameError('Name cannot be empty');
        return;
      }

      const response = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: nameDraft }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update name');
      }

      setNameSuccess(true);
      onUpdate();
      setTimeout(() => setNameSuccess(false), 3000);
    } catch (error) {
      setNameError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    const validation = validatePassword(newPassword);
    if (validation) {
      setPasswordError(validation);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setSaving(true);

    try {
      const response = await fetch('/api/account/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update password');
      }

      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
      onUpdate();
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  }

  const strength = passwordStrength(newPassword);
  const matchError = confirmPassword && newPassword !== confirmPassword ? 'Passwords do not match' : null;

  return (
    <div className="space-y-6">
      {/* Name Update Section */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
        <h3 className="text-lg font-bold text-white mb-4">Update name</h3>
        <form onSubmit={handleNameSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Full name
            </label>
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Enter your full name"
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
              maxLength={100}
            />
          </div>

          {nameError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {nameError}
            </div>
          )}

          {nameSuccess && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
              ✓ Name updated successfully
            </div>
          )}

          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save name'}
          </Button>
        </form>
      </div>

      {/* Password Update Section */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
        <h3 className="text-lg font-bold text-white mb-4">Change password</h3>
        <p className="mb-3 text-xs text-slate-400">
          Last changed: {lastPasswordChangedAt ? new Date(lastPasswordChangedAt).toLocaleString() : 'Not available yet'}
        </p>
        <form onSubmit={handlePasswordSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Current password
            </label>
            <div className="flex gap-2">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter your current password"
                autoComplete="current-password"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                required
              />
              <Button type="button" className="bg-slate-800 hover:bg-slate-700" onClick={() => setShowCurrentPassword((v) => !v)}>
                {showCurrentPassword ? 'Hide' : 'Show'}
              </Button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              New password
            </label>
            <div className="flex gap-2">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Create a strong password"
                autoComplete="new-password"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                required
              />
              <Button type="button" className="bg-slate-800 hover:bg-slate-700" onClick={() => setShowNewPassword((v) => !v)}>
                {showNewPassword ? 'Hide' : 'Show'}
              </Button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              At least 8 characters with uppercase, lowercase, numbers, and symbols.
            </p>
            <div className="mt-2">
              <div className="h-2 w-full rounded-full bg-white/10">
                <div
                  className={`h-2 rounded-full transition ${
                    strength.label === 'Strong' ? 'bg-green-500' : strength.label === 'Medium' ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${(strength.score / 5) * 100}%` }}
                ></div>
              </div>
              <p className="mt-1 text-xs text-slate-400">Strength: {strength.label}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Confirm password
            </label>
            <div className="flex gap-2">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                autoComplete="new-password"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                required
              />
              <Button type="button" className="bg-slate-800 hover:bg-slate-700" onClick={() => setShowConfirmPassword((v) => !v)}>
                {showConfirmPassword ? 'Hide' : 'Show'}
              </Button>
            </div>
            {matchError ? <p className="mt-1 text-xs text-red-400">{matchError}</p> : null}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => {
                const generated = generatePassword();
                setNewPassword(generated);
                setConfirmPassword(generated);
              }}
            >
              Generate strong password
            </Button>
          </div>

          {passwordError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {passwordError}
            </div>
          )}

          {passwordSuccess && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
              ✓ Password changed successfully
            </div>
          )}

          <Button type="submit" disabled={saving}>
            {saving ? 'Updating...' : 'Change password'}
          </Button>
        </form>
      </div>

      {/* Password Requirements Info */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm font-semibold text-slate-300 mb-2">Password requirements:</p>
        <ul className="space-y-1 text-xs text-slate-400">
          <li>✓ At least 8 characters long</li>
          <li>✓ Contains uppercase letters (A-Z)</li>
          <li>✓ Contains lowercase letters (a-z)</li>
          <li>✓ Contains numbers (0-9)</li>
          <li>✓ Contains symbols (!@#$...)</li>
        </ul>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm font-semibold text-slate-300">Session Security</p>
        <p className="mt-2 text-xs text-slate-400">
          Device management, login alerts, and 2FA controls are coming soon. Your account remains protected by secure sessions.
        </p>
      </div>
    </div>
  );
}
