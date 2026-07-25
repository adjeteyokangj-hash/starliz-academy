"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type StudentRow = {
  id: string;
  name: string;
  yearGroup: string | null;
};

type ReadinessRow = {
  studentId: string;
  name: string;
  yearGroup: string | null;
  band: "not_ready" | "nearly_ready" | "ready";
  score: number;
  headline: string;
  readinessStatus: string;
};

export default function AdminAssessmentReadinessPage() {
  const [rows, setRows] = useState<ReadinessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const studentsRes = await fetch("/api/admin/students", { credentials: "include" });
        if (!studentsRes.ok) throw new Error("Unable to load students.");
        const studentsPayload = (await studentsRes.json()) as { students?: StudentRow[] };
        const students = (studentsPayload.students ?? []).slice(0, 20);

        const readinessRows = await Promise.all(students.map(async (student) => {
          const aiRes = await fetch(`/api/admin/academic-intelligence?studentId=${encodeURIComponent(student.id)}`, { credentials: "include" });
          if (!aiRes.ok) return null;
          const payload = (await aiRes.json()) as {
            examReadinessProfile?: { band: "not_ready" | "nearly_ready" | "ready"; score: number; headline: string };
            assessmentReadiness?: string;
          };
          if (!payload.examReadinessProfile) return null;
          return {
            studentId: student.id,
            name: student.name,
            yearGroup: student.yearGroup,
            band: payload.examReadinessProfile.band,
            score: payload.examReadinessProfile.score,
            headline: payload.examReadinessProfile.headline,
            readinessStatus: payload.assessmentReadiness ?? "not_ready",
          } satisfies ReadinessRow;
        }));

        if (!cancelled) {
          setRows(readinessRows.filter((row): row is ReadinessRow => Boolean(row)).sort((left, right) => left.score - right.score));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load readiness dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  const notReady = rows.filter((row) => row.band === "not_ready").length;
  const nearlyReady = rows.filter((row) => row.band === "nearly_ready").length;
  const ready = rows.filter((row) => row.band === "ready").length;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Admin dashboard</p>
        <h1 className="mt-1 text-2xl font-black text-white">AI Assessment and Exam Readiness</h1>
        <p className="mt-1 text-sm text-slate-300">Quick triage view across learners for intervention priorities.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">Not ready: <span className="font-black">{notReady}</span></div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">Nearly ready: <span className="font-black">{nearlyReady}</span></div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">Ready: <span className="font-black">{ready}</span></div>
      </div>

      {loading ? <p className="text-sm text-slate-300">Loading readiness signals...</p> : null}
      {error ? <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.studentId} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-white">{row.name} {row.yearGroup ? `• ${row.yearGroup}` : ""}</p>
                <p className="text-xs text-slate-400">{row.headline}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-cyan-200">{row.score}%</p>
                <p className="text-[11px] text-slate-400">{row.readinessStatus.replaceAll("_", " ")}</p>
                <Link href={`/admin/students/${row.studentId}`} className="text-[11px] font-semibold text-cyan-300 hover:text-cyan-200">Open student</Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
