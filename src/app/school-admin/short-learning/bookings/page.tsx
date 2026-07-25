"use client";

import { useEffect, useState } from "react";
import ShortLearningSubNav from "@/components/school-admin/ShortLearningSubNav";

type BookingRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  subject: string;
  status: string;
  studentName?: string | null;
  parentEmail?: string | null;
};

export default function SchoolAdminBookingsPage() {
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

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-10">
      <h1 className="text-3xl font-bold text-foreground">Short Learning bookings</h1>
      <p className="mt-2 text-sm text-foreground/60">Parent-booked AI-led sessions for this school.</p>
      <ShortLearningSubNav />

      {error ? <p className="mt-4 text-sm font-semibold text-rose-700">{error}</p> : null}
      {loading ? (
        <p className="mt-6 text-sm text-foreground/60">Loading…</p>
      ) : bookings.length === 0 ? (
        <p className="mt-6 text-sm text-foreground/60">No bookings yet.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-foreground/60">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Student</th>
                <th className="px-4 py-2 text-left font-medium">Subject</th>
                <th className="px-4 py-2 text-left font-medium">Starts</th>
                <th className="px-4 py-2 text-left font-medium">Duration</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium">{booking.studentName ?? "Student"}</div>
                    {booking.parentEmail ? (
                      <div className="text-xs text-foreground/50">{booking.parentEmail}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 capitalize">{booking.subject}</td>
                  <td className="px-4 py-2">{new Date(booking.startsAt).toLocaleString()}</td>
                  <td className="px-4 py-2">{booking.durationMinutes} min</td>
                  <td className="px-4 py-2 capitalize">{booking.status.replaceAll("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
