"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

const YEAR_GROUP_OPTIONS = ["Reception", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6", "Year 7", "Year 8", "Year 9", "Year 10", "Year 11"];
const TEACHER_OPTIONS = ["Unassigned", "Class Teacher A", "Class Teacher B", "Class Teacher C"];
const TA_OPTIONS = ["None", "Teaching Assistant A", "Teaching Assistant B"];

export default function SchoolClassroomNewPage() {
  const params = useParams<{ schoolId: string }>();
  const schoolId = params.schoolId;
  const [created, setCreated] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreated(true);
  }

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="classrooms"
      title="Create Class"
      subtitle="Set up a class with staffing, capacity, and location details."
    >
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
            <select required name="classTeacher" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
              {TEACHER_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-300">
            Teaching assistant
            <select required name="teachingAssistant" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
              {TA_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-300">
            Capacity
            <input required type="number" min={1} max={60} defaultValue={30} name="capacity" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
          </label>
          <label className="text-xs text-slate-300">
            Room/location
            <input required name="location" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="Room 12 / Upper Hall" />
          </label>
        </div>

        {created ? <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">Class profile captured. Review it from Classroom Registry.</p> : null}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20">Create Class</button>
          <Link href={`/admin/schools/${schoolId}/classrooms`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Cancel</Link>
        </div>
      </form>
    </SchoolDashboardShell>
  );
}
