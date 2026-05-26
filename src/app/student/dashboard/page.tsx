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
import CurriculumMasteryMap from "@/components/academic-intelligence/CurriculumMasteryMap";
import type { PlacementLessonGroup, PlacementLessonRecommendation, PlacementLevels, StudentLearningState } from "@/components/student/dashboardTypes";
import type { CoverageEntry } from "@/lib/academic-intelligence/types";

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
  quickLevelFinderRetestEnabled?: boolean;
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
  curriculumCoverage?: CoverageEntry[];
  masteryExpansion?: {
    needsCatchUpTopics: number;
    nearlySecureTopics: number;
    masteredTopics: number;
    overdueRevisionTopics: number;
    highConfidenceTopics: number;
    priorityTopics: string[];
  };
  catchUpRecommendations: Array<{
    id: string;
    title: string;
    subject: string;
    topic?: string | null;
    studentFriendlyReason?: string;
    reason: string;
    estimatedMinutes: number;
    status: "recommended" | "scheduled" | "active" | "in_progress" | "completed" | "skipped" | "waived" | "overdue";
    routeTarget?: string | null;
  }>;
  catchUpTasks?: Array<{
    taskId: string;
    recommendationId: string;
    title: string;
    subject: string;
    topic?: string | null;
    status: "recommended" | "scheduled" | "active" | "in_progress" | "completed" | "skipped" | "waived" | "overdue";
    estimatedMinutes: number;
    dueDate?: string | null;
    scheduledDay?: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | null;
    routeTarget?: string | null;
  }>;
  homeworkTasks?: Array<{
    taskId: string;
    blockId: string;
    title: string;
    subject?: string | null;
    topic?: string | null;
    status: "assigned" | "in_progress" | "completed" | "waived" | "overdue";
    estimatedMinutes: number;
    dueDate?: string | null;
    scheduledDay?: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | null;
    routeTarget?: string | null;
  }>;
  assessmentRecommendations: Array<{
    assessmentType: string;
    subject: string;
    topic?: string | null;
    reason: string;
    readinessStatus: string;
  }>;
  examReadinessProfile?: {
    score: number;
    band: "not_ready" | "nearly_ready" | "ready";
    headline: string;
    blockers: string[];
    recommendedActions: string[];
    signals: {
      masteryScore: number;
      consistencyScore: number;
      examEvidenceScore: number;
      weakAreaPenalty: number;
    };
  };
  schoolWeekModePlan?: {
    enabled: boolean;
    strategy: string;
    totalEstimatedMinutes: number;
    days: Array<{
      day: string;
      focus: string;
      activityType: "catch_up" | "assessment" | "mastery" | "revision";
      estimatedMinutes: number;
      routeTarget: string | null;
      recommendationId: string | null;
    }>;
    dailySchedules: Array<{
      day: string;
      totalMinutes: number;
      blocks: Array<{
        blockId: string;
        title: string;
        activityType: string;
        startTime: string;
        endTime: string;
        routeTarget: string | null;
        friendlyLabel: string;
      }>;
    }>;
  };
  nextRecommendedActions: string[];
  generatedAt: string;
};

type CertificateEligibilityPayload = {
  ok?: boolean;
  code?: "placement_required" | "not_enough_evidence";
  term?: string;
  message?: string;
  summary?: {
    primaryCertificateType: "term_completion" | "end_of_term_exam" | "subject_achievement" | "english_achievement" | "mastery_certificate";
    status: "locked" | "pending_lessons" | "pending_quizzes" | "pending_catch_up" | "pending_exam" | "pending_review" | "eligible" | "issued" | "not_yet_awarded";
    readinessPercentage: number;
    friendlyLabel: "Keep learning" | "Almost ready" | "Catch-up needed" | "Exam needed" | "Ready for certificate";
    mainBlocker: string | null;
    nextBestAction: string;
  };
  certificates?: Array<{
    certificateType: "term_completion" | "end_of_term_exam" | "subject_achievement" | "english_achievement" | "mastery_certificate";
    status: "locked" | "pending_lessons" | "pending_quizzes" | "pending_catch_up" | "pending_exam" | "pending_review" | "eligible" | "issued" | "not_yet_awarded";
    readinessScore: number;
    completionPercentage: number;
    blockers: string[];
    nextBestAction: string;
  }>;
  issuedCertificates?: Array<{
    id: string;
    certificateNumber: string;
    verificationCode: string;
    certificateType: "term_completion" | "end_of_term_exam" | "subject_achievement" | "english_achievement" | "mastery_certificate";
    title: string;
    term: string;
    status: "issued" | "revoked";
    issuedAt: string;
    verificationUrl: string;
  }>;
  error?: string;
};

