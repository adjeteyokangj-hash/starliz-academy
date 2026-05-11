"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { ChildProfile, LearningLevel, StartLevelChoice, getProfile, saveProfile } from "@/lib/store";
import { speakEncouragement } from "@/lib/voice";
import { getStartingSubjectLevel } from "@/lib/learningLevelEngine";

const avatars = ["🦊", "🦄", "🐼", "🐯", "🐬", "🐧"];

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(avatars[0]);
  const [ageYears, setAgeYears] = useState(6);
  const [startLevelChoice, setStartLevelChoice] = useState<StartLevelChoice>("Beginner");

  const ageRange: "5-7" | "8-10" = ageYears <= 7 ? "5-7" : "8-10";
  const level: LearningLevel = startLevelChoice === "Confident" ? "Advanced" : startLevelChoice === "Intermediate" ? "Growing" : "Beginner";
  const baseDifficulty = getStartingSubjectLevel({ ageYears, startLevelChoice, yearGroup: null });

  const canStart = useMemo(() => name.trim().length > 0, [name]);
  const greetName = name.trim() || "Superstar";

  useEffect(() => {
    const existing = getProfile();
    const isNewFlow = new URLSearchParams(window.location.search).get("new") === "1";
    if (existing && !isNewFlow) {
      router.replace("/dashboard");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startLearning() {
    if (!canStart) return;
    speakEncouragement(`Hello ${greetName}! Welcome to StarLiz Academy!`);
    const profile: ChildProfile = {
      id: crypto.randomUUID(),
      name: name.trim(),
      avatar,
      theme: "default",
      hubPins: ["spelling"],
      hubOrder: ["spelling", "math", "reading", "pet", "rewards", "profiles"],
      ageRange,
      yearGroup: "Year 1",
      ageYears,
      startLevelChoice,
      level,
      subjectLevels: {
        spelling: baseDifficulty,
        math: baseDifficulty,
        reading: baseDifficulty,
      },
      stars: 12,
      xp: 20,
      coins: 10,
      weekStreak: 1,
      streakShields: 1,
      petStage: 1,
      petEmotion: "calm",
      petMoodUpdatedAt: new Date().toISOString(),
      inventory: [],
      weeklyRewardClaimedAt: null,
      dailyGoal: 3,
      weeklyTarget: 18,
      usageLimitMinutes: 45,
      usageTodayMinutes: 0,
      usageDayKey: new Date().toISOString().slice(0, 10),
      lastActiveDay: new Date().toISOString().slice(0, 10),
      adaptive: {
        spellingDifficulty: baseDifficulty,
        mathDifficulty: baseDifficulty,
        readingDifficulty: baseDifficulty,
        spellingStreak: 0,
        weakAreas: [],
        nextBestActivity: "Mission 1: Complete one Spelling Quest",
        lastVoiceMessage: "Welcome to StarLiz Academy!",
      },
      learnerInsights: {
        spelling: { level: baseDifficulty, attempts: 0, correct: 0, hintsUsed: 0, avgResponseMs: 0, strengths: [], needsSupport: [], repeatedMistakes: [], audioSupportNeeded: false },
        math: { level: baseDifficulty, attempts: 0, correct: 0, hintsUsed: 0, avgResponseMs: 0, strengths: [], needsSupport: [], repeatedMistakes: [], audioSupportNeeded: false },
        reading: { level: baseDifficulty, attempts: 0, correct: 0, hintsUsed: 0, avgResponseMs: 0, strengths: [], needsSupport: [], repeatedMistakes: [], audioSupportNeeded: false },
        updatedAt: new Date().toISOString(),
      },
      levelDecisions: [],
      dailySubjectProgress: {
        dayKey: new Date().toISOString().slice(0, 10),
        targets: { spelling: 15, math: 10, reading: 5 },
        completed: { spelling: 0, math: 0, reading: 0 },
        weakItems: { spelling: [], math: [], reading: [] },
      },
      masteryTags: { spelling: {}, math: {}, reading: {} },
      weaknessMap: {},
      spellingPatterns: {},
      mathSkills: {},
      settings: {
        voiceEnabled: true,
        sfxEnabled: true,
        volume: 0.9,
        voiceStyle: "friendly_coach",
        subjectCoachingStyles: { spelling: "standard", math: "standard", reading: "standard" },
        reduceMotion: false,
        largeText: false,
        highContrast: false,
      },
      createdAt: new Date().toISOString(),
    };
    saveProfile(profile);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("starliz.firstMission", "1");
      window.sessionStorage.setItem("starliz.greetName", greetName);
    }
    router.push("/dashboard?first=1");
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">StarLiz Academy</p>
        <h1 className="mt-2 text-4xl font-black text-slate-900">Learn. Play. Grow.</h1>
        <p className="mt-2 text-slate-600">Let us set up your child profile to begin the adventure.</p>

        <Card className="mt-8 space-y-6">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">What is your child&apos;s name?</label>
            <input
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none ring-primary focus:ring-2"
              placeholder="Enter child name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {name.trim() ? <p className="mt-2 animate-[popin_0.35s_ease-out] text-sm font-bold text-primary">Hello {greetName}! Your adventure is about to begin.</p> : null}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">How old is the learner? (5-10)</label>
            <input
              type="range"
              min={5}
              max={10}
              value={ageYears}
              onChange={(e) => setAgeYears(Number(e.target.value))}
              className="w-full"
            />
            <p className="mt-2 text-sm text-slate-600">Age {ageYears} selected. This sets experience style, not question difficulty.</p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Choose avatar</label>
            <div className="grid grid-cols-6 gap-2">
              {avatars.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setAvatar(item)}
                  className={`rounded-xl border p-2 text-2xl ${avatar === item ? "border-primary bg-primary/10" : "border-slate-300 bg-white"}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Choose starting level</label>
            <select
              title="Choose starting level"
              value={startLevelChoice}
              onChange={(e) => setStartLevelChoice(e.target.value as StartLevelChoice)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              <option>Beginner</option>
              <option>Intermediate</option>
              <option>Confident</option>
            </select>
            <p className="mt-2 text-xs text-slate-500">You can change this later in Parent Area or run a quick assessment in a future update.</p>
          </div>

          <Button onClick={startLearning} disabled={!canStart} className="w-full text-lg">
            Start Learning
          </Button>
        </Card>
      </div>
    </main>
  );
}
