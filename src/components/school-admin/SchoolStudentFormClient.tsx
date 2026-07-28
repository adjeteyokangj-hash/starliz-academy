"use client";

import CollapsibleCard from "@/components/school-admin/CollapsibleCard";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { YEAR_GROUPS } from "@/lib/curriculum";

type Props = {
  schoolId: string;
  schoolName: string;
  mode: "create" | "edit";
  studentId?: string;
};

type ClassroomOption = { id: string; name: string; yearGroup: string | null };
type YearChangeRow = {
  id: string;
  fromYearGroup: string | null;
  toYearGroup: string;
  reason: string;
  createdAt: string;
};

export default function SchoolStudentFormClient({ schoolId, schoolName, mode, studentId }: Props) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [yearGroup, setYearGroup] = useState("Year 5");
  const [classroomId, setClassroomId] = useState("");
  const [externalRef, setExternalRef] = useState("");
  const [holdBackFromPromotion, setHoldBackFromPromotion] = useState(false);
  const [yearChanges, setYearChanges] = useState<YearChangeRow[]>([]);
  const [guardianFirstName, setGuardianFirstName] = useState("");
  const [guardianLastName, setGuardianLastName] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [relationship, setRelationship] = useState("parent");
  const [message, setMessage] = useState("");
  const [sendInvite, setSendInvite] = useState(true);
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    queueMicrotask(() => {
      void (async () => {
        try {
          if (mode === "edit" && studentId) {
            const res = await fetch(`/api/school/students/${encodeURIComponent(studentId)}?schoolId=${encodeURIComponent(schoolId)}`, { credentials: "include" });
            const payload = await res.json() as {
              item?: {
                child: { name: string; yearGroup: string | null };
                classroom: { id: string } | null;
                externalRef: string | null;
                holdBackFromPromotion?: boolean;
              };
              classrooms?: ClassroomOption[];
              yearChanges?: YearChangeRow[];
              error?: string;
            };
            if (!res.ok) throw new Error(payload.error ?? "Unable to load student.");
            const parts = (payload.item?.child.name ?? "").split(/\s+/);
            setFirstName(parts[0] ?? "");
            setLastName(parts.slice(1).join(" "));
            setYearGroup(payload.item?.child.yearGroup ?? "Year 5");
            setClassroomId(payload.item?.classroom?.id ?? "");
            setExternalRef(payload.item?.externalRef ?? "");
            setHoldBackFromPromotion(Boolean(payload.item?.holdBackFromPromotion));
            setYearChanges(payload.yearChanges ?? []);
            setClassrooms(payload.classrooms ?? []);
          } else {
            const res = await fetch(`/api/school/classrooms?schoolId=${encodeURIComponent(schoolId)}&status=active`, { credentials: "include" });
            const payload = await res.json() as { classrooms?: ClassroomOption[]; error?: string };
            if (!res.ok) throw new Error(payload.error ?? "Unable to load classes.");
            setClassrooms(payload.classrooms ?? []);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Unable to load form.");
        } finally {
          setLoading(false);
        }
      })();
    });
  }, [mode, studentId, schoolId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (mode === "create") {
        const res = await fetch("/api/school/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            schoolId,
            firstName,
            lastName,
            yearGroup,
            classroomId: classroomId || null,
            externalRef: externalRef || null,
            guardianFirstName,
            guardianLastName,
            guardianEmail,
            relationship,
            message: message || null,
            sendInvite,
          }),
        });
        const payload = await res.json() as { schoolStudentId?: string; error?: string };
        if (!res.ok) throw new Error(payload.error ?? "Unable to create student.");
        router.push(`/school-admin/day-school/students/${payload.schoolStudentId}`);
        return;
      }
      const res = await fetch(`/api/school/students/${encodeURIComponent(studentId!)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          schoolId,
          action: "update",
          name: `${firstName} ${lastName}`.trim(),
          yearGroup,
          classroomId: classroomId || null,
          externalRef: externalRef || null,
          holdBackFromPromotion,
        }),
      });
      const payload = await res.json() as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Unable to update student.");
      router.push(`/school-admin/day-school/students/${studentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      setSaving(false);
    }
  }

  async function onEarlyPromote() {
    if (!studentId) return;
    if (!window.confirm(`Early-promote ${firstName} to the next year group now?`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/school/students/${encodeURIComponent(studentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ schoolId, action: "earlyPromote" }),
      });
      const payload = await res.json() as { to?: string; error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Unable to early-promote.");
      if (payload.to) setYearGroup(payload.to);
      setHoldBackFromPromotion(false);
      const reload = await fetch(
        `/api/school/students/${encodeURIComponent(studentId)}?schoolId=${encodeURIComponent(schoolId)}`,
        { credentials: "include" },
      );
      const reloadPayload = await reload.json() as { yearChanges?: YearChangeRow[] };
      setYearChanges(reloadPayload.yearChanges ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Early promote failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-10 text-sm text-foreground/50">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-10">
      <nav className="mb-4 text-sm text-foreground/50">
        <Link href="/school-admin/day-school/students" className="hover:text-foreground">Students</Link>
        {" / "}
        <span className="font-medium text-foreground">{mode === "create" ? "Add" : "Edit"}</span>
      </nav>
      <h1 className="text-2xl font-bold">{mode === "create" ? "Add student" : "Edit student"}</h1>
      <p className="mt-1 text-sm text-foreground/60">{schoolName}</p>
      {error ? <div className="mt-4 rounded-xl border border-red-600/20 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}

      <CollapsibleCard title={mode === "create" ? "Add student" : "Edit student"} className="mt-6" bodyClassName="p-6">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">First name</label>
            <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Last name</label>
            <input required value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
          </div>
        </div>
        <p className="text-xs text-foreground/50">Preferred name is not in the current student schema.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Year group (official)</label>
            <select required value={yearGroup} onChange={(e) => setYearGroup(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
              {YEAR_GROUPS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-foreground/50">
              Managed by school academic-year rollover unless you override here.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Class</label>
            <select value={classroomId} onChange={(e) => setClassroomId(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
              <option value="">Unassigned</option>
              {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Student reference (optional)</label>
          <input value={externalRef} onChange={(e) => setExternalRef(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        </div>

        {mode === "edit" ? (
          <div className="space-y-3 rounded-xl border border-border bg-muted/10 p-4">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={holdBackFromPromotion}
                onChange={(e) => setHoldBackFromPromotion(e.target.checked)}
              />
              <span>
                Hold back from next academic-year promotion
                <span className="mt-0.5 block text-xs text-foreground/55">
                  Student keeps their current official year when the school applies rollover.
                </span>
              </span>
            </label>
            <button
              type="button"
              disabled={saving || holdBackFromPromotion}
              onClick={() => void onEarlyPromote()}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Early promote one year
            </button>
            {yearChanges.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/55">Year-change history</p>
                <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-foreground/70">
                  {yearChanges.map((row) => (
                    <li key={row.id}>
                      {new Date(row.createdAt).toLocaleString("en-GB")}: {row.fromYearGroup ?? "—"} → {row.toYearGroup} ({row.reason})
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {mode === "create" ? (
          <CollapsibleCard title="First guardian (required)" bodyClassName="space-y-4 p-4" className="border-border bg-muted/10">
            <p className="text-xs text-foreground/55">
              Child profiles require a parent account. You can add more guardians after enrolment.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Guardian first name</label>
                <input required value={guardianFirstName} onChange={(e) => setGuardianFirstName(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Guardian last name</label>
                <input required value={guardianLastName} onChange={(e) => setGuardianLastName(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Guardian email</label>
              <input required type="email" value={guardianEmail} onChange={(e) => setGuardianEmail(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Relationship</label>
              <select value={relationship} onChange={(e) => setRelationship(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                <option value="parent">Parent</option>
                <option value="guardian">Guardian</option>
                <option value="carer">Carer</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Optional message</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} />
              Send activation invite (no permanent password shown)
            </label>
          </CollapsibleCard>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={saving} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {mode === "create" ? "Create student" : "Save changes"}
          </button>
          <Link href={studentId ? `/school-admin/day-school/students/${studentId}` : "/school-admin/day-school/students"} className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold">
            Cancel
          </Link>
        </div>
      </form>
      </CollapsibleCard>
    </div>
  );
}
