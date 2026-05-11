"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import { SKILL_MAP } from "@/lib/skills";
import { isInterventionEligibleSkill } from "@/lib/interventionMission";

type StudentAssignment = {
  id: string;
  status: "assigned" | "in_progress" | "completed" | string;
  subject: string;
  title: string;
  skillFocus?: string | null;
  difficulty?: number;
  items?: unknown[];
  updatedAt: string;
};

type StudentAssignmentsPayload = {
  assignments?: StudentAssignment[];
  weakWords?: string[];
  weakSkills?: string[];
  error?: string;
};

type StudentSkill = {
  skill: string;
  status: "weak" | "improving" | "mastered" | string;
  accuracy: number;
};

type DailyJourneyPayload = {
  ok?: boolean;
  student?: { id: string; name: string };
  journey?: {
    warmupSkill: string;
    focusSkill: string;
    weakSkill: string | null;
    reviewSkills: string[];
    bossTestSkills: string[];
  };
  lesson?: {
    assignmentId?: string;
  };
  error?: string;
};

type BossBattleStatusPayload = {
  unlocked?: boolean;
  alreadyPlayedToday?: boolean;
};

type ShopOwnedItem = {
  id: string;
  name: string;
  category: string;
};

type ShopOwnedPayload = {
  owned?: ShopOwnedItem[];
};

type ActiveChildPayload = {
  child?: {
    id: string;
    name: string;
    stars?: number;
    xp?: number;
    coins?: number;
    weekStreak?: number;
  } | null;
};

type SessionSummaryPayload = {
  ok?: boolean;
  summary?: {
    learningConfidence: string;
    engagementLevel: string;
    speechConfidence: string;
    frustrationSignals: string;
    dominantMood: string;
  };
};

function subjectPath(subject: string): "spelling" | "math" | "reading" | "lesson" {
  if (subject === "lesson" || subject === "ai_daily" || subject === "daily") return "lesson";
  if (subject === "math") return "math";
  if (subject === "reading") return "reading";
  return "spelling";
}

function skillLabel(skill: string | null | undefined): string {
  if (!skill) return "Practice";
  const fromMap = SKILL_MAP[skill]?.label;
  const base = (fromMap ?? skill).replace(/\s*\([^)]*\)/g, "").trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().trim();
}

function buildInterventionPath(input: {
  assignmentId: string;
  skill: string;
  supportSkill: string;
  accuracy: number;
  launchedAt?: string;
}): string {
  const params = new URLSearchParams({
    assignmentId: input.assignmentId,
    intervention: "1",
    skill: input.skill,
    supportSkill: input.supportSkill,
    accuracy: String(input.accuracy),
    launchedAt: input.launchedAt ?? new Date().toISOString(),
  });
  return `/games/lesson?${params.toString()}`;
}

