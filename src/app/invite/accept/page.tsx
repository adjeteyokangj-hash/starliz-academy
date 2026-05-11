"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type InvitePreview = {
  valid: boolean;
  schoolName: string;
  teacherEmail: string;
  teacherName: string | null;
  role: string;
  expiresAt: string;
};

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!token) {
        setPreviewError("No invite token provided.");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/auth/teacher-invite?token=${encodeURIComponent(token)}`);
        const data = await res.json() as InvitePreview & { error?: string };
        if (!res.ok) {
          setPreviewError(data.error ?? "Invalid invite link.");
        } else {
          setPreview(data);
          if (data.teacherName) setName(data.teacherName);
        }
      } catch {
        setPreviewError("Failed to load invite details.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    if (password !== confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/teacher-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, name: name.trim() || undefined }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        setSubmitError(data.error ?? "Failed to activate account.");
        return;
      }
      setDone(true);
      setTimeout(() => router.replace("/teacher"), 2000);
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-foreground/60 animate-pulse">Validating invite link…</p>
      </main>
    );
  }

  if (previewError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mb-4 text-4xl">⚠️</div>
          <h1 className="mb-2 text-xl font-bold text-foreground">Invite Link Invalid</h1>
          <p className="mb-6 text-sm text-foreground/60">{previewError}</p>
          <Link href="/auth/login" className="text-sm text-primary hover:underline">
            Go to login
          </Link>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mb-4 text-4xl">✅</div>
          <h1 className="mb-2 text-xl font-bold text-foreground">Account Activated</h1>
          <p className="text-sm text-foreground/60">
            Welcome to {preview?.schoolName}! Redirecting to your dashboard…
          </p>
        </div>
      </main>
    );
  }

  const roleLabel: Record<string, string> = {
    owner: "School Owner",
    admin: "School Admin",
    teacher: "Teacher",
    support: "Support Staff",
    staff_observer: "Staff Observer",
    finance: "Finance",
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mb-2 text-3xl">🏫</div>
          <h1 className="text-2xl font-bold text-foreground">You&apos;re invited!</h1>
          <p className="mt-1 text-sm text-foreground/60">
            Join <strong>{preview?.schoolName}</strong> as{" "}
            <span className="font-medium text-primary">
              {roleLabel[preview?.role ?? "teacher"] ?? preview?.role}
            </span>
          </p>
          <p className="mt-1 text-xs text-foreground/40">
            Signing in as <span className="font-mono">{preview?.teacherEmail}</span>
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="name">
              Your Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="password">
              Set Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="At least 8 characters"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="confirm">
              Confirm Password
            </label>
            <input
              id="confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Repeat password"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {submitError && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "Activating…" : "Activate Account & Join School"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-foreground/40">
          This invite expires{" "}
          {preview?.expiresAt
            ? new Date(preview.expiresAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : "soon"}
          .
        </p>
      </div>
    </main>
  );
}
