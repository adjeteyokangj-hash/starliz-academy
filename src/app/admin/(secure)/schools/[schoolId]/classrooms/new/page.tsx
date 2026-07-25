"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import { postSchoolAction } from "@/components/admin/schools/school-actions";
import { useSchoolDashboardRecord } from "@/components/admin/schools/school-dashboard-data";

const YEAR_GROUP_OPTIONS = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6", "Year 7", "Year 8", "Year 9", "Year 10", "Year 11"];

function ClassroomNewForm({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const { school, refresh } = useSchoolDashboardRecord(schoolId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teachers = useMemo(() => {
    return (school?.teachers ?? [])
      .filter((row) => row.status === "active" || row.status === "invited")
      .map((row) => ({
        id: row.id,
        label: row.name?.trim() || row.email || "Teacher",
      }));
  }, [school]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const teacherRaw = String(form.get("classTeacher") ?? "");
    setSaving(true);
    setError(null);
    const result = await postSchoolAction("createClassroom", {
      schoolId,
      name: String(form.get("className") ?? "").trim(),
      yearGroup: String(form.get("yearGroup") ?? "").trim(),
      teacherId: teacherRaw && teacherRaw !== "unassigned" ? teacherRaw : null,
      status: "active",
      academicYear: new Date().getFullYear() + "/" + String(new Date().getFullYear() + 1).slice(-2),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    refresh();
    router.push(`/admin/schools/${schoolId}/classrooms`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-slate-300">
          Class name
          <input required name="className" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-slate-300">
          Year group
          <select required name="yearGroup" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value="">Select year group</option>
            {YEAR_GROUP_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-300">
          Class teacher
          <select name="classTeacher" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value="unassigned">Unassigned</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>{teacher.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-300">
          Room/location
          <input name="location" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="Room 12 / Upper Hall (stored in notes later)" />
        </label>
      </div>

      {teachers.length === 0 ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          No teachers invited yet. You can create the class unassigned, then{" "}
          <Link href={`/admin/schools/${schoolId}/staff/new?role=teacher`} className="font-semibold underline">invite a teacher</Link>.
        </p>
      ) : null}

      {error ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className="rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20 disabled:opacity-60">
          {saving ? "Creating..." : "Create Class"}
        </button>
        <Link href={`/admin/schools/${schoolId}/classrooms`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Cancel</Link>
      </div>
    </form>
  );
}

export default function SchoolClassroomNewPage() {
  const params = useParams<{ schoolId: string }>();
  const schoolId = params.schoolId;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="classrooms"
      title="Create Class"
      subtitle="Set up a class with staffing and year group."
    >
      <ClassroomNewForm schoolId={schoolId} />
    </SchoolDashboardShell>
  );
}
