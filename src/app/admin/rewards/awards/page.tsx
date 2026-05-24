"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type AwardNomination = {
  nominationId: string;
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
  status: "pending_review" | "approved" | "rejected";
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
  reviewDecision?: {
    status: "approved" | "rejected";
    reason: string | null;
    reviewedAt: string;
    reviewedBy: string;
  } | null;
  issuedAwardCertificate?: {
    certificateNumber: string;
    verificationCode: string;
    issuedAt: string;
    verificationUrl: string;
  } | null;
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
  limitationNote?: string;
  error?: string;
};

type ReviewPayload = {
  ok?: boolean;
  message?: string;
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
  const [message, setMessage] = useState<string | null>(null);
  const [workingNominationId, setWorkingNominationId] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const load = useCallback(async (withLoading = true) => {
    if (withLoading) setLoading(true);
    setError(null);
    setMessage(null);
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

  async function reviewNomination(input: {
    row: AwardNomination;
    action: "approve" | "reject" | "issue_award_certificate";
  }) {
    setError(null);
    setMessage(null);
    setWorkingNominationId(input.row.nominationId);

    const response = await fetch(`/api/admin/awards/nominations/${encodeURIComponent(input.row.nominationId)}/review`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: input.action,
        studentId: input.row.studentId,
        term: input.row.term,
        academicYear: input.row.academicYear,
        reason: rejectReasons[input.row.nominationId] ?? "",
        reviewNote: reviewNotes[input.row.nominationId] ?? "",
      }),
    });

    const json = (await response.json()) as ReviewPayload;
    if (!response.ok || !json.ok) {
      setError(json.error ?? "Unable to update nomination review state.");
      setWorkingNominationId(null);
      return;
    }

    setMessage(json.message ?? "Nomination review updated.");
    setWorkingNominationId(null);
    await load(false);
  }

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load(false);
    }, 0);

    return () => {
      window.clearTimeout(id);
    };
  }, [load]);

  const visibleRows = useMemo(() => {
    return (payload?.nominations ?? [])
      .sort((a, b) => b.score - a.score)
      .slice(0, 32);
  }, [payload?.nominations]);

  return (
    <main className="space-y-6">
      <section>
        <h1 className="text-3xl font-black text-white">Award Nominations</h1>
        <p className="mt-1 text-sm text-slate-400">Evidence-backed nominations only. All rows are pending admin review.</p>
      </section>

      {loading ? <p className="text-sm text-slate-400">Loading nominations...</p> : null}
      {error ? <p className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
      {message ? <p className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">{message}</p> : null}
      {payload?.limitationNote ? <p className="rounded-xl border border-cyan-500/40 bg-cyan-950/30 px-3 py-2 text-sm text-cyan-200">{payload.limitationNote}</p> : null}
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
        {visibleRows.map((row) => (
          <article key={row.nominationId} className="rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-white">{titleCase(row.awardType)} · {row.studentName}</p>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${
                row.status === "approved"
                  ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-200"
                  : row.status === "rejected"
                    ? "border-rose-500/40 bg-rose-950/40 text-rose-200"
                    : "border-amber-500/40 bg-amber-950/40 text-amber-200"
              }`}>{row.status}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Scope: {titleCase(row.awardScope)} · Year Group: {row.yearGroup ?? "n/a"} · Score: {row.score}
              {row.subject ? ` · Subject: ${row.subject}` : ""}
              {row.strand ? ` · Strand: ${titleCase(row.strand)}` : ""}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">Nomination ID: {row.nominationId}</p>
            <p className="mt-2 text-xs text-slate-300">
              Evidence: assessment {row.evidenceSummary.assessmentScore}, completion {row.evidenceSummary.assignmentCompletionScore},
              improvement {row.evidenceSummary.improvementPoints}, mastery {row.evidenceSummary.masteryAndAdvancementScore}, consistency {row.evidenceSummary.consistencyScore}
            </p>
            {row.reasons.length ? <p className="mt-2 text-xs text-emerald-300">Reasons: {row.reasons.join(" | ")}</p> : null}
            {row.blockers.length ? <p className="mt-2 text-xs text-rose-300">Blockers: {row.blockers.join(" | ")}</p> : null}
            {row.safeguards.length ? <p className="mt-2 text-xs text-cyan-300">Safeguards: {row.safeguards.join(" | ")}</p> : null}

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Review Note (for blocked approvals)
                <input
                  value={reviewNotes[row.nominationId] ?? ""}
                  onChange={(event) => setReviewNotes((prev) => ({ ...prev, [row.nominationId]: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white"
                />
              </label>
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Rejection Reason
                <input
                  value={rejectReasons[row.nominationId] ?? ""}
                  onChange={(event) => setRejectReasons((prev) => ({ ...prev, [row.nominationId]: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white"
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void reviewNomination({ row, action: "approve" })}
                disabled={workingNominationId === row.nominationId}
                className="rounded-lg border border-emerald-600 bg-emerald-950/40 px-3 py-1.5 text-xs font-bold text-emerald-200 disabled:opacity-60"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => void reviewNomination({ row, action: "reject" })}
                disabled={workingNominationId === row.nominationId}
                className="rounded-lg border border-rose-600 bg-rose-950/40 px-3 py-1.5 text-xs font-bold text-rose-200 disabled:opacity-60"
              >
                Reject
              </button>
              {row.status === "approved" ? (
                <button
                  type="button"
                  onClick={() => void reviewNomination({ row, action: "issue_award_certificate" })}
                  disabled={workingNominationId === row.nominationId}
                  className="rounded-lg border border-cyan-600 bg-cyan-950/40 px-3 py-1.5 text-xs font-bold text-cyan-200 disabled:opacity-60"
                >
                  Issue Award Certificate
                </button>
              ) : null}
            </div>

            {row.issuedAwardCertificate ? (
              <div className="mt-3 rounded-xl border border-emerald-700/40 bg-emerald-950/20 p-3 text-xs text-emerald-100">
                <p>Certificate Number: <span className="font-mono">{row.issuedAwardCertificate.certificateNumber}</span></p>
                <p>Verification Code: <span className="font-mono">{row.issuedAwardCertificate.verificationCode}</span></p>
                <p>Issued At: {new Date(row.issuedAwardCertificate.issuedAt).toLocaleString()}</p>
                <button
                  type="button"
                  onClick={() => window.open(`/certificates/verify/${encodeURIComponent(row.issuedAwardCertificate?.verificationCode ?? "")}`, "_blank", "noopener,noreferrer")}
                  className="mt-2 rounded border border-emerald-500/40 bg-emerald-900/40 px-2 py-1 text-xs font-bold text-emerald-100"
                >
                  Open Verification
                </button>
              </div>
            ) : null}
          </article>
        ))}

        {!loading && !visibleRows.length ? (
          <p className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">No eligible nominations yet.</p>
        ) : null}
      </section>
    </main>
  );
}
