"use client";

import { useState } from "react";
import Link from "next/link";

type ExportType = "users" | "children" | "progress" | "subscriptions";
type ExportFormat = "csv" | "json";

const exportTypes: { type: ExportType; label: string; desc: string; icon: string }[] = [
  { type: "users", label: "Parent Accounts", desc: "All registered parent accounts with roles and subscription counts.", icon: "👥" },
  { type: "children", label: "Student Profiles", desc: "All child profiles including XP, level, stars, and year group.", icon: "🎓" },
  { type: "progress", label: "Progress Records", desc: "Activity logs — scores, stars earned, accuracy (last 5,000 rows).", icon: "📈" },
  { type: "subscriptions", label: "Subscriptions", desc: "All parent subscription records, plan keys, and statuses.", icon: "💳" },
];

export default function BackupExportPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [format, setFormat] = useState<ExportFormat>("csv");

  async function doExport(type: ExportType) {
    setLoading(type);
    try {
      const res = await fetch(`/api/admin/export?type=${type}&format=${format}`);
      if (!res.ok) { alert("Export failed."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-16">
      <div>
        <p className="mb-1 text-xs font-black uppercase tracking-widest text-indigo-400">Platform control</p>
        <h1 className="text-2xl font-black text-white">Backup / Export</h1>
        <p className="mt-1 text-sm text-slate-400">Download platform data as CSV or JSON for backup and analysis.</p>
      </div>

      {/* Format selector */}
      <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <span className="text-sm font-semibold text-slate-400">Export format:</span>
        {(["csv", "json"] as ExportFormat[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFormat(f)}
            className={`rounded-xl px-4 py-2 text-sm font-black transition ${format === f ? "bg-indigo-600 text-white" : "border border-slate-700 text-slate-400 hover:bg-slate-800"}`}
          >
            {f.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Export cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {exportTypes.map((item) => (
          <div
            key={item.type}
            className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-5"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{item.icon}</span>
              <div>
                <p className="font-black text-white">{item.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{item.desc}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void doExport(item.type)}
              disabled={loading === item.type}
              className="rounded-xl bg-indigo-600 py-2.5 text-sm font-black text-white hover:bg-indigo-500 disabled:opacity-50 transition"
            >
              {loading === item.type ? "Exporting…" : `Download ${format.toUpperCase()}`}
            </button>
          </div>
        ))}
      </div>

      {/* Info note */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5 text-sm text-slate-400 space-y-2">
        <p className="font-semibold text-slate-300">💡 Notes</p>
        <ul className="list-disc pl-5 space-y-1 text-xs">
          <li>Exports contain live data — download regularly for off-site backups.</li>
          <li>Progress records are limited to 5,000 most recent entries per export.</li>
          <li>Passwords and encrypted tokens are never included in exports.</li>
          <li>For full database backups, download <code className="rounded bg-slate-800 px-1">dev.db</code> directly from your server storage.</li>
        </ul>
      </div>

      <Link
        href="/admin/settings/migration"
        className="block rounded-2xl border border-indigo-700/40 bg-indigo-950/20 p-5 transition hover:border-indigo-500/70 hover:bg-indigo-900/30"
      >
        <p className="text-xs font-black uppercase tracking-widest text-indigo-300">Migration pipeline</p>
        <h2 className="mt-2 text-lg font-black text-white">Open Local to Production Migration Console</h2>
        <p className="mt-1 text-sm text-slate-300">
          Run migration export, dry-run validation, and guarded apply flow for parents, lessons, content library, and assignments.
        </p>
      </Link>
    </div>
  );
}
