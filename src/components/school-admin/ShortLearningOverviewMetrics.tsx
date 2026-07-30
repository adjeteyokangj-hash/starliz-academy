"use client";

import CollapsibleCard from "@/components/school-admin/CollapsibleCard";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type BookingRow = {
  id: string;
  bookingRef?: string;
  startsAt: string;
  endsAt: string;
  status: string;
  studentName?: string | null;
  subject?: string;
  changeIndicator?: {
    label: string;
    summary: string;
    requiresReview: boolean;
  } | null;
  lastChangedAt?: string | null;
};

type RecentChange = {
  id: string;
  bookingId?: string | null;
  summary: string;
  actorLabel: string;
  createdAt: string;
  requiresReview: boolean;
};

type ShiftRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  published: boolean;
};

type CoveragePayload = {
  gapMinutes?: number;
  recommendedAdditionalMinutes?: number;
  note?: string;
};

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isActiveShift(shift: ShiftRow, now: Date): boolean {
  if (!shift.published) return false;
  const start = new Date(shift.startsAt);
  const end = new Date(shift.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  if (end < now) return false;
  if (start <= now && end >= now) return true;
  return shift.status === "on_shift" && end >= now;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MetricCard(props: {
  href: string;
  title: string;
  value?: string | number;
  hint: string;
  tone?: "default" | "amber" | "violet";
  children?: ReactNode;
}) {
  const toneClass =
    props.tone === "amber"
      ? "border-amber-200 bg-amber-50/70 hover:bg-amber-50"
      : props.tone === "violet"
        ? "border-violet-200 bg-violet-50/60 hover:bg-violet-50"
        : "border-border bg-card hover:bg-muted/30";
  const titleClass =
    props.tone === "amber"
      ? "text-amber-800"
      : props.tone === "violet"
        ? "text-violet-700"
        : "text-foreground/50";
  const valueClass =
    props.tone === "amber"
      ? "text-amber-950"
      : props.tone === "violet"
        ? "text-violet-950"
        : "text-foreground";
  const hintClass =
    props.tone === "amber"
      ? "text-amber-900/80"
      : props.tone === "violet"
        ? "text-violet-950/80"
        : "text-foreground/60";

  return (
    <Link
      href={props.href}
      className={`group block rounded-2xl border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${toneClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`text-xs font-semibold uppercase tracking-wide ${titleClass}`}>{props.title}</p>
        <span className="text-xs text-foreground/35 transition group-hover:text-primary" aria-hidden>
          →
        </span>
      </div>
      {props.value !== undefined ? (
        <p className={`mt-2 text-3xl font-bold ${valueClass}`}>{props.value}</p>
      ) : null}
      {props.children ? <div className={`mt-2 text-sm leading-snug ${valueClass}`}>{props.children}</div> : null}
      <p className={`mt-1 text-xs ${hintClass}`}>{props.hint}</p>
    </Link>
  );
}

export default function ShortLearningOverviewMetrics() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [recentChanges, setRecentChanges] = useState<RecentChange[]>([]);
  const [changesRequiringReview, setChangesRequiringReview] = useState(0);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [coverage, setCoverage] = useState<CoveragePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [bookingsRes, shiftsRes, coverageRes] = await Promise.all([
          fetch("/api/school-admin/short-learning/bookings"),
          fetch("/api/school-admin/short-learning/shifts"),
          fetch("/api/school-admin/short-learning/coverage?view=48h"),
        ]);

        const bookingsPayload = await bookingsRes.json().catch(() => ({}));
        const shiftsPayload = await shiftsRes.json().catch(() => ({}));
        const coveragePayload = await coverageRes.json().catch(() => ({}));

        if (cancelled) return;

        if (!bookingsRes.ok) {
          setError(bookingsPayload.error ?? "Unable to load Short Learning overview.");
          return;
        }

        setBookings(Array.isArray(bookingsPayload.bookings) ? bookingsPayload.bookings : []);
        setRecentChanges(Array.isArray(bookingsPayload.recentChanges) ? bookingsPayload.recentChanges : []);
        setChangesRequiringReview(Number(bookingsPayload.changesRequiringReview ?? 0));
        setShifts(Array.isArray(shiftsPayload.shifts) ? shiftsPayload.shifts : []);
        setCoverage(coverageRes.ok ? (coveragePayload.coverage ?? null) : null);

        if (!shiftsRes.ok && !coverageRes.ok) {
          setError((prev) => prev ?? shiftsPayload.error ?? coveragePayload.error ?? null);
        }
      } catch {
        if (!cancelled) setError("Unable to load Short Learning overview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = useMemo(() => {
    const now = new Date();
    const activeStatuses = new Set(["booked", "confirmed", "attended"]);

    const todayBookings = bookings.filter((row) => {
      if (!activeStatuses.has(row.status)) return false;
      return sameCalendarDay(new Date(row.startsAt), now);
    });

    const upcomingBookings = bookings.filter((row) => {
      if (!activeStatuses.has(row.status)) return false;
      return new Date(row.startsAt) > now;
    });

    const activeShifts = shifts.filter((row) => isActiveShift(row, now));

    const gapMinutes = coverage?.gapMinutes ?? coverage?.recommendedAdditionalMinutes ?? 0;
    let coverageNote = coverage?.note ?? "Coverage recommendations are advisory — publish tutor shifts manually.";
    if (gapMinutes > 0) {
      coverageNote = `${gapMinutes} estimated tutor minutes uncovered in the next 48 hours. ${coverageNote}`;
    } else if (!loading && coverage) {
      coverageNote = `No coverage gaps in the next 48 hours. ${coverageNote}`;
    }

    return {
      todayBookings: todayBookings.length,
      upcomingBookings: upcomingBookings.length,
      activeShifts: activeShifts.length,
      coverageNote,
    };
  }, [bookings, coverage, loading, shifts]);

  if (loading) {
    return (
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="h-24 animate-pulse rounded-2xl bg-muted/50" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <p className="text-sm font-semibold text-rose-800">{error}</p>
        <p className="mt-1 text-sm text-rose-700">
          Check your connection and refresh. Short Learning admin tools remain available from the links below.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <CollapsibleCard title="Short Learning summary" bodyClassName="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          href="/school-admin/short-learning/bookings?scope=today"
          title="Today's bookings"
          value={metrics.todayBookings}
          hint="Parent-booked sessions starting today"
        />
        <MetricCard
          href="/school-admin/short-learning/bookings?scope=upcoming"
          title="Upcoming"
          value={metrics.upcomingBookings}
          hint="Future sessions not yet started"
        />
        <MetricCard
          href="/school-admin/short-learning/shifts"
          title="Active shifts"
          value={metrics.activeShifts}
          hint="Published tutor support windows now"
        />
        <MetricCard
          href="/school-admin/short-learning/bookings?review=1"
          title="Changes needing review"
          value={changesRequiringReview}
          hint="Parent late cancels or near-session changes (7 days)"
          tone="amber"
        />
        <MetricCard
          href="/school-admin/short-learning/coverage?view=48h"
          title="Coverage note"
          hint="Open coverage planner for the next 48 hours"
          tone="violet"
        >
          {metrics.coverageNote}
        </MetricCard>
      </CollapsibleCard>

      <CollapsibleCard title="Recent booking changes" count={recentChanges.length} bodyClassName="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs text-foreground/50">Parent and staff updates from the last 7 days</p>
          </div>
          <Link
            href="/school-admin/short-learning/bookings?review=1"
            className="text-xs font-semibold text-primary hover:underline"
          >
            View all bookings
          </Link>
        </div>
        {recentChanges.length === 0 ? (
          <p className="mt-4 text-sm text-foreground/60">No booking changes recorded in the last 7 days.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {recentChanges.slice(0, 6).map((change) => {
              const href = change.bookingId
                ? `/school-admin/short-learning/bookings/${change.bookingId}`
                : "/school-admin/short-learning/bookings?review=1";
              return (
                <li key={change.id}>
                  <Link
                    href={href}
                    className="group flex flex-wrap items-center justify-between gap-2 py-3 transition-colors hover:bg-muted/20"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground group-hover:text-primary">{change.summary}</p>
                      <p className="text-xs text-foreground/50">{formatWhen(change.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          change.requiresReview
                            ? "border border-amber-300 bg-amber-50 text-amber-900"
                            : "border border-sky-200 bg-sky-50 text-sky-900"
                        }`}
                      >
                        {change.actorLabel}
                      </span>
                      <span className="text-xs font-semibold text-primary opacity-80 group-hover:opacity-100">
                        Details
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleCard>
    </div>
  );
}
