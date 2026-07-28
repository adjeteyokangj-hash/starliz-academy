"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import CollapsibleCard from "@/components/school-admin/CollapsibleCard";
import {
  assignableSchoolRoles,
  canManageTargetStaffMember,
  getSchoolRoleLabel,
  type SchoolRole,
} from "@/lib/schools/permissions";

type StaffRole = "owner" | "admin" | "teacher" | "support" | "staff_observer" | "finance";
type StaffStatus = "invited" | "active" | "suspended" | "archived";
type EditableRole = "admin" | "teacher" | "support" | "staff_observer" | "finance";
type StatusFilter = "all" | "active" | "invited" | "suspended" | "archived";

type StaffMember = {
  id: string;
  schoolId: string;
  userId: string;
  role: StaffRole;
  status: StaffStatus;
  title: string | null;
  invitedAt: string | null;
  acceptedAt: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
  isCurrentActor: boolean;
  user: { id: string; name: string | null; email: string };
  classrooms: Array<{ id: string; name: string }>;
  shortLearning?: {
    eligible: boolean;
    upcomingShiftsCount: number;
    presenceStatus: string | null;
    lastHeartbeatAt: string | null;
  };
  safeguardingAccess?: boolean;
};

type InviteRecord = {
  id: string;
  targetEmail: string;
  inviteType: string;
  targetRole: string | null;
  expiresAt: string;
  createdAt: string;
  createdByUserId: string | null;
  invitedBy?: { id: string; name: string | null; email: string } | null;
  status?: string;
};

type AuditLog = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  actorUserId: string | null;
  severity: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type ConfirmState = {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
};

type Props = {
  schoolId: string;
  schoolName: string;
  actorRole: SchoolRole;
};

type AbsenceRow = {
  id: string;
  schoolTeacherId: string;
  teacherName: string | null;
  teacherEmail: string;
  startsOn: string;
  endsOn: string;
  reason: string;
  note: string | null;
};

const INVITE_ROLE_OPTIONS: EditableRole[] = [
  "admin",
  "teacher",
  "support",
  "staff_observer",
  "finance",
];

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function statusBadgeClass(status: StaffStatus | "pending") {
  if (status === "active") return "border-emerald-600/30 bg-emerald-50 text-emerald-800";
  if (status === "invited" || status === "pending") return "border-sky-600/30 bg-sky-50 text-sky-800";
  if (status === "suspended") return "border-amber-600/30 bg-amber-50 text-amber-900";
  return "border-border bg-muted text-foreground/70";
}

function roleHelp(role: EditableRole) {
  if (role === "support") {
    return "May support Short Learning shifts. Not automatically a Day School classroom teacher.";
  }
  if (role === "admin") return "Day-to-day school administration. Cannot transfer ownership.";
  if (role === "staff_observer") return "Read-oriented school visibility without teaching assignments.";
  if (role === "finance") return "Finance and billing visibility for the school.";
  return "Day School classroom teaching and class operations.";
}

