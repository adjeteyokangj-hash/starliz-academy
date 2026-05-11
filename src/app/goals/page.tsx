"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { ChildProfile, getProfile } from "@/lib/store";

export default function GoalsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ChildProfile | null>(null);

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

  if (!profile) return <main className="min-h-screen bg-background" />;

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Card title="Daily Goals & Streaks">
          <p className="text-slate-700">Streaks reward consistency. Keep showing up every day to build momentum.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-sm text-slate-500">Current Streak</p>
              <p className="text-2xl font-black text-slate-900">{profile.weekStreak} days</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-sm text-slate-500">Streak Shields</p>
              <p className="text-2xl font-black text-slate-900">{profile.streakShields}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-sm text-slate-500">Daily Goal</p>
              <p className="text-2xl font-black text-slate-900">{profile.dailyGoal} tasks</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-600">Milestone rewards: 3-day, 7-day, and 14-day streak bonuses are now part of the roadmap.</p>
          <div className="mt-4 flex gap-3">
            <Link href="/dashboard"><Button variant="secondary">Back to Dashboard</Button></Link>
          </div>
        </Card>
      </div>
    </main>
  );
}


