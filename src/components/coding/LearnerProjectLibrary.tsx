"use client";
import { useEffect, useState } from "react";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import StarLizHelper from "@/components/guidance/StarLizHelper";
import { portfolioGuide } from "@/components/guidance/coding-guides";
import ParentProjectPortfolio, { type ParentPortfolio } from "./ParentProjectPortfolio";
import CodingProjectReplay from "./CodingProjectReplay";
import type { learnerLegacyProjects } from "@/lib/coding/workspace-store";
type LegacyProjects = Awaited<ReturnType<typeof learnerLegacyProjects>>;
export default function LearnerProjectLibrary() {
  const [library, setLibrary] = useState<{ learnerId: string; projects: ParentPortfolio; legacyProjects: LegacyProjects } | null>(null), [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetchWithRefreshRetry("/api/student/coding/portfolio", { signal: abort.signal, cache: "no-store", credentials: "same-origin" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || typeof data.learnerId !== "string" || !Array.isArray(data.projects)) throw new Error(data.error ?? "Your assessed creations could not be opened.");
      if (!abort.signal.aborted) setLibrary({ learnerId: data.learnerId, projects: data.projects, legacyProjects: Array.isArray(data.legacyProjects) ? data.legacyProjects : [] });
    }).catch((failure) => { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : "Your assessed creations are unavailable."); });
    return () => abort.abort();
  }, []);
  if (error) return <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{error}</p>;
  if (!library) return <p role="status" className="text-sm text-slate-600">Opening your assessed creations…</p>;
  return <section aria-label="Your Coding portfolio" className="space-y-4">
    <StarLizHelper learner={library.learnerId} guide="coding-portfolio" steps={portfolioGuide} established={library.legacyProjects.length + library.projects.length > 0} />
    <div data-guide-target="portfolio-evidence" className="space-y-4">
    {library.legacyProjects.map(project => (
      <article key={project.lessonId} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-emerald-800">Mastered lesson · original Coding course</p>
        <h2 className="mt-1 text-lg font-bold">{project.title}</h2>
        <p className="mt-1 text-sm text-slate-600">{project.projectTitle}</p>
        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-sky-800">View saved project</summary>
          <div className="rounded-xl bg-slate-950 px-3 pb-3 text-white">
            <CodingProjectReplay project={project.preview} audience="learner" />
          </div>
        </details>
      </article>
    ))}
    {library.projects.length ? <ParentProjectPortfolio childId={library.learnerId} projects={library.projects} audience="learner" /> : <section className="rounded-2xl border border-slate-300 bg-white p-4 sm:p-6" aria-label="Assessed curriculum creations"><h2 className="text-xl font-bold text-slate-950">Your assessed curriculum creations</h2><p className="mt-2 text-sm leading-6 text-slate-600">{library.legacyProjects.length ? "Your completed lesson project is shown above. Expanded curriculum portfolio projects will appear here when independently assessed." : "Your independently assessed curriculum creations will appear here. Open your learning journey to resume work in progress."}</p></section>}
    </div>
  </section>;
}
