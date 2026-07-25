"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";

type StudentOption = {
  schoolId: string;
  schoolName: string;
  schoolStudentId: string;
  studentName: string;
};

type BookingRow = {
  id: string;
  schoolName: string;
  studentName: string;
  startsAt: string;
  durationMinutes: number;
  subject: string;
  status: string;
};

type SlotRow = {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  capacityRemaining: number;
  lateBooking: boolean;
};

export default function ParentShortLearningPage() {
  const [promise, setPromise] = useState("");
  const [honestyCheckbox, setHonestyCheckbox] = useState("");
  const [entitled, setEntitled] = useState(false);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [schoolStudentId, setSchoolStudentId] = useState("");
  const [dateIso, setDateIso] = useState(() => new Date().toISOString().slice(0, 10));
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [startsAt, setStartsAt] = useState("");
  const [subject, setSubject] = useState("maths");
  const [learningFocus, setLearningFocus] = useState("");
  const [honestyAcknowledged, setHonestyAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedStudent = useMemo(
    () => students.find((s) => s.schoolStudentId === schoolStudentId) ?? null,
    [schoolStudentId, students],
  );

  async function loadBookings() {
    const res = await fetch("/api/parent/short-learning/bookings");
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Failed to load bookings.");
    setPromise(payload.promise ?? "");
    setHonestyCheckbox(payload.honestyCheckbox ?? "");
    setEntitled(Boolean(payload.entitled));
    setStudents(payload.students ?? []);
    setBookings(payload.bookings ?? []);
    if (!schoolStudentId && payload.students?.[0]?.schoolStudentId) {
      setSchoolStudentId(payload.students[0].schoolStudentId);
    }
  }

  async function loadSlots(nextSchoolId: string, nextDate: string, nextDuration: number) {
    if (!nextSchoolId || !nextDate) {
      setSlots([]);
      return;
    }
    const qs = new URLSearchParams({
      schoolId: nextSchoolId,
      date: nextDate,
      durationMinutes: String(nextDuration),
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
          await loadBookings();
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load.");
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
  }, []);

  useEffect(() => {
    if (!selectedStudent) return;
    const boot = window.setTimeout(() => {
      void loadSlots(selectedStudent.schoolId, dateIso, durationMinutes);
    }, 0);
    return () => window.clearTimeout(boot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent?.schoolId, dateIso, durationMinutes]);

  async function onBook(event: FormEvent) {
    event.preventDefault();
    if (!selectedStudent) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/parent/short-learning/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId: selectedStudent.schoolId,
          schoolStudentId: selectedStudent.schoolStudentId,
          startsAt,
          durationMinutes,
          subject,
          learningFocus: learningFocus.trim() || null,
          honestyAcknowledged,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Booking failed.");
        return;
      }
      setHonestyAcknowledged(false);
      setStartsAt("");
      await loadBookings();
      await loadSlots(selectedStudent.schoolId, dateIso, durationMinutes);
    } catch {
      setError("Unable to book right now.");
    } finally {
      setSaving(false);
    }
  }

  async function onCancel(bookingId: string) {
    setError(null);
    const res = await fetch(`/api/parent/short-learning/bookings/${bookingId}/cancel`, { method: "POST" });
    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error ?? "Cancel failed.");
      return;
    }
    await loadBookings();
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar />
      <div className="mx-auto max-w-4xl px-6 py-10">
        <Link href="/parent/dashboard" className="text-sm font-semibold text-cyan-300 hover:underline">
          ← Parent portal
        </Link>
        <h1 className="mt-4 text-4xl font-black">Short Learning</h1>
        <p className="mt-3 max-w-2xl text-slate-300">{promise || "AI-led after-hours learning with optional human safety-net support."}</p>

        {!entitled ? (
          <p className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            An active subscription or school entitlement is required to book Short Learning.
          </p>
        ) : null}

        {error ? <p className="mt-4 text-sm font-semibold text-rose-300">{error}</p> : null}
        {loading ? <p className="mt-6 text-sm text-slate-400">Loading…</p> : null}

        <form onSubmit={onBook} className="mt-8 space-y-4 rounded-[2rem] border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-bold">Book a session</h2>
          <label className="block text-sm">
            Student
            <select
              required
              value={schoolStudentId}
              onChange={(e) => setSchoolStudentId(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
            >
              {students.map((student) => (
                <option key={student.schoolStudentId} value={student.schoolStudentId}>
                  {student.studentName} · {student.schoolName}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              Date
              <input
                type="date"
                required
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
            Slot
            <select
              required
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
            >
              <option value="">Select a slot</option>
              {slots.map((slot) => (
                <option key={slot.startsAt} value={slot.startsAt}>
                  {new Date(slot.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {" · "}
                  {slot.capacityRemaining} places
                  {slot.lateBooking ? " · late booking" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Subject
            <input
              required
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
          <label className="flex items-start gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={honestyAcknowledged}
              onChange={(e) => setHonestyAcknowledged(e.target.checked)}
              className="mt-1"
              required
            />
            <span>{honestyCheckbox || "I understand Short Learning is AI-led."}</span>
          </label>
          <button
            type="submit"
            disabled={saving || !entitled || students.length === 0}
            className="rounded-2xl bg-cyan-400 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-60"
          >
            {saving ? "Booking…" : "Book Short Learning"}
          </button>
        </form>

        <section className="mt-10">
          <h2 className="text-xl font-bold">Your bookings</h2>
          {bookings.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">No bookings yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {bookings.map((booking) => (
                <li key={booking.id} className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{booking.studentName} · {booking.subject}</p>
                      <p className="text-sm text-slate-400">
                        {new Date(booking.startsAt).toLocaleString()} · {booking.durationMinutes} min · {booking.status}
                      </p>
                    </div>
                    {["booked", "confirmed"].includes(booking.status) ? (
                      <button
                        type="button"
                        onClick={() => void onCancel(booking.id)}
                        className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
