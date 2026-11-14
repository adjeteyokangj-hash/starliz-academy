"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import { locations } from "@/lib/coding/world/model";
import type { GuidedEntry } from "@/lib/coding/world/guided-mapping";
export default function GuidedWorldLessons() {
  const [entries, setEntries] = useState<GuidedEntry[]>([]), [recommended, setRecommended] = useState<GuidedEntry | null>(null), [error, setError] = useState(""), [year, setYear] = useState(0);
  useEffect(() => {
    const abort = new AbortController(), query = new URLSearchParams(window.location.search), context = new URLSearchParams();
    for (const key of ["bookingId", "daytimePeriodId"]) if (query.get(key)) context.set(key, query.get(key)!);
    void fetchWithRefreshRetry(`/api/student/coding/world/guided${context.size ? `?${context}` : ""}`, { cache: "no-store", signal: abort.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Guided missions are unavailable.");
      if (!abort.signal.aborted) { setEntries(data.entries); setRecommended(data.recommendation); }
    }).catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Guided missions are unavailable."); });
    return () => abort.abort();
  }, []);
  const years = [...new Set(entries.map(entry => entry.year))].sort((a,b) => a-b), selectedYear = years.includes(year) ? year : recommended?.year ?? years[0];
  return <section data-guide-target="guided-missions" aria-label="Guided Coding Lessons" className="my-5 space-y-4 rounded-2xl border-2 border-emerald-400 bg-white p-5 text-slate-900"><header><p className="text-xs font-bold uppercase tracking-widest text-emerald-800">Your curriculum in the Game World</p><h2 className="mt-2 text-2xl font-bold">Continue a guided coding mission</h2><p className="mt-2 text-sm">Use your existing lessons, teacher assignments and mastery checks. Your formal learning and Free Practice stay separate.</p></header>{error && <p role="status" className="rounded-xl bg-amber-50 p-3">{error}</p>}{recommended && <Link className="inline-flex min-h-11 items-center rounded-xl bg-emerald-800 px-4 py-3 font-bold text-white" href={recommended.href}>{recommended.assignmentStatus === "assigned" ? "Teacher assigned" : "Recommended"}: {recommended.title} →</Link>}{years.length > 0 && <label className="block text-sm font-semibold">Curriculum year<select className="ml-3 min-h-11 rounded-xl border border-slate-400 p-2" value={selectedYear} onChange={event => setYear(Number(event.target.value))}>{years.map(year => <option key={year} value={year}>Year {year}</option>)}</select></label>}<details><summary className="min-h-11 cursor-pointer font-bold">Browse guided missions{entries.length ? ` (${entries.filter(e => e.year === selectedYear).length})` : ""}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{entries.filter(entry => entry.year === selectedYear).map(entry => <article key={`${entry.kind}:${entry.id}`} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-bold">{locations.find(l => l.id === entry.location)!.icon} {locations.find(l => l.id === entry.location)!.title} · {entry.assignmentStatus === "assigned" ? "Teacher assignment" : "Curriculum lesson"}</p><h3 className="mt-2 font-bold">{entry.title}</h3><p className="mt-2 text-sm">{entry.objective}</p><p className="mt-2 text-xs">{entry.status === "mastered" ? "Mastery already verified" : entry.unlocked ? `Saved stage: ${entry.stage}` : "Finish the prerequisite lessons first"}</p>{entry.unlocked && <Link href={entry.href} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-emerald-800 px-4 py-2 text-sm font-bold text-white">{entry.status === "mastered" ? "Revisit guided mission" : "Open guided mission"}</Link>}</article>)}</div></details></section>;
}
