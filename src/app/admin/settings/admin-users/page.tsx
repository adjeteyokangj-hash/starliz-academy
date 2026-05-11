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
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    roleId: '',
  });
  const [editingRole, setEditingRole] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400">Loading admins...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
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
                        <button
                          onClick={() => handleToggleActive(admin.id, admin.active)}
                          className={`text-sm px-3 py-1 rounded ${
                            admin.active
                              ? 'bg-red-900/30 text-red-300 hover:bg-red-900/50'
                              : 'bg-green-900/30 text-green-300 hover:bg-green-900/50'
                          }`}
                        >
                          {admin.active ? 'Deactivate' : 'Activate'}
                        </button>
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
