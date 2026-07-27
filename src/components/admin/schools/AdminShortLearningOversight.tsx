"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  AdminShortLearningOversight,
  BookingCountsByStatus,
} from "@/lib/schools/admin-short-learning-oversight";
import { AdminButtonLink } from "@/components/admin/ui";

type Props = {
  schoolId?: string;
  showSchoolLinks?: boolean;
};

const ACTIVE_STATUSES = ["booked", "confirmed", "attended"] as const;

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div
      className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] px-3 py-2"
      style={{ background: "var(--admin-rail)" }}
    >
      <p className="admin-meta">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--admin-text)] tabular-nums">{value}</p>
      {detail ? <p className="mt-0.5 text-xs text-[var(--admin-muted)]">{detail}</p> : null}
    </div>
  );
}

function statusSummary(counts: BookingCountsByStatus): { active: number; other: number } {
  let active = 0;
  let other = 0;
  for (const [status, count] of Object.entries(counts)) {
    if (ACTIVE_STATUSES.includes(status as (typeof ACTIVE_STATUSES)[number])) {
      active += count;
    } else {
      other += count;
    }
  }
  return { active, other };
}

export default function AdminShortLearningOversightPanel({ schoolId, showSchoolLinks = true }: Props) {
  const [oversight, setOversight] = useState<AdminShortLearningOversight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : "";
      const res = await fetch(`/api/admin/short-learning${query}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? "Failed to load Short Learning oversight.");
        setOversight(null);
        return;
      }
      setOversight(json.oversight as AdminShortLearningOversight);
    } catch {
      setError("Unable to reach Short Learning oversight API.");
      setOversight(null);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount; frozen behaviour, advisory only
    void load();
  }, [load]);

  if (loading) {
    return <p className="admin-body">Loading Short Learning oversight…</p>;
  }

  if (error) {
    return (
      <div className="rounded-[var(--admin-radius)] border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
        <p>{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-2 rounded-md border border-rose-300/40 bg-rose-500/20 px-2 py-1 text-xs font-semibold text-rose-50 hover:bg-rose-500/30"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!oversight) {
    return <p className="admin-body">No oversight data available.</p>;
  }

  const todayActive = statusSummary(oversight.summary.todayByStatus);
  const upcomingActive = statusSummary(oversight.summary.upcomingByStatus);

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--admin-radius)] border border-[var(--admin-primary)]/25 bg-[var(--admin-primary-muted)] px-4 py-3 text-sm text-[var(--admin-text)]">
        <p className="font-semibold">Short Learning promise</p>
        <p className="mt-1 text-[var(--admin-muted)]">{oversight.promise}</p>
        <p className="mt-2 text-xs text-[var(--admin-muted)]">
          Read-only oversight — shifts are published by school owners in{" "}
          <Link href="/school-admin/short-learning" className="font-semibold text-[var(--admin-primary-hover)] underline underline-offset-2">
            school-admin
          </Link>
          . Nothing is auto-published from this view.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Schools with activity" value={oversight.summary.schoolsWithActivity} />
        <Metric
          label="Today bookings"
          value={todayActive.active}
          detail={todayActive.other > 0 ? `${todayActive.other} other statuses` : "Active pipeline"}
        />
        <Metric
          label="Upcoming bookings"
          value={upcomingActive.active}
          detail={upcomingActive.other > 0 ? `${upcomingActive.other} other statuses` : "From now onward"}
        />
        <Metric
          label="Published shifts (48h)"
          value={oversight.summary.publishedShiftsNext48h}
          detail={`Through ${new Date(oversight.range48hEnd).toLocaleString()}`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric
          label="Coverage gap (48h)"
          value={`${oversight.summary.totalCoverageGapMinutes} min`}
          detail={`${oversight.summary.schoolsWithCoverageGap} schools with gaps`}
        />
        <Metric
          label="Bookings in coverage window"
          value={oversight.summary.totalCoverageBookings48h}
          detail="Active statuses in next 48h"
        />
        <Metric
          label="Generated"
          value={new Date(oversight.generatedAt).toLocaleTimeString()}
          detail={oversight.scope === "school" ? "School-scoped view" : "Cross-school platform view"}
        />
      </div>

      {oversight.schools.length === 0 ? (
        <div className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] px-4 py-6 text-center text-sm text-[var(--admin-muted)]">
          No schools with Short Learning bookings or published shifts yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--admin-radius)] border border-[var(--admin-border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--admin-border)] text-xs uppercase tracking-wide text-[var(--admin-muted)]">
              <tr>
                <th className="px-3 py-2 font-semibold">School</th>
                <th className="px-3 py-2 font-semibold">Today</th>
                <th className="px-3 py-2 font-semibold">Upcoming</th>
                <th className="px-3 py-2 font-semibold">Shifts 48h</th>
                <th className="px-3 py-2 font-semibold">Gap min</th>
                <th className="px-3 py-2 font-semibold">Slots w/ gap</th>
                {showSchoolLinks ? <th className="px-3 py-2 font-semibold" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--admin-border)]">
              {oversight.schools.map((row) => {
                const today = statusSummary(row.todayByStatus);
                const upcoming = statusSummary(row.upcomingByStatus);
                return (
                  <tr key={row.schoolId} className="text-[var(--admin-text)]">
                    <td className="px-3 py-2">
                      <p className="font-semibold">{row.schoolName}</p>
                      <p className="text-xs text-[var(--admin-muted)]">{row.schoolSlug}</p>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{today.active}</td>
                    <td className="px-3 py-2 tabular-nums">{upcoming.active}</td>
                    <td className="px-3 py-2 tabular-nums">{row.publishedShiftsNext48h}</td>
                    <td className="px-3 py-2 tabular-nums">
                      <span className={row.coverageGapMinutes > 0 ? "font-semibold text-amber-300" : ""}>
                        {row.coverageGapMinutes}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{row.bucketsWithGap}</td>
                    {showSchoolLinks ? (
                      <td className="px-3 py-2">
                        <AdminButtonLink
                          href={`/admin/schools/${row.schoolId}/short-learning`}
                          variant="secondary"
                          size="sm"
                        >
                          Open
                        </AdminButtonLink>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {schoolId ? (
        <div className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] px-4 py-3 text-sm text-[var(--admin-muted)]">
          <p className="font-semibold text-[var(--admin-text)]">School owner operations</p>
          <p className="mt-1">
            School owners publish tutor shifts, manage policies, and review bookings in the school-admin portal.
          </p>
          <AdminButtonLink href="/school-admin/short-learning" variant="secondary" size="sm" className="mt-3">
            Open school-admin Short Learning
          </AdminButtonLink>
        </div>
      ) : null}
    </div>
  );
}
