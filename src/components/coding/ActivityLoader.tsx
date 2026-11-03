"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import LearningWorkspace, { type ActivityWorkspaceView } from "./LearningWorkspace";

export default function ActivityLoader({ activityId, bookingId, daytimePeriodId, endpoint }: { activityId: string; bookingId?: string; daytimePeriodId?: string; endpoint?: string }) {
  const [workspace, setWorkspace] = useState<ActivityWorkspaceView | null>(null), [humanEnabled, setHumanEnabled] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const query = bookingId ? `?bookingId=${encodeURIComponent(bookingId)}` : "";
    void fetchWithRefreshRetry(`${endpoint ?? `/api/student/coding/activities/${encodeURIComponent(activityId)}`}${query}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || !data.workspace) throw new Error(data.error ?? "The saved activity could not be opened.");
      if (!controller.signal.aborted) { setWorkspace(data.workspace); setHumanEnabled(data.humanAssistanceEnabled === true); }
    }).catch((error) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "The saved activity could not be opened."); });
    return () => controller.abort();
  }, [activityId, bookingId, endpoint]);
  if (error) return <main className="mx-auto max-w-3xl p-6"><h1 className="text-2xl font-bold">Your Coding activity</h1><p role="alert" className="my-5 rounded-xl bg-amber-50 p-4 text-amber-950">{error}</p><p className="text-slate-700">Your saved work has been retained.</p><Link href="/student/coding" className="mt-5 inline-block min-h-11 rounded-xl bg-sky-800 px-4 py-3 text-white">Return to Coding</Link></main>;
  if (!workspace) return <main className="mx-auto max-w-3xl p-6" aria-busy="true"><h1 className="text-2xl font-bold">Opening your saved Coding activity…</h1></main>;
  return <LearningWorkspace key={`${activityId}:${workspace.revision}`} initial={workspace} endpoint={endpoint} bookingId={bookingId} daytimePeriodId={daytimePeriodId} humanAssistanceEnabled={humanEnabled} />;
}
