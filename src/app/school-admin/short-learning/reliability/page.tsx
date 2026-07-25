"use client";



import { useEffect, useState } from "react";

import ShortLearningSubNav from "@/components/school-admin/ShortLearningSubNav";



type ParentSummary = {

  parentUserId: string;

  parentEmail: string | null;

  parentName: string | null;

  noShowCount: number;

  lateCancelCount: number;

  totalBookings: number;

  restricted: boolean;

  restrictionReason: string | null;

};



type ReliabilityPayload = {

  lookbackDays: number;

  totals: {

    noShows: number;

    lateCancels: number;

    activeBookings: number;

    restrictedParentCount: number;

  };

  parents: ParentSummary[];

};



export default function SchoolAdminReliabilityPage() {

  const [reliability, setReliability] = useState<ReliabilityPayload | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);



  useEffect(() => {

    let cancelled = false;

    const boot = window.setTimeout(() => {

      void (async () => {

        setLoading(true);

        try {

          const res = await fetch("/api/school-admin/short-learning/reliability");

          const payload = await res.json();

          if (cancelled) return;

          if (!res.ok) {

            setError(payload.error ?? "Failed to load reliability.");

            return;

          }

          setReliability(payload.reliability ?? null);

        } catch {

          if (!cancelled) setError("Unable to load reliability.");

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



  const restrictedParents = reliability?.parents.filter((p) => p.restricted) ?? [];



  return (

    <div className="mx-auto max-w-5xl p-6 lg:p-10">

      <h1 className="text-3xl font-bold text-foreground">Parent reliability</h1>

      <p className="mt-2 text-sm text-foreground/60">

        No-show and late-cancel counts by parent over the configured lookback window.

      </p>

      <ShortLearningSubNav />



      {error ? <p className="mt-4 text-sm font-semibold text-rose-700">{error}</p> : null}



      {loading ? (

        <p className="mt-6 text-sm text-foreground/60">Loading…</p>

      ) : reliability ? (

        <>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

            <div className="rounded-2xl border border-border bg-card p-4">

              <p className="text-xs uppercase tracking-wide text-foreground/50">No-shows</p>

              <p className="mt-1 text-2xl font-bold text-foreground">{reliability.totals.noShows}</p>

            </div>

            <div className="rounded-2xl border border-border bg-card p-4">

              <p className="text-xs uppercase tracking-wide text-foreground/50">Late cancels</p>

              <p className="mt-1 text-2xl font-bold text-foreground">

                {reliability.totals.lateCancels}

              </p>

            </div>

            <div className="rounded-2xl border border-border bg-card p-4">

              <p className="text-xs uppercase tracking-wide text-foreground/50">Active bookings</p>

              <p className="mt-1 text-2xl font-bold text-foreground">

                {reliability.totals.activeBookings}

              </p>

            </div>

            <div className="rounded-2xl border border-border bg-card p-4">

              <p className="text-xs uppercase tracking-wide text-foreground/50">Restricted parents</p>

              <p className="mt-1 text-2xl font-bold text-amber-700">

                {reliability.totals.restrictedParentCount}

              </p>

            </div>

          </div>



          <p className="mt-4 text-xs text-foreground/50">

            Lookback: {reliability.lookbackDays} days. Restriction flags are advisory summaries for

            admin review — booking enforcement is not applied automatically.

          </p>



          {restrictedParents.length > 0 ? (

            <section className="mt-8">

              <h2 className="mb-3 text-lg font-semibold text-foreground">Restricted parents summary</h2>

              <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/50">

                <table className="w-full text-sm">

                  <thead className="bg-amber-100/60 text-xs text-foreground/60">

                    <tr>

                      <th className="px-4 py-2 text-left font-medium">Parent</th>

                      <th className="px-4 py-2 text-left font-medium">No-shows</th>

                      <th className="px-4 py-2 text-left font-medium">Late cancels</th>

                      <th className="px-4 py-2 text-left font-medium">Reason</th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-amber-200/60">

                    {restrictedParents.map((parent) => (

                      <tr key={parent.parentUserId}>

                        <td className="px-4 py-2">

                          <div className="font-medium">{parent.parentName ?? "Parent"}</div>

                          {parent.parentEmail ? (

                            <div className="text-xs text-foreground/50">{parent.parentEmail}</div>

                          ) : null}

                        </td>

                        <td className="px-4 py-2">{parent.noShowCount}</td>

                        <td className="px-4 py-2">{parent.lateCancelCount}</td>

                        <td className="px-4 py-2 text-xs">{parent.restrictionReason}</td>

                      </tr>

                    ))}

                  </tbody>

                </table>

              </div>

            </section>

          ) : null}



          <section className="mt-8">

            <h2 className="mb-3 text-lg font-semibold text-foreground">All parents with bookings</h2>

            {reliability.parents.length === 0 ? (

              <p className="text-sm text-foreground/60">No booking history in lookback window.</p>

            ) : (

              <div className="overflow-hidden rounded-2xl border border-border bg-card">

                <table className="w-full text-sm">

                  <thead className="bg-muted/40 text-xs text-foreground/60">

                    <tr>

                      <th className="px-4 py-2 text-left font-medium">Parent</th>

                      <th className="px-4 py-2 text-left font-medium">Bookings</th>

                      <th className="px-4 py-2 text-left font-medium">No-shows</th>

                      <th className="px-4 py-2 text-left font-medium">Late cancels</th>

                      <th className="px-4 py-2 text-left font-medium">Status</th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-border">

                    {reliability.parents.map((parent) => (

                      <tr key={parent.parentUserId}>

                        <td className="px-4 py-2">

                          <div className="font-medium">{parent.parentName ?? "Parent"}</div>

                          {parent.parentEmail ? (

                            <div className="text-xs text-foreground/50">{parent.parentEmail}</div>

                          ) : null}

                        </td>

                        <td className="px-4 py-2">{parent.totalBookings}</td>

                        <td className="px-4 py-2">{parent.noShowCount}</td>

                        <td className="px-4 py-2">{parent.lateCancelCount}</td>

                        <td className="px-4 py-2">

                          {parent.restricted ? (

                            <span className="font-medium text-amber-700">Restricted</span>

                          ) : (

                            <span className="text-foreground/60">OK</span>

                          )}

                        </td>

                      </tr>

                    ))}

                  </tbody>

                </table>

              </div>

            )}

          </section>

        </>

      ) : null}

    </div>

  );

}


