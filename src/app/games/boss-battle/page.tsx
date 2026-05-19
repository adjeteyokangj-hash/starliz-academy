"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";

type BossStatusPayload = {
  unlocked?: boolean;
  lockReason?: string | null;
  lessonAssignmentId?: string | null;
  error?: string;
};

export default function BossBattlePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const redirectIntoLessonRuntime = async () => {
      try {
        const response = await fetch("/api/student/boss-battle", { credentials: "include" });
        const payload = (await response.json()) as BossStatusPayload;
        if (!response.ok) {
          throw new Error(payload.error ?? payload.lockReason ?? "Boss Battle is locked right now.");
        }
        if (!payload.unlocked) {
          throw new Error(payload.lockReason ?? "Finish your lesson first to unlock Boss Battle.");
        }
        if (!payload.lessonAssignmentId) {
          throw new Error("No lesson context found for Boss Battle. Complete a lesson first.");
        }
        if (!active) return;
        router.replace(`/games/lesson?assignmentId=${encodeURIComponent(payload.lessonAssignmentId)}&phase=boss_battle`);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to open Boss Battle.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void redirectIntoLessonRuntime();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
      <Navbar />
      <section className="mx-auto max-w-4xl px-6 py-10">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
          {loading ? (
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-rose-600">Boss Battle Activated</p>
              <h1 className="mt-3 text-4xl font-black text-slate-950">Preparing Mastery Arena...</h1>
              <p className="mt-3 text-slate-700">Transferring your active lesson runtime, tutor state, and challenge context.</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-amber-700">Boss Battle Unavailable</p>
              <h1 className="mt-3 text-3xl font-black text-slate-950">Could not start mastery mode</h1>
              <p className="mt-3 text-slate-700">{error}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/student/dashboard" className="rounded-2xl bg-indigo-600 px-5 py-3 font-black text-white">
                  Back to Dashboard
                </Link>
                <Link href="/games/lesson" className="rounded-2xl bg-slate-200 px-5 py-3 font-black text-slate-800">
                  Open Lesson
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
