"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { ChildProfile, getProfile } from "@/lib/store";
import { LEVEL_UNLOCKS, levelFromXp, nextLevelInfo } from "@/lib/level_system";

const JOURNEY_BANDS = [
  { title: "Levels 1-10: Starter Explorer", min: 1, max: 10 },
  { title: "Levels 11-20: Growing Learner", min: 11, max: 20 },
  { title: "Levels 21-30: Skill Builder", min: 21, max: 30 },
  { title: "Levels 31-40: Challenge Champion", min: 31, max: 40 },
  { title: "Levels 41-50: StarLiz Legend", min: 41, max: 50 },
];

export default function JourneyPage() {
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

  const level = levelFromXp(profile.xp);
  const levelInfo = nextLevelInfo(profile.xp);
  const remainingXp = levelInfo.nextLevelXp ? Math.max(0, levelInfo.nextLevelXp - profile.xp) : 0;

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Card title="Learning Journey Map">
          <p className="text-slate-700">Level means where you are in your learning adventure, not just a number.</p>
          <p className="mt-2 text-sm font-semibold text-slate-700">Current level: {level}</p>
          {levelInfo.nextLevel ? (
            <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
              <p className="font-bold text-sky-900">Next Unlock 🔓</p>
              <p className="text-sm text-sky-800">Level {levelInfo.nextLevel}: {LEVEL_UNLOCKS[levelInfo.nextLevel - 1]?.unlock}</p>
              <p className="text-sm text-sky-700">You need {remainingXp.toLocaleString()} XP to unlock this.</p>
            </div>
          ) : null}

          <div className="mt-4 space-y-4">
            {JOURNEY_BANDS.map((band) => {
              const levels = LEVEL_UNLOCKS.filter((entry) => entry.level >= band.min && entry.level <= band.max);
              return (
                <section key={band.title} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <h3 className="text-sm font-black uppercase tracking-[0.08em] text-slate-700">{band.title}</h3>
                  <div className="mt-3 space-y-2">
                    {levels.map((node) => {
                      const isCurrent = node.level === level;
                      const isCompleted = node.level < level;
                      const isLocked = node.level > level;
                      const isMilestone = [10, 20, 30, 40, 50].includes(node.level);
                      const icon = isCompleted ? "✅" : isCurrent ? "🔓" : "🔒";
                      const extra = isMilestone ? " 🏆" : "";
                      const classes = isCurrent
                        ? "border-sky-300 bg-sky-50 shadow-sm"
                        : isCompleted
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-slate-200 bg-white";

                      return (
                        <div key={node.level} className={`rounded-xl border p-3 ${classes}`}>
                          <p className="font-bold text-slate-900">{icon} Level {node.level}{extra}</p>
                          <p className="text-sm text-slate-600">XP Needed: {node.xpNeeded.toLocaleString()}</p>
                          <p className="text-sm text-slate-600">Unlock: {node.unlock}</p>
                          {isLocked ? <p className="mt-1 text-xs font-semibold text-slate-500">Keep going to unlock this level.</p> : null}
                          {isCurrent ? <p className="mt-1 text-xs font-semibold text-sky-700">Current level card</p> : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          <div className="mt-4 flex gap-3">
            <Link href="/dashboard"><Button variant="secondary">Back to Dashboard</Button></Link>
          </div>
        </Card>
      </div>
    </main>
  );
}


