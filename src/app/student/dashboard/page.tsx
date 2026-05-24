"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import { SKILL_MAP } from "@/lib/skills";
import { isInterventionEligibleSkill } from "@/lib/interventionMission";
import { resolveDashboardTier } from "@/lib/dashboardResolver";
import { ageGroupForYearGroup, keyStageForYearGroup } from "@/lib/curriculum";
import PrimaryDashboard from "@/components/student/PrimaryDashboard";
import SecondaryDashboard from "@/components/student/SecondaryDashboard";
import StudentContextStrip from "@/components/student/StudentContextStrip";
import type { PlacementLessonGroup, PlacementLessonRecommendation, PlacementLevels, StudentLearningState } from "@/components/student/dashboardTypes";

type ProgressionRecommendation = {
  scopedSubject: string;
  subject: string;
  strand: string | null;
  currentLevel: number;
  recommendedLevel: number;
  status: "needs_support" | "developing" | "on_track" | "secure" | "ready_to_advance" | "advanced" | "review_needed";
  action: "keep_current_level" | "assign_catch_up" | "assign_revision" | "assign_mastery_check" | "recommend_level_up" | "recommend_admin_review";
  confidence: number;
  evidenceSummary: {
    activityCount: number;
    completedAssignments: number;
    attemptCount: number;
    averageScore: number;
    activeWeakAreas: number;
    masterySignals: number;
  };
  reasons: string[];
  blockers: string[];
  nextBestStep: string;
};

type ProgressionPayload = {
  ok?: boolean;
  code?: string;
  message?: string;
  recommendations?: ProgressionRecommendation[];
  grouped?: Array<{
    parentSubject: string;
    label: string;
    recommendations: ProgressionRecommendation[];
  }>;
  contentGaps?: ProgressionRecommendation[];
  summary?: {
    total: number;
    needsSupport: number;
    readyToAdvance: number;
    reviewNeeded: number;
    friendlyHeadline: string;
  };
  error?: string;
};

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
  lessonAssignmentId?: string | null;
  lockReason?: string | null;
  error?: string;
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

type StudentLearningStatePayload = {
  ok?: boolean;
  studentId?: string;
  learningState?: StudentLearningState;
  error?: string;
};

type QuickLevelFinderLevelsPayload = {
  ok?: boolean;
  levels?: PlacementLevels;
  error?: string;
};

type PlacementLessonsPayload = {
  ok?: boolean;
  placementCompleted?: boolean;
  grouped?: PlacementLessonGroup[];
  contentGaps?: PlacementLessonRecommendation[];
  recommendations?: PlacementLessonRecommendation[];
  error?: string;
};

