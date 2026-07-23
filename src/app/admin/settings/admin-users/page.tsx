'use client';

import { useEffect, useState } from 'react';

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
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400">Loading admins...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Admin Users & Roles</h1>
            <p className="text-gray-400">Manage admin access and role assignments</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium"
          >
            {showForm ? 'Cancel' : 'Add Admin User'}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-6 text-red-200">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-emerald-900/20 border border-emerald-500/50 rounded-lg p-4 mb-6 text-emerald-200">
            {success}
          </div>
        )}

        {resetTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="reset-password-title"
              className="w-full max-w-md rounded-xl border border-slate-600 bg-slate-800 p-6 shadow-2xl"
            >
              <h2 id="reset-password-title" className="text-xl font-bold text-white">
                Reset password
              </h2>
              <p className="mt-2 text-sm text-gray-300">
                Set a new password for <span className="font-semibold text-white">{resetTarget.email}</span>, or email them a reset link.
              </p>

              <form className="mt-5 space-y-3" onSubmit={handleSetPassword}>
                <label className="block text-sm font-medium text-gray-300">
                  New password
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    minLength={8}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-500 bg-slate-700 px-3 py-2 text-white"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-300">
                  Confirm password
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={resetConfirm}
                    onChange={(e) => setResetConfirm(e.target.value)}
                    minLength={8}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-500 bg-slate-700 px-3 py-2 text-white"
                  />
                </label>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={resetBusy}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {resetBusy ? 'Saving…' : 'Set password'}
                  </button>
                  <button
                    type="button"
                    disabled={resetBusy}
                    onClick={() => void handleEmailResetLink()}
                    className="rounded-lg border border-slate-500 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-slate-700 disabled:opacity-60"
                  >
                    Email reset link
                  </button>
                  <button
                    type="button"
                    disabled={resetBusy}
                    onClick={closeResetPassword}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-gray-400 hover:text-white disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showForm && (
          <div className="bg-slate-700 rounded-lg p-6 mb-8 border border-slate-600">
            <h2 className="text-xl font-bold text-white mb-4">Create New Admin</h2>
            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Full Name"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="bg-slate-600 border border-slate-500 rounded px-4 py-2 text-white placeholder-gray-400"
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="bg-slate-600 border border-slate-500 rounded px-4 py-2 text-white placeholder-gray-400"
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  className="bg-slate-600 border border-slate-500 rounded px-4 py-2 text-white placeholder-gray-400"
                  required
                  minLength={8}
                />
                <select
                  value={formData.roleId}
                  onChange={e => setFormData({ ...formData, roleId: e.target.value })}
                  className="bg-slate-600 border border-slate-500 rounded px-4 py-2 text-white"
                  aria-label="Admin role"
                  required
                >
                  <option value="">Select Role</option>
                  {roles.map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-medium"
              >
                Create Admin
              </button>
            </form>
          </div>
        )}

        <div className="bg-slate-700 rounded-lg overflow-hidden border border-slate-600">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-800 border-b border-slate-600">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Name</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Email</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Role</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Last Login</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                      No admin users found
                    </td>
                  </tr>
                ) : (
                  admins.map(admin => (
                    <tr key={admin.id} className="border-b border-slate-600 hover:bg-slate-600/50">
                      <td className="px-6 py-4 text-white">{admin.name || 'N/A'}</td>
                      <td className="px-6 py-4 text-gray-300">{admin.email}</td>
                      <td className="px-6 py-4">
                        {editingRole === admin.id ? (
                          <select
                            value={admin.roleId}
                            onChange={e => handleUpdateRole(admin.id, e.target.value)}
                            className="bg-slate-600 border border-slate-500 rounded px-2 py-1 text-white text-sm"
                            aria-label={`Update role for ${admin.name || admin.email}`}
                            onBlur={() => setEditingRole(null)}
                            autoFocus
                          >
                            {roles.map(role => (
                              <option key={role.id} value={role.id}>{role.name}</option>
                            ))}
                          </select>
                        ) : (
                          <button
                            onClick={() => setEditingRole(admin.id)}
                            className="text-blue-400 hover:text-blue-300 text-sm"
                          >
                            {admin.role || 'No Role'}
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                            admin.active && !admin.isLocked
                              ? 'bg-green-900/30 text-green-300'
                              : 'bg-red-900/30 text-red-300'
                          }`}
                        >
                          {admin.isLocked ? 'Locked' : admin.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-400 text-sm">
                        {admin.lastLoginAt
                          ? new Date(admin.lastLoginAt).toLocaleDateString()
                          : 'Never'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openResetPassword(admin)}
                            className="rounded bg-slate-600/80 px-3 py-1 text-sm text-cyan-200 hover:bg-slate-500"
                          >
                            Reset password
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(admin.id, admin.active)}
                            className={`rounded px-3 py-1 text-sm ${
                              admin.active
                                ? 'bg-red-900/30 text-red-300 hover:bg-red-900/50'
                                : 'bg-green-900/30 text-green-300 hover:bg-green-900/50'
                            }`}
                          >
                            {admin.active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
