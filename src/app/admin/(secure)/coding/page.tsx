import { CODING_PATHWAY_CATALOG, UNDERSTANDING_LOOPS } from "@/lib/coding/catalog";
import { publishedLessonValidation } from "@/lib/coding/draft-validation";

export default function AdminCodingPage() {
  const validation = publishedLessonValidation();
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 text-slate-100">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-300">Content</p>
        <h1 className="text-2xl font-black">Coding pathways</h1>
        <p className="mt-2 text-sm text-slate-300">
          Manage the pathway catalogue here. A lesson stays unpublished until it has year band, prerequisites, an objective, difficulty, mastery criteria and an executable check. The first live module is {UNDERSTANDING_LOOPS.title}.
        </p>
      </header>
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
