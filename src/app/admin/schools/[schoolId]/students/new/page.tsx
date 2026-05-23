"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

const YEAR_GROUP_OPTIONS = ["Reception", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6", "Year 7", "Year 8", "Year 9", "Year 10", "Year 11"];
const CLASS_OPTIONS = ["Class A", "Class B", "Class C", "Class D"];

export default function SchoolStudentNewPage() {
  const params = useParams<{ schoolId: string }>();
  const schoolId = params.schoolId;

  const [saved, setSaved] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(true);
  }

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="students"
      title="Enrol Student"
      subtitle="Create a student profile with guardian and learner support details."
    >
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
            <select required name="className" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
              <option value="">Select class</option>
              {CLASS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
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

        {saved ? <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">Student details captured. Review and continue in the students workspace.</p> : null}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20">Save Student</button>
          <Link href={`/admin/schools/${schoolId}/students`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Cancel</Link>
        </div>
      </form>
    </SchoolDashboardShell>
  );
}
