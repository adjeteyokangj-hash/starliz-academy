"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TrueNumerisHealthBadge from "@/components/admin/integrations/TrueNumerisHealthBadge";
import SyncQueueCard from "@/components/admin/integrations/SyncQueueCard";
import IntegrationToggleField from "@/components/admin/integrations/IntegrationToggleField";

type SettingsPayload = {
  id: string | null;
  companyId: string | null;
  region: "UK" | "GH";
  enabled: boolean;
  baseUrl: string | null;
  autoInvoice: boolean;
  autoVat: boolean;
  autoReconciliation: boolean;
  syncFrequencyMinutes: number;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
  maskedApiKey: string | null;
  hasApiKey: boolean;
};

type StatusPayload = {
  enabled: boolean;
  region: "UK" | "GH";
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
  queue: {
    pending: number;
    failed: number;
    synced: number;
    lastSyncAt: string | null;
    failedRefs: string[];
  };
};

const inputCls = "w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 py-3 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 transition";

export default function TrueNumerisIntegrationPage() {
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [region, setRegion] = useState<"UK" | "GH">("UK");
  const [enabled, setEnabled] = useState(false);
  const [autoInvoice, setAutoInvoice] = useState(true);
  const [autoVat, setAutoVat] = useState(true);
  const [autoReconciliation, setAutoReconciliation] = useState(true);
  const [syncFrequencyMinutes, setSyncFrequencyMinutes] = useState(15);
  const [message, setMessage] = useState<string | null>(null);
  const [workingAction, setWorkingAction] = useState<string | null>(null);

  const healthStatus = status?.lastSyncStatus ?? settings?.lastSyncStatus ?? "unknown";

  const load = useCallback(async () => {
    const [settingsRes, statusRes] = await Promise.all([
      fetch("/api/admin/integrations/truenumeris/settings"),
      fetch("/api/admin/integrations/truenumeris/status"),
    ]);

    if (settingsRes.status === 401 || statusRes.status === 401) {
      window.location.replace("/admin/login?next=/admin/integrations/truenumeris");
      return;
    }

    const settingsJson = await settingsRes.json();
    const statusJson = await statusRes.json();

    if (settingsRes.ok) {
      const nextSettings = settingsJson.settings as SettingsPayload;
      setSettings(nextSettings);
      setBaseUrl(nextSettings.baseUrl ?? "");
      setCompanyId(nextSettings.companyId ?? "");
      setRegion(nextSettings.region);
      setEnabled(nextSettings.enabled);
      setAutoInvoice(nextSettings.autoInvoice);
      setAutoVat(nextSettings.autoVat);
      setAutoReconciliation(nextSettings.autoReconciliation);
      setSyncFrequencyMinutes(nextSettings.syncFrequencyMinutes);
    }

    if (statusRes.ok) {
      setStatus(statusJson.status as StatusPayload);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const queueCards = useMemo(() => {
    return {
      pending: status?.queue.pending ?? 0,
      failed: status?.queue.failed ?? 0,
      synced: status?.queue.synced ?? 0,
    };
  }, [status]);

  async function saveSettings() {
    setWorkingAction("save");
    setMessage(null);

    const response = await fetch("/api/admin/integrations/truenumeris/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        region,
        enabled,
        apiKey: apiKey.trim() || undefined,
        baseUrl,
        autoInvoice,
        autoVat,
        autoReconciliation,
        syncFrequencyMinutes,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to save settings.");
      setWorkingAction(null);
      return;
    }

    setApiKey("");
    setMessage("TrueNumeris settings saved.");
    setWorkingAction(null);
    await load();
  }

  async function runAction(action: "test" | "sync" | "retry") {
    setWorkingAction(action);
    setMessage(null);

    const endpoint = `/api/admin/integrations/truenumeris/${action}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: action === "sync" ? JSON.stringify({ lookbackDays: 60, limit: 200 }) : undefined,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(payload.error ?? `${action} failed.`);
      setWorkingAction(null);
      return;
    }

    if (action === "test") setMessage(payload.message ?? "Connection test completed.");
    if (action === "sync") setMessage(`Sync finished. Synced ${payload.synced ?? 0}, failed ${payload.failed ?? 0}.`);
    if (action === "retry") setMessage(`Retry finished. Re-queued ${payload.retried ?? 0} failed sync events.`);

    setWorkingAction(null);
    await load();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <section className="rounded-3xl border border-slate-700/70 bg-linear-to-br from-teal-600/20 via-slate-950 to-blue-600/10 p-6">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-teal-200">Financial Integrations</p>
        <h1 className="mt-2 text-3xl font-black text-white">TrueNumeris</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">
          StarLiz financial operations bridge for invoicing, VAT, reconciliation, and compliance-ready export packs. Tax submission is disabled by policy.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <TrueNumerisHealthBadge status={healthStatus} />
          <p className="text-xs text-slate-300">
            Last sync: {status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : "Never"}
          </p>
        </div>
      </section>

      {message ? (
        <p className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-100">{message}</p>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <SyncQueueCard title="Pending Sync Queue" value={queueCards.pending} tone={queueCards.pending ? "warning" : "default"} />
        <SyncQueueCard title="Failed Syncs" value={queueCards.failed} tone={queueCards.failed ? "danger" : "success"} />
        <SyncQueueCard title="Synced Events" value={queueCards.synced} tone="success" detail={status?.queue.lastSyncAt ? `Last success ${new Date(status.queue.lastSyncAt).toLocaleString()}` : "No successful sync yet"} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5 rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-lg font-black text-white">Connection Settings</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-slate-300">
              Base URL
              <input className={`${inputCls} mt-1.5`} value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.truenumeris.com" />
            </label>
            <label className="text-sm font-semibold text-slate-300">
              Company ID
              <input className={`${inputCls} mt-1.5`} value={companyId} onChange={(event) => setCompanyId(event.target.value)} placeholder="company_123" />
            </label>
            <label className="text-sm font-semibold text-slate-300">
              Region
              <select className={`${inputCls} mt-1.5`} value={region} onChange={(event) => setRegion(event.target.value as "UK" | "GH")}>
                <option value="UK">UK</option>
                <option value="GH">Ghana</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-300">
              Sync Frequency (minutes)
              <input
                className={`${inputCls} mt-1.5`}
                type="number"
                min={1}
                max={1440}
                value={syncFrequencyMinutes}
                onChange={(event) => setSyncFrequencyMinutes(Math.max(1, Number(event.target.value) || 15))}
              />
            </label>
          </div>

          <div className="rounded-2xl border border-slate-700/70 bg-slate-950/50 p-4">
            <p className="text-sm font-bold text-white">TrueNumeris API Key</p>
            <p className="mt-1 text-xs text-slate-400">Stored encrypted server-side. Secret value is never returned to browser clients.</p>
            <p className="mt-2 text-xs text-slate-300">Current: {settings?.maskedApiKey ?? "Not configured"}</p>
            <input
              className={`${inputCls} mt-3`}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Paste new API key (optional)"
              type="password"
            />
          </div>

          <IntegrationToggleField
            label="Integration Status"
            description="Enable or disable all outbound financial sync traffic."
            checked={enabled}
            onChange={setEnabled}
          />
          <IntegrationToggleField
            label="Invoice Automation"
            description="Auto-create invoices from successful subscription payment events."
            checked={autoInvoice}
            onChange={setAutoInvoice}
          />
          <IntegrationToggleField
            label="VAT Settings"
            description="Enable VAT calculation rules (UK first, Ghana-ready scaffold)."
            checked={autoVat}
            onChange={setAutoVat}
          />
          <IntegrationToggleField
            label="Reconciliation"
            description="Track sync queue, failures, retries, and accounting reconciliation state."
            checked={autoReconciliation}
            onChange={setAutoReconciliation}
          />

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={saveSettings}
              disabled={workingAction !== null}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {workingAction === "save" ? "Saving..." : "Save Settings"}
            </button>
            <button
              type="button"
              onClick={() => void runAction("test")}
              disabled={workingAction !== null}
              className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-bold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-60"
            >
              {workingAction === "test" ? "Testing..." : "Test Connection"}
            </button>
            <button
              type="button"
              onClick={() => void runAction("sync")}
              disabled={workingAction !== null}
              className="rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-2.5 text-sm font-bold text-blue-100 hover:bg-blue-500/20 disabled:opacity-60"
            >
              {workingAction === "sync" ? "Syncing..." : "Sync Historical Transactions"}
            </button>
            <button
              type="button"
              onClick={() => void runAction("retry")}
              disabled={workingAction !== null}
              className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm font-bold text-amber-100 hover:bg-amber-500/20 disabled:opacity-60"
            >
              {workingAction === "retry" ? "Retrying..." : "Retry Failed Syncs"}
            </button>
            <a
              href={baseUrl || "https://truenumeris.com"}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-800"
            >
              Open TrueNumeris
            </a>
          </div>
        </div>

        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-lg font-black text-white">Financial Sync Queue</h2>
            <p className="mt-2 text-sm text-slate-400">Operational visibility for pending and failed financial events.</p>
            <div className="mt-3 space-y-2 text-xs text-slate-300">
              {(status?.queue.failedRefs ?? []).slice(0, 6).map((ref) => (
                <p key={ref} className="rounded-lg border border-slate-700/80 bg-slate-950/60 px-3 py-2">
                  Failed reference: {ref}
                </p>
              ))}
              {!status?.queue.failedRefs?.length ? <p className="text-slate-500">No failed references currently recorded.</p> : null}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-lg font-black text-white">HMRC/GRA Readiness</h2>
            <p className="mt-2 text-sm text-slate-400">
              Tax records and export packs are prepared for accountant workflows. Automatic tax filing is intentionally disabled.
            </p>
            <ul className="mt-3 space-y-2 text-xs text-slate-300">
              <li>HMRC MTD architecture scaffolded</li>
              <li>GRA architecture scaffolded</li>
              <li>Digital audit exports enabled</li>
              <li>No direct HMRC/GRA API submission in Phase 1</li>
            </ul>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-lg font-black text-white">Audit Logs</h2>
            <p className="mt-2 text-sm text-slate-400">
              Integration writes audit-safe events for save/test/sync/retry operations and webhook financial state changes.
            </p>
            <Link href="/admin/audit-logs" className="mt-3 inline-flex rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800">
              Open Audit Logs
            </Link>
          </section>
        </div>
      </section>
    </div>
  );
}
