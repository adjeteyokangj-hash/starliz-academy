"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import type { CodingPathwayId } from "@/lib/coding/types";
import LearningCatalogue from "./LearningCatalogue";
import LearnerProjectLibrary from "./LearnerProjectLibrary";
import SavedEvidenceLibrary from "./SavedEvidenceLibrary";
import ReadinessBridges from "./ReadinessBridges";

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
  const [note, setNote] = useState<string | null>(null);
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
    const lessons: Array<{ id: string; title: string; pathway: string; course: string; module: string }> = [];
    for (const pathway of home?.pathways ?? []) {
      for (const course of pathway.courses) {
        for (const courseModule of course.modules) {
          for (const lesson of courseModule.lessons) {
            if (lesson.published) {
              lessons.push({
                id: lesson.id,
                title: lesson.title,
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
    setSaving(true);
    setNote(null);
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
      setNote(typeof data.placement?.note === "string" ? data.placement.note : "Placement saved.");
      setHome((current) => current ? { ...current, placement: data.placement } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Placement could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return <p className="mx-auto max-w-3xl px-6 py-10 text-sm text-rose-700">{error}</p>;
  }
  if (!home) {
    return <p className="mx-auto max-w-3xl px-6 py-10 text-sm text-slate-600">Loading coding…</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 text-slate-900">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-700">Coding</p>
        <h1 className="mt-1 text-3xl font-black">Learn to give a computer instructions</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          {home.intro ?? (home.yearGroup ? `${home.yearGroup} starts on ${home.yearPathwayTitle}.` : `The usual starting pathway is ${home.yearPathwayTitle}.`)}
        </p>
      </header>

      {home.lesson ? (
        <p className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm">
          Understanding Loops is <strong>{STATUS_LABEL[home.lesson.skillStatus] ?? home.lesson.skillStatus}</strong>
          {home.lesson.assignmentStatus === "assigned" ? " and has been assigned." : "."}
        </p>
      ) : null}

      <LearningCatalogue key={`curriculum:${home.learnerId}`} yearGroup={home.yearGroup} />
      <ReadinessBridges key={`readiness:${home.learnerId}`} yearGroup={home.yearGroup} />
      <LearnerProjectLibrary key={`projects:${home.learnerId}`} />
      <SavedEvidenceLibrary childId={home.learnerId} />
      <section className="grid gap-3 md:grid-cols-2">
        {published.map((lesson) => (
          <Link
            key={lesson.id}
            href={`/student/coding/${lesson.id}`}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-sky-400"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-sky-700">{lesson.pathway}</p>
            <h2 className="mt-1 text-xl font-black">{lesson.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{lesson.course} · {lesson.module}</p>
            <p className="mt-3 text-sm font-semibold text-sky-800">Open the lesson</p>
          </Link>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-black">Find a starting point</h2>
        <p className="mt-1 text-sm text-slate-600">Answer what you already know about the lessons that are published. This does not change your year group.</p>
        <div className="mt-4 space-y-4">
          {home.placementQuestions.map((question) => (
            <fieldset key={question.id}>
              <legend className="text-sm font-semibold">{question.prompt}</legend>
              <div className="mt-2 space-y-1">
                {question.choices.map((choice) => (
                  <label key={choice.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name={question.id}
                      className="mt-1"
                      checked={answers[question.id] === choice.id}
                      onChange={() => setAnswers((current) => ({ ...current, [question.id]: choice.id }))}
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
          disabled={saving}
          className="mt-4 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save recommendation"}
        </button>
        {note || home.placement?.note ? (
          <p className="mt-3 text-sm text-slate-700">{note ?? home.placement?.note}</p>
        ) : null}
      </section>

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
