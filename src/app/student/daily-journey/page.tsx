"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";

type JourneyPayload = {
  ok: boolean;
  student?: { id: string; name: string };
  journey?: {
    date: string;
    mode: string;
    warmupSkill: string;
    focusSkill: string;
    weakSkill: string | null;
    reviewSkills: string[];
    bossTestSkills: string[];
  };
  lesson?: { assignmentId: string };
  structure?: string[];
  error?: string;
};

export default function StudentDailyJourneyPage() {
  const [payload, setPayload] = useState<JourneyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadJourney() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/student/daily-journey", { credentials: "include" });
        const data = (await response.json()) as JourneyPayload;
        if (!response.ok) throw new Error(data.error ?? "Unable to load daily journey.");
        setPayload(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load daily journey.");
      } finally {
        setLoading(false);
      }
    }

    void loadJourney();
  }, []);

  const assignmentId = payload?.lesson?.assignmentId;

  return (
    <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
      <Navbar />
      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
          <p className="text-sm font-black uppercase tracking-[0.25em] text-indigo-500">Today&apos;s Learning Adventure</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950">{"Start Today's Journey"}</h1>
          <p className="mt-3 max-w-3xl text-slate-600">A short, adaptive session with warm-up, focused skill practice, weak-area repair, mixed review, and a mini boss test.</p>

          {loading ? <div className="mt-8 rounded-3xl bg-slate-50 p-6 text-slate-600">Building your journey...</div> : null}
          {error ? <div className="mt-8 rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">{error}</div> : null}

          {!loading && !error && payload ? (
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl bg-slate-50 p-6">
                <h2 className="text-xl font-black text-slate-950">Journey Plan</h2>
                <ul className="mt-4 grid gap-2 text-sm text-slate-700">
                  {(payload.structure ?? []).map((step) => (
                    <li key={step} className="rounded-2xl bg-white px-4 py-3 font-semibold">{step}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-3xl bg-indigo-950 p-6 text-indigo-50">
                <h2 className="text-xl font-black">Skill Focus</h2>
                <div className="mt-4 grid gap-2 text-sm">
                  <div className="rounded-2xl bg-white/10 px-4 py-3"><span className="font-black">Warm-up:</span> {payload.journey?.warmupSkill}</div>
                  <div className="rounded-2xl bg-white/10 px-4 py-3"><span className="font-black">Main focus:</span> {payload.journey?.focusSkill}</div>
                  <div className="rounded-2xl bg-white/10 px-4 py-3"><span className="font-black">Weak skill repair:</span> {payload.journey?.weakSkill ?? "None"}</div>
                  <div className="rounded-2xl bg-white/10 px-4 py-3"><span className="font-black">Boss test:</span> {(payload.journey?.bossTestSkills ?? []).join(", ")}</div>
                </div>
              </div>
            </div>
          ) : null}

          {assignmentId ? (
            <Link
              href={`/games/lesson?assignmentId=${encodeURIComponent(assignmentId)}`}
              className="mt-8 inline-flex rounded-2xl bg-indigo-600 px-6 py-4 font-black text-white shadow-lg shadow-indigo-200 hover:bg-indigo-500"
            >
              {"Start Today's Lesson"}
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
