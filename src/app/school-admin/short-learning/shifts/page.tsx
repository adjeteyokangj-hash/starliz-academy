"use client";

import { FormEvent, useEffect, useState } from "react";
import ShortLearningSubNav from "@/components/school-admin/ShortLearningSubNav";

type ShiftRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  published: boolean;
  notes: string | null;
  schoolTeacherId: string;
  tutorName?: string | null;
};

type TutorOption = {
  id: string;
  name: string;
  role: string;
};

export default function SchoolAdminShiftsPage() {
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [tutors, setTutors] = useState<TutorOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schoolTeacherId, setSchoolTeacherId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [notes, setNotes] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/school-admin/short-learning/shifts");
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Failed to load shifts.");
        return;
      }
      setShifts(payload.shifts ?? []);
      setTutors(payload.tutors ?? []);
      if (!schoolTeacherId && payload.tutors?.[0]?.id) {
        setSchoolTeacherId(payload.tutors[0].id);
      }
    } catch {
      setError("Unable to load shifts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const boot = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(boot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/school-admin/short-learning/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolTeacherId,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          notes: notes.trim() || null,
          published: true,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Failed to create shift.");
        return;
      }
      setStartsAt("");
      setEndsAt("");
      setNotes("");
      await load();
    } catch {
      setError("Unable to create shift.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-10">
      <h1 className="text-3xl font-bold text-foreground">Tutor support shifts</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Tutors can only become available for human support while on a published shift.
      </p>
      <ShortLearningSubNav />

      <form onSubmit={onCreate} className="mt-8 space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold text-foreground">Create shift</h2>
        <label className="block text-sm font-semibold text-foreground/80">
          Tutor
          <select
            required
            value={schoolTeacherId}
            onChange={(e) => setSchoolTeacherId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          >
            {tutors.map((tutor) => (
              <option key={tutor.id} value={tutor.id}>
                {tutor.name} ({tutor.role})
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-foreground/80">
            Starts
            <input
              type="datetime-local"
              required
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-semibold text-foreground/80">
            Ends
            <input
              type="datetime-local"
              required
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="block text-sm font-semibold text-foreground/80">
          Notes
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            placeholder="Optional"
          />
        </label>
        {error ? <p className="text-sm font-semibold text-rose-700">{error}</p> : null}
        <button
          type="submit"
          disabled={saving || !schoolTeacherId}
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Create shift"}
        </button>
      </form>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-foreground">Upcoming & recent</h2>
        {loading ? (
          <p className="text-sm text-foreground/60">Loading…</p>
        ) : shifts.length === 0 ? (
          <p className="text-sm text-foreground/60">No shifts yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-foreground/60">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Tutor</th>
                  <th className="px-4 py-2 text-left font-medium">Starts</th>
                  <th className="px-4 py-2 text-left font-medium">Ends</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shifts.map((shift) => (
                  <tr key={shift.id}>
                    <td className="px-4 py-2">{shift.tutorName ?? shift.schoolTeacherId}</td>
                    <td className="px-4 py-2">{new Date(shift.startsAt).toLocaleString()}</td>
                    <td className="px-4 py-2">{new Date(shift.endsAt).toLocaleString()}</td>
                    <td className="px-4 py-2 capitalize">{shift.status.replaceAll("_", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
