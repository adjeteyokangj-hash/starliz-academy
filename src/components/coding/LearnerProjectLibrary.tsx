"use client";
import { useEffect, useState } from "react";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import ParentProjectPortfolio, { type ParentPortfolio } from "./ParentProjectPortfolio";
export default function LearnerProjectLibrary() {
  const [library, setLibrary] = useState<{ learnerId: string; projects: ParentPortfolio } | null>(null), [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetchWithRefreshRetry("/api/student/coding/portfolio", { signal: abort.signal, cache: "no-store", credentials: "same-origin" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || typeof data.learnerId !== "string" || !Array.isArray(data.projects)) throw new Error(data.error ?? "Your assessed creations could not be opened.");
      if (!abort.signal.aborted) setLibrary({ learnerId: data.learnerId, projects: data.projects });
    }).catch((failure) => { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : "Your assessed creations are unavailable."); });
    return () => abort.abort();
  }, []);
  if (error) return <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{error}</p>;
  if (!library) return <p role="status" className="text-sm text-slate-600">Opening your assessed creations…</p>;
  if (!library.projects.length) return <section className="rounded-2xl border border-slate-300 bg-white p-4 sm:p-6" aria-label="Assessed curriculum creations"><h2 className="text-xl font-bold text-slate-950">Your assessed curriculum creations</h2><p className="mt-2 text-sm leading-6 text-slate-600">Your independently assessed curriculum creations will appear here. Open your learning journey to resume work in progress.</p></section>;
  return <ParentProjectPortfolio childId={library.learnerId} projects={library.projects} audience="learner" />;
}
