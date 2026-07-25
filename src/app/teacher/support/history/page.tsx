"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TeacherSupportDashboard } from "@/lib/schools/teacher-support-dashboard";

export default function TeacherSupportHistoryPage() {
  const [rows, setRows] = useState<TeacherSupportDashboard["recentHistory"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/teacher/support", {
          credentials: "include",
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Unable to load history.");
        }
        if (!active) return;
        setRows((data.dashboard as TeacherSupportDashboard).recentHistory ?? []);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Unable to load history.");
        setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-10">
      <header className="mb-6">
        <Link href="/teacher/support" className="text-sm font-semibold text-sky-700 hover:underline">
          ← Support
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Support history</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Your completed human support sessions. Capacity metrics only — no rankings.
        </p>
      </header>

      {loading ? <p className="text-sm text-foreground/60">Loading…</p> : null}
      {error ? (
        <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-800">{error}</p>
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground/60">
          No completed sessions yet.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {rows.map((row) => (
            <li key={row.sessionId} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">{row.studentName}</p>
                  <p className="mt-0.5 text-xs text-foreground/50">
                    Started {new Date(row.startedAt).toLocaleString()}
                    {row.endedAt ? ` · ended ${new Date(row.endedAt).toLocaleString()}` : ""}
                  </p>
                </div>
                <div className="text-right text-xs font-semibold text-foreground/70">
                  <p className="capitalize">{(row.outcome ?? row.status).replaceAll("_", " ")}</p>
                  {row.exceededBudget ? <p className="text-amber-700">Over budget</p> : null}
                  {row.hasUnresolvedReport ? <p className="text-sky-700">Report filed</p> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