export default function SchoolStaffManagementClient({ schoolId, schoolName, actorRole }: Props) {
  const inviteRoles = useMemo(
    () => INVITE_ROLE_OPTIONS.filter((role) => assignableSchoolRoles(actorRole).includes(role)),
    [actorRole],
  );
  const changeRoles = useMemo(
    () =>
      (["admin", "teacher", "support", "staff_observer", "finance"] as EditableRole[]).filter((role) =>
        assignableSchoolRoles(actorRole).includes(role),
      ),
    [actorRole],
  );

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [absences, setAbsences] = useState<AbsenceRow[]>([]);
  const [absenceBusy, setAbsenceBusy] = useState(false);
  const [absenceMsg, setAbsenceMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | StaffRole>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, EditableRole>>({});
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [lastResetUrl, setLastResetUrl] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: (inviteRoles[0] ?? "teacher") as EditableRole,
    message: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [staffRes, inviteRes] = await Promise.all([
        fetch(`/api/school/teachers?schoolId=${encodeURIComponent(schoolId)}&status=all`, {
          credentials: "include",
        }),
        fetch(`/api/school/invites?schoolId=${encodeURIComponent(schoolId)}`, {
          credentials: "include",
        }),
      ]);
      const staffPayload = (await staffRes.json()) as { teachers?: StaffMember[]; error?: string };
      if (!staffRes.ok) throw new Error(staffPayload.error ?? "Unable to load staff.");
      const invitePayload = (await inviteRes.json()) as { invites?: InviteRecord[]; error?: string };
      if (!inviteRes.ok) throw new Error(invitePayload.error ?? "Unable to load invites.");

      const teachers = staffPayload.teachers ?? [];
      setStaff(teachers);
      setInvites(invitePayload.invites ?? []);
      setRoleDrafts((previous) => {
        const next = { ...previous };
        for (const member of teachers) {
          if (member.role === "owner") continue;
          next[member.id] = member.role;
        }
        return next;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load staff.");
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  
  async function loadAbsences() {
    try {
      const res = await fetch("/api/school-admin/staff/absences");
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.absences)) {
        setAbsences(data.absences as AbsenceRow[]);
      }
    } catch {
      /* non-blocking */
    }
  }

  async function markAbsentToday(schoolTeacherId: string) {
    setAbsenceBusy(true);
    setAbsenceMsg(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch("/api/school-admin/staff/absences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolTeacherId,
          startsOn: today,
          endsOn: today,
          reason: "unavailable",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAbsenceMsg(data.error ?? "Unable to mark absence.");
        return;
      }
      setAbsenceMsg("Marked absent today.");
      await loadAbsences();
    } catch {
      setAbsenceMsg("Unable to mark absence.");
    } finally {
      setAbsenceBusy(false);
    }
  }

  async function clearAbsence(id: string) {
    setAbsenceBusy(true);
    setAbsenceMsg(null);
    try {
      const res = await fetch(`/api/school-admin/staff/absences?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAbsenceMsg(data.error ?? "Unable to clear absence.");
        return;
      }
      setAbsenceMsg("Absence cleared.");
      await loadAbsences();
    } catch {
      setAbsenceMsg("Unable to clear absence.");
    } finally {
      setAbsenceBusy(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
      void loadAbsences();
    });
  }, [load]);

  const selected = useMemo(
    () => staff.find((member) => member.id === selectedId) ?? null,
    [selectedId, staff],
  );

  useEffect(() => {
    if (!selected) return;
    const teacherId = selected.id;
    let cancelled = false;
    queueMicrotask(() => {
      void (async () => {
        try {
          const response = await fetch(
            `/api/school/audit?schoolId=${encodeURIComponent(schoolId)}&entityType=teacher&entityId=${encodeURIComponent(teacherId)}`,
            { credentials: "include" },
          );
          const payload = (await response.json()) as { logs?: AuditLog[]; error?: string };
          if (!response.ok) throw new Error(payload.error ?? "Unable to load audit history.");
          if (!cancelled) setAuditLogs(payload.logs ?? []);
        } catch {
          if (!cancelled) setAuditLogs([]);
        }
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [schoolId, selected]);

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((member) => {
      if (roleFilter !== "all" && member.role !== roleFilter) return false;
      if (statusFilter !== "all" && member.status !== statusFilter) return false;
      if (!q) return true;
      const name = (member.user.name ?? "").toLowerCase();
      const email = member.user.email.toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [roleFilter, search, staff, statusFilter]);

  async function runAction(label: string, work: () => Promise<string | void>) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const nextMessage = await work();
      setMessage(typeof nextMessage === "string" ? nextMessage : label);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed.");
    } finally {
      setSaving(false);
      setConfirm(null);
    }
  }

  async function onInviteSubmit(event: FormEvent) {
    event.preventDefault();
    const role = inviteForm.role;
    if (!inviteRoles.includes(role)) {
      setError("You cannot invite that role.");
      return;
    }
    await runAction(`Invitation sent to ${inviteForm.email}.`, async () => {
      const inviteType = role === "admin" ? "school_admin" : "teacher";
      const response = await fetch("/api/school/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          schoolId,
          targetEmail: inviteForm.email.trim(),
          inviteType,
          targetRole: role,
          firstName: inviteForm.firstName.trim() || undefined,
          lastName: inviteForm.lastName.trim() || undefined,
          message: inviteForm.message.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as { error?: string; inviteUrl?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to send invite.");
      setLastInviteUrl(payload.inviteUrl ?? null);
      setShowInvite(false);
      setInviteForm({
        firstName: "",
        lastName: "",
        email: "",
        role: inviteRoles[0] ?? "teacher",
        message: "",
      });
    });
  }

  async function onInviteLifecycle(inviteId: string, action: "resend" | "revoke") {
    await runAction(action === "resend" ? "Invitation resent." : "Invitation revoked.", async () => {
      const response = await fetch("/api/school/invites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ schoolId, inviteId, action }),
      });
      const payload = (await response.json()) as { error?: string; inviteUrl?: string };
      if (!response.ok) throw new Error(payload.error ?? `Unable to ${action} invite.`);
      if (action === "resend" && payload.inviteUrl) setLastInviteUrl(payload.inviteUrl);
    });
  }

  function requestStaffAction(
    member: StaffMember,
    action: "suspend" | "reactivate" | "archive" | "changeRole" | "resetPassword",
    role?: EditableRole,
  ) {
    if (member.role === "owner" || member.isCurrentActor) return;
    if (!canManageTargetStaffMember(actorRole, member.role)) return;

    const name = member.user.name ?? member.user.email;
    if (action === "resetPassword") {
      if (member.status === "archived") return;
      setConfirm({
        title: `Reset password for ${name}?`,
        body: `A secure reset link will be emailed to ${member.user.email}. No password is generated or shown here. Pending invitations should use Resend instead of password reset when the person has not joined yet.`,
        confirmLabel: "Send reset email",
        onConfirm: () =>
          runAction(`Password reset prepared for ${member.user.email}.`, async () => {
            const response = await fetch("/api/school/teachers", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ schoolId, teacherId: member.id, action: "resetPassword" }),
            });
            const payload = (await response.json()) as {
              error?: string;
              message?: string;
              resetUrl?: string | null;
            };
            if (!response.ok) throw new Error(payload.error ?? "Unable to send password reset.");
            setLastResetUrl(payload.resetUrl ?? null);
            return payload.message;
          }),
      });
      return;
    }
    if (action === "suspend") {
      setConfirm({
        title: `Suspend ${name}?`,
        body: "This blocks school portal access for this membership. History and audit records are kept. The user account is not deleted, and memberships in other schools are not removed.",
        confirmLabel: "Suspend",
        onConfirm: () =>
          runAction(`Suspended ${name}.`, async () => {
            const response = await fetch("/api/school/teachers", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ schoolId, teacherId: member.id, action: "suspend" }),
            });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) throw new Error(payload.error ?? "Unable to suspend staff.");
          }),
      });
      return;
    }
    if (action === "archive") {
      setConfirm({
        title: `Archive ${name}?`,
        body: "Archiving removes this member from the active school roster while preserving history. This does not hard-delete the user.",
        confirmLabel: "Archive",
        onConfirm: () =>
          runAction(`Archived ${name}.`, async () => {
            const response = await fetch("/api/school/teachers", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ schoolId, teacherId: member.id, action: "archive" }),
            });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) throw new Error(payload.error ?? "Unable to archive staff.");
          }),
      });
      return;
    }
    if (action === "changeRole" && role) {
      setConfirm({
        title: `Change role for ${name}?`,
        body: `Set role to ${getSchoolRoleLabel(role)}. Ownership transfer is not available here.`,
        confirmLabel: "Change role",
        onConfirm: () =>
          runAction(`Updated role for ${name}.`, async () => {
            const response = await fetch("/api/school/teachers", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                schoolId,
                teacherId: member.id,
                action: "changeRole",
                role,
              }),
            });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) throw new Error(payload.error ?? "Unable to change role.");
          }),
      });
      return;
    }

    void runAction(`Reactivated ${name}.`, async () => {
      const response = await fetch("/api/school/teachers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ schoolId, teacherId: member.id, action: "reactivate" }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to reactivate staff.");
    });
  }

  async function copyInviteUrl() {
    if (!lastInviteUrl) return;
    try {
      await navigator.clipboard.writeText(lastInviteUrl);
      setMessage("Invite link copied.");
    } catch {
      setError("Unable to copy invite link.");
    }
  }

  async function copyResetUrl() {
    if (!lastResetUrl) return;
    try {
      await navigator.clipboard.writeText(lastResetUrl);
      setMessage("Password reset link copied.");
    } catch {
      setError("Unable to copy reset link.");
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Staff</h1>
          <p className="mt-0.5 text-sm text-foreground/60">
            School-scoped staff management for {schoolName}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowInvite((open) => !open)}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Invite staff
        </button>
      </div>

      {message ? (
        <div className="mb-4 rounded-xl border border-emerald-600/20 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
          {lastInviteUrl ? (
            <button
              type="button"
              className="ml-3 font-semibold underline"
              onClick={() => void copyInviteUrl()}
            >
              Copy invite link
            </button>
          ) : null}
          {lastResetUrl ? (
            <button
              type="button"
              className="ml-3 font-semibold underline"
              onClick={() => void copyResetUrl()}
            >
              Copy reset link
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-xl border border-red-600/20 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      {showInvite ? (
        <CollapsibleCard title="Invite staff" className="mb-8" bodyClassName="p-5">
        <form
          onSubmit={(event) => void onInviteSubmit(event)}
          className="grid gap-4 sm:grid-cols-2"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground/70">First name</label>
            <input
              required
              value={inviteForm.firstName}
              onChange={(event) => setInviteForm((prev) => ({ ...prev, firstName: event.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground/70">Last name</label>
            <input
              required
              value={inviteForm.lastName}
              onChange={(event) => setInviteForm((prev) => ({ ...prev, lastName: event.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-foreground/70">Email</label>
            <input
              required
              type="email"
              value={inviteForm.email}
              onChange={(event) => setInviteForm((prev) => ({ ...prev, email: event.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground/70">Role</label>
            <select
              value={inviteForm.role}
              onChange={(event) =>
                setInviteForm((prev) => ({ ...prev, role: event.target.value as EditableRole }))
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {inviteRoles.map((role) => (
                <option key={role} value={role}>
                  {getSchoolRoleLabel(role)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-foreground/55">{roleHelp(inviteForm.role)}</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground/70">Optional message</label>
            <textarea
              value={inviteForm.message}
              onChange={(event) => setInviteForm((prev) => ({ ...prev, message: event.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Send invitation
            </button>
            <button
              type="button"
              onClick={() => setShowInvite(false)}
              className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium"
            >
              Cancel
            </button>
            <p className="w-full text-xs text-foreground/50">
              Ownership transfer is not available here. Platform Admin remains setup / break-glass only.
            </p>
          </div>
        </form>
        </CollapsibleCard>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name or email"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
        />
        <select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value as "all" | StaffRole)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All roles</option>
          {(["owner", "admin", "teacher", "support", "staff_observer", "finance"] as StaffRole[]).map(
            (role) => (
              <option key={role} value={role}>
                {getSchoolRoleLabel(role)}
              </option>
            ),
          )}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="invited">Invited</option>
          <option value="suspended">Suspended</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {invites.length > 0 ? (
        <CollapsibleCard title="Pending invitations" count={invites.length} className="mb-6">
          <div className="divide-y divide-border">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <div className="font-medium">{invite.targetEmail}</div>
                  <div className="text-xs text-foreground/60">
                    {getSchoolRoleLabel(invite.targetRole ?? "teacher")} · Sent {fmtDate(invite.createdAt)} ·
                    Expires {fmtDate(invite.expiresAt)}
                    {invite.invitedBy
                      ? ` · Invited by ${invite.invitedBy.name ?? invite.invitedBy.email}`
                      : ""}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs ${statusBadgeClass("pending")}`}>
                    Pending
                  </span>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void onInviteLifecycle(invite.id, "resend")}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
                  >
                    Resend
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void onInviteLifecycle(invite.id, "revoke")}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleCard>
      ) : null}

      <CollapsibleCard title="Staff absences" count={absences.length} className="mb-6" defaultOpen={false}>
        {absences.length === 0 ? (
          <p className="p-4 text-sm text-foreground/60">No upcoming or recent absences recorded.</p>
        ) : (
          <ul className="divide-y divide-border">
            {absences.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{row.teacherName ?? row.teacherEmail}</p>
                  <p className="text-xs text-foreground/55">
                    {row.startsOn === row.endsOn ? row.startsOn : `${row.startsOn} → ${row.endsOn}`} · {row.reason}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={absenceBusy}
                  onClick={() => void clearAbsence(row.id)}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted/40 disabled:opacity-50"
                >
                  Clear
                </button>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleCard>

      <CollapsibleCard title="Staff" count={loading ? null : filteredStaff.length}>
        {loading ? (
          <div className="p-10 text-center text-sm text-foreground/50">Loading staff…</div>
        ) : filteredStaff.length === 0 ? (
          <div className="p-10 text-center text-sm text-foreground/50">No staff match these filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-muted/30 text-xs text-foreground/60">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Joined / invited</th>
                  <th className="px-4 py-3 text-left font-medium">Last active</th>
                  <th className="px-4 py-3 text-left font-medium">Classes</th>
                  <th className="px-4 py-3 text-left font-medium">Short Learning</th>
                  <th className="px-4 py-3 text-left font-medium">Safeguarding</th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredStaff.map((member) => {
                  const manageable =
                    !member.isCurrentActor &&
                    member.role !== "owner" &&
                    canManageTargetStaffMember(actorRole, member.role);
                  return (
                    <tr
                      key={member.id}
                      className="cursor-pointer transition-colors hover:bg-muted/20"
                      onClick={() => setSelectedId(member.id)}
                    >
                      <td className="px-4 py-3 font-medium text-foreground">
                        {member.user.name ?? "—"}
                        {member.isCurrentActor ? (
                          <span className="ml-2 text-xs font-normal text-foreground/45">(you)</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-foreground/70">{member.user.email}</td>
                      <td className="px-4 py-3 text-foreground/70">{getSchoolRoleLabel(member.role)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs capitalize ${statusBadgeClass(member.status)}`}
                        >
                          {member.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground/60">
                        {member.acceptedAt
                          ? `Joined ${fmtDate(member.acceptedAt)}`
                          : `Invited ${fmtDate(member.invitedAt ?? member.createdAt)}`}
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground/60">
                        {fmtDate(member.lastActiveAt)}
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground/60">
                        {member.classrooms.length}
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground/60">
                        {member.shortLearning?.eligible
                          ? `${member.shortLearning.upcomingShiftsCount} upcoming${
                              member.shortLearning.presenceStatus
                                ? ` · ${member.shortLearning.presenceStatus}`
                                : ""
                            }`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground/60">
                        {member.safeguardingAccess ? "Yes" : "No"}
                      </td>
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        {member.role === "owner" ? (
                          <span className="text-xs text-foreground/45">Protected</span>
                        ) : manageable ? (
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              className="rounded-lg border border-border px-2 py-1 text-xs"
                              onClick={() => setSelectedId(member.id)}
                            >
                              View
                            </button>
                            {member.status !== "archived" ? (
                              <button
                                type="button"
                                disabled={saving}
                                className="rounded-lg border border-border px-2 py-1 text-xs"
                                onClick={() => requestStaffAction(member, "resetPassword")}
                              >
                                Reset password
                              </button>
                            ) : null}
                            {member.status === "suspended" || member.status === "archived" ? (
                              <button
                                type="button"
                                disabled={saving}
                                className="rounded-lg border border-border px-2 py-1 text-xs"
                                onClick={() => requestStaffAction(member, "reactivate")}
                              >
                                Reactivate
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={saving}
                                className="rounded-lg border border-border px-2 py-1 text-xs"
                                onClick={() => requestStaffAction(member, "suspend")}
                              >
                                Suspend
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-foreground/45">View only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleCard>

      {selected ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => setSelectedId(null)}>
          <aside
            className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-background p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{selected.user.name ?? "Staff member"}</h2>
                <p className="text-sm text-foreground/60">{selected.user.email}</p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-1.5 text-xs"
                onClick={() => setSelectedId(null)}
              >
                Close
              </button>
            </div>

            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-foreground/55">Role</dt>
                <dd>{getSchoolRoleLabel(selected.role)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-foreground/55">Status</dt>
                <dd className="capitalize">{selected.status}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-foreground/55">Invited</dt>
                <dd>{fmtDateTime(selected.invitedAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-foreground/55">Joined</dt>
                <dd>{fmtDateTime(selected.acceptedAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-foreground/55">Last active</dt>
                <dd>{fmtDateTime(selected.lastActiveAt)}</dd>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={absenceBusy || selected.status !== "active"}
                  onClick={() => void markAbsentToday(selected.id)}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted/40 disabled:opacity-50"
                >
                  Mark absent today
                </button>
                {absenceMsg ? <p className="text-xs text-foreground/60">{absenceMsg}</p> : null}
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-foreground/55">Safeguarding access</dt>
                <dd>{selected.safeguardingAccess ? "Yes (owner/admin)" : "No"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-foreground/55">Ownership transfer</dt>
                <dd className="text-foreground/55">Not available here</dd>
              </div>
            </dl>

            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold">Assigned classes</h3>
              {selected.classrooms.length === 0 ? (
                <p className="text-sm text-foreground/50">No classes assigned.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {selected.classrooms.map((classroom) => (
                    <li key={classroom.id}>
                      <Link
                        href="/school-admin/day-school/classes"
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {classroom.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {(selected.role === "support" || selected.shortLearning?.eligible) && (
              <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                <h3 className="mb-2 font-semibold">Short Learning</h3>
                <p>
                  Eligible for shifts:{" "}
                  {selected.shortLearning?.eligible ? "Yes (informational)" : "No"}
                </p>
                <p>Upcoming shifts: {selected.shortLearning?.upcomingShiftsCount ?? 0}</p>
                <p>Presence: {selected.shortLearning?.presenceStatus ?? "—"}</p>
                {selected.role === "support" ? (
                  <p className="mt-2 text-xs text-foreground/55">
                    Tutor / Support may cover Short Learning but is not automatically a Day School
                    classroom teacher.
                  </p>
                ) : null}
              </div>
            )}

            {selected.role !== "owner" &&
            !selected.isCurrentActor &&
            canManageTargetStaffMember(actorRole, selected.role) ? (
              <div className="mt-6 space-y-3">
                <h3 className="text-sm font-semibold">Management actions</h3>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={roleDrafts[selected.id] ?? selected.role}
                    onChange={(event) =>
                      setRoleDrafts((prev) => ({
                        ...prev,
                        [selected.id]: event.target.value as EditableRole,
                      }))
                    }
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    {changeRoles.map((role) => (
                      <option key={role} value={role}>
                        {getSchoolRoleLabel(role)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={saving}
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                    onClick={() =>
                      requestStaffAction(
                        selected,
                        "changeRole",
                        roleDrafts[selected.id] ?? (selected.role as EditableRole),
                      )
                    }
                  >
                    Change role
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.status !== "archived" ? (
                    <button
                      type="button"
                      disabled={saving}
                      className="rounded-lg border border-border px-3 py-2 text-sm"
                      onClick={() => requestStaffAction(selected, "resetPassword")}
                    >
                      Reset password
                    </button>
                  ) : null}
                  {selected.status === "suspended" || selected.status === "archived" ? (
                    <button
                      type="button"
                      disabled={saving}
                      className="rounded-lg border border-border px-3 py-2 text-sm"
                      onClick={() => requestStaffAction(selected, "reactivate")}
                    >
                      Reactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={saving}
                      className="rounded-lg border border-border px-3 py-2 text-sm"
                      onClick={() => requestStaffAction(selected, "suspend")}
                    >
                      Suspend
                    </button>
                  )}
                  {selected.status !== "archived" ? (
                    <button
                      type="button"
                      disabled={saving}
                      className="rounded-lg border border-border px-3 py-2 text-sm"
                      onClick={() => requestStaffAction(selected, "archive")}
                    >
                      Archive
                    </button>
                  ) : null}
                </div>
              </div>
            ) : selected.role === "owner" ? (
              <p className="mt-6 text-sm text-foreground/55">
                School Owner is protected. Demote, suspend, archive, and ownership transfer are not
                available here.
              </p>
            ) : null}

            <div className="mt-8">
              <h3 className="mb-2 text-sm font-semibold">Recent staff events</h3>
              {auditLogs.length === 0 ? (
                <p className="text-sm text-foreground/50">No recent staff-management events.</p>
              ) : (
                <ul className="space-y-2 text-xs text-foreground/70">
                  {auditLogs.slice(0, 12).map((log) => (
                    <li key={log.id} className="rounded-lg border border-border px-3 py-2">
                      <div className="font-medium text-foreground">{log.action}</div>
                      <div>{fmtDateTime(log.createdAt)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      ) : null}

      {confirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
            <h3 className="text-lg font-semibold">{confirm.title}</h3>
            <p className="mt-2 text-sm text-foreground/70">{confirm.body}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border border-border px-4 py-2 text-sm"
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                onClick={() => void confirm.onConfirm()}
              >
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
