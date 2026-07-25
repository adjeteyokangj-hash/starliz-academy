"use client";



import { useCallback, useEffect, useState } from "react";

import ShortLearningSubNav from "@/components/school-admin/ShortLearningSubNav";



type View = "7d" | "48h" | "deadline" | "late-capacity-only";



type DemandBucket = {

  startsAt: string;

  endsAt: string;

  durationMinutes: number;

  bookingCount: number;

  lateBooking: boolean;

  estimatedTutorMinutesNeeded: number;

  publishedShiftMinutes: number;

  gapMinutes: number;

};



type ForecastPayload = {

  view: View;

  rangeStart: string;

  rangeEnd: string;

  totalBookings: number;

  peakBookingCount: number;

  buckets: DemandBucket[];

};



const VIEW_OPTIONS: { value: View; label: string }[] = [

  { value: "7d", label: "Next 7 days" },

  { value: "48h", label: "Next 48 hours" },

  { value: "deadline", label: "Approaching deadline" },

  { value: "late-capacity-only", label: "Late capacity only" },

];



export default function SchoolAdminForecastPage() {

  const [view, setView] = useState<View>("7d");

  const [forecast, setForecast] = useState<ForecastPayload | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);



  const load = useCallback(async () => {

    setLoading(true);

    setError(null);

    try {

      const res = await fetch(`/api/school-admin/short-learning/forecast?view=${view}`);

      const payload = await res.json();

      if (!res.ok) {

        setError(payload.error ?? "Failed to load forecast.");

        return;

      }

      setForecast(payload.forecast ?? null);

    } catch {

      setError("Unable to load forecast.");

    } finally {

      setLoading(false);

    }

  }, [view]);



  useEffect(() => {

    const boot = window.setTimeout(() => {

      void load();

    }, 0);

    return () => window.clearTimeout(boot);

  }, [load]);



  return (

    <div className="mx-auto max-w-5xl p-6 lg:p-10">

      <h1 className="text-3xl font-bold text-foreground">Demand forecast</h1>

      <p className="mt-2 text-sm text-foreground/60">

        Projected Short Learning booking demand vs tutor shift coverage by time slot.

      </p>

      <ShortLearningSubNav />



      <div className="mt-6 flex flex-wrap gap-2">

        {VIEW_OPTIONS.map((opt) => (

          <button

            key={opt.value}

            type="button"

            onClick={() => setView(opt.value)}

            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${

              view === opt.value

                ? "bg-primary/10 font-semibold text-primary"

                : "border border-border text-foreground/60 hover:bg-muted/50"

            }`}

          >

            {opt.label}

          </button>

        ))}

      </div>



      {error ? <p className="mt-4 text-sm font-semibold text-rose-700">{error}</p> : null}



      {loading ? (

        <p className="mt-6 text-sm text-foreground/60">Loading…</p>

      ) : forecast ? (

        <>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">

            <div className="rounded-2xl border border-border bg-card p-4">

              <p className="text-xs uppercase tracking-wide text-foreground/50">Total bookings</p>

              <p className="mt-1 text-2xl font-bold text-foreground">{forecast.totalBookings}</p>

            </div>

            <div className="rounded-2xl border border-border bg-card p-4">

              <p className="text-xs uppercase tracking-wide text-foreground/50">Peak slot</p>

              <p className="mt-1 text-2xl font-bold text-foreground">{forecast.peakBookingCount}</p>

            </div>

            <div className="rounded-2xl border border-border bg-card p-4">

              <p className="text-xs uppercase tracking-wide text-foreground/50">Slots with demand</p>

              <p className="mt-1 text-2xl font-bold text-foreground">{forecast.buckets.length}</p>

            </div>

          </div>



          {forecast.buckets.length === 0 ? (

            <p className="mt-6 text-sm text-foreground/60">No booking demand in this view.</p>

          ) : (

            <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">

              <table className="w-full text-sm">

                <thead className="bg-muted/40 text-xs text-foreground/60">

                  <tr>

                    <th className="px-4 py-2 text-left font-medium">Session start</th>

                    <th className="px-4 py-2 text-left font-medium">Bookings</th>

                    <th className="px-4 py-2 text-left font-medium">Est. tutor min</th>

                    <th className="px-4 py-2 text-left font-medium">Shift min</th>

                    <th className="px-4 py-2 text-left font-medium">Gap</th>

                    <th className="px-4 py-2 text-left font-medium">Late</th>

                  </tr>

                </thead>

                <tbody className="divide-y divide-border">

                  {forecast.buckets.map((bucket) => (

                    <tr key={bucket.startsAt}>

                      <td className="px-4 py-2">{new Date(bucket.startsAt).toLocaleString()}</td>

                      <td className="px-4 py-2">{bucket.bookingCount}</td>

                      <td className="px-4 py-2">{bucket.estimatedTutorMinutesNeeded}</td>

                      <td className="px-4 py-2">{bucket.publishedShiftMinutes}</td>

                      <td className="px-4 py-2 font-medium text-amber-700">

                        {bucket.gapMinutes > 0 ? `+${bucket.gapMinutes}` : "—"}

                      </td>

                      <td className="px-4 py-2">{bucket.lateBooking ? "Yes" : "No"}</td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          )}

        </>

      ) : null}

    </div>

  );

}


