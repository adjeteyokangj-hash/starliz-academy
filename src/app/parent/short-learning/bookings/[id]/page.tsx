"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/layout/Navbar";

import { formatUkDateTime, formatUkTime } from "@/lib/uk-datetime";

type BookingDetail = {
  id: string;
  bookingRef: string;
  schoolId: string;
  schoolStudentId: string;
  schoolName: string;
  studentName: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  subject: string;
  status: string;
  learningFocus: string | null;
};

type SlotRow = {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  capacityRemaining: number;
  lateBooking: boolean;
};

type ChangeStep = "detail" | "edit" | "review" | "done";

function formatSessionWhen(iso: string): string {
  return formatUkDateTime(iso);
}

function formatStatus(status: string): string {
  return status.replaceAll("_", " ");
}

export default function ParentBookingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const bookingId = params.id;

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [step, setStep] = useState<ChangeStep>("detail");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [dateIso, setDateIso] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [startsAt, setStartsAt] = useState("");
  const [subject, setSubject] = useState("");
  const [learningFocus, setLearningFocus] = useState("");

  const canChange = booking ? ["booked", "confirmed"].includes(booking.status) : false;

  async function loadBooking() {
    const res = await fetch(`/api/parent/short-learning/bookings/${bookingId}`);
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Booking not found.");
    const next = payload.booking as BookingDetail;
    setBooking(next);
    setDateIso(next.startsAt.slice(0, 10));
    setDurationMinutes(next.durationMinutes);
    setStartsAt(next.startsAt);
    setSubject(next.subject);
    setLearningFocus(next.learningFocus ?? "");
  }

  async function loadSlots(schoolId: string, schoolStudentId: string, date: string, duration: number) {
    const qs = new URLSearchParams({
      schoolId,
      schoolStudentId,
      date,
      durationMinutes: String(duration),
    });
    const res = await fetch(`/api/parent/short-learning/slots?${qs}`);
    const payload = await res.json();
    if (!res.ok) {
      setSlots([]);
      setError(payload.error ?? "Failed to load slots.");
      return;
    }
    setSlots(payload.slots ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    const boot = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          await loadBooking();
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load booking.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(boot);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  useEffect(() => {
    if (!booking || step !== "edit") return;
    const boot = window.setTimeout(() => {
      void loadSlots(booking.schoolId, booking.schoolStudentId, dateIso, durationMinutes);
    }, 0);
    return () => window.clearTimeout(boot);
  }, [booking, step, dateIso, durationMinutes]);

  const proposed = useMemo(() => {
    if (!booking) return null;
    return {
      startsAt,
      durationMinutes,
      subject: subject.trim(),
      learningFocus: learningFocus.trim() || null,
    };
  }, [booking, startsAt, durationMinutes, subject, learningFocus]);

  async function onCancel() {
    if (!booking) return;
    setError(null);
    try {
      const res = await fetch(`/api/parent/short-learning/bookings/${booking.id}/cancel`, {
        method: "POST",
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Cancel failed.");
        return;
      }
      await loadBooking();
      setSuccess("Booking cancelled.");
      setStep("detail");
    } catch {
      setError("Unable to cancel right now.");
    }
  }

  async function onConfirmChange() {
    if (!booking || !proposed) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/parent/short-learning/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt: proposed.startsAt,
          durationMinutes: proposed.durationMinutes,
          subject: proposed.subject,
          learningFocus: proposed.learningFocus,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Unable to change booking.");
        return;
      }
      await loadBooking();
      setSuccess(
        `Booking ${booking.bookingRef} updated. Your booking reference stays the same.`,
      );
      setStep("done");
    } catch {
      setError("Unable to change booking right now.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/parent/short-learning" className="text-sm font-semibold text-cyan-300 hover:underline">
          ← My bookings
        </Link>
        <h1 className="mt-4 text-3xl font-black">Booking details</h1>

        {error ? <p className="mt-4 text-sm font-semibold text-rose-300" role="alert">{error}</p> : null}
        {success ? <p className="mt-4 text-sm font-semibold text-emerald-300">{success}</p> : null}
        {loading ? <p className="mt-6 text-sm text-slate-400">Loading…</p> : null}

        {booking && step === "detail" ? (
          <section className="mt-8 space-y-4 rounded-[2rem] border border-slate-800 bg-slate-900 p-6">
            <p className="text-xs uppercase tracking-wide text-slate-400">{booking.bookingRef}</p>
            <p className="text-xl font-bold">{booking.studentName} · {booking.subject}</p>
            <p className="text-sm text-slate-300">
              {formatSessionWhen(booking.startsAt)} · {booking.durationMinutes} min · {formatStatus(booking.status)}
            </p>
            <p className="text-sm text-slate-400">{booking.schoolName}</p>
            {booking.learningFocus ? (
              <p className="text-sm text-slate-300">Focus: {booking.learningFocus}</p>
            ) : null}

            <div className="flex flex-wrap gap-3 pt-2">
              {canChange ? (
                <button
                  type="button"
                  onClick={() => {
                    setSuccess(null);
                    setError(null);
                    setStep("edit");
                  }}
                  className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-300"
                >
                  Change booking
                </button>
              ) : null}
              {canChange ? (
                <button
                  type="button"
                  onClick={() => void onCancel()}
                  className="rounded-2xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
                >
                  Cancel booking
                </button>
              ) : null}
            </div>
            {!canChange ? (
              <p className="text-sm text-amber-200/90">
                This booking can no longer be changed ({formatStatus(booking.status)}).
              </p>
            ) : null}
          </section>
        ) : null}

        {booking && step === "edit" ? (
          <section className="mt-8 space-y-4 rounded-[2rem] border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-bold">Change booking</h2>
            <p className="text-sm text-slate-400">
              You can change date, start time, subject, and duration. The server validates availability and rules.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                Date
                <input
                  type="date"
                  value={dateIso}
                  onChange={(e) => setDateIso(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </label>
              <label className="block text-sm">
                Duration
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
                >
                  <option value={90}>90 minutes</option>
                  <option value={120}>120 minutes</option>
                </select>
              </label>
            </div>
            <label className="block text-sm">
              Start time
              <select
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
              >
                <option value="">Select a slot</option>
                {booking.startsAt.slice(0, 10) === dateIso
                && booking.durationMinutes === durationMinutes ? (
                  <option value={booking.startsAt}>
                    Current · {formatUkTime(booking.startsAt)}
                  </option>
                ) : null}
                {slots.map((slot) => (
                  <option key={slot.startsAt} value={slot.startsAt}>
                    {formatUkTime(slot.startsAt)}
                    {" · "}
                    {slot.capacityRemaining} places
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Subject
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
              />
            </label>
            <label className="block text-sm">
              Learning focus (optional)
              <input
                value={learningFocus}
                onChange={(e) => setLearningFocus(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!startsAt || !subject.trim()}
                onClick={() => setStep("review")}
                className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-60"
              >
                Review change
              </button>
              <button
                type="button"
                onClick={() => setStep("detail")}
                className="rounded-2xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
              >
                Back
              </button>
            </div>
          </section>
        ) : null}

        {booking && proposed && step === "review" ? (
          <section className="mt-8 space-y-4 rounded-[2rem] border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-bold">Review change</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Current</p>
                <p className="mt-2 font-semibold">{booking.subject}</p>
                <p className="text-sm text-slate-300">{formatSessionWhen(booking.startsAt)}</p>
                <p className="text-sm text-slate-400">{booking.durationMinutes} min</p>
                <p className="text-sm text-slate-400">{booking.learningFocus || "No learning focus"}</p>
              </div>
              <div className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-4">
                <p className="text-xs uppercase tracking-wide text-cyan-200">New</p>
                <p className="mt-2 font-semibold">{proposed.subject}</p>
                <p className="text-sm text-slate-100">{formatSessionWhen(proposed.startsAt)}</p>
                <p className="text-sm text-slate-300">{proposed.durationMinutes} min</p>
                <p className="text-sm text-slate-300">{proposed.learningFocus || "No learning focus"}</p>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Confirming updates this booking in place. Reference {booking.bookingRef} stays the same.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => void onConfirmChange()}
                className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Confirm change"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setStep("edit")}
                className="rounded-2xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
              >
                Back
              </button>
            </div>
          </section>
        ) : null}

        {booking && step === "done" ? (
          <section className="mt-8 space-y-4 rounded-[2rem] border border-emerald-500/30 bg-emerald-500/10 p-6">
            <h2 className="text-xl font-bold text-emerald-100">Change confirmed</h2>
            <p className="text-sm text-emerald-50/90">
              {booking.bookingRef} · {formatSessionWhen(booking.startsAt)} · {booking.subject} · {booking.durationMinutes} min
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setSuccess(null);
                  setStep("detail");
                }}
                className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-300"
              >
                View booking
              </button>
              <button
                type="button"
                onClick={() => router.push("/parent/short-learning")}
                className="rounded-2xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
              >
                Back to my bookings
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
