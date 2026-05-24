"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type AwardNomination = {
  awardType: string;
  awardScope: string;
  studentId: string;
  studentName: string;
  yearGroup: string | null;
  term: string;
  academicYear: string;
  subject: string | null;
  strand: string | null;
  score: number;
  rank: number | null;
  status: "pending_review";
  eligibleForNomination: boolean;
  evidenceSummary: {
    evidenceVolume: number;
    baselineAccuracy: number;
    currentAccuracy: number;
    improvementPoints: number;
    assessmentScore: number;
    assignmentCompletionScore: number;
    attemptQualityScore: number;
    masteryAndAdvancementScore: number;
    levelAdvancementScore: number;
    catchUpAndResilienceScore: number;
    consistencyScore: number;
    activeWeakAreas: number;
    resolvedWeakAreas: number;
    fastLowQualityAttemptRatio: number;
  };
  reasons: string[];
  blockers: string[];
  safeguards: string[];
};

type AwardsPayload = {
  ok?: boolean;
  code?: "not_enough_evidence";
  message?: string;
  summary?: {
    studentCount: number;
    nominationsCount: number;
    eligibleCount: number;
  };
  nominations?: AwardNomination[];
  error?: string;
};

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .map((part) => (part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

export default function AdminAwardsNominationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AwardsPayload | null>(null);

  const load = useCallback(async (withLoading = true) => {
    if (withLoading) setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/awards/nominations?scope=platform", { credentials: "include" });
      const json = (await response.json()) as AwardsPayload;
      if (!response.ok) {
        setError(json.error ?? "Unable to load award nominations.");
        setPayload(null);
        return;
      }
      setPayload(json);
    } catch {
      setError("Unable to load award nominations.");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load(false);
    }, 0);

    return () => {
      window.clearTimeout(id);
    };
  }, [load]);

  const topEligible = useMemo(() => {
    return (payload?.nominations ?? [])
      .filter((row) => row.eligibleForNomination)
      .sort((a, b) => b.score - a.score)
      .slice(0, 24);
  }, [payload?.nominations]);

  return (
    <main className="space-y-6">
      <section>
        <h1 className="text-3xl font-black text-white">Award Nominations</h1>
        <p className="mt-1 text-sm text-slate-400">Evidence-backed nominations only. All rows are pending admin review.</p>
      </section>

      {loading ? <p className="text-sm text-slate-400">Loading nominations...</p> : null}
      {error ? <p className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
      {payload?.message ? <p className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">{payload.message}</p> : null}

      {payload?.summary ? (
        <section className="grid gap-3 md:grid-cols-3">
          <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
            <p className="text-xs text-slate-400">Students Evaluated</p>
            <p className="mt-1 text-2xl font-black text-white">{payload.summary.studentCount}</p>
          </article>
          <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
            <p className="text-xs text-slate-400">Nominations Generated</p>
            <p className="mt-1 text-2xl font-black text-white">{payload.summary.nominationsCount}</p>
          </article>
          <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
            <p className="text-xs text-slate-400">Eligible for Review</p>
            <p className="mt-1 text-2xl font-black text-white">{payload.summary.eligibleCount}</p>
          </article>
        </section>
      ) : null}

      <section className="space-y-3">
        {topEligible.map((row) => (
          <article key={`${row.studentId}-${row.awardType}-${row.subject ?? "none"}-${row.strand ?? "none"}`} className="rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-white">{titleCase(row.awardType)} · {row.studentName}</p>
              <span className="rounded-full border border-amber-500/40 bg-amber-950/40 px-2 py-0.5 text-xs font-bold text-amber-200">pending_review</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Scope: {titleCase(row.awardScope)} · Year Group: {row.yearGroup ?? "n/a"} · Score: {row.score}
              {row.subject ? ` · Subject: ${row.subject}` : ""}
              {row.strand ? ` · Strand: ${titleCase(row.strand)}` : ""}
            </p>
            <p className="mt-2 text-xs text-slate-300">
              Evidence: assessment {row.evidenceSummary.assessmentScore}, completion {row.evidenceSummary.assignmentCompletionScore},
              improvement {row.evidenceSummary.improvementPoints}, mastery {row.evidenceSummary.masteryAndAdvancementScore}, consistency {row.evidenceSummary.consistencyScore}
            </p>
            {row.reasons.length ? <p className="mt-2 text-xs text-emerald-300">Reasons: {row.reasons.join(" | ")}</p> : null}
            {row.blockers.length ? <p className="mt-2 text-xs text-rose-300">Blockers: {row.blockers.join(" | ")}</p> : null}
          </article>
        ))}

        {!loading && !topEligible.length ? (
          <p className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">No eligible nominations yet.</p>
        ) : null}
      </section>
    </main>
  );
}
