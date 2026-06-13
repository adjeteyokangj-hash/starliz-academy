"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Lesson = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  level: string;
  category: string;
  objective: string;
  words: Array<{ id: string }>;
  quizQuestions: Array<{ id: string }>;
};

export default function GaLearningHubPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ga/lessons")
      .then((response) => response.json() as Promise<{ items?: Lesson[] }>)
      .then((payload) => {
        if (!cancelled) setLessons(payload.items ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <section className="mx-auto max-w-5xl rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200">Ga Learning Hub</p>
        <h1 className="mt-2 text-3xl font-black">Beginner Ga Lessons</h1>
        <p className="mt-3 text-sm text-emerald-50/80">Practise flashcards and simple quizzes built from approved Ga words.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/ga-dictionary" className="rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-950">Open Ga Dictionary</Link>
          <Link href="/admin/ga-voice" className="rounded-xl border border-emerald-300/40 px-4 py-2 text-sm font-black text-emerald-100">Review Ga Voice</Link>
        </div>
      </section>
      <section className="mx-auto mt-6 grid max-w-5xl gap-3 md:grid-cols-2">
        {loading ? <p className="text-sm text-slate-400">Loading lessons...</p> : null}
        {!loading && !lessons.length ? <p className="text-sm text-slate-400">No published Ga lessons yet.</p> : null}
        {lessons.map((lesson) => (
          <Link key={lesson.id} href={`/ga-learning-hub/${encodeURIComponent(lesson.slug)}`} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 transition hover:border-emerald-400/50">
            <p className="text-xs font-black uppercase text-emerald-300">{lesson.category} · {lesson.level}</p>
            <h2 className="mt-2 text-xl font-black">{lesson.title}</h2>
            <p className="mt-2 text-sm text-slate-300">{lesson.objective}</p>
            <p className="mt-3 text-xs text-slate-400">{lesson.words.length} words · {lesson.quizQuestions.length} questions</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
