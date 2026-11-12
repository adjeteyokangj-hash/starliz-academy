"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import type { LocationId } from "@/lib/coding/world/model";
import { guidedHref } from "@/lib/coding/world/guided-mapping";
import LearningWorkspace, { type ActivityWorkspaceView } from "./LearningWorkspace";

export default function ActivityLoader({ activityId, bookingId, daytimePeriodId, endpoint, worldLocation }: { activityId: string; bookingId?: string; daytimePeriodId?: string; endpoint?: string; worldLocation?: LocationId }) {
  const [boundLearner, setBoundLearner] = useState<string | undefined>(undefined);
  const [workspace, setWorkspace] = useState<ActivityWorkspaceView | null>(null), [humanEnabled, setHumanEnabled] = useState(false);
  const [error, setError] = useState<{ message: string; status: number } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const query = bookingId ? `?bookingId=${encodeURIComponent(bookingId)}` : "";
    void fetchWithRefreshRetry(`${endpoint ?? `/api/student/coding/activities/${encodeURIComponent(activityId)}`}${query}`, { signal: controller.signal, cache: "no-store", credentials: "same-origin" }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.workspace) {
        if (!controller.signal.aborted) setError({ status: response.status, message: response.status === 401 ? "We could not restore your sign-in session. Try again, or sign in to return to this activity." : data.error ?? "The saved activity could not be opened." });
        return;
      }
      if (!controller.signal.aborted) { setBoundLearner(response.headers.get("X-Coding-Learner") ?? undefined); setWorkspace(data.workspace); setHumanEnabled(data.humanAssistanceEnabled === true); }
    }).catch(() => { if (!controller.signal.aborted) setError({ status: 0, message: "The activity could not be reached. Check your connection and try again." }); });
    return () => controller.abort();
  }, [activityId, bookingId, endpoint, attempt]);
  const context = new URLSearchParams();
  if (bookingId) context.set("bookingId", bookingId);
  if (daytimePeriodId) context.set("daytimePeriodId", daytimePeriodId);
  const path = endpoint && (endpoint.startsWith("/api/student/coding/") || endpoint.startsWith("/api/admin/coding/")) ? endpoint.slice(4).split("?")[0] : `/student/coding/activities/${encodeURIComponent(activityId)}`;
  const returnPath = worldLocation ? guidedHref("activity", activityId, { bookingId, daytimePeriodId }) : `${path}${context.size ? `?${context}` : ""}`;
  const home = bookingId ? `/student/coding?bookingId=${encodeURIComponent(bookingId)}` : "/student/coding";
  if (error) return <main className="mx-auto max-w-3xl p-6"><h1 className="text-2xl font-bold">Your Coding activity</h1><p role="alert" className="my-5 rounded-xl bg-amber-50 p-4 text-amber-950">{error.message}</p><p className="text-slate-700">Your saved work has been retained.</p><div className="mt-5 flex flex-wrap gap-3">{error.status === 401 && <Link href={`/auth/login?next=${encodeURIComponent(returnPath)}`} className="inline-flex min-h-11 items-center rounded-xl bg-sky-800 px-4 py-3 font-semibold text-white">Sign in and return to activity</Link>}<button type="button" className="min-h-11 rounded-xl border border-sky-800 px-4 py-3 font-semibold text-sky-900" onClick={() => { setError(null); setAttempt(value => value + 1); }}>Try again</button><Link href={home} className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 py-3 text-slate-800">Return to Coding</Link></div></main>;
  if (!workspace) return <main className="mx-auto max-w-3xl p-6" aria-busy="true"><h1 className="text-2xl font-bold">Opening your saved Coding activity…</h1></main>;
  return <LearningWorkspace boundLearner={boundLearner} worldLocation={worldLocation} key={`${activityId}:${workspace.revision}`} initial={workspace} endpoint={endpoint} bookingId={bookingId} daytimePeriodId={daytimePeriodId} humanAssistanceEnabled={humanEnabled} />;
}
