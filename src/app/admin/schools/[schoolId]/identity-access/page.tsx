import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolIdentityAccessPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="identity-access"
      title="Identity Access Integrations"
      subtitle="API keys, scopes, webhook, rate limits, and emergency controls placeholders."
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[
          "API key management per external app",
          "Scope-based permissions",
          "Webhook events",
          "Rate limiting",
          "Audit logs",
          "Card lifecycle history",
          "Lost/stolen card workflow",
          "Parent consent rules",
          "Safeguarding override protection",
          "Emergency access mode",
        ].map((item) => (
          <article key={item} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
            <h2 className="text-sm font-semibold text-white">{item}</h2>
            <p className="mt-1 text-xs text-slate-400">Audit-ready placeholder card for this identity access control area.</p>
            <button className="mt-3 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200">Configure Placeholder</button>
          </article>
        ))}
      </div>
    </SchoolDashboardShell>
  );
}
