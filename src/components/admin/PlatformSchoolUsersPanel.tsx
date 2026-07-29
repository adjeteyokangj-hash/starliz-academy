'use client';

import Link from "next/link";
import { useState } from "react";
import {
  groupSchoolUsersBySchool,
  type PlatformUserDto,
  type SchoolUserDto,
} from "@/lib/admin/access-scope";
import {
  AdminButton,
  AdminInput,
  AdminSelect,
  AdminTable,
  AdminTableBody,
  AdminTableEmpty,
  AdminTableHead,
  AdminTd,
  AdminTh,
  AdminTr,
} from "@/components/admin/ui";

export type PlatformRoleOption = { id: string; name: string };

type Props = {
  platformUsers: PlatformUserDto[];
  schoolUsers: SchoolUserDto[];
  roles: PlatformRoleOption[];
  onToggleActive?: (adminId: string, currentActive: boolean) => void | Promise<void>;
  onEdit?: (user: PlatformUserDto) => void;
  onDelete?: (adminId: string) => void;
  onUpdateRole?: (adminId: string, roleId: string) => void | Promise<void>;
  onResetPassword?: (user: PlatformUserDto) => void;
  showDelete?: boolean;
  showRoleEdit?: boolean;
  showResetPassword?: boolean;
  deleteConfirmId?: string | null;
  onRequestDelete?: (adminId: string) => void;
  onCancelDelete?: () => void;
};

function statusLabel(active: boolean, isLocked?: boolean) {
  if (isLocked) return "Locked";
  return active ? "Active" : "Inactive";
}

function statusClass(active: boolean, isLocked?: boolean) {
  if (isLocked || !active) return "bg-rose-900/30 text-rose-300";
  return "bg-emerald-900/30 text-emerald-300";
}

