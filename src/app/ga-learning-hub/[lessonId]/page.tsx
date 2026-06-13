"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatGaEnglishDisplayWord } from "@/lib/ga-word-bank";

type Lesson = {
  id: string;
  title: string;
  description: string | null;
  level: string;
  category: string;
  objective: string;
  flashcards: Array<{ wordId: string; englishWord: string; gaWord: string }>;
  pronunciationReferences: Array<{
    id: string;
    sourceTitle: string | null;
    sourceUrl: string;
    pronunciationNote: string | null;
    linkedWordId: string | null;
    linkedPhraseText: string | null;
    linkedLessonId: string | null;
    reviewStatus: string;
    permissionStatus: string;
  }>;
  quizQuestions: Array<{ id: string; prompt: string; options: string[]; correctAnswer: string; explanation: string | null }>;
};

type Props = { params: Promise<{ lessonId: string }> };

export default function GaLessonPage({ params }: Props) {
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    params.then((resolved) => {
      if (!cancelled) setLessonId(resolved.lessonId);
    });
    return () => {
      cancelled = true;
    };
  }, [params]);

  useEffect(() => {
    if (!lessonId) return;
    let cancelled = false;
    fetch(`/api/ga/lessons/${encodeURIComponent(lessonId)}`)
      .then((response) => response.json() as Promise<{ item?: Lesson; error?: string }>)
      .then((payload) => {
        if (!cancelled) setLesson(payload.item ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  const correctAnswers = useMemo(() => {
    if (!lesson) return 0;
    return lesson.quizQuestions.filter((question) => answers[question.id] === question.correctAnswer).length;
  }, [answers, lesson]);

  async function submitProgress() {
    if (!lesson) return;
    const completed = lesson.quizQuestions.length === 0 || Object.keys(answers).length >= lesson.quizQuestions.length;
    const response = await fetch(`/api/ga/lessons/${encodeURIComponent(lesson.id)}/progress`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ correctAnswers, totalQuestions: lesson.quizQuestions.length, completed }),
    });
    if (response.ok) {
      setMessage(completed ? "Lesson progress saved." : "Practice progress saved.");
    } else {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      setMessage(payload?.error ?? "Unable to save progress. Please sign in and select a student.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        <Link href="/ga-learning-hub" className="text-sm font-bold text-emerald-300">Back to Ga Learning Hub</Link>
        {loading ? <p className="mt-6 text-sm text-slate-400">Loading lesson...</p> : null}
        {!loading && !lesson ? <p className="mt-6 text-sm text-slate-400">Lesson is not available.</p> : null}
        {lesson ? (
          <div className="mt-6 space-y-6">
            <section className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200">{lesson.category} · {lesson.level}</p>
              <h1 className="mt-2 text-3xl font-black">{lesson.title}</h1>
              <p className="mt-3 text-sm text-emerald-50/80">{lesson.objective}</p>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <h2 className="text-lg font-black">Flashcards</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {lesson.flashcards.map((card) => (
                  <article key={card.wordId} className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
                    <p className="text-xs uppercase text-slate-500">English</p>
                    <p className="text-xl font-black">{formatGaEnglishDisplayWord({ englishWord: card.englishWord, category: lesson.category })}</p>
                    <p className="mt-3 text-xs uppercase text-emerald-300">Ga</p>
                    <p className="text-2xl font-black text-emerald-100">{card.gaWord}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-black">Pronunciation References</h2>
                <Link href="/ga-dictionary" className="text-sm font-bold text-emerald-300 hover:text-emerald-200">Open Ga Dictionary</Link>
              </div>
              <p className="mt-2 text-sm text-slate-400">Approved pronunciation and audio references linked to this lesson and its words.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {lesson.pronunciationReferences.length ? lesson.pronunciationReferences.map((reference) => (
                  <article key={reference.id} className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-300">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">{reference.sourceTitle ?? reference.permissionStatus}</p>
                    <p className="mt-2 font-bold text-white">{reference.pronunciationNote ?? reference.linkedPhraseText ?? "Pronunciation reference"}</p>
                    <p className="mt-1 text-xs text-slate-400">{reference.reviewStatus} · {reference.linkedWordId ? `Word ${reference.linkedWordId}` : reference.linkedLessonId ? "Lesson-level reference" : "General reference"}</p>
                    <a href={reference.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-bold text-emerald-300 hover:text-emerald-200">
                      Open source reference
                    </a>
                  </article>
                )) : (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-400">
                    No approved pronunciation references are linked yet. Open the Ga Dictionary to seed vocabulary, or add references from the Ga Voice dashboard.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <h2 className="text-lg font-black">Mini Quiz</h2>
              <div className="mt-3 space-y-3">
                {lesson.quizQuestions.map((question, index) => (
                  <article key={question.id} className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
                    <p className="font-bold">{index + 1}. {question.prompt}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {question.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                          className={`rounded-lg border px-3 py-2 text-sm font-bold ${answers[question.id] === option ? "border-emerald-400 bg-emerald-500/20 text-emerald-100" : "border-slate-700 text-slate-200"}`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
              <button type="button" onClick={submitProgress} className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-white">Save progress</button>
              {message ? <p className="mt-3 text-sm font-bold text-emerald-200">{message}</p> : null}
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
