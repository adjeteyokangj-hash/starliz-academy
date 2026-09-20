"use client";

import { FormEvent, useState } from "react";
import Button from "@/components/ui/Button";
import type { OneTimeChildCredentials } from "./ChildLoginCredentialsReveal";

type LoginMode = "generated" | "manual";

export type CreateChildLoginResult = {
  childName: string;
  credentials: OneTimeChildCredentials;
};

type Props = {
  childId: string;
  childName: string;
  onSuccess: (result: CreateChildLoginResult) => void;
  onCancel: () => void;
};

export default function CreateChildLoginPanel({ childId, childName, onSuccess, onCancel }: Props) {
  const [loginMode, setLoginMode] = useState<LoginMode>("generated");
  const [manualUsername, setManualUsername] = useState("");
  const [manualPassword, setManualPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const body =
        loginMode === "generated"
          ? { mode: "generated" as const }
          : {
              mode: "manual" as const,
              username: manualUsername,
              password: manualPassword,
            };

      const response = await fetch(`/api/parent/children/${encodeURIComponent(childId)}/account`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        credentials?: { username?: string; password?: string };
      } | null;

      if (!response.ok) {
        setError(payload?.error ?? "Could not create login. Please try again.");
        return;
      }

      const username = payload?.credentials?.username?.trim() ?? "";
      const password = payload?.credentials?.password ?? "";
      if (!username || !password) {
        setError("Login was created but credentials were not returned. Contact support if needed.");
        return;
      }

      onSuccess({
        childName,
        credentials: { username, password },
      });
    } catch {
      setError("Could not create login. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
      <div>
        <h3 className="text-base font-semibold text-white">Create login for {childName}</h3>
        <p className="mt-1 text-sm text-slate-300">
          Generate a username and password, or enter them manually. The password is shown once and is not stored in plain text.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setLoginMode("generated")}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
            loginMode === "generated"
              ? "bg-cyan-600 text-white"
              : "bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          Generate login
        </button>
        <button
          type="button"
          onClick={() => setLoginMode("manual")}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
            loginMode === "manual"
              ? "bg-cyan-600 text-white"
              : "bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          Manual login
        </button>
      </div>

      {loginMode === "generated" ? (
        <p className="text-sm text-slate-400">
          We will create a username from {childName}&apos;s name and a secure password for you to save once.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-slate-300">
            Username
            <input
              type="text"
              autoComplete="off"
              value={manualUsername}
              onChange={(event) => setManualUsername(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-white"
              required
            />
          </label>
          <label className="block text-sm text-slate-300">
            Password
            <input
              type="password"
              autoComplete="new-password"
              value={manualPassword}
              onChange={(event) => setManualPassword(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-white"
              required
            />
          </label>
        </div>
      )}

      {error ? <p className="text-sm font-semibold text-rose-300">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving} className="bg-cyan-600 hover:bg-cyan-700">
          {saving ? "Creating…" : "Create Login"}
        </Button>
        <Button type="button" onClick={onCancel} disabled={saving} className="bg-white/10 hover:bg-white/15">
          Cancel
        </Button>
      </div>
    </form>
  );
}
