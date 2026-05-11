"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type InvitePreview = {
  schoolName: string;
  schoolId: string;
  targetEmail: string;
  role: string;
  inviteType: string;
  expiresAt: string;
};

export default function AcceptSchoolInvitePage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const missingToken = !token;

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load invite preview
  useEffect(() => {
    if (missingToken) {
      return;
    }
    fetch(`/api/school/invites/accept?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setLoadError(data.error);
        else setPreview(data);
      })
      .catch(() => setLoadError("Could not load invite details."));
  }, [missingToken, token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/school/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, name: name || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.replace(data.redirectTo ?? "/teacher");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const roleLabel: Record<string, string> = {
    owner: "School Owner",
    admin: "School Admin",
    teacher: "Teacher",
    support: "Support Staff",
    staff_observer: "Staff Observer",
    finance: "Finance",
  };

  if (missingToken || loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <p className="text-lg font-semibold text-destructive mb-2">Invite Not Valid</p>
          <p className="text-sm text-foreground/70">{loadError ?? "Missing invite token."}</p>
        </div>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-foreground/50 animate-pulse">Loading invite...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full">
        {/* School badge */}
        <div className="mb-6 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
            You&apos;re invited to
          </p>
          <p className="text-2xl font-bold text-foreground">{preview.schoolName}</p>
          <p className="mt-1 text-sm text-foreground/60">
            Role:{" "}
            <span className="font-semibold text-foreground">
              {roleLabel[preview.role] ?? preview.role}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-foreground/40">
            Invite for {preview.targetEmail} · expires{" "}
            {new Date(preview.expiresAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>

        {/* Set-up form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4"
        >
          <h2 className="text-lg font-semibold text-foreground">Set up your account</h2>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Your name <span className="text-foreground/40">(optional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={preview.targetEmail.split("@")[0]}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="At least 8 characters"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Confirm password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Repeat password"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "Activating..." : "Activate account & sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