type IssueCertificatePayload = {
  ok?: boolean;
  message?: string;
  issuedCertificate?: {
    id: string;
    certificateNumber: string;
    verificationCode: string;
    certificateType: "term_completion" | "end_of_term_exam" | "subject_achievement" | "english_achievement" | "mastery_certificate";
    term: string;
    issuedAt: string;
    verificationUrl: string;
  };
  code?: string;
  error?: string;
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

function certificateTypeLabel(type: NonNullable<CertificateEligibilityPayload["summary"]>["primaryCertificateType"]): string {
  if (type === "term_completion") return "Term Completion Certificate";
  if (type === "end_of_term_exam") return "End-of-Term Exam Certificate";
  if (type === "subject_achievement") return "Subject Achievement Certificate";
  if (type === "english_achievement") return "English Achievement Certificate";
  return "Mastery Certificate";
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
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingJourney, setStartingJourney] = useState(false);
  const [bossUnlocked, setBossUnlocked] = useState(false);
  const [bossPlayedToday, setBossPlayedToday] = useState(false);
  const [ownedBadges, setOwnedBadges] = useState<ShopOwnedItem[]>([]);
  const [sessionSummary, setSessionSummary] = useState<SessionSummaryPayload["summary"] | null>(null);
  const [learningState, setLearningState] = useState<StudentLearningState | null>(null);
  const [quickLevelFinderRetestEnabled, setQuickLevelFinderRetestEnabled] = useState(false);
  const [placementLevels, setPlacementLevels] = useState<PlacementLevels | null>(null);
  const [placementLessonGroups, setPlacementLessonGroups] = useState<PlacementLessonGroup[]>([]);
  const [placementContentGaps, setPlacementContentGaps] = useState<PlacementLessonRecommendation[]>([]);
  const [progression, setProgression] = useState<ProgressionPayload | null>(null);
  const [certificateEligibility, setCertificateEligibility] = useState<CertificateEligibilityPayload | null>(null);
  const [academicIntelligence, setAcademicIntelligence] = useState<StudentAcademicIntelligencePayload | null>(null);
  const [academicLoading, setAcademicLoading] = useState(false);
  const [academicError, setAcademicError] = useState("");
  const [academicTaskPendingId, setAcademicTaskPendingId] = useState<string | null>(null);
  const [homeworkPendingId, setHomeworkPendingId] = useState<string | null>(null);
  const [liveNow, setLiveNow] = useState(() => new Date());
  const [error, setError] = useState("");
  const [missingChildContext, setMissingChildContext] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [pendingAssignmentId, setPendingAssignmentId] = useState<string | null>(null);
  const [openingStore, setOpeningStore] = useState(false);
  const [bossAssignmentId, setBossAssignmentId] = useState<string | null>(null);
  const [bossLaunching, setBossLaunching] = useState(false);
  const [issuingCertificate, setIssuingCertificate] = useState(false);
  const [deferredPanelsLoadedFor, setDeferredPanelsLoadedFor] = useState<string | null>(null);

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
        setActiveChildId(null);
        setAcademicLoading(false);
        setAssignments([]);
        setSkills([]);
        setSessionSummary(null);
        setLearningState(null);
        setQuickLevelFinderRetestEnabled(false);
        setPlacementLevels(null);
        setPlacementLessonGroups([]);
        setPlacementContentGaps([]);
        setProgression(null);
        setCertificateEligibility(null);
        setAcademicIntelligence(null);
        setAcademicError("");
        setBossUnlocked(false);
        setBossPlayedToday(false);
        setBossAssignmentId(null);
        return;
      }

      const [assignmentsRes, skillsRes, bossStatusRes] = await Promise.all([
        fetch("/api/student/assignments", { credentials: "include" }),
        fetch("/api/student/skills", { credentials: "include" }),
        fetch("/api/student/boss-battle", { credentials: "include" }),
      ]);

      if ([assignmentsRes, skillsRes, bossStatusRes].some((res) => res.status === 401)) {
        setAuthRequired(true);
        setError("Your session expired. Please sign in again.");
        return;
      }

      const assignmentsPayload = (await assignmentsRes.json()) as StudentAssignmentsPayload;
      const skillsPayload = skillsRes.ok ? ((await skillsRes.json()) as StudentSkill[]) : [];
      const bossStatusPayload = bossStatusRes.ok
        ? ((await bossStatusRes.json()) as BossBattleStatusPayload)
        : ({ unlocked: false, alreadyPlayedToday: false, lessonAssignmentId: null } as BossBattleStatusPayload);

      if (!assignmentsRes.ok) {
        if (assignmentsRes.status === 400 && /active student/i.test(assignmentsPayload.error ?? "")) {
          setMissingChildContext(true);
          setAssignments([]);
          setSkills([]);
          setSessionSummary(null);
          setLearningState(null);
          setQuickLevelFinderRetestEnabled(false);
          setPlacementLessonGroups([]);
          setPlacementContentGaps([]);
          setProgression(null);
          setCertificateEligibility(null);
          setBossUnlocked(false);
          setBossPlayedToday(false);
          setBossAssignmentId(null);
          setActiveChildId(null);
          return;
        }
        throw new Error(assignmentsPayload.error ?? "Unable to load assignments.");
      }

      setAssignments(assignmentsPayload.assignments ?? []);
      setSkills(Array.isArray(skillsPayload) ? skillsPayload : []);
      setBossUnlocked(Boolean(bossStatusPayload.unlocked));
      setBossPlayedToday(Boolean(bossStatusPayload.alreadyPlayedToday));
      setBossAssignmentId(typeof bossStatusPayload.lessonAssignmentId === "string" ? bossStatusPayload.lessonAssignmentId : null);
      setActiveChildId(childPayload.child.id);
      setDeferredPanelsLoadedFor(null);
      setAcademicLoading(true);

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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !activeChildId) return;
    if (deferredPanelsLoadedFor === activeChildId) return;

    let cancelled = false;

    const timer = window.setTimeout(() => {
      async function loadDeferredPanels() {
        setAcademicLoading(true);
        setAcademicError("");

        try {
          const [sessionSummaryRes, academicIntelligenceRes, learningStateRes, placementLevelsRes, placementLessonsRes, progressionRes, certificateEligibilityRes, ownedResponse] = await Promise.all([
            fetch("/api/student/session-summary", { credentials: "include" }),
            fetch("/api/student/academic-intelligence", { credentials: "include" }),
            fetch("/api/student/learning-state", { credentials: "include" }),
            fetch("/api/student/quick-level-finder/levels", { credentials: "include" }),
            fetch("/api/student/placement-lessons", { credentials: "include" }),
            fetch("/api/student/progression/recommendations", { credentials: "include" }),
            fetch("/api/student/certificates/eligibility", { credentials: "include" }),
            fetch(`/api/shop/owned?childId=${encodeURIComponent(activeChildId ?? "")}`, { credentials: "include" }),
          ]);

          if (cancelled) return;
          if ([sessionSummaryRes, academicIntelligenceRes, learningStateRes, placementLevelsRes, placementLessonsRes, progressionRes, certificateEligibilityRes].some((res) => res.status === 401)) {
            setAuthRequired(true);
            setError("Your session expired. Please sign in again.");
            return;
          }

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
          const certificateEligibilityPayload = ((await certificateEligibilityRes.json()) as CertificateEligibilityPayload);
          const academicPayload = academicIntelligenceRes.ok
            ? ((await academicIntelligenceRes.json()) as StudentAcademicIntelligencePayload)
            : null;

          setSessionSummary(sessionSummaryPayload.summary ?? null);
          setLearningState(learningStatePayload.learningState ?? null);
          setQuickLevelFinderRetestEnabled(learningStatePayload.quickLevelFinderRetestEnabled === true);
          setPlacementLevels(placementLevelsPayload.levels ?? null);
          setPlacementLessonGroups(Array.isArray(placementLessonsPayload.grouped) ? placementLessonsPayload.grouped : []);
          setPlacementContentGaps(Array.isArray(placementLessonsPayload.contentGaps) ? placementLessonsPayload.contentGaps : []);
          setProgression(progressionPayload ?? null);
          setCertificateEligibility(certificateEligibilityPayload ?? null);

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

          if (ownedResponse.ok) {
            const ownedPayload = (await ownedResponse.json()) as ShopOwnedPayload;
            setOwnedBadges((ownedPayload.owned ?? []).filter((item) => item.category === "badges"));
          }

          setDeferredPanelsLoadedFor(activeChildId);
        } finally {
          if (!cancelled) {
            setAcademicLoading(false);
          }
        }
      }

      void loadDeferredPanels();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeChildId, deferredPanelsLoadedFor, loading]);

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

  useEffect(() => {
    const timer = window.setInterval(() => setLiveNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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

  async function handleStudentCatchUpTaskAction(taskId: string, action: "start_task" | "complete_task" | "skip_task") {
    setAcademicTaskPendingId(taskId);
    setAcademicError("");
    try {
      const response = await fetch("/api/student/academic-intelligence/catch-up-tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, action }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to update catch-up task.");
      }

      await loadDashboard();
    } catch (err) {
      setAcademicError(err instanceof Error ? err.message : "Unable to update catch-up task.");
    } finally {
      setAcademicTaskPendingId(null);
    }
  }

  async function handleStudentHomeworkTaskAction(taskId: string, action: "start_homework" | "complete_homework") {
    setHomeworkPendingId(taskId);
    setAcademicError("");
    try {
      const response = await fetch("/api/student/academic-intelligence/homework-tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, action }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to update homework task.");
      }

      await loadDashboard();
    } catch (err) {
      setAcademicError(err instanceof Error ? err.message : "Unable to update homework task.");
    } finally {
      setHomeworkPendingId(null);
    }
  }

  async function startTodayJourney() {
    setStartingJourney(true);
    setError("");
    try {
      const response = await fetch("/api/student/daily-journey?quick=1", { credentials: "include" });
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

  function formatIssuedDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  async function issueCertificate() {
    if (issuingCertificate || !certificateEligibility?.summary) return;
    setIssuingCertificate(true);
    setError("");
    try {
      const response = await fetch("/api/student/certificates/issue", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          certificateType: certificateEligibility.summary.primaryCertificateType,
          term: certificateEligibility.term,
        }),
      });

      const payload = (await response.json()) as IssueCertificatePayload;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message ?? payload.error ?? "Unable to issue certificate right now.");
      }

      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to issue certificate right now.");
    } finally {
      setIssuingCertificate(false);
    }
  }

  const focusAssignment = findAssignmentForSkill(focusSkill);
  const weakAssignment = findAssignmentForSkill(weakSkill ?? focusSkill);
  const reviewAssignment = findAssignmentForSkill(strongSkill);
  const selectedIssuedCertificate = useMemo(() => {
    const primaryType = certificateEligibility?.summary?.primaryCertificateType;
    if (!primaryType || !certificateEligibility?.issuedCertificates?.length) return null;
    const match = certificateEligibility.issuedCertificates
      .filter((row) => row.certificateType === primaryType)
      .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())[0];
    return match ?? null;
  }, [certificateEligibility]);
  const weakAccuracy = Math.round(skillMap.get(weakSkill)?.accuracy ?? 45);
  const supportSkill = groupedSkills.improving[0]?.skill ?? focusSkill;
  const dashboardExperience = dashboardTier === "primary"
    ? (
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
        quickLevelFinderRetestEnabled={quickLevelFinderRetestEnabled}
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
    )
    : (dashboardTier === "ks3" || dashboardTier === "gcse")
      ? (
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
          quickLevelFinderRetestEnabled={quickLevelFinderRetestEnabled}
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
      )
      : null;

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
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
              Loading page, please wait...
            </div>
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

            {dashboardExperience ? (
              <div className="mb-6">
                {dashboardExperience}
              </div>
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
                  <p className="text-sm font-semibold text-cyan-800">Loading Smart Catch-Up...</p>
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

                  {academicIntelligence.masteryExpansion ? (
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-cyan-200 bg-white px-3 py-2">
                        <p className="text-xs text-cyan-700">Mastered topics</p>
                        <p className="text-lg font-black text-cyan-900">{academicIntelligence.masteryExpansion.masteredTopics}</p>
                      </div>
                      <div className="rounded-2xl border border-cyan-200 bg-white px-3 py-2">
                        <p className="text-xs text-cyan-700">Nearly secure</p>
                        <p className="text-lg font-black text-cyan-900">{academicIntelligence.masteryExpansion.nearlySecureTopics}</p>
                      </div>
                      <div className="rounded-2xl border border-cyan-200 bg-white px-3 py-2">
                        <p className="text-xs text-cyan-700">Priority topics</p>
                        <p className="text-sm font-black text-cyan-900">
                          {academicIntelligence.masteryExpansion.priorityTopics.slice(0, 3).join(", ") || "No priority topics"}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <CurriculumMasteryMap
                    variant="light"
                    title="Curriculum Mastery Map"
                    subtitle="Subjects, levels, and topic status across the learner's curriculum."
                    eyebrow="Mastery map"
                    summary={academicIntelligence.summary}
                    rows={academicIntelligence.curriculumCoverage ?? []}
                  />

                  {((academicIntelligence.catchUpTasks ?? []).length === 0 && academicIntelligence.catchUpRecommendations.length === 0) ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                      <p className="font-semibold">No catch-up needed right now.</p>
                      <p className="mt-1">You are on track. Keep going.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(academicIntelligence.catchUpTasks ?? []).slice(0, 5).map((task) => (
                        <div key={task.taskId} className="rounded-2xl border border-cyan-200 bg-white p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-bold text-slate-900">{task.title}</p>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                              task.status === "completed"
                                ? "bg-emerald-100 text-emerald-700"
                                : task.status === "active" || task.status === "in_progress" || task.status === "scheduled"
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
                          <p className="mt-2 text-sm text-slate-700">
                            {academicIntelligence.catchUpRecommendations.find((row) => row.id === task.recommendationId)?.studentFriendlyReason ?? "Targeted recovery task from your learning map."}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-500">
                              {task.scheduledDay ? `${task.scheduledDay} plan • ` : ""}
                              Estimated time: {task.estimatedMinutes} mins
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={academicTaskPendingId === task.taskId}
                                onClick={() => {
                                  void handleStudentCatchUpTaskAction(task.taskId, "start_task");
                                  router.push(task.routeTarget ?? "/student/dashboard");
                                }}
                                className="rounded-xl bg-cyan-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-cyan-500 disabled:opacity-60"
                              >
                                Start
                              </button>
                              <button
                                type="button"
                                disabled={academicTaskPendingId === task.taskId}
                                onClick={() => void handleStudentCatchUpTaskAction(task.taskId, "complete_task")}
                                className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
                              >
                                Complete
                              </button>
                              <button
                                type="button"
                                disabled={academicTaskPendingId === task.taskId}
                                onClick={() => void handleStudentCatchUpTaskAction(task.taskId, "skip_task")}
                                className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-60"
                              >
                                Skip
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid gap-3 lg:grid-cols-2">
                    {academicIntelligence.examReadinessProfile ? (
                      <div className="rounded-2xl border border-cyan-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-slate-900">AI Exam Readiness</p>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            academicIntelligence.examReadinessProfile.band === "ready"
                              ? "bg-emerald-100 text-emerald-700"
                              : academicIntelligence.examReadinessProfile.band === "nearly_ready"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-rose-100 text-rose-700"
                          }`}>
                            {academicIntelligence.examReadinessProfile.band.replaceAll("_", " ")}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-black text-cyan-900">{academicIntelligence.examReadinessProfile.score}%</p>
                        <p className="mt-1 text-sm text-slate-700">{academicIntelligence.examReadinessProfile.headline}</p>
                        {academicIntelligence.examReadinessProfile.recommendedActions.length > 0 ? (
                          <ul className="mt-2 space-y-1 text-xs text-slate-600">
                            {academicIntelligence.examReadinessProfile.recommendedActions.slice(0, 2).map((item) => (
                              <li key={item}>• {item}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-cyan-200 bg-white p-4">
                        <p className="text-sm text-cyan-900">No assessment due right now.</p>
                      </div>
                    )}

                    {academicIntelligence.schoolWeekModePlan?.enabled ? (
                      <div className="rounded-2xl border border-cyan-200 bg-white p-4">
                        <p className="text-sm font-bold text-slate-900">School Week Mode</p>
                        <p className="mt-1 text-xs text-slate-600">{academicIntelligence.schoolWeekModePlan.strategy}</p>
                        <p className="mt-1 text-xs font-semibold text-cyan-700">
                          Weekly load: {academicIntelligence.schoolWeekModePlan.totalEstimatedMinutes} mins
                        </p>
                        {(() => {
                          const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                          const todayName = weekdayNames[liveNow.getDay()];
                          const todaySchedule = academicIntelligence.schoolWeekModePlan?.dailySchedules?.find((item) => item.day === todayName) ?? null;
                          const nextSchedule = academicIntelligence.schoolWeekModePlan?.dailySchedules?.find((item) => item.day !== todayName && item.blocks.length > 0) ?? null;
                          const nextBlock = todaySchedule?.blocks[0] ?? nextSchedule?.blocks[0] ?? null;
                          const currentMinutes = (liveNow.getHours() * 60) + liveNow.getMinutes();
                          const currentBlock = todaySchedule?.blocks.find((item) => {
                            const [startH, startM] = item.startTime.split(":").map((value) => Number(value));
                            const [endH, endM] = item.endTime.split(":").map((value) => Number(value));
                            const start = (startH * 60) + startM;
                            const end = (endH * 60) + endM;
                            return currentMinutes >= start && currentMinutes < end;
                          }) ?? null;
                          const minutesRemaining = currentBlock
                            ? Math.max(0, ((Number(currentBlock.endTime.split(":")[0]) * 60) + Number(currentBlock.endTime.split(":")[1])) - currentMinutes)
                            : 0;

                          return (
                            <div className="mt-2 space-y-2">
                              {currentBlock ? (
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                                  <p className="font-semibold">Current block: {currentBlock.title}</p>
                                  <p className="mt-1">{minutesRemaining} minute{minutesRemaining === 1 ? "" : "s"} remaining ({currentBlock.startTime} - {currentBlock.endTime})</p>
                                </div>
                              ) : null}
                              <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs text-slate-700">
                                <p className="font-semibold text-cyan-800">Today&apos;s learning plan</p>
                                {todaySchedule?.blocks?.length ? (
                                  <p className="mt-1">
                                    {todaySchedule.blocks.slice(0, 2).map((item) => `${item.startTime} ${item.title}`).join(" • ")}
                                  </p>
                                ) : (
                                  <p className="mt-1">No timed blocks today. Keep up with revision and rest.</p>
                                )}
                              </div>
                              {nextBlock ? (
                                <button
                                  type="button"
                                  onClick={() => router.push(nextBlock.routeTarget ?? "/student/dashboard")}
                                  className="flex w-full items-center justify-between rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2 text-left text-xs text-slate-700 hover:bg-cyan-100"
                                >
                                  <span>Next activity: {nextBlock.startTime} {nextBlock.title}</span>
                                  <span className="font-bold text-cyan-700">Go</span>
                                </button>
                              ) : null}
                              <div className="space-y-1">
                                {academicIntelligence.schoolWeekModePlan.days.slice(0, 2).map((day) => (
                                  <p key={`${day.day}-${day.focus}`} className="text-xs text-slate-600">
                                    {day.day}: {day.focus} ({day.estimatedMinutes}m)
                                  </p>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ) : null}
                  </div>

                  {academicIntelligence.homeworkTasks && academicIntelligence.homeworkTasks.length > 0 ? (
                    <div className="rounded-2xl border border-indigo-200 bg-white p-4">
                      <p className="text-sm font-bold text-slate-900">School Week Homework</p>
                      <div className="mt-2 space-y-2">
                        {academicIntelligence.homeworkTasks.slice(0, 4).map((task) => (
                          <div key={task.taskId} className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-slate-700">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-indigo-900">{task.title}</p>
                              <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-bold text-indigo-700">{task.status.replaceAll("_", " ")}</span>
                            </div>
                            <p className="mt-1">{task.subject ?? "General"}{task.topic ? ` - ${task.topic}` : ""} • {task.estimatedMinutes}m</p>
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                disabled={homeworkPendingId === task.taskId}
                                onClick={() => void handleStudentHomeworkTaskAction(task.taskId, "start_homework")}
                                className="rounded-lg bg-indigo-600 px-2 py-1 font-bold text-white disabled:opacity-60"
                              >
                                Start
                              </button>
                              <button
                                type="button"
                                disabled={homeworkPendingId === task.taskId}
                                onClick={() => void handleStudentHomeworkTaskAction(task.taskId, "complete_homework")}
                                className="rounded-lg bg-emerald-600 px-2 py-1 font-bold text-white disabled:opacity-60"
                              >
                                Complete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-sm font-bold text-slate-900">School Week Report</p>
                    <p className="mt-1 text-xs text-slate-600">
                      Catch-up completed: {(academicIntelligence.catchUpTasks ?? []).filter((task) => task.status === "completed").length} •
                      Homework completed: {(academicIntelligence.homeworkTasks ?? []).filter((task) => task.status === "completed").length} •
                      Overdue items: {(academicIntelligence.catchUpTasks ?? []).filter((task) => task.status === "overdue").length + (academicIntelligence.homeworkTasks ?? []).filter((task) => task.status === "overdue").length}
                    </p>
                  </div>
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

            {certificateEligibility && (certificateEligibility.summary || certificateEligibility.message) ? (
              <section className="mb-6 rounded-3xl border border-amber-200 bg-amber-50/70 p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Certificate Progress</p>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => router.push("/student/certificates")}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-white hover:bg-slate-700"
                  >
                    View My Certificates
                  </button>
                </div>
                <p className="mt-1 text-sm font-semibold text-amber-900">
                  {certificateEligibility.summary?.friendlyLabel ?? "Keep learning"}
                </p>
                <p className="mt-1 text-sm text-amber-900">
                  {certificateEligibility.message ?? "Your certificate is not ready yet. Keep building evidence."}
                </p>

                {certificateEligibility.summary ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-4">
                    <div className="rounded-xl border border-amber-200 bg-white p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Type</p>
                      <p className="mt-1 text-sm font-black text-slate-900">{certificateTypeLabel(certificateEligibility.summary.primaryCertificateType)}</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-white p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Readiness</p>
                      <p className="mt-1 text-sm font-black text-slate-900">{certificateEligibility.summary.readinessPercentage}%</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-white p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Main blocker</p>
                      <p className="mt-1 text-sm font-black text-slate-900">{certificateEligibility.summary.mainBlocker ?? "No blocker"}</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-white p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Next action</p>
                      <p className="mt-1 text-sm font-black text-slate-900">{certificateEligibility.summary.nextBestAction}</p>
                    </div>
                  </div>
                ) : null}

                {certificateEligibility.summary?.status !== "eligible" && certificateEligibility.summary?.status !== "issued" ? (
                  <p className="mt-3 text-sm text-amber-900">
                    Your certificate is not ready yet. Complete your catch-up task and end-of-term exam first.
                  </p>
                ) : null}

                {certificateEligibility.summary?.status === "eligible" ? (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-sm font-semibold text-emerald-900">Ready for certificate review and issuing.</p>
                    <button
                      type="button"
                      onClick={() => void issueCertificate()}
                      disabled={issuingCertificate}
                      className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {issuingCertificate ? "Issuing..." : "Issue Certificate"}
                    </button>
                  </div>
                ) : null}

                {selectedIssuedCertificate ? (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-4">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Issued Certificate</p>
                    <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                      <p className="text-slate-700">Number: <span className="font-mono font-semibold text-slate-900">{selectedIssuedCertificate.certificateNumber}</span></p>
                      <p className="text-slate-700">Issued: <span className="font-semibold text-slate-900">{formatIssuedDate(selectedIssuedCertificate.issuedAt)}</span></p>
                      <p className="text-slate-700">Verification code: <span className="font-mono font-semibold text-slate-900">{selectedIssuedCertificate.verificationCode}</span></p>
                      <p className="text-slate-700">Status: <span className="font-semibold capitalize text-slate-900">{selectedIssuedCertificate.status}</span></p>
                    </div>
                    <button
                      type="button"
                      onClick={() => router.push(`/certificates/verify/${encodeURIComponent(selectedIssuedCertificate.verificationCode)}`)}
                      className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
                    >
                      Open Verification Page
                    </button>
                  </div>
                ) : null}
              </section>
            ) : null}

          </div>
        )}
      </section>
    </main>
  );
}
