"use client";

import CollapsibleCard from "@/components/school-admin/CollapsibleCard";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import ShortLearningSubNav from "@/components/school-admin/ShortLearningSubNav";
import { formatUkDateTime } from "@/lib/uk-datetime";

type HistoryEvent = {
  id: string;
  action: string;
  actorLabel: string;
  createdAt: string;
  summary: string;
  requiresReview: boolean;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

type BookingDetail = {
  id: string;
  bookingRef: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  subject: string;
  status: string;
  learningFocus?: string | null;
  parentNote?: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string | null;
  student: {
    name: string;
    yearGroup?: string | null;
    classroomName?: string | null;
  };
  parent: {
    name?: string | null;
    email?: string | null;
  };
  history: HistoryEvent[];
};

function formatWhen(iso: string): string {
  return formatUkDateTime(iso);
}

export default function SchoolAdminBookingDetailPage() {
  const params = useParams<{ id: string }>();
  const bookingId = params?.id;
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    const boot = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const res = await fetch(`/api/school-admin/short-learning/bookings/${bookingId}`);
          const payload = await res.json();
          if (cancelled) return;
          if (!res.ok) {
            setError(payload.error ?? "Failed to load booking.");
            return;
          }
          setBooking(payload.booking ?? null);
        } catch {
          if (!cancelled) setError("Unable to load booking.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(boot);
    };
  }, [bookingId]);

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-10">
      <Link
        href="/school-admin/short-learning/bookings"
        className="text-sm font-semibold text-primary hover:underline"
      >
        ← Back to bookings
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-foreground">Booking detail</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Summary, family contacts, and chronological booking history for this school only.
      </p>
      <ShortLearningSubNav />

      {error ? <p className="mt-4 text-sm font-semibold text-rose-700">{error}</p> : null}
      {loading ? <p className="mt-6 text-sm text-foreground/60">Loading…</p> : null}

      {booking ? (
        <div className="mt-6 space-y-6">
          <CollapsibleCard title="Booking summary" bodyClassName="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-foreground/50">{booking.bookingRef}</p>
                <h2 className="mt-1 text-xl font-semibold capitalize text-foreground">
                  {booking.subject} · {booking.durationMinutes} min
                </h2>
                <p className="mt-1 text-sm text-foreground/60">{formatWhen(booking.startsAt)}</p>
              </div>
              <span className="inline-flex rounded-full border border-border px-3 py-1 text-xs capitalize">
                {booking.status.replaceAll("_", " ")}
              </span>
            </div>
            {booking.learningFocus ? (
              <p className="mt-4 text-sm text-foreground/70">
                <span className="font-semibold text-foreground">Focus:</span> {booking.learningFocus}
              </p>
            ) : null}
            {booking.parentNote ? (
              <p className="mt-2 text-sm text-foreground/70">
                <span className="font-semibold text-foreground">Parent note:</span> {booking.parentNote}
              </p>
            ) : null}
          </CollapsibleCard>

          <div className="grid gap-4 sm:grid-cols-2">
            <CollapsibleCard title="Student" bodyClassName="p-5">
              <p className="mt-2 font-medium text-foreground">{booking.student.name}</p>
              <p className="mt-1 text-sm text-foreground/60">
                Year group: {booking.student.yearGroup ?? "—"}
              </p>
              <p className="text-sm text-foreground/60">
                Class: {booking.student.classroomName ?? "—"}
              </p>
            </CollapsibleCard>
            <CollapsibleCard title="Parent / guardian" bodyClassName="p-5">
              <p className="font-medium text-foreground">{booking.parent.name ?? "Parent"}</p>
              <p className="mt-1 text-sm text-foreground/60">{booking.parent.email ?? "—"}</p>
            </CollapsibleCard>
          </div>

          <CollapsibleCard title="Booking history" count={booking.history.length} bodyClassName="p-5">
            <p className="text-xs text-foreground/50">
              Chronological audit of create, change, cancel, and rebook events.
            </p>
            {booking.history.length === 0 ? (
              <p className="mt-4 text-sm text-foreground/60">No change history recorded yet.</p>
            ) : (
              <ol className="mt-4 space-y-3">
                {booking.history.map((event) => (
                  <li key={event.id} className="rounded-xl border border-border/80 bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">{event.summary}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          event.requiresReview
                            ? "border border-amber-300 bg-amber-50 text-amber-900"
                            : "border border-sky-200 bg-sky-50 text-sky-900"
                        }`}
                      >
                        {event.actorLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-foreground/50">{formatWhen(event.createdAt)}</p>
                  </li>
                ))}
              </ol>
            )}
          </CollapsibleCard>
        </div>
      ) : null}
    </div>
  );
}