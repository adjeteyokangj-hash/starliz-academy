"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type BookingRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
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

export default function ShortLearningOverviewMetrics() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
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

  const allEmpty =
    metrics.todayBookings === 0 &&
    metrics.upcomingBookings === 0 &&
    metrics.activeShifts === 0;

  return (
    <div className="mt-6 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">Today&apos;s bookings</p>
          <p className="mt-2 text-3xl font-bold text-foreground">{metrics.todayBookings}</p>
          <p className="mt-1 text-xs text-foreground/60">Parent-booked sessions starting today</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">Upcoming</p>
          <p className="mt-2 text-3xl font-bold text-foreground">{metrics.upcomingBookings}</p>
          <p className="mt-1 text-xs text-foreground/60">Future sessions not yet started</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">Active shifts</p>
          <p className="mt-2 text-3xl font-bold text-foreground">{metrics.activeShifts}</p>
          <p className="mt-1 text-xs text-foreground/60">Published tutor support windows now</p>
        </div>
        <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 sm:col-span-2 lg:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Coverage note</p>
          <p className="mt-2 text-sm leading-snug text-violet-950">{metrics.coverageNote}</p>
        </div>
      </div>

      {allEmpty ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5">
          <p className="text-sm font-semibold text-foreground">No Short Learning activity yet</p>
          <p className="mt-1 text-sm text-foreground/60">
            When parents book after-hours sessions or you publish tutor shifts, counts will appear here.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/school-admin/short-learning/bookings"
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/40"
            >
              View bookings
            </Link>
            <Link
              href="/school-admin/short-learning/shifts"
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/40"
            >
              Publish shifts
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
