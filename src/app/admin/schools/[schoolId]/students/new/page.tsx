"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import { postSchoolAction } from "@/components/admin/schools/school-actions";
import { useSchoolDashboardRecord } from "@/components/admin/schools/school-dashboard-data";

const YEAR_GROUP_OPTIONS = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6", "Year 7", "Year 8", "Year 9", "Year 10", "Year 11"];

function StudentEnrolForm({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const { school, refresh } = useSchoolDashboardRecord(schoolId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classrooms = useMemo(() => {
    return (school?.classrooms ?? [])
      .filter((row) => row.status === "active")
      .map((row) => ({
        id: row.id,
        label: `${row.name ?? "Class"}${row.yearGroup ? ` · ${row.yearGroup}` : ""}`,
      }));
  }, [school]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const classroomRaw = String(form.get("className") ?? "");
    setSaving(true);
    setError(null);
    const result = await postSchoolAction("enrolStudent", {
      schoolId,
      firstName: String(form.get("firstName") ?? "").trim(),
      lastName: String(form.get("lastName") ?? "").trim(),
      yearGroup: String(form.get("yearGroup") ?? "").trim(),
      classroomId: classroomRaw || null,
      guardianName: String(form.get("guardianName") ?? "").trim(),
      guardianEmail: String(form.get("guardianEmail") ?? "").trim(),
      sendSupport: form.get("sendSupport") === "on",
      safeguardingFlag: form.get("safeguardingFlag") === "on",
      baselineNotes: String(form.get("baselineNotes") ?? "").trim() || null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    refresh();
    router.push(`/admin/schools/${schoolId}/students`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-slate-300">
          First name
          <input required name="firstName" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-slate-300">
          Last name
          <input required name="lastName" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-slate-300">
          Year group
          <select required name="yearGroup" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value="">Select year group</option>
            {YEAR_GROUP_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-300">
          Class
          <select name="className" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value="">Unassigned</option>
            {classrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>{classroom.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-300">
          Parent/guardian name
          <input required name="guardianName" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-slate-300">
          Parent/guardian email
          <input required type="email" name="guardianEmail" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-200">
          <input type="checkbox" name="sendSupport" className="h-4 w-4" />
          SEND support flag
        </label>
        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-200">
          <input type="checkbox" name="safeguardingFlag" className="h-4 w-4" />
          Safeguarding flag
        </label>
      </div>

      <label className="text-xs text-slate-300">
        Learning baseline notes
        <textarea name="baselineNotes" rows={4} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="Add baseline attainment notes, strengths, and support focus." />
      </label>

      {classrooms.length === 0 ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          No classes yet. Enrol unassigned now, or{" "}
          <Link href={`/admin/schools/${schoolId}/classrooms/new`} className="font-semibold underline">create a class</Link> first.
        </p>
      ) : null}

      {error ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className="rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20 disabled:opacity-60">
          {saving ? "Saving..." : "Save Student"}
        </button>
        <Link href={`/admin/schools/${schoolId}/students`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Cancel</Link>
      </div>
    </form>
  );
}

export default function SchoolStudentNewPage() {
  const params = useParams<{ schoolId: string }>();
  const schoolId = params.schoolId;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="students"
      title="Enrol Student"
      subtitle="Create a student profile with guardian and learner support details."
    >
      <StudentEnrolForm schoolId={schoolId} />
    </SchoolDashboardShell>
  );
}
