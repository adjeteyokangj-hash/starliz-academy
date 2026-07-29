"use client";

import { AdminCollapsibleCard } from "@/components/admin/ui";

import { FormEvent, useCallback, useEffect, useState } from "react";

type AuthType = "bearer" | "api_key_header" | "basic" | "none";
type Environment = "test" | "live";
type ConnectionStatus = "connected" | "auth_failed" | "unreachable" | "disabled" | "not_tested";

type ConnectionRow = {
  id: string;
  name: string;
  description: string | null;
  baseUrl: string;
  authType: AuthType;
  credentialHint: string | null;
  headerName: string | null;
  hasCredential: boolean;
  hasAdditionalHeaders: boolean;
  environment: Environment;
  status: ConnectionStatus;
  enabled: boolean;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

type KeyRow = {
  id: string;
  name: string;
  description: string | null;
  keyPrefix: string;
  environment: Environment;
  scopes: string[];
  status: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  rateLimit: number;
  rotationOfId: string | null;
};

const inputCls =
  "w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 py-3 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 transition";

const statusColour: Record<string, string> = {
  connected: "text-emerald-400",
  auth_failed: "text-amber-400",
  unreachable: "text-rose-400",
  disabled: "text-slate-500",
  not_tested: "text-slate-400",
  active: "text-emerald-400",
  revoked: "text-rose-400",
  expired: "text-amber-400",
};

function statusLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const emptyConnForm = {
  name: "",
  description: "",
  baseUrl: "",
  authType: "bearer" as AuthType,
  credential: "",
  headerName: "X-API-Key",
  additionalHeaders: "",
  environment: "test" as Environment,
  enabled: true,
};

const emptyKeyForm = {
  name: "",
  description: "",
  environment: "test" as Environment,
  scopes: { "api:read": true, "api:write": false } as Record<string, boolean>,
  expiresAt: "",
  rateLimit: 60,
};

export default function ApiManagementPage() {
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [connForm, setConnForm] = useState(emptyConnForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keyForm, setKeyForm] = useState(emptyKeyForm);
  const [connMsg, setConnMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [keyMsg, setKeyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [cRes, kRes] = await Promise.all([
          fetch("/api/admin/settings/api-management/connections"),
          fetch("/api/admin/settings/api-management/keys"),
        ]);
        if (cancelled) return;
        if (cRes.status === 403 || kRes.status === 403) {
          setLoadError("You need MANAGE_API_KEYS permission (SUPER_ADMIN) to manage API connections and keys.");
          return;
        }
        if (!cRes.ok || !kRes.ok) {
          setLoadError("Failed to load API management data.");
          return;
        }
        const cPayload = (await cRes.json()) as { connections?: ConnectionRow[] };
        const kPayload = (await kRes.json()) as { keys?: KeyRow[] };
        if (cancelled) return;
        setLoadError(null);
        setConnections(cPayload.connections ?? []);
        setKeys(kPayload.keys ?? []);
      } catch {
        if (!cancelled) setLoadError("Failed to load API management data.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      const [cRes, kRes] = await Promise.all([
        fetch("/api/admin/settings/api-management/connections"),
        fetch("/api/admin/settings/api-management/keys"),
      ]);
      if (cRes.status === 403 || kRes.status === 403) {
        setLoadError("You need MANAGE_API_KEYS permission (SUPER_ADMIN) to manage API connections and keys.");
        return;
      }
      if (!cRes.ok || !kRes.ok) {
        setLoadError("Failed to load API management data.");
        return;
      }
      setLoadError(null);
      const cPayload = (await cRes.json()) as { connections?: ConnectionRow[] };
      const kPayload = (await kRes.json()) as { keys?: KeyRow[] };
      setConnections(cPayload.connections ?? []);
      setKeys(kPayload.keys ?? []);
    } catch {
      setLoadError("Failed to load API management data.");
    }
  }, []);

  function startEdit(row: ConnectionRow) {
    setEditingId(row.id);
    setConnForm({
      name: row.name,
      description: row.description ?? "",
      baseUrl: row.baseUrl,
      authType: row.authType,
      credential: "",
      headerName: row.headerName ?? "X-API-Key",
      additionalHeaders: "",
      environment: row.environment,
      enabled: row.enabled,
    });
    setConnMsg(null);
  }

  function resetConnForm() {
    setEditingId(null);
    setConnForm(emptyConnForm);
  }

  async function saveConnection(e: FormEvent) {
    e.preventDefault();
    setBusy("save-conn");
    setConnMsg(null);
    try {
      const payload = {
        name: connForm.name,
        description: connForm.description || null,
        baseUrl: connForm.baseUrl,
        authType: connForm.authType,
        credential: connForm.credential || undefined,
        headerName: connForm.authType === "api_key_header" ? connForm.headerName : null,
        additionalHeaders: connForm.additionalHeaders || null,
        environment: connForm.environment,
        enabled: connForm.enabled,
      };

      const res = editingId
        ? await fetch(`/api/admin/settings/api-management/connections/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/settings/api-management/connections", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setConnMsg({ ok: false, text: data.error ?? "Save failed." });
        return;
      }
      setConnMsg({ ok: true, text: editingId ? "Connection updated." : "Connection saved." });
      resetConnForm();
      await reload();
    } finally {
      setBusy(null);
    }
  }

  async function testConnection(id: string) {
    setBusy(`test-${id}`);
    setConnMsg(null);
    try {
      const res = await fetch(`/api/admin/settings/api-management/connections/${id}/test`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string; message?: string; status?: string };
      if (!res.ok) {
        setConnMsg({ ok: false, text: data.error ?? "Test failed." });
        return;
      }
      setConnMsg({ ok: true, text: data.message ?? `Status: ${data.status}` });
      await reload();
    } finally {
      setBusy(null);
    }
  }

  async function disableConnection(id: string) {
    setBusy(`disable-${id}`);
    try {
      const res = await fetch(`/api/admin/settings/api-management/connections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setConnMsg({ ok: false, text: data.error ?? "Disable failed." });
        return;
      }
      setConnMsg({ ok: true, text: "Connection disabled." });
      await reload();
    } finally {
      setBusy(null);
    }
  }

  async function deleteConnection(id: string) {
    if (!window.confirm("Delete this connected API? Stored credentials will be removed.")) return;
    setBusy(`delete-${id}`);
    try {
      const res = await fetch(`/api/admin/settings/api-management/connections/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setConnMsg({ ok: false, text: data.error ?? "Delete failed." });
        return;
      }
      setConnMsg({ ok: true, text: "Connection deleted." });
      if (editingId === id) resetConnForm();
      await reload();
    } finally {
      setBusy(null);
    }
  }

  async function generateKey(e: FormEvent) {
    e.preventDefault();
    setBusy("gen-key");
    setKeyMsg(null);
    setRevealedKey(null);
    try {
      const scopes = Object.entries(keyForm.scopes)
        .filter(([, on]) => on)
        .map(([s]) => s);
      if (scopes.length === 0) {
        setKeyMsg({ ok: false, text: "Select at least one scope." });
        return;
      }
      const res = await fetch("/api/admin/settings/api-management/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: keyForm.name,
          description: keyForm.description || null,
          environment: keyForm.environment,
          scopes,
          expiresAt: keyForm.expiresAt ? new Date(keyForm.expiresAt).toISOString() : null,
          rateLimit: keyForm.rateLimit,
        }),
      });
      const data = (await res.json()) as { error?: string; fullKey?: string; warning?: string };
      if (!res.ok) {
        setKeyMsg({ ok: false, text: data.error ?? "Generation failed." });
        return;
      }
      setRevealedKey(data.fullKey ?? null);
      setKeyMsg({
        ok: true,
        text: data.warning ?? "Key generated. Copy it now — it will not be shown again.",
      });
      setKeyForm(emptyKeyForm);
      await reload();
    } finally {
      setBusy(null);
    }
  }

  async function rotateKey(id: string) {
    if (!window.confirm("Rotate this key? The current key will be revoked immediately.")) return;
    setBusy(`rotate-${id}`);
    setRevealedKey(null);
    try {
      const res = await fetch(`/api/admin/settings/api-management/keys/${id}/rotate`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string; fullKey?: string; warning?: string };
      if (!res.ok) {
        setKeyMsg({ ok: false, text: data.error ?? "Rotate failed." });
        return;
      }
      setRevealedKey(data.fullKey ?? null);
      setKeyMsg({ ok: true, text: data.warning ?? "Key rotated. Copy the new key now." });
      await reload();
    } finally {
      setBusy(null);
    }
  }

  async function revokeKey(id: string) {
    if (!window.confirm("Revoke this API key? It will stop working immediately.")) return;
    setBusy(`revoke-${id}`);
    try {
      const res = await fetch(`/api/admin/settings/api-management/keys/${id}/revoke`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setKeyMsg({ ok: false, text: data.error ?? "Revoke failed." });
        return;
      }
      setKeyMsg({ ok: true, text: "API key revoked." });
      await reload();
    } finally {
      setBusy(null);
    }
  }

  async function copyKey() {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey);
      setKeyMsg({ ok: true, text: "Key copied to clipboard." });
    } catch {
      setKeyMsg({ ok: false, text: "Could not copy — select and copy manually." });
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-10 pb-16">
      <div>
        <p className="mb-1 text-xs font-black uppercase tracking-widest text-indigo-400">Platform control</p>
        <h1 className="text-2xl font-black text-white">API Management</h1>
        <p className="mt-1 text-sm text-slate-400">
          Connect external APIs and generate StarLiz outbound keys. Provider keys (OpenAI, Payment, Email, Voice,
          Storage) remain on the main Settings page.
        </p>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200" role="alert">
          {loadError}
        </div>
      ) : null}

      {/* Connected APIs */}
      <AdminCollapsibleCard
        eyebrow="Connected APIs"
        title="Connect API"
        subtitle="Store and test credentials for an external API."
        padding="lg"
      >
        <p className="mb-4 text-xs text-slate-500">
          A successful connection test verifies reachability and authentication only. It does not mean StarLiz features work without separate code mapping.
        </p>

        <form onSubmit={(e) => void saveConnection(e)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-300">
              Name
              <input
                required
                className={`${inputCls} mt-1.5`}
                value={connForm.name}
                onChange={(e) => setConnForm((c) => ({ ...c, name: e.target.value }))}
                placeholder="Partner webhook API"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-300">
              Environment
              <select
                className={`${inputCls} mt-1.5`}
                value={connForm.environment}
                onChange={(e) => setConnForm((c) => ({ ...c, environment: e.target.value as Environment }))}
              >
                <option value="test">Test</option>
                <option value="live">Live</option>
              </select>
            </label>
          </div>

          <label className="block text-sm font-semibold text-slate-300">
            Description
            <input
              className={`${inputCls} mt-1.5`}
              value={connForm.description}
              onChange={(e) => setConnForm((c) => ({ ...c, description: e.target.value }))}
              placeholder="Optional notes"
            />
          </label>

          <label className="block text-sm font-semibold text-slate-300">
            Base URL
            <input
              required
              type="url"
              className={`${inputCls} mt-1.5`}
              value={connForm.baseUrl}
              onChange={(e) => setConnForm((c) => ({ ...c, baseUrl: e.target.value }))}
              placeholder="https://api.example.com/v1"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-300">
              Auth type
              <select
                className={`${inputCls} mt-1.5`}
                value={connForm.authType}
                onChange={(e) => setConnForm((c) => ({ ...c, authType: e.target.value as AuthType }))}
              >
                <option value="bearer">Bearer token</option>
                <option value="api_key_header">API key header</option>
                <option value="basic">Basic auth</option>
                <option value="none">None</option>
              </select>
            </label>
            {connForm.authType === "api_key_header" ? (
              <label className="block text-sm font-semibold text-slate-300">
                Header name
                <input
                  className={`${inputCls} mt-1.5`}
                  value={connForm.headerName}
                  onChange={(e) => setConnForm((c) => ({ ...c, headerName: e.target.value }))}
                />
              </label>
            ) : (
              <div />
            )}
          </div>

          {connForm.authType !== "none" ? (
            <label className="block text-sm font-semibold text-slate-300">
              API key / token{editingId ? " (leave blank to keep existing)" : ""}
              <input
                type="password"
                autoComplete="off"
                className={`${inputCls} mt-1.5`}
                value={connForm.credential}
                onChange={(e) => setConnForm((c) => ({ ...c, credential: e.target.value }))}
                placeholder={editingId ? "••••••••" : "Paste credential"}
              />
            </label>
          ) : null}

          <label className="block text-sm font-semibold text-slate-300">
            Additional headers (JSON or key=value lines)
            <textarea
              className={`${inputCls} mt-1.5 font-mono text-xs`}
              rows={3}
              value={connForm.additionalHeaders}
              onChange={(e) => setConnForm((c) => ({ ...c, additionalHeaders: e.target.value }))}
              placeholder={'{\n  "X-Custom": "value"\n}'}
            />
          </label>

          <label className="flex items-center gap-3 text-sm font-semibold text-slate-300">
            <input
              type="checkbox"
              checked={connForm.enabled}
              onChange={(e) => setConnForm((c) => ({ ...c, enabled: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-indigo-500"
            />
            Enabled
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={busy === "save-conn"}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {editingId ? "Update" : "Save"}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={resetConnForm}
                className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>

        {connMsg ? (
          <p className={`mt-4 text-sm ${connMsg.ok ? "text-emerald-400" : "text-rose-400"}`} role="status">
            {connMsg.text}
          </p>
        ) : null}

        <div className="mt-8 space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Saved connections</p>
          {connections.length === 0 ? (
            <p className="text-sm text-slate-500">No connected APIs yet.</p>
          ) : (
            connections.map((row) => (
              <div
                key={row.id}
                className="rounded-2xl border border-slate-700/60 bg-slate-950/50 px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-white">{row.name}</p>
                    <p className="mt-0.5 break-all font-mono text-xs text-slate-400">{row.baseUrl}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {row.authType} · {row.environment} ·{" "}
                      <span className={statusColour[row.status] ?? "text-slate-400"}>
                        {statusLabel(row.status)}
                      </span>
                      {row.credentialHint ? ` · ${row.credentialHint}` : ""}
                    </p>
                    {row.lastTestedAt ? (
                      <p className="mt-1 text-xs text-slate-600">Last tested {formatDate(row.lastTestedAt)}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void testConnection(row.id)}
                      disabled={busy === `test-${row.id}`}
                      className="rounded-lg border border-indigo-500/40 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-50"
                    >
                      Test
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(row)}
                      className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                    >
                      Edit
                    </button>
                    {row.enabled ? (
                      <button
                        type="button"
                        onClick={() => void disableConnection(row.id)}
                        disabled={busy === `disable-${row.id}`}
                        className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
                      >
                        Disable
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void deleteConnection(row.id)}
                      disabled={busy === `delete-${row.id}`}
                      className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </AdminCollapsibleCard>

      {/* Generated keys */}
      <AdminCollapsibleCard
        eyebrow="Generated API Keys"
        title="Generate API Key"
        subtitle="Create credentials that another authorised system can use to access supported StarLiz API endpoints."
        padding="lg"
      >

        <form onSubmit={(e) => void generateKey(e)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-300">
              Key name
              <input
                required
                className={`${inputCls} mt-1.5`}
                value={keyForm.name}
                onChange={(e) => setKeyForm((c) => ({ ...c, name: e.target.value }))}
                placeholder="Ops reporting client"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-300">
              Environment
              <select
                className={`${inputCls} mt-1.5`}
                value={keyForm.environment}
                onChange={(e) => setKeyForm((c) => ({ ...c, environment: e.target.value as Environment }))}
              >
                <option value="test">Test (sl_test_…)</option>
                <option value="live">Live (sl_live_…)</option>
              </select>
            </label>
          </div>

          <label className="block text-sm font-semibold text-slate-300">
            Description
            <input
              className={`${inputCls} mt-1.5`}
              value={keyForm.description}
              onChange={(e) => setKeyForm((c) => ({ ...c, description: e.target.value }))}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-300">
              Expiry (optional)
              <input
                type="datetime-local"
                className={`${inputCls} mt-1.5`}
                value={keyForm.expiresAt}
                onChange={(e) => setKeyForm((c) => ({ ...c, expiresAt: e.target.value }))}
              />
            </label>
            <label className="block text-sm font-semibold text-slate-300">
              Rate limit (req/min)
              <input
                type="number"
                min={1}
                max={10000}
                className={`${inputCls} mt-1.5`}
                value={keyForm.rateLimit}
                onChange={(e) => setKeyForm((c) => ({ ...c, rateLimit: Number(e.target.value) || 60 }))}
              />
            </label>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-300">Scopes</p>
            <div className="flex flex-wrap gap-4">
              {(["api:read", "api:write"] as const).map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={Boolean(keyForm.scopes[scope])}
                    onChange={(e) =>
                      setKeyForm((c) => ({
                        ...c,
                        scopes: { ...c.scopes, [scope]: e.target.checked },
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-indigo-500"
                  />
                  {scope}
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={busy === "gen-key"}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Generate key
          </button>
        </form>

        {revealedKey ? (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-950/30 p-4" role="status">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-300">
              Copy this key now — it will not be shown again
            </p>
            <code className="mt-2 block break-all font-mono text-sm text-white">{revealedKey}</code>
            <button
              type="button"
              onClick={() => void copyKey()}
              className="mt-3 rounded-lg bg-amber-600/80 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500"
            >
              Copy
            </button>
          </div>
        ) : null}

        {keyMsg ? (
          <p className={`mt-4 text-sm ${keyMsg.ok ? "text-emerald-400" : "text-rose-400"}`} role="status">
            {keyMsg.text}
          </p>
        ) : null}

        <div className="mt-8 overflow-x-auto">
          <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">Issued keys</p>
          {keys.length === 0 ? (
            <p className="text-sm text-slate-500">No generated API keys yet.</p>
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Name</th>
                  <th className="py-2 pr-3 font-semibold">Prefix</th>
                  <th className="py-2 pr-3 font-semibold">Env</th>
                  <th className="py-2 pr-3 font-semibold">Scopes</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold">Created</th>
                  <th className="py-2 pr-3 font-semibold">Last used</th>
                  <th className="py-2 pr-3 font-semibold">Expires</th>
                  <th className="py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((row) => (
                  <tr key={row.id} className="border-b border-slate-800/80 text-slate-300">
                    <td className="py-3 pr-3 font-semibold text-white">{row.name}</td>
                    <td className="py-3 pr-3 font-mono text-xs">{row.keyPrefix}</td>
                    <td className="py-3 pr-3">{row.environment}</td>
                    <td className="py-3 pr-3 text-xs">{row.scopes.join(", ")}</td>
                    <td className={`py-3 pr-3 ${statusColour[row.status] ?? ""}`}>
                      {statusLabel(row.status)}
                    </td>
                    <td className="py-3 pr-3 text-xs">{formatDate(row.createdAt)}</td>
                    <td className="py-3 pr-3 text-xs">{formatDate(row.lastUsedAt)}</td>
                    <td className="py-3 pr-3 text-xs">{formatDate(row.expiresAt)}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        {row.status === "active" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void rotateKey(row.id)}
                              disabled={busy === `rotate-${row.id}`}
                              className="rounded-lg border border-indigo-500/40 px-2.5 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-50"
                            >
                              Rotate
                            </button>
                            <button
                              type="button"
                              onClick={() => void revokeKey(row.id)}
                              disabled={busy === `revoke-${row.id}`}
                              className="rounded-lg border border-rose-500/40 px-2.5 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                            >
                              Revoke
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </AdminCollapsibleCard>
    </div>
  );
}
