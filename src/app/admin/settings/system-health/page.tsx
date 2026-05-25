"use client";

import { useEffect, useState } from "react";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type JobLog = {
  id: string;
  jobName: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
};

type StripeWebhookMonitoring = {
  tableExists: boolean;
  unavailable?: boolean;
  totalTrackedEvents: number;
  processedEvents: number;
  processingEvents: number;
  staleProcessingEvents: number;
  oldestProcessingAgeMinutes: number | null;
  duplicateEventsLast24h: number;
  timestampToleranceSeconds: number;
  staleThresholdMinutes: number;
  duplicateWindowHours: number;
};

type MonitoringPayload = {
  webhooks?: {
    stripe?: StripeWebhookMonitoring;
  };
};

export default function SystemHealthPage() {
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [stripeWebhookMonitoring, setStripeWebhookMonitoring] = useState<StripeWebhookMonitoring | null>(null);
  const [running, setRunning] = useState(false);

  async function loadLogs() {
    const response = await fetch("/api/admin/jobs/run");
    if (!response.ok) return;
    const data = await response.json();
    setLogs(data.logs ?? []);
  }

  async function runNow() {
    setRunning(true);
    await fetch("/api/admin/jobs/run", { method: "POST" });
    await loadLogs();
    setRunning(false);
  }

  async function loadMonitoring() {
    const response = await fetch("/api/admin/monitoring");
    if (!response.ok) return;
    const data = (await response.json()) as MonitoringPayload;
    setStripeWebhookMonitoring(data.webhooks?.stripe ?? null);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLogs();
    void loadMonitoring();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-white">System Health</h1>
          <p className="mt-1 text-slate-400">Background jobs, subscription checks and platform maintenance.</p>
        </div>
        <button
          type="button"
          onClick={() => void runNow()}
          disabled={running}
          className="rounded-2xl bg-violet-500 px-5 py-3 font-bold text-white shadow-lg shadow-violet-500/20 disabled:opacity-60"
        >
          {running ? "Running..." : "Run Now"}
        </button>
      </div>

      <AdminSectionCard title="Job Run Logs">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-3 py-2">Job</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2">Finished</th>
                <th className="px-3 py-2">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-slate-300">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-3 py-3 font-semibold text-white">{log.jobName}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${log.status === "success" ? "bg-emerald-500/15 text-emerald-300" : log.status === "failed" ? "bg-rose-500/15 text-rose-300" : "bg-blue-500/15 text-blue-300"}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-3 py-3">{new Date(log.startedAt).toLocaleString()}</td>
                  <td className="px-3 py-3">{log.finishedAt ? new Date(log.finishedAt).toLocaleString() : "-"}</td>
                  <td className="px-3 py-3 text-slate-400">{log.error ?? (log.metadata ? JSON.stringify(log.metadata) : "-")}</td>
                </tr>
              ))}
              {!logs.length ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">No job runs yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="Stripe Webhook Monitoring">
        {!stripeWebhookMonitoring ? (
          <p className="text-sm text-slate-500">Webhook metrics unavailable.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <MetricPill label="Tracked events" value={String(stripeWebhookMonitoring.totalTrackedEvents)} />
              <MetricPill label="Processed" value={String(stripeWebhookMonitoring.processedEvents)} />
              <MetricPill label="Processing" value={String(stripeWebhookMonitoring.processingEvents)} />
              <MetricPill label={`Stale > ${stripeWebhookMonitoring.staleThresholdMinutes}m`} value={String(stripeWebhookMonitoring.staleProcessingEvents)} tone={stripeWebhookMonitoring.staleProcessingEvents > 0 ? "danger" : "default"} />
              <MetricPill label={`Replays ${stripeWebhookMonitoring.duplicateWindowHours}h`} value={String(stripeWebhookMonitoring.duplicateEventsLast24h)} tone={stripeWebhookMonitoring.duplicateEventsLast24h > 0 ? "warning" : "default"} />
              <MetricPill label="Timestamp tolerance" value={`${stripeWebhookMonitoring.timestampToleranceSeconds}s`} />
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
              <p>
                Oldest in-flight event age: {stripeWebhookMonitoring.oldestProcessingAgeMinutes === null ? "-" : `${stripeWebhookMonitoring.oldestProcessingAgeMinutes} minutes`}
              </p>
              {!stripeWebhookMonitoring.tableExists ? (
                <p className="mt-2 text-amber-300">Webhook event table is not initialized yet. It is created automatically on first processed Stripe webhook event.</p>
              ) : null}
              {stripeWebhookMonitoring.unavailable ? (
                <p className="mt-2 text-rose-300">Webhook metrics are temporarily unavailable. Check database connectivity and retry.</p>
              ) : null}
            </div>
          </div>
        )}
      </AdminSectionCard>
    </div>
  );
}

function MetricPill({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warning" | "danger" }) {
  const toneClassName =
    tone === "danger"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
      : tone === "warning"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
      : "border-slate-700 bg-slate-900/70 text-slate-200";

  return (
    <article className={`rounded-xl border px-4 py-3 ${toneClassName}`}>
      <p className="text-xs uppercase tracking-[0.16em]">{label}</p>
      <p className="mt-2 text-xl font-black">{value}</p>
    </article>
  );
}
