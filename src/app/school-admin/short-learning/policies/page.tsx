"use client";



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

      <h1 className="text-3xl font-bold text-foreground">Policies & settings</h1>

      <p className="mt-2 text-sm text-foreground/60">

        Learning windows, coverage assumptions, and parent reliability thresholds.

      </p>

      <ShortLearningSubNav />



      {error ? <p className="mt-4 text-sm font-semibold text-rose-700">{error}</p> : null}

      {success ? <p className="mt-4 text-sm font-semibold text-emerald-700">{success}</p> : null}



      {loading ? (

        <p className="mt-6 text-sm text-foreground/60">Loading…</p>

      ) : policies ? (

        <form onSubmit={onSave} className="mt-6 space-y-8">

          <section className="rounded-2xl border border-border bg-card p-5">

            <h2 className="text-lg font-semibold text-foreground">Learning windows</h2>

            <p className="mt-1 text-sm text-foreground/60">

              When parents can book Short Learning sessions. Defaults are created automatically.

            </p>

            <div className="mt-4 overflow-hidden rounded-xl border border-border">

              <table className="w-full text-sm">

                <thead className="bg-muted/40 text-xs text-foreground/60">

                  <tr>

                    <th className="px-3 py-2 text-left font-medium">Day</th>

                    <th className="px-3 py-2 text-left font-medium">Opens</th>

                    <th className="px-3 py-2 text-left font-medium">Closes</th>

                    <th className="px-3 py-2 text-left font-medium">Capacity</th>

                    <th className="px-3 py-2 text-left font-medium">Interval</th>

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

                        />

                      </td>

                      <td className="px-3 py-2">

                        <input

                          type="text"

                          value={window.closesAt}

                          onChange={(e) => updateWindow(window.id, { closesAt: e.target.value })}

                          className="w-20 rounded-lg border border-border bg-background px-2 py-1"

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

                        />

                      </td>

                      <td className="px-3 py-2">

                        <input

                          type="checkbox"

                          checked={window.active}

                          onChange={(e) => updateWindow(window.id, { active: e.target.checked })}

                        />

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          </section>



          <section className="rounded-2xl border border-border bg-card p-5">

            <h2 className="text-lg font-semibold text-foreground">Coverage assumptions</h2>

            <label className="mt-4 block text-sm font-semibold text-foreground/80">

              Estimated tutor minutes per booking

              <input

                type="number"

                min={1}

                value={tutorMinutesPerBooking}

                onChange={(e) => setTutorMinutesPerBooking(Number(e.target.value))}

                className="mt-1 w-32 rounded-xl border border-border bg-background px-3 py-2 text-sm"

              />

            </label>

          </section>



          <section className="rounded-2xl border border-border bg-card p-5">

            <h2 className="text-lg font-semibold text-foreground">Reliability thresholds</h2>

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

              </label>

              <label className="block text-sm font-semibold text-foreground/80">

                Suggested restriction period (days)

                <input

                  type="number"

                  min={1}

                  value={restrictBookingDays}

                  onChange={(e) => setRestrictBookingDays(Number(e.target.value))}

                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"

                />

              </label>

            </div>

          </section>



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