type StudentAcademicIntelligencePayload = {
  studentId: string;
  summary: {
    totalTopics: number;
    needsCatchUpCount: number;
    needsRevisionCount: number;
    coveredCount: number;
    averageScore: number;
  };
  catchUpRecommendations: Array<{
    id: string;
    title: string;
    subject: string;
    topic?: string | null;
    studentFriendlyReason?: string;
    reason: string;
    estimatedMinutes: number;
    status: "recommended" | "active" | "completed" | "skipped" | "waived" | "overdue";
    routeTarget?: string | null;
  }>;
  assessmentRecommendations: Array<{
    assessmentType: string;
    subject: string;
    topic?: string | null;
    reason: string;
    readinessStatus: string;
  }>;
  nextRecommendedActions: string[];
  generatedAt: string;
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

function progressionFriendlyBadge(status: ProgressionRecommendation["status"]): string {
  if (status === "needs_support") return "Catch-up recommended";
  if (status === "developing") return "Keep practising";
  if (status === "on_track") return "You are on track";
  if (status === "secure") return "Almost ready to move up";
  if (status === "ready_to_advance" || status === "advanced") return "Ready for a challenge";
  return "Keep practising";
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
  const [journey] = useState<DailyJourneyPayload["journey"] | null>(null);
  const [childName, setChildName] = useState("Learner");
  const [stats, setStats] = useState({ stars: 0, xp: 0, coins: 0, streak: 0 });
  const [dashboardTier, setDashboardTier] = useState<"primary" | "ks3" | "gcse">("primary");
  const [profileContext, setProfileContext] = useState<{ yearGroup: string; ageGroup: string; keyStage: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingJourney, setStartingJourney] = useState(false);
  const [bossUnlocked, setBossUnlocked] = useState(false);
  const [bossPlayedToday, setBossPlayedToday] = useState(false);
  const [ownedBadges, setOwnedBadges] = useState<ShopOwnedItem[]>([]);
  const [sessionSummary, setSessionSummary] = useState<SessionSummaryPayload["summary"] | null>(null);
  const [learningState, setLearningState] = useState<StudentLearningState | null>(null);
  const [placementLevels, setPlacementLevels] = useState<PlacementLevels | null>(null);
  const [placementLessonGroups, setPlacementLessonGroups] = useState<PlacementLessonGroup[]>([]);
  const [placementContentGaps, setPlacementContentGaps] = useState<PlacementLessonRecommendation[]>([]);
  const [progression, setProgression] = useState<ProgressionPayload | null>(null);
  const [academicIntelligence, setAcademicIntelligence] = useState<StudentAcademicIntelligencePayload | null>(null);
  const [academicLoading, setAcademicLoading] = useState(false);
  const [academicError, setAcademicError] = useState("");
  const [error, setError] = useState("");
  const [missingChildContext, setMissingChildContext] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [pendingAssignmentId, setPendingAssignmentId] = useState<string | null>(null);
  const [openingStore, setOpeningStore] = useState(false);
  const [bossAssignmentId, setBossAssignmentId] = useState<string | null>(null);
  const [bossLaunching, setBossLaunching] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    setMissingChildContext(false);
    setAuthRequired(false);
    try {
      const childRes = await fetch("/api/children/active", { credentials: "include" });
      if (childRes.status === 401) {
        setAuthRequired(true);
        setError("Your session expired. Please sign in again.");
        return;
      }
      if (!childRes.ok) {
        throw new Error("Unable to confirm active learner profile.");
      }

      const childPayload = (await childRes.json()) as ActiveChildPayload;
      if (!childPayload.child?.id) {
        setMissingChildContext(true);
        setAssignments([]);
        setSkills([]);
        setSessionSummary(null);
        setLearningState(null);
        setPlacementLevels(null);
        setPlacementLessonGroups([]);
        setPlacementContentGaps([]);
        setProgression(null);
        setAcademicIntelligence(null);
        setAcademicError("");
        setBossUnlocked(false);
        setBossPlayedToday(false);
        setBossAssignmentId(null);
        return;
      }

      setAcademicLoading(true);
      setAcademicError("");

      const [assignmentsRes, skillsRes, bossStatusRes, sessionSummaryRes, academicIntelligenceRes, learningStateRes, placementLevelsRes, placementLessonsRes, progressionRes] = await Promise.all([
        fetch("/api/student/assignments", { credentials: "include" }),
        fetch("/api/student/skills", { credentials: "include" }),
        fetch("/api/student/boss-battle", { credentials: "include" }),
        fetch("/api/student/session-summary", { credentials: "include" }),
        fetch("/api/student/academic-intelligence", { credentials: "include" }),
        fetch("/api/student/learning-state", { credentials: "include" }),
        fetch("/api/student/quick-level-finder/levels", { credentials: "include" }),
        fetch("/api/student/placement-lessons", { credentials: "include" }),
        fetch("/api/student/progression/recommendations", { credentials: "include" }),
      ]);

      if ([assignmentsRes, skillsRes, bossStatusRes, sessionSummaryRes, academicIntelligenceRes, learningStateRes, placementLevelsRes, placementLessonsRes, progressionRes].some((res) => res.status === 401)) {
        setAuthRequired(true);
        setError("Your session expired. Please sign in again.");
        return;
      }

      const assignmentsPayload = (await assignmentsRes.json()) as StudentAssignmentsPayload;
      const skillsPayload = skillsRes.ok ? ((await skillsRes.json()) as StudentSkill[]) : [];
      const bossStatusPayload = bossStatusRes.ok
        ? ((await bossStatusRes.json()) as BossBattleStatusPayload)
        : ({ unlocked: false, alreadyPlayedToday: false, lessonAssignmentId: null } as BossBattleStatusPayload);
      const sessionSummaryPayload = sessionSummaryRes.ok
        ? ((await sessionSummaryRes.json()) as SessionSummaryPayload)
        : ({} as SessionSummaryPayload);
      const learningStatePayload = learningStateRes.ok
        ? ((await learningStateRes.json()) as StudentLearningStatePayload)
        : ({} as StudentLearningStatePayload);
      const placementLevelsPayload = placementLevelsRes.ok
        ? ((await placementLevelsRes.json()) as QuickLevelFinderLevelsPayload)
        : ({} as QuickLevelFinderLevelsPayload);
      const placementLessonsPayload = placementLessonsRes.ok
        ? ((await placementLessonsRes.json()) as PlacementLessonsPayload)
        : ({} as PlacementLessonsPayload);
      const progressionPayload = ((await progressionRes.json()) as ProgressionPayload);
      const academicPayload = academicIntelligenceRes.ok
        ? ((await academicIntelligenceRes.json()) as StudentAcademicIntelligencePayload)
        : null;

      if (!assignmentsRes.ok) {
        if (assignmentsRes.status === 400 && /active student/i.test(assignmentsPayload.error ?? "")) {
          setMissingChildContext(true);
          setAssignments([]);
          setSkills([]);
          setSessionSummary(null);
          setLearningState(null);
          setPlacementLessonGroups([]);
          setPlacementContentGaps([]);
          setProgression(null);
          setBossUnlocked(false);
          setBossPlayedToday(false);
          setBossAssignmentId(null);
          return;
        }
        throw new Error(assignmentsPayload.error ?? "Unable to load assignments.");
      }

      setAssignments(assignmentsPayload.assignments ?? []);
      setSkills(Array.isArray(skillsPayload) ? skillsPayload : []);
      setBossUnlocked(Boolean(bossStatusPayload.unlocked));
      setBossPlayedToday(Boolean(bossStatusPayload.alreadyPlayedToday));
      setBossAssignmentId(typeof bossStatusPayload.lessonAssignmentId === "string" ? bossStatusPayload.lessonAssignmentId : null);
      setSessionSummary(sessionSummaryPayload.summary ?? null);
      setLearningState(learningStatePayload.learningState ?? null);
      setPlacementLevels(placementLevelsPayload.levels ?? null);
      setPlacementLessonGroups(Array.isArray(placementLessonsPayload.grouped) ? placementLessonsPayload.grouped : []);
      setPlacementContentGaps(Array.isArray(placementLessonsPayload.contentGaps) ? placementLessonsPayload.contentGaps : []);
      setProgression(progressionPayload ?? null);
      if (academicPayload) {
        const state = learningStatePayload.learningState;
        if (state?.isFirstTimeStudent || !state?.hasAssessmentData) {
          setAcademicIntelligence(null);
        } else {
          setAcademicIntelligence(academicPayload);
        }
      } else {
        setAcademicIntelligence(null);
        setAcademicError("Unable to load Smart Catch-Up right now.");
      }

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
        if (childPayload.child.yearGroup) {
          setProfileContext({
            yearGroup: childPayload.child.yearGroup,
            ageGroup: ageGroupForYearGroup(childPayload.child.yearGroup),
            keyStage: keyStageForYearGroup(childPayload.child.yearGroup),
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load dashboard.");
    } finally {
      setAcademicLoading(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    router.prefetch("/shop");
    router.prefetch("/games/lesson");
    router.prefetch("/games/spelling");
    router.prefetch("/games/math");
    router.prefetch("/games/reading");
  }, [router]);

  // Reset "stuck" loading states when the user navigates back to this page
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        setPendingAssignmentId(null);
        setOpeningStore(false);
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

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

  const coachRows = !learningState?.coachUnlocked
    ? []
    : [focusSkill, weakSkill, strongSkill]
      .filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index)
      .slice(0, 3)
      .map((skill) => {
        const row = skillMap.get(skill);
        return {
          code: skill,
          label: skillLabel(skill),
          accuracy: Math.round(row?.accuracy ?? 0),
          status: row?.status ?? "improving",
        };
      })
      .filter((row) => row.accuracy > 0);

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
    return null;
  }

  function startAssignment(assignment: StudentAssignment | null) {
    if (pendingAssignmentId) return;
    setPendingAssignmentId(assignment?.id ?? "direct");
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

  function openStore() {
    if (openingStore) return;
    setOpeningStore(true);
    router.push("/shop");
  }

  async function startTodayJourney() {
    setStartingJourney(true);
    setError("");
    try {
      const response = await fetch("/api/student/daily-journey", { credentials: "include" });
      const payload = (await response.json()) as DailyJourneyPayload;
      if (!response.ok) {
        if (response.status === 409 && payload && typeof payload === "object" && "code" in payload && (payload as { code?: string }).code === "ONBOARDING_REQUIRED") {
          router.push("/student/onboarding");
          return;
        }
        throw new Error(payload.error ?? "Unable to start today's journey.");
      }
      const assignmentId = payload.lesson?.assignmentId;
      if (!assignmentId) {
        throw new Error("No lesson assigned yet. Ask your teacher/admin to assign work.");
      }
      router.push(`/games/lesson?assignmentId=${assignmentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start today's journey.");
    } finally {
      setStartingJourney(false);
    }
  }

  async function startBossBattle() {
    if (bossLaunching) return;
    setBossLaunching(true);
    setError("");
    try {
      let nextAssignmentId = bossAssignmentId;
      if (!nextAssignmentId) {
        const statusRes = await fetch("/api/student/boss-battle", { credentials: "include" });
        const statusPayload = (await statusRes.json()) as BossBattleStatusPayload;
        if (statusRes.status === 401) {
          setAuthRequired(true);
          throw new Error("Your session expired. Please sign in again.");
        }
        if (!statusRes.ok) {
          throw new Error(statusPayload.error ?? statusPayload.lockReason ?? "Boss Battle is not available yet.");
        }
        nextAssignmentId = typeof statusPayload.lessonAssignmentId === "string" ? statusPayload.lessonAssignmentId : null;
        setBossAssignmentId(nextAssignmentId);
      }

      if (!nextAssignmentId) {
        throw new Error("Finish a lesson first, then launch Boss Battle.");
      }

      router.push(`/games/lesson?assignmentId=${encodeURIComponent(nextAssignmentId)}&phase=boss_battle`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start Boss Battle.");
    } finally {
      setBossLaunching(false);
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
        {loading ? (
          <div className="space-y-6">
            <div className="h-16 animate-pulse rounded-2xl bg-slate-200/80" />
            <div className="grid gap-3 sm:grid-cols-4">
              {[0, 1, 2, 3].map((idx) => (
                <div key={idx} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
            <div className="h-56 animate-pulse rounded-3xl bg-slate-100" />
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((idx) => (
                <div key={idx} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          </div>
        ) : error && !assignments.length ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
            <p className="font-bold text-rose-700">Unable to load your dashboard</p>
            <p className="mt-1 text-sm text-rose-600">{error}</p>
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-500"
            >
              Try again
            </button>
            {authRequired ? (
              <button
                type="button"
                onClick={() => router.push("/auth/login")}
                className="mt-3 ml-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
              >
                Go to Login
              </button>
            ) : null}
          </div>
        ) : missingChildContext ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
            <p className="font-bold text-amber-800">Choose a learner profile first</p>
            <p className="mt-1 text-sm text-amber-700">
              We could not find your active child context. Select a learner to continue to assignments, lessons, and Boss Battle.
            </p>
            <button
              type="button"
              onClick={() => router.push("/parent/profiles?intent=child")}
              className="mt-4 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-500"
            >
              Go to Profile Selection
            </button>
          </div>
        ) : (
          <div className="rounded-4xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 md:p-8">
            {profileContext ? (
              <StudentContextStrip
                ageGroup={profileContext.ageGroup}
                yearGroup={profileContext.yearGroup}
                keyStage={profileContext.keyStage}
                curriculum="National Curriculum UK"
                className="mb-6"
              />
            ) : null}
            {!loading && visibleAssignments.length === 0 ? (
              <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-amber-700">Awaiting Admin Assignment</p>
                <h2 className="mt-1 text-lg font-black">No lesson assigned yet</h2>
                <p className="mt-1 text-sm font-semibold text-amber-800">
                  Your teacher/admin has not assigned any work yet. Once work is assigned, it will appear here.
                </p>
              </div>
            ) : null}

            <section className="mb-6 rounded-3xl border border-cyan-200 bg-cyan-50/70 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">Smart Catch-Up</p>
              {learningState?.isFirstTimeStudent ? (
                <div className="mt-3 rounded-2xl border border-cyan-200 bg-white/70 p-4 text-sm text-cyan-900">
                  Smart Catch-Up unlocks after your Quick Level Finder and first learning activities.
                </div>
              ) : null}
              {academicLoading ? (
                <div className="mt-3 space-y-3">
                  <div className="h-4 w-52 animate-pulse rounded bg-cyan-200" />
                  <div className="h-16 animate-pulse rounded-2xl bg-cyan-100" />
                  <div className="h-16 animate-pulse rounded-2xl bg-cyan-100" />
                </div>
              ) : academicError ? (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <p className="text-sm font-semibold text-rose-700">{academicError}</p>
                  <button
                    type="button"
                    onClick={() => void loadDashboard()}
                    className="mt-3 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500"
                  >
                    Retry
                  </button>
                </div>
              ) : !academicIntelligence || learningState?.isFirstTimeStudent ? (
                <div className="mt-3 rounded-2xl border border-cyan-200 bg-white/70 p-4 text-sm text-cyan-900">
                  Complete more lessons to build your learning map.
                </div>
              ) : (
                <div className="mt-3 space-y-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-cyan-200 bg-white px-3 py-2">
                      <p className="text-xs text-cyan-700">Topics covered</p>
                      <p className="text-lg font-black text-cyan-900">{academicIntelligence.summary.coveredCount}/{academicIntelligence.summary.totalTopics}</p>
                    </div>
                    <div className="rounded-2xl border border-cyan-200 bg-white px-3 py-2">
                      <p className="text-xs text-cyan-700">Needs catch-up</p>
                      <p className="text-lg font-black text-cyan-900">{academicIntelligence.summary.needsCatchUpCount}</p>
                    </div>
                    <div className="rounded-2xl border border-cyan-200 bg-white px-3 py-2">
                      <p className="text-xs text-cyan-700">Needs revision</p>
                      <p className="text-lg font-black text-cyan-900">{academicIntelligence.summary.needsRevisionCount}</p>
                    </div>
                    <div className="rounded-2xl border border-cyan-200 bg-white px-3 py-2">
                      <p className="text-xs text-cyan-700">Average score</p>
                      <p className="text-lg font-black text-cyan-900">{academicIntelligence.summary.averageScore}%</p>
                    </div>
                  </div>

                  {academicIntelligence.catchUpRecommendations.length === 0 ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                      <p className="font-semibold">No catch-up needed right now.</p>
                      <p className="mt-1">You are on track. Keep going.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {academicIntelligence.catchUpRecommendations.slice(0, 5).map((task) => (
                        <div key={task.id} className="rounded-2xl border border-cyan-200 bg-white p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-bold text-slate-900">{task.title}</p>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                              task.status === "completed"
                                ? "bg-emerald-100 text-emerald-700"
                                : task.status === "active"
                                  ? "bg-cyan-100 text-cyan-700"
                                  : task.status === "overdue"
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-amber-100 text-amber-700"
                            }`}>
                              {task.status.replaceAll("_", " ")}
                            </span>
                          </div>
                          <p className="mt-1 text-xs uppercase tracking-[0.08em] text-slate-500">
                            {task.subject} {task.topic ? `• ${task.topic}` : ""}
                          </p>
                          <p className="mt-2 text-sm text-slate-700">{task.studentFriendlyReason ?? task.reason}</p>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-500">Estimated time: {task.estimatedMinutes} mins</p>
                            <button
                              type="button"
                              onClick={() => router.push(task.routeTarget ?? "/student/dashboard")}
                              className="rounded-xl bg-cyan-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-cyan-500"
                            >
                              Start
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {academicIntelligence.assessmentRecommendations.length === 0 ? (
                    <p className="text-sm text-cyan-900">No assessment due right now.</p>
                  ) : (
                    <div className="rounded-2xl border border-cyan-200 bg-white p-4">
                      <p className="text-sm font-bold text-slate-900">Assessment Readiness</p>
                      <p className="mt-1 text-sm text-slate-700">{academicIntelligence.assessmentRecommendations[0]?.reason}</p>
                    </div>
                  )}
                </div>
              )}
            </section>

            {progression && (Array.isArray(progression.recommendations) ? progression.recommendations.length > 0 : Boolean(progression.message)) ? (
              <section className="mb-6 rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Subject Progression</p>
                <p className="mt-1 text-sm font-semibold text-emerald-900">{progression.message ?? "Progression recommendations updated."}</p>

                {progression.summary ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-4">
                    <div className="rounded-xl border border-emerald-200 bg-white p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Headline</p>
                      <p className="mt-1 text-sm font-black text-slate-900">{progression.summary.friendlyHeadline}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-white p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Needs support</p>
                      <p className="mt-1 text-sm font-black text-slate-900">{progression.summary.needsSupport}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-white p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Ready to advance</p>
                      <p className="mt-1 text-sm font-black text-slate-900">{progression.summary.readyToAdvance}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-white p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Review needed</p>
                      <p className="mt-1 text-sm font-black text-slate-900">{progression.summary.reviewNeeded}</p>
                    </div>
                  </div>
                ) : null}

                {Array.isArray(progression.recommendations) && progression.recommendations.length > 0 ? (
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {progression.recommendations.slice(0, 6).map((item) => (
                      <div key={item.scopedSubject} className="rounded-2xl border border-emerald-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-black text-slate-900">{item.subject}{item.strand ? ` - ${item.strand}` : ""}</p>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                            {progressionFriendlyBadge(item.status)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-600">
                          Level {item.currentLevel} {"->"} {item.recommendedLevel} · Confidence {item.confidence}%
                        </p>
                        <p className="mt-1 text-xs text-slate-700">{item.nextBestStep}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

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
                learningState={learningState}
                placementLevels={placementLevels}
                placementLessonGroups={placementLessonGroups}
                placementContentGaps={placementContentGaps}
                loading={loading}
                error={error}
                startingJourney={startingJourney}
                onStartJourney={startTodayJourney}
                onStartAssignment={startAssignment}
                onStartBossBattle={startBossBattle}
                bossLaunching={bossLaunching}
                onOpenStore={openStore}
                pendingAssignmentId={pendingAssignmentId}
                openingStore={openingStore}
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
                learningState={learningState}
                placementLevels={placementLevels}
                placementLessonGroups={placementLessonGroups}
                placementContentGaps={placementContentGaps}
                loading={loading}
                error={error}
                startingJourney={startingJourney}
                pathway={dashboardTier}
                allAssignments={assignments}
                onStartJourney={startTodayJourney}
                onStartAssignment={startAssignment}
                onStartBossBattle={startBossBattle}
                bossLaunching={bossLaunching}
                onOpenStore={openStore}
                pendingAssignmentId={pendingAssignmentId}
                openingStore={openingStore}
              />
            )}
          </div>
        )}
      </section>
    </main>
  );
}
