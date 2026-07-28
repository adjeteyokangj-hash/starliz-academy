"use client";

import CollapsibleCard from "@/components/school-admin/CollapsibleCard";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Props = { schoolId: string; schoolName: string; studentId: string };

type Guardian = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  relationship: string | null;
  status: string;
  consentLabel: string;
  isPrimary: boolean;
};

type Detail = {
  id: string;
  status: string;
  externalRef: string | null;
  joinedAt: string;
  updatedAt: string;
  child: {
    name: string;
    yearGroup: string | null;
    dateOfBirth: string | null;
    senSupportNeeds: string | null;
    keyStage: string | null;
  };
  classroom: { id: string; name: string; teacherName: string | null } | null;
  guardians: Guardian[];
  recentBookings: Array<{ id: string; status: string; startsAt: string }>;
};

type ClassroomOption = { id: string; name: string };
type Invite = { id: string; targetEmail: string; expiresAt: string; status: string };
type Audit = { id: string; action: string; createdAt: string };

export default function SchoolStudentDetailClient({ schoolId, schoolName, studentId }: Props) {
  const [item, setItem] = useState<Detail | null>(null);
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([]);
  const [auditLogs, setAuditLogs] = useState<Audit[]>([]);
  const [classDraft, setClassDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; run: () => Promise<void> } | null>(null);
  const [inviteForm, setInviteForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    relationship: "parent",
    message: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/school/students/${encodeURIComponent(studentId)}?schoolId=${encodeURIComponent(schoolId)}`, {
        credentials: "include",
      });
      const payload = await res.json() as {
        item?: Detail;
        classrooms?: ClassroomOption[];
        pendingInvites?: Invite[];
        auditLogs?: Audit[];
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error ?? "Unable to load student.");
      setItem(payload.item ?? null);
      setClassrooms(payload.classrooms ?? []);
      setPendingInvites(payload.pendingInvites ?? []);
      setAuditLogs(payload.auditLogs ?? []);
      setClassDraft(payload.item?.classroom?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load student.");
    } finally {
      setLoading(false);
    }
  }, [schoolId, studentId]);

  useEffect(() => {
    queueMicrotask(() => { void load(); });
  }, [load]);

  async function patch(body: Record<string, unknown>, success: string) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/school/students/${encodeURIComponent(studentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ schoolId, ...body }),
      });
      const payload = await res.json() as { error?: string; inviteUrl?: string };
      if (!res.ok) throw new Error(payload.error ?? "Action failed.");
      setMessage(payload.inviteUrl ? `${success} Invite link ready.` : success);
      setConfirm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
      setConfirm(null);
    } finally {
      setSaving(false);
    }
  }

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    await patch({
      action: "inviteGuardian",
      guardianFirstName: inviteForm.firstName,
      guardianLastName: inviteForm.lastName,
      guardianEmail: inviteForm.email,
      relationship: inviteForm.relationship,
      message: inviteForm.message || null,
    }, "Guardian invited / linked.");
    setInviteForm({ firstName: "", lastName: "", email: "", relationship: "parent", message: "" });
  }

  if (loading) return <div className="p-10 text-sm text-foreground/50">Loading student…</div>;
  if (!item) {
    return (
      <div className="p-10">
        <p className="text-sm text-red-700">{error ?? "Student not found."}</p>
        <Link href="/school-admin/day-school/students" className="mt-3 inline-block text-sm text-primary underline">Back</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-10">
      <nav className="mb-4 text-sm text-foreground/50">
        <Link href="/school-admin/day-school/students" className="hover:text-foreground">Students</Link>
        {" / "}
        <span className="font-medium text-foreground">{item.child.name}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{item.child.name}</h1>
          <p className="mt-1 text-sm text-foreground/60">{schoolName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/school-admin/day-school/students/${studentId}/edit`} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">Edit</Link>
          {item.status === "active" ? (
            <>
              <button type="button" className="rounded-xl border border-border px-4 py-2 text-sm" disabled={saving} onClick={() => setConfirm({
                title: `Archive ${item.child.name}?`,
                body: "Archiving preserves lessons, attendance, bookings, guardians, and audit history. The student account is not deleted.",
                run: () => patch({ action: "archive" }, "Student archived."),
              })}>Archive</button>
              <button type="button" className="rounded-xl border border-border px-4 py-2 text-sm" disabled={saving} onClick={() => setConfirm({
                title: `Transfer out ${item.child.name}?`,
                body: "Marks the student as transferred while preserving school history.",
                run: () => patch({ action: "transfer" }, "Student transferred out."),
              })}>Transfer out</button>
            </>
          ) : (
            <button type="button" className="rounded-xl border border-border px-4 py-2 text-sm" disabled={saving} onClick={() => void patch({ action: "reactivate" }, "Student reactivated.")}>Reactivate</button>
          )}
        </div>
      </div>

      {message ? <div className="mb-4 rounded-xl border border-emerald-600/20 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div> : null}
      {error ? <div className="mb-4 rounded-xl border border-red-600/20 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}

      <CollapsibleCard title="Student summary" className="mb-6" bodyClassName="grid gap-3 p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><span className="text-foreground/55">Year group</span><div className="font-medium">{item.child.yearGroup ?? "—"}</div></div>
        <div><span className="text-foreground/55">Key stage</span><div className="font-medium">{item.child.keyStage ?? "—"}</div></div>
        <div><span className="text-foreground/55">Status</span><div className="font-medium capitalize">{item.status}</div></div>
        <div><span className="text-foreground/55">Class</span><div className="font-medium">{item.classroom?.name ?? "Unassigned"}</div></div>
        <div><span className="text-foreground/55">Teacher</span><div className="font-medium">{item.classroom?.teacherName ?? "—"}</div></div>
        <div><span className="text-foreground/55">Reference</span><div className="font-medium">{item.externalRef ?? "—"}</div></div>
        <div><span className="text-foreground/55">Date of birth</span><div className="font-medium">{item.child.dateOfBirth ? new Date(item.child.dateOfBirth).toLocaleDateString() : "—"}</div></div>
        <div><span className="text-foreground/55">Enrolled</span><div className="font-medium">{new Date(item.joinedAt).toLocaleDateString()}</div></div>
        <div><span className="text-foreground/55">Preferred name</span><div className="font-medium text-foreground/45">Not in schema</div></div>
      </CollapsibleCard>

      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        <Link href="/school-admin/day-school/timetable" className="rounded-lg border border-border px-3 py-2 font-medium">Timetable</Link>
        <Link href="/school-admin/day-school/lessons" className="rounded-lg border border-border px-3 py-2 font-medium">Lessons</Link>
        <Link href="/school-admin/day-school/attendance" className="rounded-lg border border-border px-3 py-2 font-medium">Attendance</Link>
        <Link href="/school-admin/day-school/reports" className="rounded-lg border border-border px-3 py-2 font-medium">Reports</Link>
        <Link href="/school-admin/day-school/classes" className="rounded-lg border border-border px-3 py-2 font-medium">Classes</Link>
      </div>

      <CollapsibleCard title="Class assignment" className="mb-6" bodyClassName="p-5">
        <div className="flex flex-wrap gap-2">
          <select value={classDraft} onChange={(e) => setClassDraft(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="">Unassigned</option>
            {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="button" disabled={saving} className="rounded-lg border border-border px-3 py-2 text-sm" onClick={() => void patch(
            classDraft ? { action: "assignClass", classroomId: classDraft } : { action: "removeClass" },
            classDraft ? "Class assigned." : "Removed from class.",
          )}>
            {classDraft ? "Assign class" : "Remove from class"}
          </button>
        </div>
      </CollapsibleCard>

      <CollapsibleCard id="guardians" title="Guardians" count={item.guardians.length} className="mb-6" bodyClassName="p-5">
        {item.guardians.length === 0 ? (
          <p className="mb-4 text-sm text-foreground/50">No guardians linked</p>
        ) : (
          <ul className="mb-4 divide-y divide-border text-sm">
            {item.guardians.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="font-medium">
                    {g.name ?? g.email}
                    {g.isPrimary ? <span className="ml-2 text-xs text-foreground/45">(primary)</span> : null}
                  </div>
                  <div className="text-xs text-foreground/55">
                    {g.email} · {g.relationship ?? "—"} · {g.consentLabel} · {g.status}
                    {g.phone ? ` · ${g.phone}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!g.isPrimary ? (
                    <button type="button" disabled={saving} className="rounded-lg border border-border px-2 py-1 text-xs" onClick={() => void patch({ action: "setPrimaryGuardian", linkId: g.id }, "Primary guardian updated.")}>Set primary</button>
                  ) : null}
                  <button type="button" disabled={saving} className="rounded-lg border border-border px-2 py-1 text-xs" onClick={() => void patch({ action: "recordConsent", linkId: g.id, consented: true }, "Consent recorded.")}>Record consent</button>
                  {g.status === "suspended" ? (
                    <button type="button" disabled={saving} className="rounded-lg border border-border px-2 py-1 text-xs" onClick={() => void patch({ action: "reactivateGuardian", linkId: g.id }, "Guardian link reactivated.")}>Reactivate</button>
                  ) : (
                    <button type="button" disabled={saving} className="rounded-lg border border-border px-2 py-1 text-xs" onClick={() => void patch({ action: "suspendGuardian", linkId: g.id }, "Guardian link suspended.")}>Suspend</button>
                  )}
                  <button type="button" disabled={saving} className="rounded-lg border border-border px-2 py-1 text-xs" onClick={() => setConfirm({
                    title: "Remove guardian link?",
                    body: "Removes the school link only. The parent account is preserved and can still have other children.",
                    run: () => patch({ action: "removeGuardian", linkId: g.id }, "Guardian unlinked."),
                  })}>Remove link</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {pendingInvites.length > 0 ? (
          <div className="mb-4 rounded-xl border border-border bg-muted/20 p-3 text-sm">
            <h3 className="mb-2 font-semibold">Pending invitations</h3>
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span>{inv.targetEmail} · expires {new Date(inv.expiresAt).toLocaleDateString()}</span>
                <button type="button" disabled={saving} className="rounded-lg border border-border px-2 py-1 text-xs" onClick={() => void patch({ action: "resendGuardianInvite", inviteId: inv.id }, "Invite resent.")}>Resend</button>
              </div>
            ))}
          </div>
        ) : null}

        <form onSubmit={(e) => void onInvite(e)} className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2">
          <h3 className="sm:col-span-2 text-sm font-semibold">Invite / link guardian</h3>
          <input required placeholder="First name" value={inviteForm.firstName} onChange={(e) => setInviteForm((p) => ({ ...p, firstName: e.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <input required placeholder="Last name" value={inviteForm.lastName} onChange={(e) => setInviteForm((p) => ({ ...p, lastName: e.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <input required type="email" placeholder="Email" value={inviteForm.email} onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-2" />
          <select value={inviteForm.relationship} onChange={(e) => setInviteForm((p) => ({ ...p, relationship: e.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="parent">Parent</option>
            <option value="guardian">Guardian</option>
            <option value="carer">Carer</option>
            <option value="other">Other</option>
          </select>
          <input placeholder="Optional message" value={inviteForm.message} onChange={(e) => setInviteForm((p) => ({ ...p, message: e.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <button type="submit" disabled={saving} className="sm:col-span-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            Invite or link guardian
          </button>
        </form>
      </CollapsibleCard>

      <CollapsibleCard title="Short Learning" count={item.recentBookings.length} className="mb-6" bodyClassName="p-5">
        {item.recentBookings.length === 0 ? (
          <p className="text-sm text-foreground/50">No recent bookings.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {item.recentBookings.map((b) => (
              <li key={b.id} className="rounded-lg border border-border px-3 py-2">
                {new Date(b.startsAt).toLocaleString()} · {b.status}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleCard>

      <CollapsibleCard title="Recent events" count={auditLogs.length} bodyClassName="p-5">
        {auditLogs.length === 0 ? (
          <p className="text-sm text-foreground/50">No recent events.</p>
        ) : (
          <ul className="space-y-2 text-xs text-foreground/70">
            {auditLogs.map((log) => (
              <li key={log.id} className="rounded-lg border border-border px-3 py-2">
                <div className="font-medium text-foreground">{log.action}</div>
                <div>{new Date(log.createdAt).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleCard>

      {confirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
            <h3 className="text-lg font-semibold">{confirm.title}</h3>
            <p className="mt-2 text-sm text-foreground/70">{confirm.body}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="rounded-xl border border-border px-4 py-2 text-sm" onClick={() => setConfirm(null)}>Cancel</button>
              <button type="button" disabled={saving} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" onClick={() => void confirm.run()}>Confirm</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}