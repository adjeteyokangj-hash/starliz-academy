"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type InviteRecord = {
  id: string;
  targetEmail: string;
  inviteType: string;
  targetRole: string | null;
  expiresAt: string;
  createdAt: string;
};

type ManagedTeacher = {
  id: string;
  schoolId: string;
  userId: string;
  role: "owner" | "admin" | "teacher" | "support" | "staff_observer" | "finance";
  status: "invited" | "active" | "suspended" | "archived";
  title: string | null;
  invitedAt: string | null;
  acceptedAt: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
  isCurrentActor: boolean;
  user: { id: string; name: string | null; email: string };
  classrooms: Array<{ id: string; name: string }>;
};

type ManageTeacherAction = "suspend" | "reactivate" | "changeRole";
type TeacherStatusFilter = "all" | "active" | "invited" | "suspended" | "archived";
type EditableTeacherRole = "admin" | "teacher" | "support" | "staff_observer" | "finance";

type CommunicationPreference = {
  linkId: string;
  parent: { id: string; name: string | null; email: string };
  student: { id: string; name: string };
  status: string;
  canMessageTeachers: boolean;
  consentGivenAt: string | null;
  consentWithdrawnAt: string | null;
  optedOutAt: string | null;
  optOutReason: string | null;
  safeguardingLockedAt: string | null;
  safeguardingLockReason: string | null;
  updatedAt: string;
};

type CommunicationLog = {
  id: string;
  channel: string;
  subject: string;
  messageBody: string;
  deliveryStatus: string;
  deliveryReason: string | null;
  safeguardingOverride: boolean;
  createdAt: string;
  actor: { id: string; name: string | null; email: string } | null;
  parent: { id: string; name: string | null; email: string };
  student: { id: string; name: string };
  linkId: string;
};

type ComplianceStudent = {
  id: string;
  childId: string;
  childName: string;
  archived: boolean;
  status: string;
  classroom: { id: string; name: string } | null;
  joinedAt: string;
  updatedAt: string;
};

type SafeguardingIncident = {
  id: string;
  category: string;
  severity: string;
  status: string;
  description: string;
  actionTaken: string | null;
  escalationLevel: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  student: { id: string; name: string } | null;
  escalationOwner: { id: string; name: string | null; email: string } | null;
  workflowEvents: Array<{
    id: string;
    eventType: string;
    note: string | null;
    createdAt: string;
    actor: { id: string; name: string | null; email: string } | null;
  }>;
  evidenceAttachments: Array<{
    id: string;
    label: string;
    originalName: string;
    publicUrl: string;
    mimeType: string | null;
    fileSizeBytes: number | null;
    note: string | null;
    createdAt: string;
    uploadedBy: { id: string; name: string | null; email: string } | null;
  }>;
};

type Props = {
  schoolId: string;
  schoolName: string;
  canManageInvites: boolean;
  canManageCompliance: boolean;
  canManageSafeguarding: boolean;
};

function fmtDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function roleLabel(role: ManagedTeacher["role"]) {
  const labels: Record<ManagedTeacher["role"], string> = {
    owner: "School Owner",
    admin: "School Admin",
    teacher: "Teacher",
    support: "Support Staff",
    staff_observer: "Staff Observer",
    finance: "Finance",
  };
  return labels[role];
}

function statusBadgeClass(status: ManagedTeacher["status"]) {
  if (status === "active") return "border-emerald-500/40 bg-emerald-500/15 text-emerald-100";
  if (status === "invited") return "border-cyan-500/40 bg-cyan-500/15 text-cyan-100";
  if (status === "suspended") return "border-amber-500/40 bg-amber-500/15 text-amber-100";
  return "border-slate-500/40 bg-slate-500/15 text-slate-100";
}

