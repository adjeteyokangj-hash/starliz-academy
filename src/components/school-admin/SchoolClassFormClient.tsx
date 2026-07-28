"use client";

import CollapsibleCard from "@/components/school-admin/CollapsibleCard";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { YEAR_GROUPS } from "@/lib/curriculum";
import { isEligibleClassroomTeacherRole } from "@/lib/schools/classroom-eligibility";

type Props = {
  schoolId: string;
  schoolName: string;
  mode: "create" | "edit";
  classId?: string;
};

type TeacherOption = {
  id: string;
  role: string;
  user: { name: string | null; email: string };
};

export default function SchoolClassFormClient({ schoolId, schoolName, mode, classId }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [yearGroup, setYearGroup] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(mode === "edit");

  useEffect(() => {
    queueMicrotask(() => {
      void (async () => {
        try {
          if (mode === "edit" && classId) {
            const res = await fetch(
              `/api/school/classrooms/${encodeURIComponent(classId)}?schoolId=${encodeURIComponent(schoolId)}`,
              { credentials: "include" },
            );
            const payload = await res.json() as {
              item?: {
                name: string;
                yearGroup: string | null;
                academicYear: string | null;
                teacherId: string | null;
              };
              eligibleTeachers?: TeacherOption[];
              error?: string;
            };
            if (!res.ok) throw new Error(payload.error ?? "Unable to load class.");
            setName(payload.item?.name ?? "");
            setYearGroup(payload.item?.yearGroup ?? "");
            setAcademicYear(payload.item?.academicYear ?? "");
            setTeacherId(payload.item?.teacherId ?? "");
            setTeachers(payload.eligibleTeachers ?? []);
          } else {
            const res = await fetch(
              `/api/school/teachers?schoolId=${encodeURIComponent(schoolId)}&status=active`,
              { credentials: "include" },
            );
            const payload = await res.json() as {
              teachers?: Array<{ id: string; role: string; status: string; user: { name: string | null; email: string } }>;
              error?: string;
            };
            if (!res.ok) throw new Error(payload.error ?? "Unable to load teachers.");
            setTeachers(
              (payload.teachers ?? [])
                .filter((t) => t.status === "active" && isEligibleClassroomTeacherRole(t.role))
                .map((t) => ({ id: t.id, role: t.role, user: t.user })),
            );
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Unable to load form.");
        } finally {
          setLoading(false);
        }
      })();
    });
  }, [mode, classId, schoolId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (mode === "create") {
        const res = await fetch("/api/school/classrooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            schoolId,
            name: name.trim(),
            yearGroup: yearGroup || null,
            academicYear: academicYear.trim() || null,
            teacherId: teacherId || null,
          }),
        });
        const payload = await res.json() as { item?: { id: string }; error?: string };
        if (!res.ok) throw new Error(payload.error ?? "Unable to create class.");
        router.push(`/school-admin/day-school/classes/${payload.item!.id}`);
        return;
      }
      const res = await fetch(`/api/school/classrooms/${encodeURIComponent(classId!)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          schoolId,
          action: "update",
          name: name.trim(),
          yearGroup: yearGroup || null,
          academicYear: academicYear.trim() || null,
          teacherId: teacherId || null,
        }),
      });
      const payload = await res.json() as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Unable to update class.");
      router.push(`/school-admin/day-school/classes/${classId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-10 text-sm text-foreground/50">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-10">
      <nav className="mb-4 text-sm text-foreground/50">
        <Link href="/school-admin/day-school/classes" className="hover:text-foreground">Classes</Link>
        {" / "}
        <span className="font-medium text-foreground">{mode === "create" ? "Create" : "Edit"}</span>
      </nav>
      <h1 className="text-2xl font-bold text-foreground">
        {mode === "create" ? "Create class" : "Edit class"}
      </h1>
      <p className="mt-1 text-sm text-foreground/60">{schoolName}</p>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-600/20 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      ) : null}

      <CollapsibleCard title={mode === "create" ? "Create class" : "Edit class"} className="mt-6" bodyClassName="p-6">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium">Class name</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Year group</label>
            <select value={yearGroup} onChange={(e) => setYearGroup(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
              <option value="">Not set</option>
              {YEAR_GROUPS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Academic year</label>
            <input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="e.g. 2026-2027" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Primary teacher</label>
          <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
            <option value="">Unassigned</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.user.name ?? t.user.email} ({t.role})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-foreground/55">
            Only active Owner, School Admin, or Teacher memberships can be assigned. Tutor / Support is not a Day School classroom teacher by default.
          </p>
        </div>
        <p className="text-xs text-foreground/50">
          Additional teachers and capacity are not supported by the current classroom model.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" disabled={saving} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {mode === "create" ? "Create class" : "Save changes"}
          </button>
          <Link href={classId ? `/school-admin/day-school/classes/${classId}` : "/school-admin/day-school/classes"} className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold">
            Cancel
          </Link>
        </div>
      </form>
      </CollapsibleCard>
    </div>
  );
}