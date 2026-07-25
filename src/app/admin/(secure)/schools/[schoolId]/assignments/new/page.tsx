"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import { postSchoolAction } from "@/components/admin/schools/school-actions";
import { useSchoolDashboardRecord } from "@/components/admin/schools/school-dashboard-data";

const SUBJECT_OPTIONS = ["English", "Spelling", "Reading", "Maths", "Science"];
const KEY_STAGE_OPTIONS = ["EYFS", "KS1", "KS2", "KS3", "KS4"];
const YEAR_GROUP_OPTIONS = ["Reception", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6", "Year 7", "Year 8", "Year 9", "Year 10", "Year 11"];
const LESSON_TYPES = ["Core lesson", "Intervention", "Revision", "Assessment prep", "Homework"];
const DAY_OPTIONS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
];

function schoolDayOfWeek(date = new Date()): number {
  const day = date.getDay();
  if (day === 0 || day === 6) return 1;
  return day;
}

function AssignmentNewForm({ schoolId }: { schoolId: string }) {
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
        yearGroup: row.yearGroup ?? "",
        teacherId: row.teacherId ?? "",
      }));
  }, [school]);

  const teachers = useMemo(() => {
    return (school?.teachers ?? [])
      .filter((row) => row.status === "active" || row.status === "invited")
      .map((row) => ({
        id: row.id,
        label: row.name?.trim() || row.email || "Tutor",
      }));
  }, [school]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const classroomId = String(form.get("classroomId") ?? "").trim() || null;
    const teacherId = String(form.get("teacherId") ?? "").trim() || null;
    const dayRaw = String(form.get("dayOfWeek") ?? "");
    setSaving(true);
    setError(null);
    const result = await postSchoolAction("assignSchoolLesson", {
      schoolId,
      subject: String(form.get("subject") ?? "").trim(),
      keyStage: String(form.get("keyStage") ?? "").trim() || null,
      yearGroup: String(form.get("yearGroup") ?? "").trim(),
      classroomId,
      teacherId,
      skillFocus: String(form.get("skillFocus") ?? "").trim(),
      lessonType: String(form.get("lessonType") ?? "").trim(),
      dayOfWeek: dayRaw ? Number(dayRaw) : schoolDayOfWeek(),
      dueDate: String(form.get("dueDate") ?? "").trim() || null,
      room: String(form.get("room") ?? "").trim() || null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    refresh();
    router.push(`/admin/schools/${schoolId}/timetable`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-slate-300">
          Subject
          <select required name="subject" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value="">Select subject</option>
            {SUBJECT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-300">
          Key stage
          <select required name="keyStage" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value="">Select key stage</option>
            {KEY_STAGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
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
          <select name="classroomId" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value="">Whole school / unassigned</option>
            {classrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>{classroom.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-300">
          Tutor
          <select name="teacherId" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value="">Class teacher / unassigned</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>{teacher.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-300">
          Weekday
          <select name="dayOfWeek" defaultValue={String(schoolDayOfWeek())} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
            {DAY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-300">
          Skill focus
          <input required name="skillFocus" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="Fractions fluency / Reading inference" />
        </label>
        <label className="text-xs text-slate-300">
          Lesson type
          <select required name="lessonType" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value="">Select lesson type</option>
            {LESSON_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-300">
          Room
          <input name="room" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="Room 12" />
        </label>
        <label className="text-xs text-slate-300">
          Due date
          <input type="date" name="dueDate" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
        </label>
      </div>

      {classrooms.length === 0 ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          No classes yet.{" "}
          <Link href={`/admin/schools/${schoolId}/classrooms/new`} className="font-semibold underline">Create a class</Link>
          {" "}or{" "}
          <Link href={`/admin/schools/${schoolId}/dashboard`} className="font-semibold underline">bootstrap the daytime school</Link>.
        </p>
      ) : null}

      {error ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className="rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20 disabled:opacity-60">
          {saving ? "Assigning..." : "Assign Lesson"}
        </button>
        <Link href={`/admin/schools/${schoolId}/assignments`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Cancel</Link>
      </div>
    </form>
  );
}

export default function SchoolAssignmentNewPage() {
  const params = useParams<{ schoolId: string }>();
  const schoolId = params.schoolId;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="assignments"
      title="Assign Lesson"
      subtitle="Create a real lesson and place it on the school-day timetable."
    >
      <AssignmentNewForm schoolId={schoolId} />
    </SchoolDashboardShell>
  );
}
