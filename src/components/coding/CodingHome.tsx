"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import type { CodingPathwayId } from "@/lib/coding/types";
import LearningCatalogue from "./LearningCatalogue";
import LearnerProjectLibrary from "./LearnerProjectLibrary";
import SavedEvidenceLibrary from "./SavedEvidenceLibrary";
import ReadinessBridges from "./ReadinessBridges";
import CodingNextStep from "./CodingNextStep";
import { PUBLISHED_CODING_LESSON_ID } from "@/lib/coding/types";

type Pathway = {
  id: CodingPathwayId;
  title: string;
  years: string;
  mainLearning: string;
  exampleProjects: string[];
  courses: Array<{
    id: string;
    title: string;
    modules: Array<{
      id: string;
      title: string;
      lessons: Array<{ id: string; title: string; published: boolean }>;
    }>;
  }>;
};

type Question = { id: string; prompt: string; choices: Array<{ id: string; label: string }> };

type HomePayload = {
  learnerId: string;
  yearGroup: string | null;
  yearPathwayTitle: string;
  intro?: string;
  curriculumPublished?: boolean;
  pathways: Pathway[];
  placementQuestions: Question[];
  placement: { recommended: string; adjustment: string; note: string } | null;
  lesson: { skillStatus: string; stage: string; assignmentStatus: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  learning: "Learning",
  practising: "Practising",
  mastered: "Mastered",
};

export default function CodingHome() {
  const [home, setHome] = useState<HomePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [placementSaved, setPlacementSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = await fetchWithRefreshRetry("/api/student/coding", { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "Coding could not be loaded.");
        return;
      }
      setHome(data as HomePayload);
    })();
  }, []);

  const published = useMemo(() => {
    const lessons: Array<{ id: string; title: string; pathwayId: CodingPathwayId; pathway: string; course: string; module: string }> = [];
    for (const pathway of home?.pathways ?? []) {
      for (const course of pathway.courses) {
        for (const courseModule of course.modules) {
          for (const lesson of courseModule.lessons) {
            if (lesson.published) {
              lessons.push({
                id: lesson.id,
                title: lesson.title,
                pathwayId: pathway.id,
                pathway: pathway.title,
                course: course.title,
                module: courseModule.title,
              });
            }
          }
        }
      }
    }
    return lessons;
  }, [home]);

  async function submitPlacement() {
    if (!home || saving) return;
    setPlacementError(null);
    if (!home.placementQuestions.length || home.placementQuestions.some(question => !answers[question.id])) {
      setPlacementError("Choose an answer to each question before finding your starting point.");
      return;
    }
    setSaving(true);
    setPlacementSaved(false);
    try {
      const response = await fetchWithRefreshRetry("/api/student/coding/placement", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: Object.entries(answers).map(([questionId, choiceId]) => ({ questionId, choiceId })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Placement could not be saved.");
      if (!data.placement || typeof data.placement.note !== "string" || typeof data.placement.recommended !== "string") throw new Error("Your recommendation could not be confirmed. Please try again.");
      setHome((current) => current ? { ...current, placement: data.placement } : current);
      setPlacementSaved(true);
    } catch (cause) {
      setPlacementError(cause instanceof Error ? cause.message : "Placement could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const nextLesson = published.find(lesson => lesson.pathwayId === home?.placement?.recommended) ?? published[0];

  const dashboardNavigation = (
    <nav aria-label="Coding navigation">
      <Link
        href="/student/dashboard"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-bold text-sky-800 shadow-sm hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
      >
        <span aria-hidden="true">←</span>
        Return to dashboard
      </Link>
    </nav>
  );

  if (error || !home) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        {dashboardNavigation}
        {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : <p role="status" className="text-sm text-slate-600">Loading coding…</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 text-slate-900">
      {dashboardNavigation}
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-700">Coding</p>
        <h1 className="mt-1 text-3xl font-black">Learn to give a computer instructions</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          {home.intro ?? (home.yearGroup ? `${home.yearGroup} starts on ${home.yearPathwayTitle}.` : `The usual starting pathway is ${home.yearPathwayTitle}.`)}
        </p>
        {home.curriculumPublished && <Link href="#coding-curriculum" className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-sky-800 px-5 py-3 font-bold text-white">Open my learning journey →</Link>}
      </header>

      {home.lesson ? (
        <p className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm">
          Understanding Loops is <strong>{STATUS_LABEL[home.lesson.skillStatus] ?? home.lesson.skillStatus}</strong>
          {home.lesson.assignmentStatus === "assigned" ? " and has been assigned." : "."}
        </p>
      ) : null}

      <section aria-label="Available Coding lessons" className="grid gap-4 md:grid-cols-2">
        {published.map((lesson) => (
          <Link
            key={lesson.id}
            href={`/student/coding/${lesson.id}`}
            className="group rounded-2xl border-2 border-sky-300 bg-gradient-to-br from-sky-50 to-white p-6 shadow-md transition hover:border-sky-600 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-sky-700">{lesson.pathway}</p>
            <h2 className="mt-1 text-xl font-black">{lesson.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{lesson.course} · {lesson.module}</p>
            <span className="mt-5 inline-flex min-h-12 items-center gap-3 rounded-xl bg-sky-700 px-5 py-3 text-base font-bold text-white group-hover:bg-sky-800">
              {home.lesson?.skillStatus === "mastered" ? "Revisit lesson" : home.lesson && home.lesson.skillStatus !== "not_started" ? "Continue lesson" : "Start lesson"}<span aria-hidden="true">→</span>
            </span>
          </Link>
        ))}
      </section>

      {home.lesson?.skillStatus === "mastered" ? <section aria-label="Your next learning step" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><h2 className="text-lg font-black text-emerald-950">Your learning continues from your achievement</h2><p className="mt-2 text-sm text-slate-700">You’ve mastered Understanding Loops. You do not need to repeat the starting-point check. Your year-group pathway remains {home.yearPathwayTitle}.</p><CodingNextStep lessonId={PUBLISHED_CODING_LESSON_ID} showReturnLink={false} /><Link href="#coding-portfolio" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white">View my saved project →</Link></section> : <section aria-labelledby="coding-starting-point" className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 id="coding-starting-point" className="text-lg font-black">Find a starting point</h2>
        <p className="mt-1 text-sm text-slate-600">Answer this short check, then open an available lesson to practise. This saves guidance; it does not change your year group or unlock unpublished lessons.</p>
        <div className="mt-4 space-y-4">
          {home.placementQuestions.map((question) => (
            <fieldset key={question.id} disabled={saving}>
              <legend className="text-sm font-semibold">{question.prompt}</legend>
              <div className="mt-2 space-y-1">
                {question.choices.map((choice) => (
                  <label key={choice.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm ${answers[question.id] === choice.id ? "border-sky-500 bg-sky-50" : "border-slate-200 hover:bg-slate-50"}`}>
                    <input
                      type="radio"
                      name={question.id}
                      className="mt-1"
                      checked={answers[question.id] === choice.id}
                      onChange={() => { setAnswers((current) => ({ ...current, [question.id]: choice.id })); setPlacementError(null); setPlacementSaved(false); }}
                    />
                    <span>{choice.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void submitPlacement()}
          disabled={saving || !home.placementQuestions.length}
          className="mt-4 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? "Finding your starting point…" : "Find my starting point"}
        </button>
        {placementError && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{placementError}</p>}
        {home.placement && <div role="status" aria-live="polite" className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
          <h3 className="font-bold text-sky-950">{placementSaved ? "Your starting point is saved" : "Your saved guidance"}</h3>
          <p className="mt-2 text-sm text-slate-700">{home.curriculumPublished ? `Your year-group pathway is ${home.yearPathwayTitle}. Use the learning journey and practical readiness bridge to find eligible activities.` : home.placement.note}</p>
          {home.curriculumPublished ? <Link href="#coding-curriculum" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-sky-700 px-4 py-2 font-bold text-white">Open my learning journey →</Link> : nextLesson ? <><p className="mt-2 text-sm text-slate-700">{nextLesson.pathwayId === home.placement.recommended ? "Your next available lesson:" : "While your recommended pathway awaits publication, you can practise with:"} <strong>{nextLesson.title}</strong></p><Link href={`/student/coding/${nextLesson.id}`} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-sky-700 px-4 py-2 font-bold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">Open {nextLesson.title}<span aria-hidden="true" className="ml-2">→</span></Link></> : <p className="mt-2 text-sm text-slate-700">Your guidance is saved. Lessons will appear here when they are published.</p>}
        </div>}
      </section>

      }
      <div id="coding-curriculum"><LearningCatalogue key={`curriculum:${home.learnerId}`} yearGroup={home.yearGroup} /></div>
      <ReadinessBridges key={`readiness:${home.learnerId}`} yearGroup={home.yearGroup} />
      <LearnerProjectLibrary key={`projects:${home.learnerId}`} />
      <SavedEvidenceLibrary childId={home.learnerId} />

      <section>
        <h2 className="text-lg font-black">Pathways</h2>
        <div className="mt-3 grid gap-3">
          {home.pathways.map((pathway) => (
            <article key={pathway.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-black">{pathway.title}</h3>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{pathway.years}</p>
              </div>
              <p className="mt-1 text-sm text-slate-600">{pathway.mainLearning}</p>
              <p className="mt-2 text-xs text-slate-500">Projects: {pathway.exampleProjects.join("; ")}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
