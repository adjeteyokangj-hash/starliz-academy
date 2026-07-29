'use client';

import { useEffect, useState } from 'react';
import {
  AdminButton,
  AdminCard,
  AdminFieldLabel,
  AdminInput,
  AdminModal,
  AdminPageHeader,
  AdminSelect,
} from '@/components/admin/ui';
import { PlatformSchoolUsersPanel } from '@/components/admin/PlatformSchoolUsersPanel';
import type { PlatformUserDto, SchoolUserDto } from '@/lib/admin/access-scope';

interface Role {
  id: string;
  name: string;
  description: string;
}

export default function AdminUsersPage() {
  const [platformUsers, setPlatformUsers] = useState<PlatformUserDto[]>([]);
  const [schoolUsers, setSchoolUsers] = useState<SchoolUserDto[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    roleId: '',
  });
  const [resetTarget, setResetTarget] = useState<PlatformUserDto | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  async function fetchUsers() {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (res.ok) {
        setPlatformUsers(data.platformUsers ?? data.admins ?? []);
        setSchoolUsers(data.schoolUsers ?? []);
        setError(null);
      } else if (res.status === 403) {
        setPlatformUsers([]);
        setSchoolUsers([]);
        setError(data.error || 'You do not have permission to manage Admin users.');
      } else {
        setError(data.error || 'Failed to fetch users');
      }
    } catch (err) {
      setError('Error fetching users');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchRoles() {
    try {
      const res = await fetch('/api/admin/roles');
      const data = await res.json();
      if (res.ok) {
        setRoles(data.roles);
      }
    } catch (err) {
      console.error('Error fetching roles:', err);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchUsers();
      void fetchRoles();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setFormData({ name: '', email: '', password: '', roleId: '' });
        setShowForm(false);
        fetchUsers();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create platform user');
      }
    } catch (err) {
      setError('Error creating platform user');
      console.error(err);
    }
  };

  const handleUpdateRole = async (adminId: string, newRoleId: string) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId, roleId: newRoleId }),
      });

      if (res.ok) {
        fetchUsers();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update role');
      }
    } catch (err) {
      setError('Error updating role');
      console.error(err);
    }
  };

  const handleToggleActive = async (adminId: string, currentActive: boolean) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId, active: !currentActive }),
      });

      if (res.ok) {
        fetchUsers();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update platform user');
      }
    } catch (err) {
      setError('Error updating platform user');
      console.error(err);
    }
  };

  function openResetPassword(admin: PlatformUserDto) {
    setError(null);
    setSuccess(null);
    setResetTarget(admin);
    setResetPassword('');
    setResetConfirm('');
  }

  function closeResetPassword() {
    if (resetBusy) return;
    setResetTarget(null);
    setResetPassword('');
    setResetConfirm('');
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    if (resetPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (resetPassword !== resetConfirm) {
      setError('Passwords do not match.');
      return;
    }

    setResetBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/users/${resetTarget.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'set', password: resetPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to set password');
        return;
      }
      setSuccess(data.message || `Password updated for ${resetTarget.email}`);
      setResetTarget(null);
      setResetPassword('');
      setResetConfirm('');
    } catch {
      setError('Error setting password');
    } finally {
      setResetBusy(false);
    }
  }

  async function handleEmailResetLink() {
    if (!resetTarget) return;
    setResetBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/users/${resetTarget.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'email' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to send reset email');
        return;
      }
      setSuccess(data.message || `Reset link sent to ${resetTarget.email}`);
      setResetTarget(null);
      setResetPassword('');
      setResetConfirm('');
    } catch {
      setError('Error sending reset email');
    } finally {
      setResetBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="admin-body">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <AdminPageHeader
        eyebrow="Platform"
        title="Platform Users & School Users"
        subtitle="Separate Operations Console access from school-scoped staff"
        actions={
          error?.toLowerCase().includes('permission') ? undefined : (
          <AdminButton onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'New platform user'}
          </AdminButton>
          )
        }
      />

        {error && (
          <div className="rounded-[var(--admin-radius)] border border-rose-500/50 bg-rose-900/20 p-4 text-rose-200">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-[var(--admin-radius)] border border-emerald-500/50 bg-emerald-900/20 p-4 text-emerald-200">
            {success}
          </div>
        )}

        <AdminModal
          open={Boolean(resetTarget)}
          title="Reset password"
          description={resetTarget ? `Set a new password for ${resetTarget.email}, or email them a reset link.` : undefined}
          onClose={closeResetPassword}
          footer={
            <>
              <AdminButton type="submit" form="admin-reset-password-form" disabled={resetBusy}>
                {resetBusy ? 'Saving…' : 'Set password'}
              </AdminButton>
              <AdminButton type="button" variant="secondary" disabled={resetBusy} onClick={() => void handleEmailResetLink()}>
                Email reset link
              </AdminButton>
              <AdminButton type="button" variant="ghost" disabled={resetBusy} onClick={closeResetPassword}>
                Cancel
              </AdminButton>
            </>
          }
        >
          <form id="admin-reset-password-form" className="space-y-3" onSubmit={handleSetPassword}>
            <AdminFieldLabel>
              New password
              <AdminInput
                type="password"
                autoComplete="new-password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                minLength={8}
                required
                className="mt-1"
              />
            </AdminFieldLabel>
            <AdminFieldLabel>
              Confirm password
              <AdminInput
                type="password"
                autoComplete="new-password"
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
                minLength={8}
                required
                className="mt-1"
              />
            </AdminFieldLabel>
          </form>
        </AdminModal>

        {showForm && (
          <AdminCard className="mb-2">
            <h2 className="admin-section-title mb-4">New platform user</h2>
            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <AdminInput
                  type="text"
                  placeholder="Full Name"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                />
                <AdminInput
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  required
                />
                <AdminInput
                  type="password"
                  placeholder="Password"
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={8}
                />
                <AdminSelect
                  value={formData.roleId}
                  onChange={e => setFormData({ ...formData, roleId: e.target.value })}
                  aria-label="Platform role"
                  required
                >
                  <option value="">Select platform role</option>
                  {roles.map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </AdminSelect>
              </div>
              <AdminButton type="submit" className="w-full">
                Create platform user
              </AdminButton>
            </form>
          </AdminCard>
        )}

        <PlatformSchoolUsersPanel
          platformUsers={platformUsers}
          schoolUsers={schoolUsers}
          roles={roles}
          showRoleEdit
          showResetPassword
          onUpdateRole={handleUpdateRole}
          onToggleActive={handleToggleActive}
          onResetPassword={openResetPassword}
        />
    </div>
  );
}