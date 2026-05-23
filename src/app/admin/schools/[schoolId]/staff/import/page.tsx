"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

export default function SchoolStaffImportPage() {
  const params = useParams<{ schoolId: string }>();
  const schoolId = params.schoolId;
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="staff"
      title="Import Staff by CSV"
      subtitle="Upload staff records with role and permission profile mapping."
    >
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
        <p className="text-xs text-slate-300">Include full name, email, role, permission profile, safeguarding access status, and invite status columns.</p>

        <label className="text-xs text-slate-300">
          CSV file
          <input required type="file" accept=".csv" className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
        </label>

        {submitted ? <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">Staff CSV import queued for review.</p> : null}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20">Import Staff by CSV</button>
          <Link href={`/admin/schools/${schoolId}/staff`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Cancel</Link>
        </div>
      </form>
    </SchoolDashboardShell>
  );
}
