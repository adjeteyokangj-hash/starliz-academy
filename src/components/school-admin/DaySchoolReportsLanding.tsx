"use client";

import CollapsibleCard from "@/components/school-admin/CollapsibleCard";

import Link from "next/link";
import { useEffect, useState } from "react";

type ProgressPack = {
  windowDays?: number;
  studentCount?: number;
  summaryLine?: string;
  weakAreaCount?: number;
};

type Props = {
  schoolId: string;
  schoolName: string;
};

export default function DaySchoolReportsLanding({ schoolId, schoolName }: Props) {
  const [pack, setPack] = useState<ProgressPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const boot = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const res = await fetch(
            `/api/school/progress-report?schoolId=${encodeURIComponent(schoolId)}&windowDays=30`,
            { credentials: "include" },
          );
          const payload = await res.json();
          if (cancelled) return;
          if (!res.ok) {
            setError(payload.error ?? "Unable to load progress report.");
            setPack(null);
            return;
          }
          setPack(payload.pack ?? null);
        } catch {
          if (!cancelled) setError("Unable to load progress report.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(boot);
    };
  }, [schoolId]);

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="mt-1 text-sm text-foreground/60">
          School reports for {schoolName}. Links use existing school-scoped reporting APIs — no invented metrics.
        </p>
      </div>

      <section className="space-y-4">
        <CollapsibleCard title="Academic progress pack (30 days)" bodyClassName="p-5">
          <p className="mt-1 text-sm text-foreground/60">
            Existing school leader progress pack via `/api/school/progress-report`.
          </p>
          {loading ? <p className="mt-3 text-sm text-foreground/50">Loading…</p> : null}
          {error ? <p className="mt-3 text-sm font-semibold text-destructive">{error}</p> : null}
          {pack ? (
            <div className="mt-3 space-y-1 text-sm text-foreground/80">
              {pack.summaryLine ? <p>{pack.summaryLine}</p> : null}
              <p>
                Students in pack: {pack.studentCount ?? "—"}
                {pack.weakAreaCount != null ? ` · Weak areas: ${pack.weakAreaCount}` : ""}
              </p>
            </div>
          ) : null}
        </CollapsibleCard>

        <CollapsibleCard title="CSV export" bodyClassName="p-5">
          <p className="mt-1 text-sm text-foreground/60">
            School reports export endpoint (when permitted for your role).
          </p>
          <a
            href={`/api/school/reports/export?schoolId=${encodeURIComponent(schoolId)}`}
            className="mt-3 inline-flex rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted/40"
          >
            Download export
          </a>
        </CollapsibleCard>

        <CollapsibleCard title="Attendance trends" bodyClassName="p-5">
          <p className="mt-1 text-sm text-foreground/55">
            Not implemented as a dedicated report yet. Use{" "}
            <Link href="/school-admin/day-school/attendance" className="font-semibold text-primary underline">
              Day School → Attendance
            </Link>{" "}
            for the live day summary.
          </p>
        </CollapsibleCard>

        <CollapsibleCard title="Lesson Health board" bodyClassName="p-5">
          <p className="mt-1 text-sm text-foreground/55">
            Use{" "}
            <Link href="/school-admin/day-school/lesson-review" className="font-semibold text-primary underline">
              Lesson Review
            </Link>{" "}
            for generate → review → approve — not teacher personal progress.
          </p>
        </CollapsibleCard>
      </section>
    </div>
  );
}
