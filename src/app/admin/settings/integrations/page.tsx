"use client";

const integrations = [
  {
    id: "microsoft-graph",
    title: "Microsoft 365 / Outlook",
    desc: "Admin inbox connected via Microsoft Graph OAuth. Enables inbox, sent mail, and reply functionality.",
    icon: "📧",
    href: "/admin/inbox",
    statusLabel: "Configure in Inbox",
    badgeClass: "bg-blue-500/15 text-blue-300",
  },
  {
    id: "openai",
    title: "OpenAI",
    desc: "Powers AI spelling, maths, reading generation, and the admin AI content generator.",
    icon: "✦",
    href: "/admin/settings#openai",
    statusLabel: "Configure in API Keys",
    badgeClass: "bg-slate-800 text-slate-400",
  },
  {
    id: "resend",
    title: "Resend",
    desc: "Sends parent notification emails and weekly progress reports.",
    icon: "✉",
    href: "/admin/settings#email",
    statusLabel: "Configure in API Keys",
    badgeClass: "bg-slate-800 text-slate-400",
  },
  {
    id: "stripe",
    title: "Stripe / Paystack",
    desc: "Handles subscription billing, trial upgrades, and wallet top-ups.",
    icon: "💳",
    href: "/admin/settings#payment",
    statusLabel: "Configure in API Keys",
    badgeClass: "bg-slate-800 text-slate-400",
  },
  {
    id: "storage",
    title: "Cloud Storage (S3 / R2)",
    desc: "Stores uploaded media assets, exports, and database backups. Supports AWS, Cloudflare R2, and Supabase.",
    icon: "🗄",
    href: "/admin/settings#storage",
    statusLabel: "Configure in API Keys",
    badgeClass: "bg-slate-800 text-slate-400",
  },
  {
    id: "family-link",
    title: "Family Link",
    desc: "Google Family Link integration for parental supervision of student accounts.",
    icon: "👨‍👩‍👧",
    href: "/admin/settings/integrations/family-link",
    statusLabel: "View Setup Guide",
    badgeClass: "bg-slate-800 text-slate-400",
  },
];

export default function IntegrationsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-16">
      <div>
        <p className="mb-1 text-xs font-black uppercase tracking-widest text-indigo-400">Platform control</p>
        <h1 className="text-2xl font-black text-white">Integrations</h1>
        <p className="mt-1 text-sm text-slate-400">Third-party services connected to StarLiz Academy.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {integrations.map((item) => (
          <a
            key={item.id}
            href={item.href}
            className="group flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-5 transition hover:border-indigo-500/40 hover:bg-indigo-950/20"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-2xl">{item.icon}</span>
                <div>
                  <p className="font-black text-white group-hover:text-indigo-200 transition">{item.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{item.desc}</p>
                </div>
              </div>
            </div>
            <span className={`self-start rounded-full px-2.5 py-1 text-xs font-black ${item.badgeClass}`}>
              {item.statusLabel}
            </span>
          </a>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5 text-xs text-slate-400">
        <p className="font-semibold text-slate-300 mb-1">➕ Adding a new integration?</p>
        <p>API keys for OpenAI, Resend, Stripe, and Storage are managed in <a href="/admin/settings" className="text-indigo-400 hover:underline">Settings → API Keys</a>. OAuth connections (like Microsoft 365) have dedicated setup flows linked above.</p>
      </div>
    </div>
  );
}