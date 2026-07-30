"use client";

import CollapsibleCard from "@/components/school-admin/CollapsibleCard";

import Link from "next/link";
import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ShortLearningSubNav from "@/components/school-admin/ShortLearningSubNav";

type View = "7d" | "48h" | "deadline" | "late-capacity-only";

type DemandBucket = {
  startsAt: string;
  bookingCount: number;
  lateBooking: boolean;
  estimatedTutorMinutesNeeded: number;
  publishedShiftMinutes: number;
  gapMinutes: number;
  recommendedAdditionalMinutes: number;
};

type CoveragePayload = {
  view: View;
  totalBookings: number;
  totalEstimatedDemandMinutes: number;
  totalPublishedShiftMinutes: number;
  gapMinutes: number;
  recommendedAdditionalMinutes: number;
  buckets: DemandBucket[];
  note: string;
};

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: "7d", label: "Next 7 days" },
  { value: "48h", label: "Next 48 hours" },
  { value: "deadline", label: "Approaching deadline" },
  { value: "late-capacity-only", label: "Late capacity only" },
];

function normalizeView(value: string | null): View {
  if (value === "7d" || value === "48h" || value === "deadline" || value === "late-capacity-only") {
    return value;
  }
  return "7d";
}

function CoveragePlanner() {
  const searchParams = useSearchParams();
  const [view, setView] = useState<View>(() => normalizeView(searchParams.get("view")));
  const [coverage, setCoverage] = useState<CoveragePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setView(normalizeView(searchParams.get("view")));
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/school-admin/short-learning/coverage?view=${view}`);
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Failed to load coverage.");
        return;
      }
      setCoverage(payload.coverage ?? null);
    } catch {
      setError("Unable to load coverage.");
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(boot);
  }, [load]);

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-2">
        {VIEW_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setView(opt.value)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              view === opt.value
                ? "bg-primary/10 font-semibold text-primary"
                : "border border-border text-foreground/60 hover:bg-muted/50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error ? <p className="mt-4 text-sm font-semibold text-rose-700">{error}</p> : null}

      {loading ? (
        <p className="mt-6 text-sm text-foreground/60">Loading…</p>
      ) : coverage ? (
        <>
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {coverage.note}{" "}
            <Link href="/school-admin/short-learning/shifts" className="font-semibold underline">
              Publish shifts manually →
            </Link>
          </p>

          <CollapsibleCard title="Coverage summary" className="mt-6" bodyClassName="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-foreground/50">Demand (min)</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {coverage.totalEstimatedDemandMinutes}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-foreground/50">Published shifts (min)</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {coverage.totalPublishedShiftMinutes}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-foreground/50">Coverage gap (min)</p>
              <p className="mt-1 text-2xl font-bold text-amber-700">{coverage.gapMinutes}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-foreground/50">Recommended add (min)</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {coverage.recommendedAdditionalMinutes}
              </p>
            </div>
          </CollapsibleCard>


          {coverage.buckets.filter((b) => b.gapMinutes > 0).length === 0 ? (
            <p className="mt-6 text-sm text-foreground/60">No coverage gaps in this view.</p>
          ) : (
            <CollapsibleCard title="Coverage gaps" className="mt-6">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-foreground/60">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Session start</th>
                    <th className="px-4 py-2 text-left font-medium">Bookings</th>
                    <th className="px-4 py-2 text-left font-medium">Demand min</th>
                    <th className="px-4 py-2 text-left font-medium">Shift min</th>
                    <th className="px-4 py-2 text-left font-medium">Recommend add</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {coverage.buckets
                    .filter((b) => b.gapMinutes > 0)
                    .map((bucket) => (
                      <tr key={bucket.startsAt}>
                        <td className="px-4 py-2">{new Date(bucket.startsAt).toLocaleString()}</td>
                        <td className="px-4 py-2">{bucket.bookingCount}</td>
                        <td className="px-4 py-2">{bucket.estimatedTutorMinutesNeeded}</td>
                        <td className="px-4 py-2">{bucket.publishedShiftMinutes}</td>
                        <td className="px-4 py-2 font-semibold text-amber-700">
                          +{bucket.recommendedAdditionalMinutes} min
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </CollapsibleCard>
          )}
        </>
      ) : null}
    </>
  );
}

export default function SchoolAdminCoveragePage() {
  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-10">
      <h1 className="text-3xl font-bold text-foreground">Tutor coverage</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Gaps between estimated tutor demand and published shift minutes. Recommendations are advisory only.
      </p>
      <ShortLearningSubNav />
      <Suspense fallback={<p className="mt-6 text-sm text-foreground/60">Loading…</p>}>
        <CoveragePlanner />
      </Suspense>
    </div>
  );
}

