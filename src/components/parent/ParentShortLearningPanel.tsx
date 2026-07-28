"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  SHORT_LEARNING_STARLIZ_CHOOSE,
  SHORT_LEARNING_SUBJECT_OPTIONS,
  shortLearningSubjectLabel,
} from "@/lib/schools/short-learning-subjects";
import { formatUkDateTimeShort, formatUkTime, todayUkDateIso } from "@/lib/uk-datetime";

type StudentOption = {
  schoolId: string;
  schoolName: string;
  schoolStudentId: string;
  studentName: string;
};

type BookingRow = {
  id: string;
  schoolId: string;
  schoolStudentId?: string;
  schoolName: string;
  studentName: string;
  startsAt: string;
  durationMinutes: number;
  subject: string;
  status: string;
  learningFocus?: string | null;
  subjectSelectionMode?: string | null;
};

type SlotRow = {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  capacityRemaining: number;
  lateBooking: boolean;
};

function formatBookingStatus(status: string): string {
  switch (status) {
    case "booked":
      return "Requested";
    case "confirmed":
      return "Confirmed";
    case "attended":
      return "Attended";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "late_cancelled":
      return "Cancelled (late)";
    case "no_show":
      return "Missed (no-show)";
    case "expired":
      return "Expired";
    case "generation_failed":
    case "failed":
      return "Content preparation failed";
    default:
      return status.replaceAll("_", " ");
  }
}

export default function ParentShortLearningPanel() {
  const [promise, setPromise] = useState("");
  const [honestyCheckbox, setHonestyCheckbox] = useState("");
  const [entitled, setEntitled] = useState(false);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [schoolStudentId, setSchoolStudentId] = useState("");
  const [dateIso, setDateIso] = useState(() => todayUkDateIso());
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [startsAt, setStartsAt] = useState("");
  const [subject, setSubject] = useState<string>(SHORT_LEARNING_STARLIZ_CHOOSE);
  const [learningFocus, setLearningFocus] = useState("");
  const [honestyAcknowledged, setHonestyAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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
    setEmptyReason(typeof payload.emptyReason === "string" ? payload.emptyReason : null);
    setBookings(payload.bookings ?? []);
    if (!schoolStudentId && payload.students?.[0]?.schoolStudentId) {
      setSchoolStudentId(payload.students[0].schoolStudentId);
    }
  }

  async function loadSlots(nextSchoolId: string, nextSchoolStudentId: string, nextDate: string, nextDuration: number) {
    if (!nextSchoolId || !nextSchoolStudentId || !nextDate) {
      setSlots([]);
      return;
    }
    const qs = new URLSearchParams({
      schoolId: nextSchoolId,
      schoolStudentId: nextSchoolStudentId,
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
      void loadSlots(selectedStudent.schoolId, selectedStudent.schoolStudentId, dateIso, durationMinutes);
    }, 0);
    return () => window.clearTimeout(boot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent?.schoolId, selectedStudent?.schoolStudentId, dateIso, durationMinutes]);

  async function onBook(event: FormEvent) {
    event.preventDefault();
    if (!selectedStudent) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/parent/short-learning/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId: selectedStudent.schoolId,
          schoolStudentId: selectedStudent.schoolStudentId,
          startsAt,
          durationMinutes,
          subject: subject === SHORT_LEARNING_STARLIZ_CHOOSE ? "" : subject,
          learningFocus: learningFocus.trim() || null,
          honestyAcknowledged,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Booking failed.");
        return;
      }
      const resolved = payload.booking?.subject
        ? shortLearningSubjectLabel(String(payload.booking.subject))
        : "your selected subject";
      setSuccess(`Booked. Subject for this session: ${resolved}.`);
      setHonestyAcknowledged(false);
      setStartsAt("");
      setSubject(SHORT_LEARNING_STARLIZ_CHOOSE);
      setLearningFocus("");
      await loadBookings();
      await loadSlots(selectedStudent.schoolId, selectedStudent.schoolStudentId, dateIso, durationMinutes);
    } catch {
      setError("Unable to book right now.");
    } finally {
      setSaving(false);
    }
  }

  async function onCancel(bookingId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/parent/short-learning/bookings/${bookingId}/cancel`, { method: "POST" });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Cancel failed.");
        return;
      }
      await loadBookings();
    } catch {
      setError("Unable to cancel right now. Please try again.");
    }
  }

  return (
    <div className="space-y-8" data-testid="parent-short-learning-panel">
      <p className="max-w-2xl text-sm text-slate-300">
        {promise || "AI-led after-hours learning with optional human safety-net support."}
      </p>

      {!entitled ? (
        <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          An active subscription or school entitlement is required to book Short Learning. Short Learning is AI-led; human support is availability-based and is not private one-to-one tutoring.
        </p>
      ) : null}

      {entitled && students.length === 0 && emptyReason ? (
        <p className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-50">
          {emptyReason}
        </p>
      ) : null}

      {error ? <p className="text-sm font-semibold text-rose-300" role="alert">{error}</p> : null}
      {success ? <p className="text-sm font-semibold text-emerald-300" role="status">{success}</p> : null}
      {loading ? <p className="text-sm text-slate-400" aria-live="polite">Loading…</p> : null}

      <form onSubmit={onBook} className="space-y-4 rounded-[2rem] border border-slate-800 bg-slate-900/80 p-6">
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
                {formatUkTime(slot.startsAt)}
                {" · "}
                {slot.capacityRemaining} places
                {slot.lateBooking ? " · late booking" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Subject
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
            data-testid="short-learning-subject-select"
          >
            {SHORT_LEARNING_SUBJECT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="mt-2 block text-xs text-slate-400">
            Choose a subject, or let StarLiz select one based on your child’s recent learning and areas that may need further practice.
          </span>
        </label>
        <label className="block text-sm">
          Learning focus (optional)
          <input
            value={learningFocus}
            onChange={(e) => setLearningFocus(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
            maxLength={200}
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

      <section>
        <h2 className="text-xl font-bold">Your bookings</h2>
        {bookings.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No bookings yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {bookings.map((booking) => (
              <li key={booking.id} className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {booking.studentName} · {shortLearningSubjectLabel(booking.subject)}
                    </p>
                    <p className="text-sm text-slate-400">
                      {formatUkDateTimeShort(booking.startsAt)} · {booking.durationMinutes} min · {formatBookingStatus(booking.status)}
                    </p>
                    {booking.status === "no_show" ? (
                      <p className="mt-1 text-xs text-amber-200/90">
                        Repeated no-shows may temporarily limit future bookings. There is no cancellation fee.
                      </p>
                    ) : null}
                  </div>
                  {["booked", "confirmed"].includes(booking.status) ? (
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/parent/short-learning/bookings/${booking.id}`}
                        className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20"
                      >
                        Open booking
                      </Link>
                      <button
                        type="button"
                        onClick={() => void onCancel(booking.id)}
                        className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <Link
                      href={`/parent/short-learning/bookings/${booking.id}`}
                      className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                    >
                      Open booking
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
