"use client";

import { FormEvent, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import type { OneTimeChildCredentials } from "./ChildLoginCredentialsReveal";

type LoginMode = "generated" | "manual";

export type ResetChildLoginResult = {
  childName: string;
  credentials: OneTimeChildCredentials;
};

type Props = {
  childId: string;
  childName: string;
  currentUsername: string;
  onSuccess: (result: ResetChildLoginResult) => void;
  onCancel: () => void;
};

type UsernameCheck = {
  available: boolean;
  valid: boolean;
  message: string | null;
  suggestions: string[];
};

export default function ResetChildLoginPanel({
  childId,
  childName,
  currentUsername,
  onSuccess,
  onCancel,
}: Props) {
  const [loginMode, setLoginMode] = useState<LoginMode>("generated");
  const [manualUsername, setManualUsername] = useState(currentUsername);
  const [manualPassword, setManualPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameCheck, setUsernameCheck] = useState<UsernameCheck | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  useEffect(() => {
    setManualUsername(currentUsername);
  }, [currentUsername]);

  useEffect(() => {
    if (loginMode !== "manual") {
      setUsernameCheck(null);
      return;
    }
    const trimmed = manualUsername.trim();
    if (trimmed.length < 3) {
      setUsernameCheck(null);
      return;
    }
    if (trimmed === currentUsername) {
      setUsernameCheck({
        available: true,
        valid: true,
        message: "Keeping the current username.",
        suggestions: [],
      });
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        setCheckingUsername(true);
        try {
          const qs = new URLSearchParams({
            username: trimmed,
            childName,
          });
          const response = await fetch(`/api/parent/usernames/availability?${qs}`, {
            credentials: "include",
          });
          const payload = (await response.json().catch(() => null)) as {
            available?: boolean;
            valid?: boolean;
            message?: string | null;
            suggestions?: string[];
            error?: string;
          } | null;
          if (!response.ok) {
            setUsernameCheck({
              available: false,
              valid: false,
              message: payload?.error ?? "Could not check username.",
              suggestions: [],
            });
            return;
          }
          setUsernameCheck({
            available: Boolean(payload?.available),
            valid: Boolean(payload?.valid),
            message: payload?.message ?? null,
            suggestions: Array.isArray(payload?.suggestions) ? payload.suggestions : [],
          });
        } catch {
          setUsernameCheck({
            available: false,
            valid: false,
            message: "Could not check username right now.",
            suggestions: [],
          });
        } finally {
          setCheckingUsername(false);
        }
      })();
    }, 350);

    return () => window.clearTimeout(timer);
  }, [childName, currentUsername, loginMode, manualUsername]);

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

      const response = await fetch(
        `/api/parent/children/${encodeURIComponent(childId)}/account/reset`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        code?: string;
        suggestions?: string[];
        credentials?: { username?: string; password?: string };
      } | null;

      if (!response.ok) {
        const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
        if (payload?.code === "username_taken" || suggestions.length > 0) {
          setUsernameCheck({
            available: false,
            valid: true,
            message: payload?.error ?? "That username is already taken.",
            suggestions,
          });
        }
        setError(payload?.error ?? "Could not reset login. Please try again.");
        return;
      }

      const username = payload?.credentials?.username?.trim() ?? "";
      const password = payload?.credentials?.password ?? "";
      if (!username || !password) {
        setError("Login was reset but credentials were not returned. Contact support if needed.");
        return;
      }

      onSuccess({
        childName,
        credentials: { username, password },
      });
    } catch {
      setError("Could not reset login. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div>
        <h3 className="text-base font-semibold text-white">Reset login for {childName}</h3>
        <p className="mt-1 text-sm text-slate-300">
          Create a new password (and optionally change the username). The new password is shown once and is not stored in plain text.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Current username: <code className="text-slate-200">{currentUsername}</code>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setLoginMode("generated")}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
            loginMode === "generated"
              ? "bg-amber-600 text-white"
              : "bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          Generate new password
        </button>
        <button
          type="button"
          onClick={() => setLoginMode("manual")}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
            loginMode === "manual"
              ? "bg-amber-600 text-white"
              : "bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          Set manually
        </button>
      </div>

      {loginMode === "generated" ? (
        <p className="text-sm text-slate-400">
          We will keep the username <code className="text-slate-200">{currentUsername}</code> and create a secure new password for you to save once.
        </p>
      ) : (
        <div className="space-y-3">
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
              New password
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

          {checkingUsername ? (
            <p className="text-xs text-slate-400">Checking username availability…</p>
          ) : null}

          {usernameCheck ? (
            <div className="space-y-2">
              <p
                className={`text-sm font-medium ${
                  usernameCheck.available ? "text-emerald-300" : "text-amber-200"
                }`}
              >
                {usernameCheck.message}
              </p>
              {!usernameCheck.available && usernameCheck.suggestions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs text-slate-400 self-center">Suggestions:</span>
                  {usernameCheck.suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setManualUsername(suggestion)}
                      className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {error ? <p className="text-sm font-semibold text-rose-300">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={
            saving
            || (loginMode === "manual"
              && usernameCheck !== null
              && usernameCheck.valid
              && !usernameCheck.available)
          }
          className="bg-amber-600 hover:bg-amber-700"
        >
          {saving ? "Resetting…" : "Reset Login"}
        </Button>
        <Button type="button" onClick={onCancel} disabled={saving} className="bg-white/10 hover:bg-white/15">
          Cancel
        </Button>
      </div>
    </form>
  );
}
