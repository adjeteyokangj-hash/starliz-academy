"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

const SUBJECT_OPTIONS = ["English", "Spelling", "Reading", "Maths", "Science"];
const KEY_STAGE_OPTIONS = ["EYFS", "KS1", "KS2", "KS3", "KS4"];
const YEAR_GROUP_OPTIONS = ["Reception", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6", "Year 7", "Year 8", "Year 9", "Year 10", "Year 11"];
const TARGET_OPTIONS = ["Class", "Student"];
const LESSON_TYPES = ["Core lesson", "Intervention", "Revision", "Assessment prep", "Homework"]; 

export default function SchoolAssignmentNewPage() {
  const params = useParams<{ schoolId: string }>();
  const schoolId = params.schoolId;
  const [assigned, setAssigned] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssigned(true);
  }

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="assignments"
      title="Assign Lesson"
      subtitle="Create and assign a lesson to a class or student target."
    >
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
            Class/student target
            <select required name="targetType" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
              {TARGET_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
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
          <label className="text-xs text-slate-300 md:col-span-2">
            Due date
            <input required type="date" name="dueDate" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
          </label>
        </div>

        {assigned ? <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">Lesson assignment created. Review in the assignment queue.</p> : null}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20">Assign Lesson</button>
          <Link href={`/admin/schools/${schoolId}/assignments`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Cancel</Link>
        </div>
      </form>
    </SchoolDashboardShell>
  );
}
