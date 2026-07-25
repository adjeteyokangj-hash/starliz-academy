"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import IntegrationToggleField from "@/components/admin/integrations/IntegrationToggleField";
import { OPSWATCH_DEFAULT_API_URL } from "@/types/opswatch";

type SettingsPayload = {
  id: string | null;
  enabled: boolean;
  baseUrl: string | null;
  projectSlug: string | null;
  environment: "production" | "staging" | "development";
  maskedApiKey: string | null;
  hasApiKey: boolean;
  hasSigningSecret: boolean;
  lastHeartbeatAt: string | null;
  lastHeartbeatStatus: string | null;
  lastHeartbeatMessage: string | null;
  fromEnvFallback: boolean;
};

type TestResult = {
  connected: boolean;
  reason: string;
  statusCode: number | null;
  checkedAt: string;
};

const inputCls =
  "w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 py-3 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 transition";

export default function OpsWatchIntegrationPage() {
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [baseUrl, setBaseUrl] = useState(OPSWATCH_DEFAULT_API_URL);
  const [projectSlug, setProjectSlug] = useState("");
  const [environment, setEnvironment] = useState<"production" | "staging" | "development">("production");
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [signingSecret, setSigningSecret] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [workingAction, setWorkingAction] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/integrations/opswatch/settings");
    if (response.status === 401) {
      window.location.replace("/admin/login?next=/admin/integrations/opswatch");
      return;
    }

    const payload = await response.json().catch(() => ({} as { settings?: SettingsPayload; error?: string }));
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to load OpsWatch settings.");
      return;
    }

    const next = payload.settings as SettingsPayload;
    setSettings(next);
    setBaseUrl(next.baseUrl || OPSWATCH_DEFAULT_API_URL);
    setProjectSlug(next.projectSlug ?? "");
    setEnvironment(next.environment);
    setEnabled(next.enabled);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function saveSettings() {
    setWorkingAction("save");
    setMessage(null);

    const response = await fetch("/api/admin/integrations/opswatch/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled,
        baseUrl,
        projectSlug,
        environment,
        apiKey: apiKey.trim() || undefined,
        signingSecret: signingSecret.trim() || undefined,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to save OpsWatch settings.");
      setWorkingAction(null);
      return;
    }

    setApiKey("");
    setSigningSecret("");
    setMessage("OpsWatch settings saved. Use Test Connection to send a signed heartbeat.");
    setWorkingAction(null);
    await load();
  }

  async function testConnection() {
    setWorkingAction("test");
    setMessage(null);

    const response = await fetch("/api/admin/integrations/opswatch/test", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    const reason = payload.message ?? payload.error ?? "OpsWatch test failed.";
    const statusCode = typeof payload.statusCode === "number" ? payload.statusCode : response.status;
    const checkedAt = typeof payload.checkedAt === "string" ? payload.checkedAt : new Date().toISOString();
    const connected = Boolean(payload.ok);

    setTestResult({ connected, reason, statusCode, checkedAt });
    setMessage(connected ? "OpsWatch heartbeat accepted." : `Failed: ${reason}`);
    setWorkingAction(null);
    await load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <section className="rounded-3xl border border-slate-700/70 bg-linear-to-br from-sky-600/20 via-slate-950 to-indigo-600/10 p-6">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-200">Observability</p>
        <h1 className="mt-2 text-3xl font-black text-white">OpsWatch</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          Paste Connect credentials from OpsWatch, then send a signed heartbeat. Prefer the project{" "}
          <strong className="text-white">slug</strong> (e.g. <code className="text-sky-200">starliz-academy</code>), never the display Application ID.
        </p>
        <p className="mt-3 text-xs text-slate-400">
          Last heartbeat:{" "}
          {settings?.lastHeartbeatAt ? new Date(settings.lastHeartbeatAt).toLocaleString() : "Never"}
          {settings?.lastHeartbeatStatus ? ` · ${settings.lastHeartbeatStatus}` : ""}
        </p>
      </section>

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        <p className="font-bold">Manual setup in OpsWatch first</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-amber-50/90">
          <li>
            Open{" "}
            <a className="underline hover:text-white" href="https://opswatch.okanggroup.com" target="_blank" rel="noreferrer">
              opswatch.okanggroup.com
            </a>{" "}
            → Register application → <strong>StarLiz Academy</strong>
          </li>
          <li>Copy Base URL, API key, Signing secret, and <strong>project slug</strong></li>
          <li>Paste below → Save → Test Connection</li>
          <li>After deploy: schedule <code className="text-amber-50">POST /api/cron/opswatch-heartbeat</code> (every 5 min preferred)</li>
        </ol>
      </div>

      {message ? (
        <p className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-100">{message}</p>
      ) : null}

      {testResult ? (
        <section
          className={`rounded-xl border px-4 py-3 text-sm ${
            testResult.connected
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
              : "border-rose-500/40 bg-rose-500/10 text-rose-100"
          }`}
        >
          <p className="font-bold">Status: {testResult.connected ? "Connected" : "Failed"}</p>
          <p className="mt-1">Reason: {testResult.reason}</p>
          <p className="mt-1">HTTP Status: {testResult.statusCode ?? "n/a"}</p>
          <p className="mt-1">Last Checked: {new Date(testResult.checkedAt).toLocaleString()}</p>
        </section>
      ) : null}

      {settings?.fromEnvFallback ? (
        <p className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-xs text-slate-300">
          Using <code>OPSWATCH_*</code> environment variables as fallback. In-app settings will take precedence once saved.
        </p>
      ) : null}

      <section className="space-y-5 rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
        <h2 className="text-lg font-black text-white">Connection Settings</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-300 md:col-span-2">
            OpsWatch Base URL
            <input
              className={`${inputCls} mt-1.5`}
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder={OPSWATCH_DEFAULT_API_URL}
            />
          </label>
          <label className="text-sm font-semibold text-slate-300">
            Project slug
            <input
              className={`${inputCls} mt-1.5`}
              value={projectSlug}
              onChange={(event) => setProjectSlug(event.target.value)}
              placeholder="starliz-academy"
            />
          </label>
          <label className="text-sm font-semibold text-slate-300">
            Environment
            <select
              className={`${inputCls} mt-1.5`}
              value={environment}
              onChange={(event) =>
                setEnvironment(event.target.value as "production" | "staging" | "development")
              }
            >
              <option value="production">production</option>
              <option value="staging">staging</option>
              <option value="development">development</option>
            </select>
          </label>
        </div>

        <div className="rounded-2xl border border-slate-700/70 bg-slate-950/50 p-4">
          <p className="text-sm font-bold text-white">API key</p>
          <p className="mt-1 text-xs text-slate-400">Stored encrypted. Never returned to the browser.</p>
          <p className="mt-2 text-xs text-slate-300">
            Current: {settings?.maskedApiKey ?? (settings?.hasApiKey ? "Stored" : "Not configured")}
          </p>
          <input
            className={`${inputCls} mt-3`}
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Paste OpsWatch API key"
            autoComplete="off"
          />
        </div>

        <div className="rounded-2xl border border-slate-700/70 bg-slate-950/50 p-4">
          <p className="text-sm font-bold text-white">Signing secret</p>
          <p className="mt-1 text-xs text-slate-400">Required for HMAC-signed heartbeats (Noble pattern).</p>
          <p className="mt-2 text-xs text-slate-300">
            Current: {settings?.hasSigningSecret ? "Stored" : "Not configured"}
          </p>
          <input
            className={`${inputCls} mt-3`}
            type="password"
            value={signingSecret}
            onChange={(event) => setSigningSecret(event.target.value)}
            placeholder="Paste OpsWatch signing secret"
            autoComplete="off"
          />
        </div>

        <IntegrationToggleField
          label="Enable scheduled heartbeats"
          description="When on, /api/cron/opswatch-heartbeat will send signed heartbeats (protect with CRON_SECRET)."
          checked={enabled}
          onChange={setEnabled}
        />

        {settings?.lastHeartbeatMessage ? (
          <p className="text-xs text-slate-400">Last result: {settings.lastHeartbeatMessage}</p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={workingAction !== null}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {workingAction === "save" ? "Saving..." : "Save Settings"}
          </button>
          <button
            type="button"
            onClick={() => void testConnection()}
            disabled={workingAction !== null}
            className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-bold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-60"
          >
            {workingAction === "test" ? "Testing..." : "Test Connection"}
          </button>
          <Link
            href="/admin/settings/integrations"
            className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-800"
          >
            Back to Integrations
          </Link>
        </div>
      </section>
    </div>
  );
}
