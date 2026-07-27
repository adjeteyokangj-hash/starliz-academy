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
  AdminTable,
  AdminTableBody,
  AdminTableEmpty,
  AdminTableHead,
  AdminTd,
  AdminTh,
  AdminTr,
} from '@/components/admin/ui';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string | null;
  roleId: string;
  active: boolean;
  isLocked: boolean;
  title: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
}

export default function AdminUsersPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
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
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  async function fetchAdmins() {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (res.ok) {
        setAdmins(data.admins);
        setError(null);
      } else if (res.status === 403) {
        setAdmins([]);
        setError(data.error || 'You do not have permission to manage Admin users.');
      } else {
        setError(data.error || 'Failed to fetch admins');
      }
    } catch (err) {
      setError('Error fetching admins');
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
      void fetchAdmins();
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
        fetchAdmins();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create admin');
      }
    } catch (err) {
      setError('Error creating admin');
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
        fetchAdmins();
        setEditingRole(null);
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
        fetchAdmins();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update admin');
      }
    } catch (err) {
      setError('Error updating admin');
      console.error(err);
    }
  };

  function openResetPassword(admin: AdminUser) {
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
        <p className="admin-body">Loading admins...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <AdminPageHeader
        eyebrow="Platform"
        title="Admin Users & Roles"
        subtitle="Manage admin access and role assignments"
        actions={
          error?.toLowerCase().includes('permission') ? undefined : (
          <AdminButton onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'Add Admin User'}
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
            <h2 className="admin-section-title mb-4">Create New Admin</h2>
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
                  aria-label="Admin role"
                  required
                >
                  <option value="">Select Role</option>
                  {roles.map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </AdminSelect>
              </div>
              <AdminButton type="submit" className="w-full">
                Create Admin
              </AdminButton>
            </form>
          </AdminCard>
        )}

        <div
          className="overflow-hidden rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)]"
          style={{ background: "var(--admin-surface)", boxShadow: "var(--admin-shadow-sm)" }}
        >
          <AdminTable>
            <AdminTableHead>
              <AdminTh>Name</AdminTh>
              <AdminTh>Email</AdminTh>
              <AdminTh>Role</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Last Login</AdminTh>
              <AdminTh>Actions</AdminTh>
            </AdminTableHead>
            <AdminTableBody>
                {admins.length === 0 ? (
                  <AdminTableEmpty colSpan={6} message="No admin users found" />
                ) : (
                  admins.map(admin => (
                    <AdminTr key={admin.id}>
                      <AdminTd>{admin.name || 'N/A'}</AdminTd>
                      <AdminTd className="text-[var(--admin-muted)]">{admin.email}</AdminTd>
                      <AdminTd>
                        {editingRole === admin.id ? (
                          <AdminSelect
                            value={admin.roleId}
                            onChange={e => handleUpdateRole(admin.id, e.target.value)}
                            className="py-1 text-sm"
                            aria-label={`Update role for ${admin.name || admin.email}`}
                            onBlur={() => setEditingRole(null)}
                            autoFocus
                          >
                            {roles.map(role => (
                              <option key={role.id} value={role.id}>{role.name}</option>
                            ))}
                          </AdminSelect>
                        ) : (
                          <button
                            onClick={() => setEditingRole(admin.id)}
                            className="text-sm text-[var(--admin-primary-hover)] hover:underline"
                          >
                            {admin.role || 'No Role'}
                          </button>
                        )}
                      </AdminTd>
                      <AdminTd>
                        <span
                          className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                            admin.active && !admin.isLocked
                              ? 'bg-emerald-900/30 text-emerald-300'
                              : 'bg-rose-900/30 text-rose-300'
                          }`}
                        >
                          {admin.isLocked ? 'Locked' : admin.active ? 'Active' : 'Inactive'}
                        </span>
                      </AdminTd>
                      <AdminTd className="text-sm text-[var(--admin-muted)]">
                        {admin.lastLoginAt
                          ? new Date(admin.lastLoginAt).toLocaleDateString()
                          : 'Never'}
                      </AdminTd>
                      <AdminTd>
                        <div className="flex flex-wrap items-center gap-2">
                          <AdminButton type="button" size="sm" variant="secondary" onClick={() => openResetPassword(admin)}>
                            Reset password
                          </AdminButton>
                          <AdminButton
                            type="button"
                            size="sm"
                            variant={admin.active ? 'danger' : 'secondary'}
                            onClick={() => handleToggleActive(admin.id, admin.active)}
                          >
                            {admin.active ? 'Deactivate' : 'Activate'}
                          </AdminButton>
                        </div>
                      </AdminTd>
                    </AdminTr>
                  ))
                )}
            </AdminTableBody>
          </AdminTable>
        </div>
    </div>
  );
}
