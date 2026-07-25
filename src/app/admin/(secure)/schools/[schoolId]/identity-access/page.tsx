import Link from "next/link";
import AdminSecondaryModuleBanner from "@/components/admin/schools/AdminSecondaryModuleBanner";
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
      subtitle="API keys, scopes, webhook, rate limits, and emergency controls."
    >
      <AdminSecondaryModuleBanner schoolId={schoolId} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[
          { title: "API key management per external app", section: "api-keys" },
          { title: "Scope-based permissions", section: "scopes" },
          { title: "Webhook events", section: "webhooks" },
          { title: "Rate limiting", section: "rate-limits" },
          { title: "Audit logs", section: "audit-logs" },
          { title: "Card lifecycle history", section: "card-lifecycle" },
          { title: "Lost/stolen card workflow", section: "card-incident" },
          { title: "Parent consent rules", section: "parent-consent" },
          { title: "Safeguarding override protection", section: "safeguarding-override" },
          { title: "Emergency access mode", section: "emergency-access" },
        ].map((item) => (
          <article key={item.title} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
            <h2 className="text-sm font-semibold text-white">{item.title}</h2>
            <p className="mt-1 text-xs text-slate-400">Audit-ready controls for this identity access area.</p>
            <Link href={`/admin/schools/${schoolId}/identity-access?section=${item.section}`} className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Configure Section</Link>
          </article>
        ))}
      </div>
    </SchoolDashboardShell>
  );
}
