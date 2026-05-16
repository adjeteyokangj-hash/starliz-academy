"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import { SKILL_MAP } from "@/lib/skills";
import { isInterventionEligibleSkill } from "@/lib/interventionMission";
import { resolveDashboardTier } from "@/lib/dashboardResolver";
import PrimaryDashboard from "@/components/student/PrimaryDashboard";
import SecondaryDashboard from "@/components/student/SecondaryDashboard";

type StudentAssignment = {
  id: string;
  status: "assigned" | "in_progress" | "completed" | string;
  subject: string;
  contentId?: string;
  href?: string;
  title: string;
  skillFocus?: string | null;
  difficulty?: number;
  examBoard?: string | null;
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
    yearGroup?: string | null;
    ageYears?: number | null;
    dateOfBirth?: string | null;
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

function subjectPath(subject: string, title?: string | null, skillFocus?: string | null): "spelling" | "math" | "reading" | "lesson" {
  const normalized = normalize(subject);
  const context = `${normalized} ${normalize(title)} ${normalize(skillFocus)}`;
  if (normalized === "lesson" || normalized === "ai_daily" || normalized === "daily") return "lesson";
  if (normalized === "math" || normalized === "maths") return "math";
  if (
    normalized === "reading"
    || normalized === "english-language"
    || normalized === "english-literature"
    || normalized === "gcse-english"
    || context.includes("literature")
    || context.includes("comprehension")
  ) return "reading";
  if (normalized === "science" || normalized === "gcse-science") return "lesson";
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

export default function StudentDashboardPage() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [skills, setSkills] = useState<StudentSkill[]>([]);
  const [journey, setJourney] = useState<DailyJourneyPayload["journey"] | null>(null);
  const [childName, setChildName] = useState("Learner");
  const [stats, setStats] = useState({ stars: 0, xp: 0, coins: 0, streak: 0 });
  const [dashboardTier, setDashboardTier] = useState<"primary" | "ks3" | "gcse">("primary");
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
        setDashboardTier(resolveDashboardTier({
          yearGroup: childPayload.child.yearGroup,
          ageYears: childPayload.child.ageYears,
          dateOfBirth: childPayload.child.dateOfBirth,
        }));
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
    if (assignment.href) {
      router.push(assignment.href);
      return;
    }

    const route = subjectPath(assignment.subject, assignment.title, assignment.skillFocus);
    const params = new URLSearchParams({ assignmentId: assignment.id });
    if (assignment.contentId) params.set("contentId", assignment.contentId);
    const literatureContext = `${assignment.title} ${assignment.skillFocus ?? ""}`.toLowerCase();
    if (route === "reading" && /literature|gcse english|english literature/.test(literatureContext)) {
      params.set("mode", "literature");
    }
    router.push(`/games/${route}?${params.toString()}`);
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
    // Do not auto-force intervention when explicit assignments are already present.
    if (visibleAssignments.length > 0) return;

    // Only auto-launch intervention when the assigned content is explicitly letter-sound support.
    const weakPath = subjectPath(weakAssignment.subject, weakAssignment.title, weakAssignment.skillFocus);
    const weakSkillFocus = normalize(weakAssignment.skillFocus);
    const isExplicitLetterSound = weakSkillFocus.includes("letter_sound") || weakSkillFocus.includes("letter sound");
    if (weakPath === "reading" || weakPath === "math" || !isExplicitLetterSound) return;

    const key = `starliz:intervention:${new Date().toISOString().slice(0, 10)}:${weakSkill}`;
    if (window.sessionStorage.getItem(key) === "done") return;

    window.sessionStorage.setItem(key, "done");
    router.replace(buildInterventionPath({
      assignmentId: weakAssignment.id,
      skill: weakSkill,
      supportSkill,
      accuracy: weakAccuracy,
    }));
  }, [loading, router, supportSkill, visibleAssignments.length, weakAccuracy, weakAssignment, weakSkill]);

  return (
    <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
      <Navbar />
      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="rounded-4xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 md:p-8">
          {dashboardTier === "primary" && (
            <PrimaryDashboard
              childName={childName}
              stats={stats}
              visibleAssignments={visibleAssignments}
              skills={skills}
              coachRows={coachRows}
              focusSkill={focusSkill}
              weakSkill={weakSkill}
              strongSkill={strongSkill}
              focusAssignment={focusAssignment}
              weakAssignment={weakAssignment}
              reviewAssignment={reviewAssignment}
              bossUnlocked={bossUnlocked}
              bossPlayedToday={bossPlayedToday}
              ownedBadges={ownedBadges}
              sessionSummary={sessionSummary ?? null}
              loading={loading}
              error={error}
              startingJourney={startingJourney}
              onStartJourney={startTodayJourney}
              onStartAssignment={startAssignment}
              onOpenStore={() => router.push("/shop")}
            />
          )}
          {(dashboardTier === "ks3" || dashboardTier === "gcse") && (
            <SecondaryDashboard
              childName={childName}
              stats={stats}
              visibleAssignments={visibleAssignments}
              skills={skills}
              coachRows={coachRows}
              focusSkill={focusSkill}
              weakSkill={weakSkill}
              strongSkill={strongSkill}
              focusAssignment={focusAssignment}
              weakAssignment={weakAssignment}
              reviewAssignment={reviewAssignment}
              bossUnlocked={bossUnlocked}
              bossPlayedToday={bossPlayedToday}
              ownedBadges={ownedBadges}
              sessionSummary={sessionSummary ?? null}
              loading={loading}
              error={error}
              startingJourney={startingJourney}
              pathway={dashboardTier}
              allAssignments={assignments}
              onStartJourney={startTodayJourney}
              onStartAssignment={startAssignment}
              onOpenStore={() => router.push("/shop")}
            />
          )}
        </div>
      </section>
    </main>
  );
}
