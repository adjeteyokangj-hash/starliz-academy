"use client";

import CollapsibleCard from "@/components/school-admin/CollapsibleCard";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import ShortLearningSubNav from "@/components/school-admin/ShortLearningSubNav";
import { formatUkDateTime, formatUkDateTimeShort, formatUkTime } from "@/lib/uk-datetime";

type ChangeIndicator = {
  label: string;
  actorKind: string;
  summary: string;
  requiresReview: boolean;
};

type BookingRow = {
  id: string;
  bookingRef: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  subject: string;
  status: string;
  studentName?: string | null;
  yearGroup?: string | null;
  parentName?: string | null;
  parentEmail?: string | null;
  lastChangedAt?: string | null;
  changeIndicator?: ChangeIndicator | null;
};

function formatStatus(status: string): string {
  return status.replaceAll("_", " ");
}

function formatWhen(iso: string): string {
  return formatUkDateTime(iso);
}

function formatDate(iso: string): string {
  return formatUkDateTimeShort(iso).replace(/,\s*\d{2}:\d{2}$/, "");
}

function formatTime(iso: string): string {
  return formatUkTime(iso);
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function BookingsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope = searchParams.get("scope");
  const reviewOnly = searchParams.get("review") === "1";

  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const boot = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const res = await fetch("/api/school-admin/short-learning/bookings");
          const payload = await res.json();
          if (cancelled) return;
          if (!res.ok) {
            setError(payload.error ?? "Failed to load bookings.");
            return;
          }
          setBookings(payload.bookings ?? []);
        } catch {
          if (!cancelled) setError("Unable to load bookings.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(boot);
    };
  }, []);

  const filtered = useMemo(() => {
    const now = new Date();
    const activeStatuses = new Set(["booked", "confirmed", "attended"]);
    let rows = bookings;

    if (scope === "today") {
      rows = rows.filter(
        (row) => activeStatuses.has(row.status) && sameCalendarDay(new Date(row.startsAt), now),
      );
    } else if (scope === "upcoming") {
      rows = rows.filter((row) => activeStatuses.has(row.status) && new Date(row.startsAt) > now);
    }

    if (reviewOnly) {
      rows = rows.filter((row) => row.changeIndicator?.requiresReview);
    }

    return rows;
  }, [bookings, reviewOnly, scope]);

  const filterLabel = useMemo(() => {
    const parts: string[] = [];
    if (scope === "today") parts.push("starting today");
    if (scope === "upcoming") parts.push("upcoming");
    if (reviewOnly) parts.push("needing review");
    return parts.length ? parts.join(" · ") : null;
  }, [reviewOnly, scope]);

  if (error) return <p className="mt-4 text-sm font-semibold text-rose-700">{error}</p>;
  if (loading) return <p className="mt-6 text-sm text-foreground/60">Loading…</p>;
  if (bookings.length === 0) return <p className="mt-6 text-sm text-foreground/60">No bookings yet.</p>;

  return (
    <CollapsibleCard title="Bookings" count={filtered.length} className="mt-6 max-w-full" bodyClassName="p-0">
      {filterLabel ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-xs text-foreground/60">
          <p>
            Showing <span className="font-semibold text-foreground">{filterLabel}</span>
            {" "}({filtered.length} of {bookings.length})
          </p>
          <Link href="/school-admin/short-learning/bookings" className="font-semibold text-primary hover:underline">
            Clear filters
          </Link>
        </div>
      ) : null}
      {filtered.length === 0 ? (
        <p className="p-4 text-sm text-foreground/60">No bookings match this filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-muted/30 text-xs text-foreground/60">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Ref</th>
                <th className="px-3 py-2 text-left font-medium">Student</th>
                <th className="hidden px-3 py-2 text-left font-medium md:table-cell">Year</th>
                <th className="hidden px-3 py-2 text-left font-medium xl:table-cell">Parent</th>
                <th className="px-3 py-2 text-left font-medium">Subject</th>
                <th className="px-3 py-2 text-left font-medium">Session</th>
                <th className="hidden px-3 py-2 text-left font-medium lg:table-cell">Duration</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="hidden px-3 py-2 text-left font-medium 2xl:table-cell">Last changed</th>
                <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">Change</th>
                <th className="px-3 py-2 text-right font-medium"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((booking) => (
                <tr
                  key={booking.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => router.push(`/school-admin/short-learning/bookings/${booking.id}`)}
                >
                    <td className="px-3 py-2 font-mono text-xs">{booking.bookingRef}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{booking.studentName ?? "Student"}</div>
                      <div className="text-xs text-foreground/50 md:hidden">
                        {booking.yearGroup ?? "—"} · {booking.parentName ?? booking.parentEmail ?? "Parent"}
                      </div>
                      <div className="hidden text-xs text-foreground/50 md:block xl:hidden">
                        {booking.parentName ?? booking.parentEmail ?? "Parent"}
                      </div>
                    </td>
                    <td className="hidden px-3 py-2 md:table-cell">{booking.yearGroup ?? "—"}</td>
                    <td className="hidden px-3 py-2 xl:table-cell">
                      <div>{booking.parentName ?? "Parent"}</div>
                      <div className="text-xs text-foreground/50">{booking.parentEmail ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2 capitalize">{booking.subject}</td>
                    <td className="px-3 py-2">
                      <div>{formatDate(booking.startsAt)}</div>
                      <div className="text-xs text-foreground/50">{formatTime(booking.startsAt)}</div>
                    </td>
                    <td className="hidden px-3 py-2 lg:table-cell">{booking.durationMinutes} min</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs capitalize">
                        {formatStatus(booking.status)}
                      </span>
                    </td>
                    <td className="hidden px-3 py-2 text-xs text-foreground/60 2xl:table-cell">
                      {booking.lastChangedAt ? formatWhen(booking.lastChangedAt) : "—"}
                    </td>
                    <td className="hidden px-3 py-2 sm:table-cell">
                      {booking.changeIndicator ? (
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            booking.changeIndicator.requiresReview
                              ? "border border-amber-300 bg-amber-50 text-amber-900"
                              : "border border-sky-200 bg-sky-50 text-sky-900"
                          }`}
                          title={booking.changeIndicator.summary}
                        >
                          {booking.changeIndicator.label}
                        </span>
                      ) : (
                        <span className="text-xs text-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/school-admin/short-learning/bookings/${booking.id}`}
                        className="inline-flex whitespace-nowrap text-xs font-semibold text-primary hover:underline"
                      >
                        View booking
                      </Link>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CollapsibleCard>
  );
}

export default function SchoolAdminBookingsPage() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl p-6 lg:p-10">
      <h1 className="text-3xl font-bold text-foreground">Short Learning bookings</h1>
      <p className="mt-2 text-sm text-foreground/60">Parent-booked AI-led sessions for this school.</p>
      <ShortLearningSubNav />
      <Suspense fallback={<p className="mt-6 text-sm text-foreground/60">Loading…</p>}>
        <BookingsList />
      </Suspense>
    </div>
  );
}