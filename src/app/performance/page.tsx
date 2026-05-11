"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { ChildProfile, getProfile } from "@/lib/store";
import { fetchProfileHistory, getProfileHistory } from "@/lib/progress_data";
import { LearningEvent } from "@/lib/history_api";

export default function PerformancePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [history, setHistory] = useState<LearningEvent[]>([]);
  const profileId = profile?.id ?? null;

  useEffect(() => {
    const p = getProfile();
    if (!p) {
      router.replace("/onboarding");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(p);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!profileId) return;
    void fetchProfileHistory(profileId).then((entries) => setHistory(entries));
  }, [profileId]);

  const stats = useMemo(() => {
    if (!profile) return { accuracy: 0, grade: "Keep going", perfectDays: 0 };
    const currentHistory = history.length ? history : getProfileHistory(profile);
    if (!currentHistory.length) return { accuracy: 0, grade: "Keep going", perfectDays: 0 };
    const accuracy = Math.round((currentHistory.filter((h) => h.correct).length / currentHistory.length) * 100);
    const byDay = new Map<string, number[]>();
    currentHistory.forEach((item) => {
      const key = item.ts.slice(0, 10);
      const current = byDay.get(key) ?? [];
      current.push(item.score);
      byDay.set(key, current);
    });
    const perfectDays = Array.from(byDay.values()).filter((scores) => scores.length > 0 && scores.every((value) => value >= 1)).length;
    const grade = accuracy >= 90 ? "Excellent" : accuracy >= 75 ? "Great" : "Keep going";
    return { accuracy, grade, perfectDays };
  }, [history, profile]);

  if (!profile) return <main className="min-h-screen bg-background" />;

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Card title="Performance & Badges">
          <p className="text-slate-700">Stars show how well {profile.name} is doing with accuracy and care.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-sm text-slate-500">Total Stars</p>
              <p className="text-2xl font-black text-slate-900">{profile.stars}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-sm text-slate-500">Weekly Star Score</p>
              <p className="text-2xl font-black text-slate-900">{stats.accuracy}%</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-sm text-slate-500">Perfect Days</p>
              <p className="text-2xl font-black text-slate-900">{stats.perfectDays}</p>
            </div>
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-700">Grade: {stats.grade}</p>
          <p className="mt-2 text-sm text-slate-600">Badges unlock as consistency improves: Spelling Star, Maths Star, Reading Star, and Star Streak Champion.</p>
          <div className="mt-4 flex gap-3">
            <Link href="/dashboard"><Button variant="secondary">Back to Dashboard</Button></Link>
          </div>
        </Card>
      </div>
    </main>
  );
}


