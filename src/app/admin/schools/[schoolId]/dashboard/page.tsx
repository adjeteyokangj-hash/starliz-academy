import Link from "next/link";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

type SectionCard = {
  title: string;
  description: string;
  actionLabel: string;
  href: string;
};

const SECTION_CARDS: SectionCard[] = [
  { title: "Overview", description: "School overview KPIs, operating posture, and launch status.", actionLabel: "Open Overview", href: "dashboard" },
  { title: "Staff & Teachers", description: "Provisioning, invite lifecycle, access history, and training posture.", actionLabel: "Manage Staff", href: "staff" },
  { title: "Students", description: "Enrolment, allocation, import placeholder, and active cohort health.", actionLabel: "Open Students", href: "students" },
  { title: "Classrooms", description: "Classroom ownership, year-group allocation, and capacity controls.", actionLabel: "Manage Classrooms", href: "classrooms" },
  { title: "Parent Onboarding", description: "Parent activation progress, consent, and comms readiness.", actionLabel: "Open Parent Onboarding", href: "parent-onboarding" },
  { title: "Safeguarding", description: "Case register, escalation queue, override protection, and incidents.", actionLabel: "Open Safeguarding", href: "safeguarding" },
  { title: "Assignments", description: "Assignment readiness and delivery handoff checkpoints.", actionLabel: "Go to Assignment Operations", href: "dashboard" },
  { title: "Attendance", description: "Attendance actions, trend checks, and intervention placeholders.", actionLabel: "Open Attendance Placeholder", href: "dashboard" },
  { title: "Communications", description: "Parent communication history, channel health, and sending controls.", actionLabel: "Open Communications", href: "communications" },
  { title: "Billing & Licence", description: "Licence allocation, seat pressure, renewal windows, and billing notes.", actionLabel: "Open Profile & Licence", href: "profile" },
  { title: "Compliance & Audit", description: "Audit activity log, compliance checkpoints, and evidence links.", actionLabel: "Open Compliance & Audit", href: "audit" },
  { title: "Risk & Interventions", description: "Risk scoring, escalation queue, and intervention planning.", actionLabel: "Open Risk & Readiness", href: "readiness" },
  { title: "Settings", description: "School settings, role permissions, and operational controls.", actionLabel: "Open Settings", href: "profile" },
];

export default async function SchoolDashboardPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="dashboard"
      title="School Dashboard"
      subtitle="Dedicated school operations cockpit with governance and compliance routing."
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4 text-sm text-slate-300">
          Open Dashboard now routes to this dedicated school page. The cards below are routing placeholders and clearly marked pending backend wiring.
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SECTION_CARDS.map((section) => (
            <article key={section.title} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
              <h2 className="text-sm font-semibold text-white">{section.title}</h2>
              <p className="mt-1 text-xs text-slate-400">{section.description}</p>
              <Link
                href={`/admin/schools/${schoolId}/${section.href}`}
                className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-sky-400/60 hover:text-sky-100"
              >
                {section.actionLabel}
              </Link>
            </article>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
            <h2 className="text-sm font-semibold text-white">Identity Access Integrations</h2>
            <ul className="mt-2 space-y-1 text-xs text-slate-300">
              <li>API key management per external app</li>
              <li>Scope-based permissions</li>
              <li>Webhook event placeholders</li>
              <li>Rate-limit warnings</li>
              <li>Access audit logs</li>
              <li>Card lifecycle history</li>
              <li>Lost/stolen card workflow</li>
              <li>Parent consent rules</li>
              <li>Safeguarding override protection</li>
              <li>Emergency access mode</li>
            </ul>
            <Link
              href={`/admin/schools/${schoolId}/identity-access`}
              className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-sky-400/60 hover:text-sky-100"
            >
              Open Identity Access
            </Link>
          </article>

          <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
            <h2 className="text-sm font-semibold text-white">Developer Documentation</h2>
            <p className="mt-1 text-xs text-slate-400">
              Integration-ready guidance page for identity access events, key scopes, webhook delivery, and incident procedures.
            </p>
            <Link
              href={`/admin/schools/${schoolId}/developer-docs`}
              className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-sky-400/60 hover:text-sky-100"
            >
              Open Developer Docs
            </Link>
          </article>
        </div>
      </div>
    </SchoolDashboardShell>
  );
}
