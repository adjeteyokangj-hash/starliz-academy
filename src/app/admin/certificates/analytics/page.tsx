"use client";

import { useEffect, useState } from "react";

type AnalyticsPayload = {
  ok?: boolean;
  analytics?: {
    issuedCertificates: number;
    pendingCertificates: number;
    awardCertificates: number;
    revokedCertificates: number;
    verificationActivity: {
      total: number;
      valid: number;
      revoked: number;
      notFound: number;
      recent: Array<{
        verificationCode: string;
        status: "valid" | "revoked" | "not_found";
        createdAt: string;
      }>;
    };
    templateUsage: Array<{
      certificateType: string;
      template: string;
      theme: string;
      issuedCount: number;
      revokedCount: number;
    }>;
  };
  note?: string;
  error?: string;
};

function statusClass(status: "valid" | "revoked" | "not_found"): string {
  if (status === "valid") return "bg-emerald-500/20 text-emerald-200";
  if (status === "revoked") return "bg-rose-500/20 text-rose-200";
  return "bg-amber-500/20 text-amber-200";
}

export default function AdminCertificateAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AnalyticsPayload | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/admin/certificates/analytics", { cache: "no-store" });
        const json = await response.json() as AnalyticsPayload;
        if (!active) return;

        if (!response.ok || !json.ok) {
          setError(json.error ?? "Unable to load certificate analytics.");
          return;
        }

        setPayload(json);
      } catch {
        if (!active) return;
        setError("Unable to load certificate analytics.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  const analytics = payload?.analytics;

  return (
    <main className="space-y-6">
      <section>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Admin certificates</p>
        <h1 className="mt-2 text-3xl font-black text-white">Certificate Analytics Dashboard</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">Issued, pending, award, revoked, verification activity, and template usage analytics.</p>
      </section>

      {loading ? <p className="text-sm text-slate-300">Loading analytics...</p> : null}
      {error ? <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}

      {analytics ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
              <p className="text-xs text-slate-400">Issued certificates</p>
              <p className="mt-1 text-2xl font-black text-white">{analytics.issuedCertificates}</p>
            </article>
            <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
              <p className="text-xs text-slate-400">Pending certificates</p>
              <p className="mt-1 text-2xl font-black text-white">{analytics.pendingCertificates}</p>
            </article>
            <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
              <p className="text-xs text-slate-400">Award certificates</p>
              <p className="mt-1 text-2xl font-black text-white">{analytics.awardCertificates}</p>
            </article>
            <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
              <p className="text-xs text-slate-400">Revoked certificates</p>
              <p className="mt-1 text-2xl font-black text-white">{analytics.revokedCertificates}</p>
            </article>
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
            <h2 className="text-base font-bold text-white">Verification activity</h2>
            <p className="mt-1 text-xs text-slate-400">Total checks: {analytics.verificationActivity.total} | valid: {analytics.verificationActivity.valid} | revoked: {analytics.verificationActivity.revoked} | not found: {analytics.verificationActivity.notFound}</p>

            <div className="mt-3 space-y-2">
              {analytics.verificationActivity.recent.length === 0 ? (
                <p className="text-sm text-slate-400">No verification activity recorded yet.</p>
              ) : analytics.verificationActivity.recent.map((item) => (
                <div key={`${item.verificationCode}-${item.createdAt}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs">
                  <div className="space-x-2 text-slate-200">
                    <span className="font-mono">{item.verificationCode}</span>
                    <span className={`rounded-full px-2 py-0.5 font-bold uppercase ${statusClass(item.status)}`}>{item.status}</span>
                  </div>
                  <p className="text-slate-400">{new Date(item.createdAt).toLocaleString("en-GB")}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
            <h2 className="text-base font-bold text-white">Template usage</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-xs text-slate-200">
                <thead className="text-slate-400">
                  <tr>
                    <th className="py-2 pr-3">Certificate type</th>
                    <th className="py-2 pr-3">Template</th>
                    <th className="py-2 pr-3">Theme</th>
                    <th className="py-2 pr-3">Issued</th>
                    <th className="py-2 pr-3">Revoked</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.templateUsage.map((row) => (
                    <tr key={row.certificateType} className="border-t border-slate-800">
                      <td className="py-2 pr-3 font-semibold">{row.certificateType.replaceAll("_", " ")}</td>
                      <td className="py-2 pr-3">{row.template}</td>
                      <td className="py-2 pr-3">{row.theme}</td>
                      <td className="py-2 pr-3">{row.issuedCount}</td>
                      <td className="py-2 pr-3">{row.revokedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {payload?.note ? <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-100">{payload.note}</p> : null}
        </>
      ) : null}
    </main>
  );
}