export default function TeacherGovernancePanel({
  schoolId,
  schoolName,
  canManageInvites,
  canManageCompliance,
  canManageSafeguarding,
}: Props) {
  const [teachers, setTeachers] = useState<ManagedTeacher[]>([]);
  const [teacherStatusFilter, setTeacherStatusFilter] = useState<TeacherStatusFilter>("all");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, EditableTeacherRole>>({});
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [preferences, setPreferences] = useState<CommunicationPreference[]>([]);
  const [logs, setLogs] = useState<CommunicationLog[]>([]);
  const [students, setStudents] = useState<ComplianceStudent[]>([]);
  const [incidents, setIncidents] = useState<SafeguardingIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const requests: Promise<Response>[] = [
        fetch(`/api/school/communications?schoolId=${schoolId}`, { credentials: "include" }),
        fetch(`/api/school/compliance?schoolId=${schoolId}&mode=students`, { credentials: "include" }),
        fetch(`/api/school/safeguarding?schoolId=${schoolId}&status=open`, { credentials: "include" }),
      ];

      if (canManageInvites) {
        requests.unshift(fetch(`/api/school/invites?schoolId=${schoolId}`, { credentials: "include" }));
        requests.unshift(fetch(`/api/school/teachers?schoolId=${schoolId}&status=${teacherStatusFilter}`, { credentials: "include" }));
      }

      const responses = await Promise.all(requests);
      let offset = 0;

      if (canManageInvites) {
        const teachersResponse = responses[offset++];
        const teachersPayload = await teachersResponse.json() as { teachers?: ManagedTeacher[]; error?: string };
        if (!teachersResponse.ok) throw new Error(teachersPayload.error ?? "Unable to load teacher records.");
        const fetchedTeachers = teachersPayload.teachers ?? [];
        setTeachers(fetchedTeachers);
        setRoleDrafts((previous) => {
          const next: Record<string, EditableTeacherRole> = { ...previous };
          for (const teacher of fetchedTeachers) {
            if (teacher.role === "owner") continue;
            next[teacher.id] = teacher.role;
          }
          return next;
        });

        const inviteResponse = responses[offset++];
        const invitePayload = await inviteResponse.json() as { invites?: InviteRecord[]; error?: string };
        if (!inviteResponse.ok) throw new Error(invitePayload.error ?? "Unable to load invites.");
        setInvites(invitePayload.invites ?? []);
      } else {
        setTeachers([]);
        setInvites([]);
      }

      const communicationsResponse = responses[offset++];
      const communicationsPayload = await communicationsResponse.json() as {
        logs?: CommunicationLog[];
        preferences?: CommunicationPreference[];
        error?: string;
      };
      if (!communicationsResponse.ok) throw new Error(communicationsPayload.error ?? "Unable to load communications review.");
      setLogs(communicationsPayload.logs ?? []);
      setPreferences(communicationsPayload.preferences ?? []);

      const studentsResponse = responses[offset++];
      const studentsPayload = await studentsResponse.json() as { students?: ComplianceStudent[]; error?: string };
      if (!studentsResponse.ok) throw new Error(studentsPayload.error ?? "Unable to load compliance records.");
      setStudents(studentsPayload.students ?? []);

      const safeguardingResponse = responses[offset++];
      const safeguardingPayload = await safeguardingResponse.json() as { incidents?: SafeguardingIncident[]; error?: string };
      if (!safeguardingResponse.ok) throw new Error(safeguardingPayload.error ?? "Unable to load safeguarding incidents.");
      setIncidents(safeguardingPayload.incidents ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load governance workspace.");
    } finally {
      setLoading(false);
    }
  }, [canManageInvites, schoolId, teacherStatusFilter]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadAll();
    });
  }, [loadAll]);

  async function onInviteAction(inviteId: string, action: "resend" | "revoke") {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/school/invites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ schoolId, inviteId, action }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `Unable to ${action} invite.`);
      setMessage(action === "resend" ? "Invite resent." : "Invite revoked.");
      await loadAll();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update invite.");
    } finally {
      setSaving(false);
    }
  }

  async function onTeacherAction(teacher: ManagedTeacher, action: ManageTeacherAction, role?: EditableTeacherRole) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/school/teachers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ schoolId, teacherId: teacher.id, action, role }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `Unable to ${action} teacher.`);

      if (action === "changeRole") {
        setMessage(`Updated role for ${teacher.user.name ?? teacher.user.email}.`);
      } else if (action === "suspend") {
        setMessage(`Suspended ${teacher.user.name ?? teacher.user.email}.`);
      } else {
        setMessage(`Reactivated ${teacher.user.name ?? teacher.user.email}.`);
      }

      await loadAll();
    } catch (teacherError) {
      setError(teacherError instanceof Error ? teacherError.message : "Unable to update teacher.");
    } finally {
      setSaving(false);
    }
  }

  async function onExportStudent(student: ComplianceStudent) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/school/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "exportStudentData", schoolId, schoolStudentId: student.id }),
      });
      const payload = await response.json() as Record<string, unknown> & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to export student data.");

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `${student.childName.replace(/\s+/g, "-").toLowerCase()}-export.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
      setMessage(`Exported ${student.childName}.`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Unable to export student data.");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteStudent(student: ComplianceStudent) {
    const reason = window.prompt(`Why are you requesting deletion for ${student.childName}?`);
    if (!reason) return;

    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/school/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "requestDeleteStudentData",
          schoolId,
          schoolStudentId: student.id,
          reason,
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to request deletion.");
      setMessage(`Deletion workflow requested for ${student.childName}.`);
      await loadAll();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to request deletion.");
    } finally {
      setSaving(false);
    }
  }

  async function onEvidenceUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("schoolId", schoolId);

    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/school/safeguarding/upload", {
        method: "POST",
        credentials: "include",
        body: data,
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to upload evidence.");
      setMessage("Evidence uploaded.");
      form.reset();
      await loadAll();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload evidence.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-800 bg-linear-to-br from-slate-950 via-slate-950 to-cyan-950/40 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Governance</p>
        <h1 className="mt-2 text-3xl font-black text-white">{schoolName}</h1>
        <p className="mt-2 text-sm text-slate-300">
          Review invites, parent communications, compliance actions, and live safeguarding evidence in one governance workspace.
        </p>
      </section>

      {loading ? <p className="text-sm text-slate-400">Loading governance workspace...</p> : null}
      {error ? <p className="rounded-2xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
      {message ? <p className="rounded-2xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}

      {canManageInvites ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black text-white">Teacher Management</h2>
              <p className="text-sm text-slate-400">Filter staff, update roles, and suspend or reactivate school members.</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400" htmlFor="teacher-status-filter">Status</label>
              <select
                id="teacher-status-filter"
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                value={teacherStatusFilter}
                onChange={(event) => setTeacherStatusFilter(event.target.value as TeacherStatusFilter)}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="invited">Invited</option>
                <option value="suspended">Suspended</option>
                <option value="archived">Archived</option>
              </select>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">{teachers.length} staff</span>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {teachers.map((teacher) => {
              const draftRole = roleDrafts[teacher.id] ?? (teacher.role === "owner" ? "admin" : teacher.role);
              const roleChanged = teacher.role !== "owner" && draftRole !== teacher.role;
              const canMutate = !teacher.isCurrentActor && teacher.role !== "owner";
              return (
                <article key={teacher.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-white">{teacher.user.name ?? teacher.user.email}</p>
                        <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${statusBadgeClass(teacher.status)}`}>
                          {teacher.status}
                        </span>
                        {teacher.isCurrentActor ? <span className="text-[11px] text-slate-400">You</span> : null}
                      </div>
                      <p className="text-xs text-slate-400">{teacher.user.email} • {roleLabel(teacher.role)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Joined {fmtDate(teacher.createdAt)} • Last active {fmtDate(teacher.lastActiveAt)} • Classrooms {teacher.classrooms.length}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={draftRole}
                        disabled={!canMutate || saving}
                        onChange={(event) => {
                          const value = event.target.value as EditableTeacherRole;
                          setRoleDrafts((previous) => ({ ...previous, [teacher.id]: value }));
                        }}
                        className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white disabled:opacity-50"
                      >
                        <option value="admin">School Admin</option>
                        <option value="teacher">Teacher</option>
                        <option value="support">Support Staff</option>
                        <option value="staff_observer">Staff Observer</option>
                        <option value="finance">Finance</option>
                      </select>

                      <button
                        type="button"
                        disabled={!canMutate || !roleChanged || saving}
                        onClick={() => void onTeacherAction(teacher, "changeRole", draftRole)}
                        className="rounded-xl border border-cyan-500/60 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-500/10 disabled:opacity-50"
                      >
                        Save Role
                      </button>

                      <button
                        type="button"
                        disabled={!canMutate || saving || teacher.status === "suspended"}
                        onClick={() => void onTeacherAction(teacher, "suspend")}
                        className="rounded-xl border border-amber-500/60 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-amber-500/10 disabled:opacity-50"
                      >
                        Suspend
                      </button>

                      <button
                        type="button"
                        disabled={!canMutate || saving || teacher.status === "active"}
                        onClick={() => void onTeacherAction(teacher, "reactivate")}
                        className="rounded-xl border border-emerald-500/60 px-3 py-2 text-xs font-bold text-emerald-100 hover:bg-emerald-500/10 disabled:opacity-50"
                      >
                        Reactivate
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}

            {teachers.length === 0 ? <p className="text-sm text-slate-400">No teachers matched this status.</p> : null}
          </div>
        </section>
      ) : null}

      {canManageInvites ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-white">Invite Controls</h2>
              <p className="text-sm text-slate-400">Pending school invites can be resent or revoked without leaving the teacher portal.</p>
            </div>
            <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">{invites.length} pending</span>
          </div>

          <div className="mt-4 grid gap-3">
            {invites.map((invite) => (
              <article key={invite.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-bold text-white">{invite.targetEmail}</p>
                    <p className="text-xs text-slate-400">
                      {invite.targetRole ?? invite.inviteType} • expires {fmtDate(invite.expiresAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void onInviteAction(invite.id, "resend")}
                      className="rounded-xl border border-cyan-500/60 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-500/10 disabled:opacity-50"
                    >
                      Resend
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void onInviteAction(invite.id, "revoke")}
                      className="rounded-xl border border-rose-500/60 px-3 py-2 text-xs font-bold text-rose-100 hover:bg-rose-500/10 disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {invites.length === 0 ? <p className="text-sm text-slate-400">No active invites.</p> : null}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
        <h2 className="text-xl font-black text-white">Parent Communication Review</h2>
        <p className="text-sm text-slate-400">Delivery history, consent state, opt-outs, and safeguarding locks are now backed by dedicated records.</p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            {preferences.map((entry) => (
              <article key={entry.linkId} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="font-bold text-white">{entry.student.name}</p>
                <p className="text-xs text-slate-400">{entry.parent.name ?? entry.parent.email}</p>
                <p className="mt-2 text-xs text-slate-300">
                  Consent: {entry.consentGivenAt ? fmtDate(entry.consentGivenAt) : "missing"} • Opt-out: {entry.optedOutAt ? fmtDate(entry.optedOutAt) : "active"}
                </p>
                <p className="text-xs text-slate-300">
                  Safeguarding lock: {entry.safeguardingLockedAt ? fmtDate(entry.safeguardingLockedAt) : "none"}
                </p>
                {entry.optOutReason ? <p className="mt-2 text-xs text-amber-200">Reason: {entry.optOutReason}</p> : null}
                {entry.safeguardingLockReason ? <p className="mt-1 text-xs text-rose-200">Lock: {entry.safeguardingLockReason}</p> : null}
              </article>
            ))}
            {preferences.length === 0 ? <p className="text-sm text-slate-400">No parent communication records yet.</p> : null}
          </div>

          <div className="space-y-3">
            {logs.slice(0, 12).map((log) => (
              <article key={log.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-white">{log.subject}</p>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${log.deliveryStatus === "sent" ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"}`}>
                    {log.deliveryStatus}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{log.parent.email} • {log.student.name}</p>
                <p className="mt-2 line-clamp-3 text-sm text-slate-300">{log.messageBody}</p>
                <p className="mt-2 text-xs text-slate-500">{fmtDate(log.createdAt)} • {log.actor?.name ?? log.actor?.email ?? "system"}</p>
              </article>
            ))}
            {logs.length === 0 ? <p className="text-sm text-slate-400">No outbound communication logs yet.</p> : null}
          </div>
        </div>
      </section>

      {canManageCompliance ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <h2 className="text-xl font-black text-white">Compliance Actions</h2>
          <p className="text-sm text-slate-400">Export data packages or start deletion workflows for enrolled learners.</p>

          <div className="mt-4 grid gap-3">
            {students.map((student) => (
              <article key={student.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-bold text-white">{student.childName}</p>
                    <p className="text-xs text-slate-400">{student.classroom?.name ?? "No classroom"} • {student.status} • updated {fmtDate(student.updatedAt)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void onExportStudent(student)}
                      className="rounded-xl border border-cyan-500/60 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-500/10 disabled:opacity-50"
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      disabled={saving || student.status === "archived"}
                      onClick={() => void onDeleteStudent(student)}
                      className="rounded-xl border border-rose-500/60 px-3 py-2 text-xs font-bold text-rose-100 hover:bg-rose-500/10 disabled:opacity-50"
                    >
                      Delete Request
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {students.length === 0 ? <p className="text-sm text-slate-400">No school student records found.</p> : null}
          </div>
        </section>
      ) : null}

      {canManageSafeguarding ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <h2 className="text-xl font-black text-white">Safeguarding Evidence</h2>
          <p className="text-sm text-slate-400">Open incidents now hold first-class workflow events and file attachments.</p>

          <div className="mt-4 grid gap-4">
            {incidents.map((incident) => (
              <article key={incident.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="font-bold text-white">{incident.student?.name ?? "Unassigned student"}</p>
                    <p className="text-xs text-slate-400">{incident.category} • {incident.severity} • {incident.status}</p>
                    <p className="mt-2 text-sm text-slate-300">{incident.description}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-300">
                    {incident.evidenceAttachments.length} attachments • {incident.workflowEvents.length} events
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-3">
                    {incident.evidenceAttachments.map((attachment) => (
                      <div key={attachment.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                        <a href={attachment.publicUrl} target="_blank" rel="noreferrer" className="font-bold text-cyan-200 hover:text-cyan-100">
                          {attachment.label}
                        </a>
                        <p className="text-xs text-slate-400">{attachment.originalName} • {fmtDate(attachment.createdAt)}</p>
                        {attachment.note ? <p className="mt-1 text-xs text-slate-300">{attachment.note}</p> : null}
                      </div>
                    ))}
                    {incident.evidenceAttachments.length === 0 ? <p className="text-sm text-slate-400">No evidence files uploaded yet.</p> : null}
                  </div>

                  <form onSubmit={(event) => void onEvidenceUpload(event)} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                    <input type="hidden" name="incidentId" value={incident.id} />
                    <label className="block text-xs text-slate-400">
                      Label
                      <input name="label" required className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
                    </label>
                    <label className="block text-xs text-slate-400">
                      Note
                      <textarea name="note" rows={3} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
                    </label>
                    <label className="block text-xs text-slate-400">
                      Evidence File
                      <input name="file" required type="file" className="mt-1 block w-full text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-cyan-500/15 file:px-3 file:py-2 file:font-bold file:text-cyan-100" />
                    </label>
                    <button disabled={saving} className="w-full rounded-xl bg-cyan-500 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50">
                      Upload Evidence
                    </button>
                  </form>
                </div>
              </article>
            ))}
            {incidents.length === 0 ? <p className="text-sm text-slate-400">No open safeguarding incidents.</p> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
