"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { ChildProfile, getProfile } from "@/lib/store";
import { nextLevelInfo } from "@/lib/level_system";

export default function ProgressJourneyPage() {
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

  const levelInfo = nextLevelInfo(profile.xp);
  const inLevel = profile.xp - levelInfo.currentLevelXpFloor;
  const targetSpan = (levelInfo.nextLevelXp ?? levelInfo.currentLevelXpFloor) - levelInfo.currentLevelXpFloor;
  const pct = targetSpan > 0 ? Math.round((inLevel / targetSpan) * 100) : 100;

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Card title="Progress & Level Journey">
          <p className="text-slate-700">XP measures effort and learning progress across all activities.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-sm text-slate-500">Current XP</p>
              <p className="text-2xl font-black text-slate-900">{profile.xp}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-sm text-slate-500">Current Level</p>
              <p className="text-2xl font-black text-slate-900">{levelInfo.currentLevel}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-sm text-slate-500">Next Level At</p>
              <p className="text-2xl font-black text-slate-900">{levelInfo.nextLevelXp ?? "Max"}</p>
            </div>
          </div>
          <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-[image:var(--btn-primary)]" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-sm text-slate-600">{inLevel}/{targetSpan || 0} XP in this level.</p>
          <p className="mt-2 text-sm text-slate-600">XP comes from activity completion, streaks, and daily quests.</p>
          <div className="mt-4 flex gap-3">
            <Link href="/dashboard"><Button variant="secondary">Back to Dashboard</Button></Link>
          </div>
        </Card>
      </div>
    </main>
  );
}


