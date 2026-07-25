'use client';

import { useEffect, useState } from 'react';

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isBuiltIn: boolean;
  userCount: number;
}

const permissionLabels: Record<string, string> = {
  MANAGE_USERS: 'Manage Users',
  MANAGE_ADMINS: 'Manage Admin Users',
  MANAGE_ROLES: 'Manage Roles',
  VIEW_AUDIT_LOGS: 'View Audit Logs',
  MANAGE_CONTENT: 'Manage Content',
  APPROVE_CONTENT: 'Approve Content',
  MANAGE_ASSIGNMENTS: 'Manage Assignments',
  VIEW_PROGRESS: 'View Progress',
  MANAGE_BILLING: 'Manage Billing',
  MANAGE_SUBSCRIPTIONS: 'Manage Subscriptions',
  MANAGE_INTEGRATIONS: 'Manage Integrations',
  MANAGE_API_KEYS: 'Manage API Keys',
  MANAGE_SETTINGS: 'Manage Settings',
  MANAGE_BRANDING: 'Manage Branding',
  MANAGE_SECURITY: 'Manage Security',
  VIEW_REPORTS: 'View Reports',
  EXPORT_DATA: 'Export Data',
  ARCHIVE_RECORDS: 'Archive Records',
  DELETE_RECORDS: 'Delete Records',
  MANAGE_INBOX: 'Manage Inbox',
};

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  async function fetchRoles() {
    try {
      const res = await fetch('/api/admin/roles');
      const data = await res.json();
      if (res.ok) {
        setRoles(data.roles);
      } else {
        setError(data.error || 'Failed to fetch roles');
      }
    } catch (err) {
      setError('Error fetching roles');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchRoles();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const roleDescriptions: Record<string, string> = {
    SUPER_ADMIN: 'Full system access - can manage everything including roles, users, billing, API keys, integrations, and platform settings.',
    ADMIN: 'Can manage students, parents, assignments, AI content, reports, and inbox. Cannot manage billing, API keys, integrations, or roles.',
    MANAGER: 'Operational management - can manage learning content, assignments, reports, and student progress. Cannot access critical settings.',
    TUTOR: 'Limited educational access - can view assigned students, create assignments, review progress, and add notes.',
    AUDITOR: 'Read-only access - can view reports, audit logs, compliance records, and operational activity.',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400">Loading roles...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Roles & Permissions</h1>
          <p className="text-gray-400">Manage role definitions and their assigned permissions</p>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-6 text-red-200">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {roles.length === 0 ? (
            <p className="text-gray-400">No roles found</p>
          ) : (
            roles.map(role => (
              <div
                key={role.id}
                className="bg-slate-700 rounded-lg border border-slate-600 overflow-hidden"
              >
                <button
                  onClick={() =>
                    setExpandedRole(expandedRole === role.id ? null : role.id)
                  }
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-600/50 transition"
                >
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-lg font-bold text-white">{role.name}</h3>
                      {role.isBuiltIn && (
                        <span className="text-xs bg-blue-900/50 text-blue-300 px-2 py-1 rounded">
                          Built-in
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400">
                      {roleDescriptions[role.name] || role.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 text-sm">
                      {role.permissions.length} permissions
                    </span>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${
                        expandedRole === role.id ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 14l-7 7m0 0l-7-7m7 7V3"
                      />
                    </svg>
                  </div>
                </button>

                {expandedRole === role.id && (
                  <div className="bg-slate-800 border-t border-slate-600 px-6 py-4">
                    <div className="grid grid-cols-2 gap-3">
                      {role.permissions.length === 0 ? (
                        <p className="col-span-2 text-gray-400 text-sm">No permissions assigned</p>
                      ) : (
                        role.permissions.map(perm => (
                          <div
                            key={perm}
                            className="flex items-center gap-2 px-3 py-2 bg-slate-700 rounded border border-slate-600"
                          >
                            <svg
                              className="w-4 h-4 text-green-400"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                            <span className="text-sm text-gray-300">
                              {permissionLabels[perm] || perm}
                            </span>
                          </div>
                        ))
                      )}
                    </div>

                    {role.isBuiltIn && (
                      <div className="mt-4 p-3 bg-blue-900/20 border border-blue-600/30 rounded text-blue-300 text-sm">
                        ℹ️ Built-in roles cannot be modified or deleted to maintain system integrity.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="mt-12 bg-blue-900/20 border border-blue-600/30 rounded-lg p-6">
          <h2 className="text-lg font-bold text-white mb-4">Role Hierarchy & Guidelines</h2>
          <div className="space-y-4 text-gray-300 text-sm">
            <div>
              <h3 className="font-semibold text-white mb-2">🔒 Super Admin</h3>
              <p>
                Highest privilege level with full system access. Can manage all aspects including user accounts,
                roles, permissions, billing, and critical system settings. Only Super Admins can delete other Super Admins
                and require at least 2 active Super Admins in the system at all times.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">👨‍💼 Admin</h3>
              <p>
                Administrative role for day-to-day platform management. Can manage students, parents, learning content,
                and generate reports, but cannot access billing or advanced system configuration.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">📊 Manager</h3>
              <p>
                Operational management with focus on content and progress tracking. Can create and manage assignments,
                view student progress, and manage learning content without access to system settings.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">👨‍🏫 Tutor</h3>
              <p>
                Limited to educational functions. Can view assigned students, create assignments, review progress, and
                add notes. No access to system administration or advanced features.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">👁️ Auditor</h3>
              <p>
                Read-only access for compliance and audit purposes. Can view reports, audit logs, and compliance records
                but cannot modify any data.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
