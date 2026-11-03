import { CODING_PATHWAY_CATALOG, UNDERSTANDING_LOOPS } from "@/lib/coding/catalog";
import { publishedLessonValidation } from "@/lib/coding/draft-validation";
import CodingAssistanceSettings from "@/components/coding/CodingAssistanceSettings";
import Link from "next/link";
import { curriculumReadiness } from "@/lib/coding/curriculum/registry";
import { firstInstructionsPackages } from "@/lib/coding/curriculum/first-instructions";
import { authoredActivities, releasedActivities } from "@/lib/coding/learning/catalogue";
import CodingPlanAccess from "@/components/coding/CodingPlanAccess";

export default function AdminCodingPage() {
  const validation = publishedLessonValidation();
  const readiness = curriculumReadiness();
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 text-slate-100">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-300">Content</p>
        <h1 className="text-2xl font-black">Coding pathways</h1>
        <p className="mt-2 text-sm text-slate-300">
          Manage the pathway catalogue here. A lesson stays unpublished until it has year band, prerequisites, an objective, difficulty, mastery criteria and an executable check. The first live module is {UNDERSTANDING_LOOPS.title}.
        </p>
      </header>
      <CodingAssistanceSettings />
      <CodingPlanAccess />
      <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5"><h2 className="text-xl font-bold">Curriculum workbenches</h2><p className="text-sm text-slate-300">{authoredActivities.length} authored activities · {releasedActivities().length} released activities. Author workbenches execute the same practical engines in temporary private sessions; they do not award learner progress or publish content.</p>{[...new Set(authoredActivities.map((activity) => activity.year))].sort((a, b) => a - b).map((year) => <details key={year} className="rounded-xl border border-slate-700 p-3"><summary className="min-h-11 cursor-pointer font-semibold">Year {year} · {authoredActivities.filter((activity) => activity.year === year).length} authored activities</summary><ul className="mt-3 grid gap-2 sm:grid-cols-2">{authoredActivities.filter((activity) => activity.year === year).map((activity) => <li key={activity.id}><Link className="block min-h-11 rounded-lg bg-slate-800 p-3 text-sm text-sky-200 hover:bg-slate-700" href={`/admin/coding/workbench/${activity.id}`}>{activity.inventoryId} · {activity.title}<span className="mt-1 block text-xs text-slate-400">{activity.kind}</span></Link></li>)}</ul></details>)}</section>
      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
        <h2 className="text-xl font-bold">Approved curriculum implementation</h2>
        <p className="mt-2 text-sm text-slate-300">{readiness.approvedCoreLessons} core lessons · {readiness.plannedConsolidationSessions} consolidation sessions · {readiness.portfolioProjects} portfolio projects.</p>
        <p className="mt-2 text-sm text-amber-200">One existing lesson is published. No expanded pathway is complete. Authored drafts require their practical, educational, access and accessibility checks before publication.</p>
        <h3 className="mt-5 font-bold">First Instructions — executable author previews</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">{firstInstructionsPackages.map((lesson) => <li key={lesson.id}><Link className="block rounded-xl bg-slate-800 p-3 text-sky-200 hover:bg-slate-700" href={`/admin/coding/preview/${lesson.id}`}>{lesson.inventoryId} · {lesson.title}</Link></li>)}</ul>
      </section>
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
        <p className="font-semibold">{validation.ok ? "Executable checks passed" : "Executable checks failed"}</p>
        <ul className="mt-2 space-y-1 text-slate-300">
          {validation.issues.length === 0 ? <li>Starter project, debug task and reference solutions ran inside the step limit.</li> : null}
          {validation.issues.map((issue) => <li key={issue.code}>{issue.message}</li>)}
        </ul>
      </section>
      {CODING_PATHWAY_CATALOG.map((pathway) => (
        <section key={pathway.id} className="rounded-2xl border border-white/10 p-4">
          <h2 className="font-black">{pathway.title}</h2>
          <p className="text-xs uppercase tracking-wide text-slate-400">{pathway.years}</p>
          <p className="mt-2 text-sm text-slate-300">{pathway.mainLearning}</p>
          {pathway.courses.map((course) => (
            <div key={course.id} className="mt-3 text-sm">
              <p className="font-semibold">{course.title}</p>
              {course.modules.map((module) => (
                <ul key={module.id} className="mt-1 space-y-1 text-slate-300">
                  {module.lessons.map((lesson) => (
                    <li key={lesson.id}>{module.title} · {lesson.title} · {lesson.published ? "Published" : "Draft, not in the learner catalogue"}</li>
                  ))}
                </ul>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