function tagTone(status: string): string {
  if (status === "mastered") return "bg-emerald-100 text-emerald-700";
  if (status === "improving") return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

export default function StudentDashboardPage() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [skills, setSkills] = useState<StudentSkill[]>([]);
  const [journey, setJourney] = useState<DailyJourneyPayload["journey"] | null>(null);
  const [childName, setChildName] = useState("Learner");
  const [stats, setStats] = useState({ stars: 0, xp: 0, coins: 0, streak: 0 });
  const [loading, setLoading] = useState(true);
  const [startingJourney, setStartingJourney] = useState(false);
  const [bossUnlocked, setBossUnlocked] = useState(false);
  const [bossPlayedToday, setBossPlayedToday] = useState(false);
  const [ownedBadges, setOwnedBadges] = useState<ShopOwnedItem[]>([]);
  const [sessionSummary, setSessionSummary] = useState<SessionSummaryPayload["summary"] | null>(null);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [assignmentsRes, skillsRes, journeyRes, childRes, bossStatusRes, sessionSummaryRes] = await Promise.all([
        fetch("/api/student/assignments", { credentials: "include" }),
        fetch("/api/student/skills", { credentials: "include" }),
        fetch("/api/student/daily-journey", { credentials: "include" }),
        fetch("/api/children/active", { credentials: "include" }),
        fetch("/api/student/boss-battle", { credentials: "include" }),
        fetch("/api/student/session-summary", { credentials: "include" }),
      ]);

      const assignmentsPayload = (await assignmentsRes.json()) as StudentAssignmentsPayload;
      const skillsPayload = (await skillsRes.json()) as StudentSkill[];
      const journeyPayload = (await journeyRes.json()) as DailyJourneyPayload;
      const childPayload = (await childRes.json()) as ActiveChildPayload;
      const bossStatusPayload = (await bossStatusRes.json()) as BossBattleStatusPayload;
      const sessionSummaryPayload = (await sessionSummaryRes.json()) as SessionSummaryPayload;

      if (!assignmentsRes.ok) {
        throw new Error(assignmentsPayload.error ?? "Unable to load assignments.");
      }

      setAssignments(assignmentsPayload.assignments ?? []);
      setSkills(Array.isArray(skillsPayload) ? skillsPayload : []);
      setJourney(journeyPayload.journey ?? null);
      setBossUnlocked(Boolean(bossStatusPayload.unlocked));
      setBossPlayedToday(Boolean(bossStatusPayload.alreadyPlayedToday));
      setSessionSummary(sessionSummaryPayload.summary ?? null);

      if (childPayload.child?.id) {
        const ownedResponse = await fetch(`/api/shop/owned?childId=${encodeURIComponent(childPayload.child.id)}`, { credentials: "include" });
        if (ownedResponse.ok) {
          const ownedPayload = (await ownedResponse.json()) as ShopOwnedPayload;
          setOwnedBadges((ownedPayload.owned ?? []).filter((item) => item.category === "badges"));
        }
      }

      if (childPayload.child) {
        setChildName(childPayload.child.name || "Learner");
        setStats({
          stars: childPayload.child.stars ?? 0,
          xp: childPayload.child.xp ?? 0,
          coins: childPayload.child.coins ?? 0,
          streak: childPayload.child.weekStreak ?? 0,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard();
  }, [loadDashboard]);

  const visibleAssignments = useMemo(
    () => assignments.filter((assignment) => {
      const title = normalize(assignment.title);
      const focus = normalize(assignment.skillFocus);
      const noisy = title.includes("weak support") || title.includes("automatic starter content") || focus.includes("weak support");
      return assignment.status !== "completed" && !noisy;
    }),
    [assignments],
  );

  const skillMap = useMemo(() => {
    const map = new Map<string, StudentSkill>();
    for (const row of skills) map.set(row.skill, row);
    return map;
  }, [skills]);

  const groupedSkills = useMemo(() => ({
    weak: skills.filter((row) => row.status === "weak"),
    improving: skills.filter((row) => row.status === "improving"),
    mastered: skills.filter((row) => row.status === "mastered"),
  }), [skills]);

  const focusSkill = journey?.focusSkill ?? groupedSkills.improving[0]?.skill ?? groupedSkills.weak[0]?.skill ?? "cvc";
  const weakSkill = journey?.weakSkill ?? groupedSkills.weak[0]?.skill ?? "syllable_2";
  const strongSkill = journey?.warmupSkill ?? groupedSkills.mastered[0]?.skill ?? "letter_sound";

  const coachRows = [focusSkill, weakSkill, strongSkill]
    .filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index)
    .slice(0, 3)
    .map((skill) => ({
      code: skill,
      label: skillLabel(skill),
      accuracy: Math.round(skillMap.get(skill)?.accuracy ?? (skill === strongSkill ? 90 : skill === weakSkill ? 45 : 62)),
      status: skillMap.get(skill)?.status ?? (skill === strongSkill ? "mastered" : skill === weakSkill ? "weak" : "improving"),
    }));

  function findAssignmentForSkill(skillCode: string): StudentAssignment | null {
    const label = normalize(skillLabel(skillCode));
    const code = normalize(skillCode);
    for (const assignment of visibleAssignments) {
      const title = normalize(assignment.title);
      const focus = normalize(assignment.skillFocus);
      if (title.includes(code) || title.includes(label) || focus.includes(code) || focus.includes(label)) {
        return assignment;
      }
    }
    return visibleAssignments[0] ?? null;
  }

  function startAssignment(assignment: StudentAssignment | null) {
    if (!assignment) {
      router.push("/games/lesson");
      return;
    }
    router.push(`/games/${subjectPath(assignment.subject)}?assignmentId=${assignment.id}`);
  }

  async function startTodayJourney() {
    setStartingJourney(true);
    setError("");
    try {
      const response = await fetch("/api/student/daily-journey", { credentials: "include" });
      const payload = (await response.json()) as DailyJourneyPayload;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to start today's journey.");
      }
      const assignmentId = payload.lesson?.assignmentId;
      router.push(assignmentId ? `/games/lesson?assignmentId=${assignmentId}` : "/games/lesson");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start today's journey.");
    } finally {
      setStartingJourney(false);
    }
  }

  const focusAssignment = findAssignmentForSkill(focusSkill);
  const weakAssignment = findAssignmentForSkill(weakSkill ?? focusSkill);
  const reviewAssignment = findAssignmentForSkill(strongSkill);
  const weakAccuracy = Math.round(skillMap.get(weakSkill)?.accuracy ?? 45);
  const supportSkill = groupedSkills.improving[0]?.skill ?? focusSkill;

  useEffect(() => {
    if (loading || !weakAssignment || !weakSkill) return;
    if (!isInterventionEligibleSkill(weakSkill) || weakAccuracy > 60) return;
    if (typeof window === "undefined") return;

    const key = `starliz:intervention:${new Date().toISOString().slice(0, 10)}:${weakSkill}`;
    if (window.sessionStorage.getItem(key) === "done") return;

    window.sessionStorage.setItem(key, "done");
    router.replace(buildInterventionPath({
      assignmentId: weakAssignment.id,
      skill: weakSkill,
      supportSkill,
      accuracy: weakAccuracy,
    }));
  }, [loading, router, supportSkill, weakAccuracy, weakAssignment, weakSkill]);

  return (
    <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
      <Navbar />
      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="space-y-6 rounded-4xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 md:p-8">
          <header>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">Hi {childName} 👋</h1>
            <p className="mt-2 text-slate-600">Ready for today&apos;s learning adventure?</p>
          </header>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">⭐ Stars</p>
              <p className="mt-1 text-xl font-black text-slate-900">{stats.stars}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">✨ XP</p>
              <p className="mt-1 text-xl font-black text-slate-900">{stats.xp}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">🪙 Coins</p>
              <p className="mt-1 text-xl font-black text-slate-900">{stats.coins}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">🔥 Streak</p>
              <p className="mt-1 text-xl font-black text-slate-900">{stats.streak}</p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">AI Learning Signals</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-2xl bg-white px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Learning Confidence</p>
                <p className="mt-1 text-sm font-black text-slate-900">{sessionSummary?.learningConfidence ?? "Unknown"}</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Engagement Level</p>
                <p className="mt-1 text-sm font-black text-slate-900">{sessionSummary?.engagementLevel ?? "Unknown"}</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Speech Confidence</p>
                <p className="mt-1 text-sm font-black text-slate-900">{sessionSummary?.speechConfidence ?? "Unknown"}</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Frustration Signals</p>
                <p className="mt-1 text-sm font-black text-slate-900">{sessionSummary?.frustrationSignals ?? "Unknown"}</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Session Mood</p>
                <p className="mt-1 text-sm font-black capitalize text-slate-900">{(sessionSummary?.dominantMood ?? "neutral").replace("_", " ")}</p>
              </div>
            </div>
          </div>

          <section className="rounded-3xl border border-indigo-200 bg-linear-to-br from-indigo-50 via-sky-50 to-white p-6">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-indigo-600">🌈 Today&apos;s Learning Journey</p>
            <p className="mt-2 text-slate-700">Today we will:</p>
            <ol className="mt-3 space-y-2 text-sm font-semibold text-slate-700">
              <li>1. Warm up</li>
              <li>2. Practise {skillLabel(focusSkill)}</li>
              <li>3. Fix {skillLabel(weakSkill ?? focusSkill)}</li>
              <li>4. Complete a mini boss test</li>
            </ol>
            <p className="mt-4 text-sm text-slate-600">Estimated time: 7 minutes</p>
            <button
              type="button"
              onClick={() => void startTodayJourney()}
              disabled={startingJourney || loading}
              className="journey-cta-pulse mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-5 py-4 text-lg font-black text-white shadow-lg shadow-indigo-200 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {startingJourney ? "Starting..." : "Start Today's Journey"}
            </button>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-cyan-700">🧠 Smart Coach</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Today&apos;s Focus</p>
                <p className="mt-1 font-black text-slate-900">{skillLabel(focusSkill)}</p>
              </div>
              <div className="rounded-2xl bg-white p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Needs Practice</p>
                <p className="mt-1 font-black text-slate-900">{skillLabel(weakSkill ?? focusSkill)}</p>
              </div>
              <div className="rounded-2xl bg-white p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Strong Skills</p>
                <p className="mt-1 font-black text-slate-900">{skillLabel(strongSkill)}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {coachRows.map((row) => (
                <div key={row.code} className="rounded-2xl bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-slate-800">{row.label}</p>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-black ${tagTone(row.status)}`}>
                        {row.status}
                      </span>
                      <span className="text-sm font-black text-slate-900">{row.accuracy}%</span>
                    </div>
                  </div>
                  <progress
                    value={Math.max(6, Math.min(100, row.accuracy))}
                    max={100}
                    className={`mt-2 h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:rounded-full [&::-moz-progress-bar]:rounded-full ${row.accuracy >= 80 ? "[&::-webkit-progress-value]:bg-emerald-500 [&::-moz-progress-bar]:bg-emerald-500" : row.accuracy >= 60 ? "[&::-webkit-progress-value]:bg-amber-500 [&::-moz-progress-bar]:bg-amber-500" : "[&::-webkit-progress-value]:bg-rose-500 [&::-moz-progress-bar]:bg-rose-500"}`}
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm font-bold text-cyan-900">
              <p>You&apos;re getting better at {skillLabel(focusSkill)}!</p>
              <p className="mt-1">Let&apos;s fix {skillLabel(weakSkill ?? focusSkill)} next.</p>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-3">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Or practise a skill:</p>
            </div>
            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-black uppercase tracking-wide text-indigo-700">🎯 Focus Practice</p>
              <h2 className="mt-2 text-xl font-black text-slate-950">{skillLabel(focusSkill)}</h2>
              <p className="mt-2 text-sm text-slate-600">Practise this skill to build confidence quickly.</p>
              <button
                type="button"
                onClick={() => startAssignment(focusAssignment)}
                className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Practise now
              </button>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-black uppercase tracking-wide text-rose-700">🛠 Fix Weak Area</p>
              <h2 className="mt-2 text-xl font-black text-slate-950">{skillLabel(weakSkill ?? focusSkill)}</h2>
              <p className="mt-2 text-sm text-slate-600">This one needs extra practice. You can do it.</p>
              <button
                type="button"
                onClick={() => {
                  if (!weakAssignment || !weakSkill) {
                    startAssignment(weakAssignment);
                    return;
                  }
                  if (isInterventionEligibleSkill(weakSkill)) {
                    router.push(buildInterventionPath({
                      assignmentId: weakAssignment.id,
                      skill: weakSkill,
                      supportSkill,
                      accuracy: weakAccuracy,
                    }));
                    return;
                  }
                  startAssignment(weakAssignment);
                }}
                className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Practise now
              </button>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-black uppercase tracking-wide text-emerald-700">🔁 Quick Review</p>
              <h2 className="mt-2 text-xl font-black text-slate-950">{skillLabel(strongSkill)}</h2>
              <p className="mt-2 text-sm text-slate-600">Keep your strong skill fresh with a quick review.</p>
              <button
                type="button"
                onClick={() => startAssignment(reviewAssignment)}
                className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Practise now
              </button>
            </article>
          </section>

          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-black uppercase tracking-wide text-amber-800">🏆 Bonus Challenge</p>
            <p className="mt-2 font-bold text-amber-900">
              {bossUnlocked ? "Boss Battle unlocked!" : "Finish today&apos;s journey to unlock a fun challenge!"}
            </p>
            <p className="mt-1 text-sm text-amber-800">
              {bossUnlocked
                ? "Beat the boss to earn bonus coins and XP."
                : "Complete the main route first, then come back for bonus play."}
            </p>
            <button
              type="button"
              onClick={() => router.push("/games/boss-battle")}
              disabled={!bossUnlocked}
              className="mt-4 inline-flex rounded-2xl bg-amber-500 px-5 py-3 font-black text-amber-950 shadow-md hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-amber-200 disabled:text-amber-700"
            >
              {bossUnlocked ? "Start Boss Battle" : "Locked until journey complete"}
            </button>
            {bossPlayedToday ? (
              <p className="mt-2 text-xs font-bold text-amber-900">Boss Battle already played today.</p>
            ) : null}
          </section>

          <section className="rounded-3xl border border-amber-200 bg-linear-to-br from-amber-50 via-yellow-50 to-orange-50 p-5">
            <p className="text-sm font-black uppercase tracking-wide text-amber-800">🏅 Badge Case</p>
            {ownedBadges.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {ownedBadges.slice(0, 6).map((badge) => (
                  <span key={badge.id} className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-black text-amber-900">
                    {badge.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm font-semibold text-amber-900">No badges yet. Perfect-win a Boss Battle to earn a rare badge.</p>
            )}
            <button
              type="button"
              onClick={() => router.push("/shop")}
              className="mt-4 inline-flex rounded-2xl bg-amber-500 px-5 py-3 font-black text-amber-950 shadow-md hover:bg-amber-400"
            >
              View Inventory
            </button>
          </section>

          <section className="rounded-3xl border border-yellow-300 bg-linear-to-br from-yellow-50 via-amber-50 to-orange-50 p-6 shadow-sm">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-yellow-700">🛒 Rewards Store</p>
            <p className="mt-2 font-black text-slate-800">🎁 Unlock fun rewards!</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">Spend your coins on avatars, pets &amp; surprises.</p>
            <p className="mt-1 text-sm text-slate-600">You have <span className="font-black text-yellow-700">🪙 {stats.coins} coins ready to spend!</span></p>
            <button
              type="button"
              onClick={() => router.push("/shop")}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-yellow-400 px-6 py-3 font-black text-yellow-900 shadow-md hover:bg-yellow-300"
            >
              🛍 Open Store
            </button>
          </section>

          {loading && (
            <div className="rounded-2xl bg-slate-50 p-5 text-slate-600">Loading your learning journey...</div>
          )}

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700">{error}</div>
          )}
        </div>
      </section>
    </main>
  );
}