export function PlatformSchoolUsersPanel({
  platformUsers,
  schoolUsers,
  roles,
  onToggleActive,
  onEdit,
  onDelete,
  onUpdateRole,
  onResetPassword,
  showDelete = false,
  showRoleEdit = false,
  showResetPassword = false,
  deleteConfirmId = null,
  onRequestDelete,
  onCancelDelete,
}: Props) {
  const [search, setSearch] = useState("");
  const [platformRoleFilter, setPlatformRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [schoolFilter, setSchoolFilter] = useState("");
  const [schoolRoleFilter, setSchoolRoleFilter] = useState("");
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);

  const schoolOptions = (() => {
    const map = new Map<string, string>();
    for (const row of schoolUsers) map.set(row.schoolId, row.schoolName);
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  })();

  const schoolRoleOptions = (() => {
    const set = new Set(schoolUsers.map((u) => u.schoolRole));
    return Array.from(set).sort();
  })();

  const q = search.trim().toLowerCase();

  const filteredPlatform = (() => {
    return platformUsers.filter((row) => {
      if (platformRoleFilter && row.role !== platformRoleFilter) return false;
      if (statusFilter === "active" && !(row.active && !row.isLocked)) return false;
      if (statusFilter === "inactive" && row.active && !row.isLocked) return false;
      if (!q) return true;
      const hay = [row.name, row.email, row.role, "platform"].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  })();

  const filteredSchool = (() => {
    return schoolUsers.filter((row) => {
      if (schoolFilter && row.schoolId !== schoolFilter) return false;
      if (schoolRoleFilter && row.schoolRole !== schoolRoleFilter) return false;
      if (statusFilter === "active" && row.status !== "active") return false;
      if (statusFilter === "inactive" && row.status === "active") return false;
      if (!q) return true;
      const hay = [row.name, row.email, row.schoolName, row.schoolRole, row.schoolRoleLabel, "school"]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  })();

  const groupedSchools = groupSchoolUsersBySchool(filteredSchool);

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <AdminInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, role, school…"
          aria-label="Search platform and school users"
        />
        <AdminSelect
          value={platformRoleFilter}
          onChange={(e) => setPlatformRoleFilter(e.target.value)}
          aria-label="Filter by platform role"
        >
          <option value="">All platform roles</option>
          {roles.map((role) => (
            <option key={role.id} value={role.name}>{role.name}</option>
          ))}
        </AdminSelect>
        <AdminSelect
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </AdminSelect>
        <AdminSelect
          value={schoolFilter}
          onChange={(e) => setSchoolFilter(e.target.value)}
          aria-label="Filter by school"
        >
          <option value="">All schools</option>
          {schoolOptions.map((school) => (
            <option key={school.id} value={school.id}>{school.name}</option>
          ))}
        </AdminSelect>
        <AdminSelect
          value={schoolRoleFilter}
          onChange={(e) => setSchoolRoleFilter(e.target.value)}
          aria-label="Filter by school role"
        >
          <option value="">All school roles</option>
          {schoolRoleOptions.map((role) => (
            <option key={role} value={role}>{role}</option>
          ))}
        </AdminSelect>
      </div>

      <section className="space-y-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black text-[var(--admin-text)]">Platform Users</h3>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-bold text-slate-400">
              {filteredPlatform.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--admin-muted)]">
            Users who manage the StarLiz platform and Operations Console.
          </p>
        </div>

        <div
          className="overflow-hidden rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)]"
          style={{ background: "var(--admin-surface)", boxShadow: "var(--admin-shadow-sm)" }}
        >
          <AdminTable>
            <AdminTableHead>
              <AdminTh>Name</AdminTh>
              <AdminTh>Email</AdminTh>
              <AdminTh>Platform role</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Last active</AdminTh>
              <AdminTh>Actions</AdminTh>
            </AdminTableHead>
            <AdminTableBody>
              {filteredPlatform.length === 0 ? (
                <AdminTableEmpty colSpan={6} message="No platform users found" />
              ) : (
                filteredPlatform.map((admin) => (
                  <AdminTr key={admin.id}>
                    <AdminTd>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-300">
                          Platform
                        </span>
                        <span>{admin.name || "N/A"}</span>
                      </div>
                    </AdminTd>
                    <AdminTd className="text-[var(--admin-muted)]">{admin.email}</AdminTd>
                    <AdminTd>
                      {showRoleEdit && editingRoleId === admin.id && onUpdateRole ? (
                        <AdminSelect
                          value={admin.roleId ?? ""}
                          onChange={(e) => {
                            void onUpdateRole(admin.id, e.target.value);
                            setEditingRoleId(null);
                          }}
                          className="py-1 text-sm"
                          aria-label={`Update platform role for ${admin.name || admin.email}`}
                          onBlur={() => setEditingRoleId(null)}
                          autoFocus
                        >
                          {roles.map((role) => (
                            <option key={role.id} value={role.id}>{role.name}</option>
                          ))}
                        </AdminSelect>
                      ) : showRoleEdit ? (
                        <button
                          type="button"
                          onClick={() => setEditingRoleId(admin.id)}
                          className="text-sm text-[var(--admin-primary-hover)] hover:underline"
                        >
                          {admin.role || "No Role"}
                        </button>
                      ) : (
                        admin.role || "No Role"
                      )}
                    </AdminTd>
                    <AdminTd>
                      <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${statusClass(admin.active, admin.isLocked)}`}>
                        {statusLabel(admin.active, admin.isLocked)}
                      </span>
                    </AdminTd>
                    <AdminTd className="text-sm text-[var(--admin-muted)]">
                      {admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleDateString() : "Never"}
                    </AdminTd>
                    <AdminTd>
                      <div className="flex flex-wrap items-center gap-2">
                        {onEdit ? (
                          <AdminButton type="button" size="sm" variant="secondary" onClick={() => onEdit(admin)}>
                            Edit
                          </AdminButton>
                        ) : null}
                        {showResetPassword && onResetPassword ? (
                          <AdminButton type="button" size="sm" variant="secondary" onClick={() => onResetPassword(admin)}>
                            Reset password
                          </AdminButton>
                        ) : null}
                        {onToggleActive ? (
                          <AdminButton
                            type="button"
                            size="sm"
                            variant={admin.active ? "danger" : "secondary"}
                            onClick={() => void onToggleActive(admin.id, admin.active)}
                          >
                            {admin.active ? "Deactivate" : "Activate"}
                          </AdminButton>
                        ) : null}
                        {showDelete && onDelete ? (
                          deleteConfirmId === admin.id ? (
                            <div className="flex gap-1.5">
                              <AdminButton type="button" size="sm" variant="danger" onClick={() => void onDelete(admin.id)}>
                                Confirm
                              </AdminButton>
                              <AdminButton type="button" size="sm" variant="ghost" onClick={() => onCancelDelete?.()}>
                                Cancel
                              </AdminButton>
                            </div>
                          ) : (
                            <AdminButton
                              type="button"
                              size="sm"
                              variant="danger"
                              onClick={() => onRequestDelete?.(admin.id)}
                              disabled={platformUsers.length <= 1}
                            >
                              Delete
                            </AdminButton>
                          )
                        ) : null}
                      </div>
                    </AdminTd>
                  </AdminTr>
                ))
              )}
            </AdminTableBody>
          </AdminTable>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black text-[var(--admin-text)]">School Users</h3>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-bold text-slate-400">
              {filteredSchool.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--admin-muted)]">
            Owners and staff whose access is limited to a specific school.
          </p>
        </div>

        {groupedSchools.length === 0 ? (
          <p className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-rail)] p-6 text-center text-sm text-[var(--admin-muted)]">
            No school users found.
          </p>
        ) : (
          groupedSchools.map((school) => (
            <div
              key={school.schoolId}
              className="overflow-hidden rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)]"
              style={{ background: "var(--admin-surface)", boxShadow: "var(--admin-shadow-sm)" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--admin-border)] px-4 py-3">
                <p className="text-sm font-black text-[var(--admin-text)]">{school.schoolName}</p>
                <Link
                  href={`/admin/schools/${school.schoolId}/staff/directory`}
                  className="inline-flex rounded-[var(--admin-radius)] border border-[var(--admin-border)] px-3 py-1.5 text-xs font-bold text-[var(--admin-text)] transition hover:border-[var(--admin-primary)]/40 hover:bg-[var(--admin-primary-muted)]"
                >
                  Manage school users
                </Link>
              </div>

              {school.groups.map((group) => (
                <div key={group.key} className="border-b border-[var(--admin-border)] last:border-b-0">
                  <p className="bg-[var(--admin-rail)] px-4 py-2 text-xs font-black uppercase tracking-wide text-[var(--admin-muted)]">
                    {group.label}
                  </p>
                  <AdminTable>
                    <AdminTableHead>
                      <AdminTh>Name</AdminTh>
                      <AdminTh>Email</AdminTh>
                      <AdminTh>School</AdminTh>
                      <AdminTh>School role</AdminTh>
                      <AdminTh>Status</AdminTh>
                      <AdminTh>View/Manage</AdminTh>
                    </AdminTableHead>
                    <AdminTableBody>
                      {group.users.map((user) => (
                        <AdminTr key={user.membershipId}>
                          <AdminTd>
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                                School
                              </span>
                              <span>{user.name || "N/A"}</span>
                            </div>
                          </AdminTd>
                          <AdminTd className="text-[var(--admin-muted)]">{user.email}</AdminTd>
                          <AdminTd>{user.schoolName}</AdminTd>
                          <AdminTd>{user.schoolRoleLabel}</AdminTd>
                          <AdminTd>
                            <span
                              className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                                user.status === "active"
                                  ? "bg-emerald-900/30 text-emerald-300"
                                  : "bg-slate-800 text-slate-400"
                              }`}
                            >
                              {user.status}
                            </span>
                          </AdminTd>
                          <AdminTd>
                            <Link
                              href={user.managePath}
                              className="text-sm font-semibold text-[var(--admin-primary-hover)] hover:underline"
                            >
                              View / Manage
                            </Link>
                          </AdminTd>
                        </AdminTr>
                      ))}
                    </AdminTableBody>
                  </AdminTable>
                </div>
              ))}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
