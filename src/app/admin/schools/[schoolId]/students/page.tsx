import Link from "next/link";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolStudentsPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="students"
      title="Student Enrolment & Import"
      subtitle="Student enrolment operations and CSV import workflows."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Enrolment Workspace</h2>
          <p className="mt-1 text-xs text-slate-400">Start enrolment, assign classes, and capture baseline learner context.</p>
          <Link href={`/admin/schools/${schoolId}/students/new`} className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Enrol Student</Link>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Student CSV Import</h2>
          <p className="mt-1 text-xs text-slate-400">Import students by CSV with template guidance and validation checks.</p>
          <Link href={`/admin/schools/${schoolId}/students/import`} className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Open CSV Import</Link>
        </article>
      </div>
    </SchoolDashboardShell>
  );
}
