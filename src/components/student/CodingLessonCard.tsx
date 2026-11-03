"use client";

import Link from "next/link";
import type { CodingDashboardLesson } from "@/lib/coding/dashboard-lessons";

const STATUS: Record<string, string> = {
  not_started: "Not started",
  learning: "Learning",
  practising: "Practising",
  mastered: "Mastered",
};

export default function CodingLessonCard({ lessons }: { lessons: CodingDashboardLesson[] }) {
  if (lessons.length === 0) return null;
  return (
    <section className="mb-6 rounded-3xl border border-sky-200 bg-sky-50 p-5">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Coding</p>
      <h2 className="mt-1 text-lg font-black text-slate-900">Coding lessons</h2>
      <ul className="mt-3 space-y-2">
        {lessons.map((lesson) => (
          <li key={lesson.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
            <div>
              <p className="font-black text-slate-900">{lesson.title}</p>
              <p className="text-sm text-slate-600">{STATUS[lesson.status] ?? lesson.status}</p>
            </div>
            <Link href={lesson.href} className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white">
              Open lesson
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
