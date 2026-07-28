"use client";

import CollapsibleCard from "@/components/school-admin/CollapsibleCard";

import { FormEvent, useCallback, useEffect, useState } from "react";
import ShortLearningSubNav from "@/components/school-admin/ShortLearningSubNav";

type WindowRow = {
  id: string;
  weekday: number | null;
  weekdayLabel: string;
  opensAt: string;
  closesAt: string;
  capacityPerSlot: number;
  startIntervalMinutes: number;
  active: boolean;
};

type PoliciesPayload = {
  windows: WindowRow[];
  reliability: {
    noShowThreshold: number;
    lateCancelThreshold: number;
    lookbackDays: number;
    restrictBookingDays: number;
  };
  coverage: {
    tutorMinutesPerBooking: number;
  };
};

export default function SchoolAdminPoliciesPage() {
  const [policies, setPolicies] = useState<PoliciesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [noShowThreshold, setNoShowThreshold] = useState(3);
  const [lateCancelThreshold, setLateCancelThreshold] = useState(5);
  const [lookbackDays, setLookbackDays] = useState(90);
  const [restrictBookingDays, setRestrictBookingDays] = useState(14);
  const [tutorMinutesPerBooking, setTutorMinutesPerBooking] = useState(8);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/school-admin/short-learning/policies");
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Failed to load policies.");
        return;
      }
      const data = payload.policies as PoliciesPayload;
      setPolicies(data);
      setNoShowThreshold(data.reliability.noShowThreshold);
      setLateCancelThreshold(data.reliability.lateCancelThreshold);
      setLookbackDays(data.reliability.lookbackDays);
      setRestrictBookingDays(data.reliability.restrictBookingDays);
      setTutorMinutesPerBooking(data.coverage.tutorMinutesPerBooking);
    } catch {
      setError("Unable to load policies.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(boot);
  }, [load]);

  function updateWindow(id: string, patch: Partial<WindowRow>) {
    setPolicies((prev) =>
      prev
        ? {
            ...prev,
            windows: prev.windows.map((w) => (w.id === id ? { ...w, ...patch } : w)),
          }
        : prev,
    );
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!policies) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/school-admin/short-learning/policies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          windows: policies.windows.map((w) => ({
            id: w.id,
            opensAt: w.opensAt,
            closesAt: w.closesAt,
            capacityPerSlot: w.capacityPerSlot,
            startIntervalMinutes: w.startIntervalMinutes,
            active: w.active,
          })),
          reliability: {
            noShowThreshold,
            lateCancelThreshold,
            lookbackDays,
            restrictBookingDays,
          },
          coverage: { tutorMinutesPerBooking },
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Failed to save policies.");
        return;
      }
      setPolicies(payload.policies);
      setSuccess("Policies saved.");
    } catch {
      setError("Unable to save policies.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-10">
      <h1 className="text-3xl font-bold text-foreground">Policies & Settings</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Configure when parents can book Short Learning, how coverage demand is estimated, and reliability thresholds.
      </p>
      <ShortLearningSubNav />

      <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50/60 p-4 text-sm text-sky-950">
        <p className="font-semibold">How these settings are used</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sky-900/90">
          <li>
            <span className="font-medium">Learning windows</span> define weekday open/close times for parent booking
            slots.
          </li>
          <li>
            <span className="font-medium">Capacity per slot</span> is the maximum number of concurrent Short Learning
            bookings allowed to start at the same slot time (not classroom seats).
          </li>
          <li>
            <span className="font-medium">Start interval</span> is the minutes between offered start times inside a
            window (for example 30 means 16:00, 16:30, 17:00…).
          </li>
          <li>
            <span className="font-medium">Estimated tutor minutes per booking</span> is a planning assumption used only
            for coverage demand estimates (bookings × minutes), not actual tutor assignment length.
          </li>
        </ul>
      </div>

      {error ? <p className="mt-4 text-sm font-semibold text-rose-700">{error}</p> : null}
      {success ? <p className="mt-4 text-sm font-semibold text-emerald-700">{success}</p> : null}

      {loading ? (
        <p className="mt-6 text-sm text-foreground/60">Loading…</p>
      ) : policies ? (
        <form onSubmit={onSave} className="mt-6 space-y-8">
          <CollapsibleCard title="Learning windows" bodyClassName="p-5">
            <p className="mt-1 text-sm text-foreground/60">
              When parents can book Short Learning sessions. Defaults are created automatically for this school.
            </p>
            <p className="mt-2 text-xs text-foreground/50">
              Capacity = max bookings starting at one slot time. Interval = spacing between start times.
            </p>
            <div className="mt-4 overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-foreground/60">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Day</th>
                    <th className="px-3 py-2 text-left font-medium">Opens</th>
                    <th className="px-3 py-2 text-left font-medium">Closes</th>
                    <th className="px-3 py-2 text-left font-medium">Capacity / slot</th>
                    <th className="px-3 py-2 text-left font-medium">Interval (min)</th>
                    <th className="px-3 py-2 text-left font-medium">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {policies.windows.map((window) => (
                    <tr key={window.id}>
                      <td className="px-3 py-2 font-medium">{window.weekdayLabel}</td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={window.opensAt}
                          onChange={(e) => updateWindow(window.id, { opensAt: e.target.value })}
                          className="w-20 rounded-lg border border-border bg-background px-2 py-1"
                          aria-label={`${window.weekdayLabel} opens at`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={window.closesAt}
                          onChange={(e) => updateWindow(window.id, { closesAt: e.target.value })}
                          className="w-20 rounded-lg border border-border bg-background px-2 py-1"
                          aria-label={`${window.weekdayLabel} closes at`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          value={window.capacityPerSlot}
                          onChange={(e) =>
                            updateWindow(window.id, { capacityPerSlot: Number(e.target.value) })
                          }
                          className="w-16 rounded-lg border border-border bg-background px-2 py-1"
                          aria-label={`${window.weekdayLabel} capacity per slot`}
                          title="Max concurrent bookings that may start at the same slot time"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={15}
                          step={15}
                          value={window.startIntervalMinutes}
                          onChange={(e) =>
                            updateWindow(window.id, {
                              startIntervalMinutes: Number(e.target.value),
                            })
                          }
                          className="w-16 rounded-lg border border-border bg-background px-2 py-1"
                          aria-label={`${window.weekdayLabel} start interval minutes`}
                          title="Minutes between offered start times"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={window.active}
                          onChange={(e) => updateWindow(window.id, { active: e.target.checked })}
                          aria-label={`${window.weekdayLabel} active`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleCard>

          <CollapsibleCard title="Coverage planning" bodyClassName="p-5">
            <p className="mt-1 text-sm text-foreground/60">
              Used by Demand Forecast and Coverage to estimate tutor-support demand. Does not change session length
              for students.
            </p>
            <label className="mt-4 block text-sm font-semibold text-foreground/80">
              Estimated tutor minutes per booking
              <input
                type="number"
                min={1}
                value={tutorMinutesPerBooking}
                onChange={(e) => setTutorMinutesPerBooking(Number(e.target.value))}
                className="mt-1 w-32 rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs font-normal text-foreground/50">
                Coverage demand ≈ number of bookings × this value (default 8). Advisory only — publish shifts manually.
              </span>
            </label>
          </CollapsibleCard>

          <CollapsibleCard title="Reliability thresholds" bodyClassName="p-5">
            <p className="mt-1 text-sm text-foreground/60">
              Soft limits that temporarily restrict further parent bookings after repeated no-shows or late
              cancellations. No fees are charged.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-foreground/80">
                No-show threshold
                <input
                  type="number"
                  min={1}
                  value={noShowThreshold}
                  onChange={(e) => setNoShowThreshold(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs font-normal text-foreground/50">
                  Number of no-shows in the lookback window before temporary booking restriction.
                </span>
              </label>
              <label className="block text-sm font-semibold text-foreground/80">
                Late cancel threshold
                <input
                  type="number"
                  min={1}
                  value={lateCancelThreshold}
                  onChange={(e) => setLateCancelThreshold(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs font-normal text-foreground/50">
                  Late cancellations counted toward reliability restrictions.
                </span>
              </label>
              <label className="block text-sm font-semibold text-foreground/80">
                Lookback days
                <input
                  type="number"
                  min={7}
                  value={lookbackDays}
                  onChange={(e) => setLookbackDays(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs font-normal text-foreground/50">
                  How far back no-shows and late cancels are counted.
                </span>
              </label>
              <label className="block text-sm font-semibold text-foreground/80">
                Restriction period (days)
                <input
                  type="number"
                  min={1}
                  value={restrictBookingDays}
                  onChange={(e) => setRestrictBookingDays(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs font-normal text-foreground/50">
                  How long new bookings stay restricted after the threshold is reached.
                </span>
              </label>
            </div>
          </CollapsibleCard>

          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save policies"}
          </button>
        </form>
      ) : null}
    </div>
  );
}