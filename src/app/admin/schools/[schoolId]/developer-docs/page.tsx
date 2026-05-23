import Link from "next/link";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolDeveloperDocsPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="developer-docs"
      title="Developer Documentation"
      subtitle="Integration guidance for school identity and access features."
    >
      <div className="space-y-3">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Identity Integration Guide</h2>
          <p className="mt-1 text-xs text-slate-400">Document API key scopes, webhook signatures, retries, and access lifecycle handling.</p>
          <Link href={`/admin/schools/${schoolId}/developer-docs?view=integration-notes`} className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Open Integration Notes</Link>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Operational Runbook</h2>
          <ul className="mt-2 space-y-1 text-xs text-slate-300">
            <li>Rate-limit and abuse handling guidance</li>
            <li>Emergency access mode invocation and rollback</li>
            <li>Safeguarding override audit requirements</li>
            <li>Lost/stolen card incident runbook</li>
          </ul>
        </article>
      </div>
    </SchoolDashboardShell>
  );
}