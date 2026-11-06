import { CODING_PATHWAY_CATALOG, UNDERSTANDING_LOOPS } from "@/lib/coding/catalog";

import { codingPublicationSummary } from "@/lib/coding/learning/publication-summary";

export default function SchoolAdminCodingPage() {
  const publication = codingPublicationSummary();
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Coding</h1>
        <p className="mt-2 text-sm text-foreground/70">
          Coding is an optional subject from Year 1 to Year 11. Families choose it in subject selection. Put Coding on the Day School timetable and eligible published activities open in the coding workspace. Short Learning bookings also use the Coding workspace. Human support still depends on tutors who are on shift.
        </p>
      </header>
      <section className="rounded-xl border border-border p-4 text-sm">
        <h2 className="font-semibold">Current curriculum availability</h2><p>{publication.authored} authored activities · {publication.published} published in {publication.environment}.</p><p>{publication.initiallyEligible} have no academic prerequisites. Learner access also depends on consent, licensing or subscription, year group and verified prerequisites or readiness evidence.</p><p className="mt-2">The original experience below is separate from the 440 curriculum requirements.</p><h3 className="mt-3 font-semibold">Original Understanding Loops experience</h3>
        <p className="mt-1">{UNDERSTANDING_LOOPS.pathwayTitle} · {UNDERSTANDING_LOOPS.courseTitle} · {UNDERSTANDING_LOOPS.moduleTitle}</p>
        <p className="mt-1">{UNDERSTANDING_LOOPS.title} · {UNDERSTANDING_LOOPS.yearBand}</p>
        <p className="mt-2 text-foreground/70">{UNDERSTANDING_LOOPS.learningObjective}</p>
      </section>
      <section className="space-y-3">
        {CODING_PATHWAY_CATALOG.map((pathway) => (
          <article key={pathway.id} className="rounded-xl border border-border p-4 text-sm">
            <h2 className="font-semibold">{pathway.title}</h2>
            <p className="text-xs text-foreground/50">{pathway.years}</p>
            <p className="mt-1 text-foreground/70">{pathway.mainLearning}</p>{publication.pathways.filter(item => item.id === pathway.id).map(item => <p key={item.id} className="mt-2">{item.authored} authored · {item.published} published here</p>)}
          </article>
        ))}
      </section>
    </div>
  );
}
