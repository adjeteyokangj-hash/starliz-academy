"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import { SKILL_MAP } from "@/lib/skills";
import { isInterventionEligibleSkill } from "@/lib/interventionMission";
import { resolveDashboardTier } from "@/lib/dashboardResolver";
import { ageGroupForYearGroup, keyStageForYearGroup } from "@/lib/curriculum";
import PrimaryDashboard from "@/components/student/PrimaryDashboard";
import SecondaryDashboard from "@/components/student/SecondaryDashboard";
import StudentContextStrip from "@/components/student/StudentContextStrip";
import WeeklyHomeworkPanel from "@/components/student/WeeklyHomeworkPanel";
import {
  resolveHomeworkStartTarget,
} from "@/lib/student-dashboard-actions";
import type { HomeworkBatchView } from "@/lib/homework-phase1b/service";
import {
  resolveHomeworkGateMessage,
  shouldShowHomeworkDashboardCard,
  WEEKLY_HOMEWORK_PENDING_MESSAGE,
  WEEKLY_HOMEWORK_SUPPORT_MESSAGE,
} from "@/lib/homework-phase1c/helpers";
import { isStudentCertificateCenterEnabled } from "@/lib/launch-scope";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import { formatStudentId } from "@/lib/student-id";
import { resolveRecoverySeverityChips } from "@/lib/recovery-task-severity";
import type { PlacementLessonGroup, PlacementLessonRecommendation, PlacementLevels, StudentLearningState } from "@/components/student/dashboardTypes";
import type { CoverageEntry, LearningTwinProfile } from "@/lib/academic-intelligence/types";

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

type DashboardSummaryPayload = {
  ok?: boolean;
  child?: (NonNullable<ActiveChildPayload["child"]> & {
    level?: number;
    dashboardTier?: "primary" | "ks3" | "gcse";
    keyStage?: string | null;
  }) | null;
  assignments?: StudentAssignment[];
  activeLanguageModules?: Array<{
    id: string;
    language: string;
    title: string;
    description: string;
    href: string;
    activeAssignments: number;
  }>;
  assignedLanguageLessons?: Array<{
    assignmentId: string;
    language: string;
    title: string;
    href: string | null;
    status: string;
  }>;
  skills?: StudentSkill[];
  error?: string;
};

type SessionSummaryPayload = {
  ok?: boolean;
  source?: "legacy_progress_record_session_signals";
  type?: "legacy_engagement_summary";
  canonical?: false;
  status?: "recent_activity_only";
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
    denominatorCoverage?: {
      expectedTopics: number;
      coveredTopics: number;
      missingTopics: number;
      coveragePercent: number;
      overIndexedTopics: string[];
      underCoveredTopics: string[];
      bySubject: Array<{
        subject: string;
        keyStage: string | null;
        yearGroup: string | null;
        curriculumLevel: "foundation" | "core" | "advanced";
        expectedTopics: string[];
        coveredTopics: string[];
        missingTopics: string[];
        coveragePercent: number;
        overIndexedTopics: string[];
        underCoveredTopics: string[];
      }>;
    };
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
  learningTwin?: LearningTwinProfile;
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
    skill?: string | null;
    status: "recommended" | "scheduled" | "active" | "in_progress" | "completed" | "skipped" | "waived" | "overdue";
    priority?: "high" | "medium" | "low";
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

type WeeklyHomeworkGatePayload = {
  ok?: boolean;
  featureEnabled?: boolean;
  code?: string;
  reason?: string;
  homework?: HomeworkBatchView | null;
  homeworkGate?: {
    blockNewLearningSession?: boolean;
    allowRecapCatchUpOnly?: boolean;
    allowedSurfaces?: string[];
    reason?: string;
  };
  error?: string;
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
  const searchParams = useSearchParams();
  const requestedStudentId = searchParams.get("studentId")?.trim() || null;
  const certificateCenterEnabled = isStudentCertificateCenterEnabled();
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [activeLanguageModules, setActiveLanguageModules] = useState<NonNullable<DashboardSummaryPayload["activeLanguageModules"]>>([]);
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
  const [homeworkPendingId, setHomeworkPendingId] = useState<string | null>(null);
  const [weeklyHomeworkGate, setWeeklyHomeworkGate] = useState<WeeklyHomeworkGatePayload | null>(null);
  const [error, setError] = useState("");
  const [missingChildContext, setMissingChildContext] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [pendingAssignmentId, setPendingAssignmentId] = useState<string | null>(null);
  const [openingStore, setOpeningStore] = useState(false);
  const [bossAssignmentId, setBossAssignmentId] = useState<string | null>(null);
  const [bossLaunching, setBossLaunching] = useState(false);
  const [issuingCertificate, setIssuingCertificate] = useState(false);
  const [deferredPanelsLoadedFor, setDeferredPanelsLoadedFor] = useState<string | null>(null);
  const [panelActionMessage, setPanelActionMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    setMissingChildContext(false);
    setAuthRequired(false);
    setAcademicIntelligence(null);
    setSessionSummary(null);
    setLearningState(null);
    setProgression(null);
    setWeeklyHomeworkGate(null);
    setPanelActionMessage(null);
    try {
      const forceDashboardRefresh = typeof window !== "undefined"
        && new URLSearchParams(window.location.search).get("refresh") === "1";
      const summaryParam = requestedStudentId
        ? `studentId=${encodeURIComponent(requestedStudentId)}`
        : "";
      const refreshParam = forceDashboardRefresh ? "refresh=1" : "";
      const summaryQuery = [summaryParam, refreshParam].filter(Boolean).join("&");
      const summaryRes = await fetch(`/api/student/dashboard-summary${summaryQuery ? `?${summaryQuery}` : ""}`, { credentials: "include" });
      if (summaryRes.status === 401) {
        setAuthRequired(true);
        setError("Your session expired. Please sign in again.");
        return;
      }
      if (!summaryRes.ok) {
        throw new Error("Unable to confirm active learner profile.");
      }

      const summaryPayload = (await summaryRes.json().catch(() => null)) as DashboardSummaryPayload | null;
      if (!summaryPayload || typeof summaryPayload !== "object") {
        throw new Error("Unable to read dashboard summary.");
      }
      if (!summaryPayload.child?.id) {
        setMissingChildContext(true);
        setActiveChildId(null);
        setAcademicLoading(false);
        setAssignments([]);
        setActiveLanguageModules([]);
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
        setWeeklyHomeworkGate(null);
        setBossUnlocked(false);
        setBossPlayedToday(false);
        setBossAssignmentId(null);
        return;
      }

      setAssignments(summaryPayload.assignments ?? []);
      setActiveLanguageModules(Array.isArray(summaryPayload.activeLanguageModules) ? summaryPayload.activeLanguageModules : []);
      setSkills(Array.isArray(summaryPayload.skills) ? summaryPayload.skills : []);
      setBossUnlocked(false);
      setBossPlayedToday(false);
      setBossAssignmentId(null);
      setActiveChildId(summaryPayload.child.id);
      setDeferredPanelsLoadedFor(null);
      setAcademicLoading(true);

      if (summaryPayload.child) {
        setChildName(summaryPayload.child.name || "Learner");
        setStats({
          stars: summaryPayload.child.stars ?? 0,
          xp: summaryPayload.child.xp ?? 0,
          coins: summaryPayload.child.coins ?? 0,
          streak: summaryPayload.child.weekStreak ?? 0,
        });
        setDashboardTier(summaryPayload.child.dashboardTier ?? resolveDashboardTier({
          yearGroup: summaryPayload.child.yearGroup,
          ageYears: summaryPayload.child.ageYears,
          dateOfBirth: summaryPayload.child.dateOfBirth,
        }));
        if (summaryPayload.child.yearGroup) {
          setProfileContext({
            yearGroup: summaryPayload.child.yearGroup,
            ageGroup: ageGroupForYearGroup(summaryPayload.child.yearGroup),
            keyStage: summaryPayload.child.keyStage ?? keyStageForYearGroup(summaryPayload.child.yearGroup),
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [requestedStudentId]);

  useEffect(() => {
    if (loading || !activeChildId) return;
    if (deferredPanelsLoadedFor === activeChildId) return;

    let cancelled = false;
    const deferredStudentId = activeChildId;

    const timer = window.setTimeout(() => {
      async function loadDeferredPanels() {
        const studentParam = `studentId=${encodeURIComponent(deferredStudentId)}`;
        setAcademicLoading(true);
        setAcademicError("");

        try {
          const [sessionSummaryRes, academicIntelligenceRes, learningStateRes, bossStatusRes, ownedResponse] = await Promise.all([
            fetch(`/api/student/session-summary?${studentParam}`, { credentials: "include" }),
            fetch(`/api/student/academic-intelligence?${studentParam}`, { credentials: "include" }),
            fetch(`/api/student/learning-state?${studentParam}`, { credentials: "include" }),
            fetch("/api/student/boss-battle", { credentials: "include" }),
            fetch(`/api/shop/owned?childId=${encodeURIComponent(deferredStudentId)}`, { credentials: "include" }),
          ]);

          const [placementLevelsRes, placementLessonsRes, progressionRes, certificateEligibilityRes] = await Promise.all([
            fetch("/api/student/quick-level-finder/levels", { credentials: "include" }),
            fetch("/api/student/placement-lessons", { credentials: "include" }),
            fetch(`/api/student/progression/recommendations?${studentParam}`, { credentials: "include" }),
            certificateCenterEnabled
              ? fetch(`/api/student/certificates/eligibility?${studentParam}`, { credentials: "include" })
              : Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } })),
          ]);

          if (cancelled) return;
          if ([sessionSummaryRes, academicIntelligenceRes, learningStateRes, bossStatusRes, placementLevelsRes, placementLessonsRes, progressionRes, certificateEligibilityRes].some((res) => res.status === 401)) {
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
          const progressionPayload = progressionRes.ok
            ? ((await progressionRes.json()) as ProgressionPayload)
            : ({} as ProgressionPayload);
          const certificateEligibilityPayload = certificateEligibilityRes.ok
            ? ((await certificateEligibilityRes.json()) as CertificateEligibilityPayload)
            : ({} as CertificateEligibilityPayload);
          const academicPayload = academicIntelligenceRes.ok
            ? ((await academicIntelligenceRes.json()) as StudentAcademicIntelligencePayload)
            : null;
          const bossStatusPayload = bossStatusRes.ok
            ? ((await bossStatusRes.json()) as BossBattleStatusPayload)
            : ({ unlocked: false, alreadyPlayedToday: false, lessonAssignmentId: null } as BossBattleStatusPayload);

          setSessionSummary(sessionSummaryPayload.summary ?? null);
          setLearningState(learningStatePayload.learningState ?? null);
          setQuickLevelFinderRetestEnabled(learningStatePayload.quickLevelFinderRetestEnabled === true);
          setPlacementLevels(placementLevelsPayload.levels ?? null);
          setPlacementLessonGroups(Array.isArray(placementLessonsPayload.grouped) ? placementLessonsPayload.grouped : []);
          setPlacementContentGaps(Array.isArray(placementLessonsPayload.contentGaps) ? placementLessonsPayload.contentGaps : []);
          setProgression(progressionPayload ?? null);
          setCertificateEligibility(certificateEligibilityPayload ?? null);
          setBossUnlocked(Boolean(bossStatusPayload.unlocked));
          setBossPlayedToday(Boolean(bossStatusPayload.alreadyPlayedToday));
          setBossAssignmentId(typeof bossStatusPayload.lessonAssignmentId === "string" ? bossStatusPayload.lessonAssignmentId : null);

          if (academicPayload) {
            const state = learningStatePayload.learningState;
            if (state?.isFirstTimeStudent || !state?.hasAssessmentData) {
              setAcademicIntelligence(null);
            } else {
              setAcademicIntelligence(academicPayload);
            }
          } else {
            setAcademicIntelligence(null);
            setAcademicError("Unable to load Recovery Path right now.");
          }

          if (ownedResponse.ok) {
            const ownedPayload = (await ownedResponse.json()) as ShopOwnedPayload;
            setOwnedBadges((ownedPayload.owned ?? []).filter((item) => item.category === "badges"));
          }

          setDeferredPanelsLoadedFor(deferredStudentId);
        } catch {
          if (!cancelled) {
            setAcademicIntelligence(null);
            setAcademicError("Unable to load Recovery Path right now.");
          }
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
  }, [activeChildId, certificateCenterEnabled, deferredPanelsLoadedFor, loading]);

  useEffect(() => {
    if (loading || !activeChildId) return;

    let cancelled = false;

    async function loadWeeklyHomeworkGate() {
      try {
        const response = await fetchWithRefreshRetry(
          "/api/student/weekly-homework/gate?surface=new_learning_session",
          { credentials: "include" },
        );
        const payload = (await response.json()) as WeeklyHomeworkGatePayload;
        if (!cancelled) {
          setWeeklyHomeworkGate(payload);
        }
      } catch {
        if (!cancelled) {
          setWeeklyHomeworkGate(null);
        }
      }
    }

    void loadWeeklyHomeworkGate();

    return () => {
      cancelled = true;
    };
  }, [activeChildId, loading]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);
    return () => window.clearTimeout(timer);
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

  function openDashboardTarget(targetId: string): boolean {
    const panel = document.getElementById(targetId);
    if (!panel) return false;
    if (panel instanceof HTMLDetailsElement) panel.open = true;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }

  function openCatchUpPanel() {
    setPanelActionMessage(null);
    router.push("/student/recovery-path");
  }

  function openWeeklyHomeworkPanel() {
    setPanelActionMessage(null);
    if (!openDashboardTarget("weekly-homework-panel")) {
      setPanelActionMessage("No weekly homework ready yet.");
    }
  }

  function openCertificatePanel() {
    if (openDashboardTarget("certificate-progress-panel")) {
      setPanelActionMessage(null);
      return;
    }
    setPanelActionMessage("Certificate status is not ready yet.");
  }

  async function handleStudentHomeworkTaskAction(taskId: string, action: "start_homework" | "complete_homework") {
    setHomeworkPendingId(taskId);
    setAcademicError("");
    try {
      const response = await fetchWithRefreshRetry("/api/student/academic-intelligence/homework-tasks", {
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
      const studentParam = activeChildId ? `&studentId=${encodeURIComponent(activeChildId)}` : "";
      const response = await fetch(`/api/student/daily-journey?quick=1${studentParam}`, { credentials: "include" });
      const payload = (await response.json()) as DailyJourneyPayload;
      if (!response.ok) {
        if (response.status === 409 && payload && typeof payload === "object" && "code" in payload) {
          const code = (payload as { code?: string }).code;
          if (code === "ONBOARDING_REQUIRED") {
            router.push("/student/onboarding");
            return;
          }
          if (code === "HOMEWORK_GATE_BLOCKED") {
            throw new Error(WEEKLY_HOMEWORK_PENDING_MESSAGE);
          }
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
      const response = await fetchWithRefreshRetry("/api/student/certificates/issue", {
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
  const showWeeklyHomeworkCard = shouldShowHomeworkDashboardCard({
    featureEnabled: !loading && activeChildId ? (weeklyHomeworkGate?.featureEnabled ?? null) : null,
    blockNewLearningSession: weeklyHomeworkGate?.homeworkGate?.blockNewLearningSession === true,
    hasHomework: Boolean(weeklyHomeworkGate?.homework),
  });
  const weeklyHomeworkMessage = resolveHomeworkGateMessage({
    blockNewLearningSession: weeklyHomeworkGate?.homeworkGate?.blockNewLearningSession === true,
    reason: weeklyHomeworkGate?.reason,
  });
  const catchUpPendingCount = (academicIntelligence?.catchUpTasks ?? []).filter((task) => task.status !== "completed" && task.status !== "waived" && task.status !== "skipped").length;
  const catchUpTotalCount = academicIntelligence?.catchUpTasks?.length ?? 0;
  const catchUpCompletedCount = (academicIntelligence?.catchUpTasks ?? []).filter((task) => task.status === "completed").length;
  const catchUpCompletionPercent = catchUpTotalCount > 0
    ? Math.round((catchUpCompletedCount / catchUpTotalCount) * 100)
    : 0;
  const recoveryRingCircumference = 2 * Math.PI * 16;
  const recoveryRingDashOffset = recoveryRingCircumference * (1 - catchUpCompletionPercent / 100);
  const homeworkPendingCount = (academicIntelligence?.homeworkTasks ?? []).filter((task) => task.status !== "completed" && task.status !== "waived").length;
  const dashboardHomeworkTasks = (academicIntelligence?.homeworkTasks ?? []).slice(0, 4);
  const pendingRecoveryTasks = (academicIntelligence?.catchUpTasks ?? []).filter((task) => !["completed", "waived", "skipped"].includes(task.status));
  const recoveryReasonByRecommendationId = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of academicIntelligence?.catchUpRecommendations ?? []) {
      map.set(row.id, row.studentFriendlyReason ?? row.reason ?? "Targeted recovery task from your learning map.");
    }
    return map;
  }, [academicIntelligence?.catchUpRecommendations]);
  const recoveryPreviewTasks = pendingRecoveryTasks.slice(0, 2);
  const hiddenRecoveryCount = Math.max(0, pendingRecoveryTasks.length - recoveryPreviewTasks.length);
  const activeAssignmentCount = visibleAssignments.length;
  const certificateStatus = certificateEligibility?.summary?.status ?? null;
  const openCertificateByDefault = certificateStatus === "eligible" || certificateStatus === "issued";
  const primaryLanguageModule = activeLanguageModules[0] ?? null;
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
        learningTwin={academicIntelligence?.learningTwin ?? null}
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
          learningTwin={academicIntelligence?.learningTwin ?? null}
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
            {activeChildId ? (
              <div className="mb-6 flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700">
                  Student ID: <span className="ml-2 font-black text-slate-900">{formatStudentId(activeChildId)}</span>
                </div>
                {requestedStudentId ? (
                  <Link
                    href={`/admin/students/${encodeURIComponent(requestedStudentId)}`}
                    className="inline-flex rounded-2xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Return to Admin Portal
                  </Link>
                ) : null}
              </div>
            ) : null}

            {dashboardExperience ? (
              <div className="mb-6">
                {dashboardExperience}
              </div>
            ) : null}

            <section className="mb-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-600">Priority Summary</p>
                  <h2 className="mt-1 text-lg font-black text-slate-900">Today&apos;s top actions</h2>
                  <p className="mt-1 text-sm text-slate-600">Start with assigned lessons and pending support tasks, then expand lower-priority details when needed.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      // When there is a priority focus assignment, launch it directly (one-click path).
                      // Otherwise continue via the Recovery Path page.
                      if (focusAssignment) {
                        startAssignment(focusAssignment);
                        return;
                      }
                      openCatchUpPanel();
                    }}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
                  >
                    {focusAssignment ? "Start next lesson" : "Continue recovery path"}
                  </button>
                  <button
                    type="button"
                    onClick={openWeeklyHomeworkPanel}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
                  >
                    Weekly homework
                  </button>
                  <button
                    type="button"
                    onClick={openCertificatePanel}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
                  >
                    Certificate status
                  </button>
                </div>
              </div>
              {panelActionMessage ? (
                <p className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  {panelActionMessage}
                </p>
              ) : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Assigned now</p>
                  <p className="mt-1 text-lg font-black text-slate-900">{activeAssignmentCount}</p>
                  <p className="mt-1 text-xs text-slate-500">Your next assigned lessons and activities.</p>
                </div>
                <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.08em] text-cyan-700">Recovery pending</p>
                      <p className="mt-1 text-lg font-black text-cyan-900">{catchUpPendingCount}</p>
                    </div>
                    <div className="flex flex-col items-center">
                      <svg viewBox="0 0 40 40" className="h-10 w-10" aria-label="Recovery progress">
                        <circle cx="20" cy="20" r="16" className="fill-none stroke-cyan-100" strokeWidth="4" />
                        <circle
                          cx="20"
                          cy="20"
                          r="16"
                          className="fill-none stroke-cyan-600"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeDasharray={recoveryRingCircumference}
                          strokeDashoffset={recoveryRingDashOffset}
                          transform="rotate(-90 20 20)"
                        />
                      </svg>
                      <span className="text-[10px] font-bold text-cyan-800">{catchUpCompletionPercent}%</span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-cyan-800">Targeted support for topics where you need more confidence.</p>
                </div>
                <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.08em] text-violet-700">Homework pending</p>
                  <p className="mt-1 text-lg font-black text-violet-900">{homeworkPendingCount}</p>
                  <p className="mt-1 text-xs text-violet-800">Homework from this week&apos;s lessons.</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.08em] text-amber-700">Certificate</p>
                  <p className="mt-1 text-lg font-black text-amber-900">{certificateStatus?.replaceAll("_", " ") ?? "not ready"}</p>
                  <p className="mt-1 text-xs text-amber-800">Track when your learning evidence is ready.</p>
                </div>
              </div>
            </section>

            {primaryLanguageModule ? (
              <section className="mb-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Language Adventure</p>
                <h2 className="mt-1 text-lg font-black text-slate-900">{primaryLanguageModule.title}</h2>
                <p className="mt-1 text-sm text-slate-700">{primaryLanguageModule.description}</p>
                <p className="mt-2 text-xs font-bold uppercase tracking-[0.08em] text-emerald-800">
                  {primaryLanguageModule.activeAssignments} active assignment{primaryLanguageModule.activeAssignments === 1 ? "" : "s"}
                </p>
                <Link
                  href={primaryLanguageModule.href}
                  className="mt-3 inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-500"
                >
                  Open {primaryLanguageModule.title}
                </Link>
              </section>
            ) : null}

            {showWeeklyHomeworkCard ? (
              <section className="mb-6 rounded-3xl border border-violet-200 bg-violet-50/70 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Weekly Homework</p>
                    <h2 className="mt-1 text-lg font-black text-slate-900">Homework ready for this week</h2>
                    <p className="mt-1 text-sm font-semibold text-violet-900">{weeklyHomeworkMessage}</p>
                    <p className="mt-2 text-xs text-violet-700">{WEEKLY_HOMEWORK_SUPPORT_MESSAGE}</p>
                    {weeklyHomeworkGate?.homework ? (
                      <p className="mt-2 text-xs text-slate-600">
                        {weeklyHomeworkGate.homework.questions.length} question{weeklyHomeworkGate.homework.questions.length === 1 ? "" : "s"} for the week of {new Date(weeklyHomeworkGate.homework.weekStart).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        openWeeklyHomeworkPanel();
                      }}
                      className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-500"
                    >
                      Open homework
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        router.push("/student/recovery-path");
                      }}
                      className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-bold text-violet-700 hover:bg-violet-100"
                    >
                      Recovery path
                    </button>
                  </div>
                </div>
              </section>
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

            <section id="recovery-path-panel" className="mb-6 rounded-3xl border border-cyan-200 bg-cyan-50/70 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">Recovery Path</p>
                  <h2 className="mt-1 text-lg font-black text-slate-900">Focused support in one place</h2>
                  <p className="mt-1 text-sm text-cyan-900">Finish your top recovery actions here, then continue to the full Recovery Path for everything else.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => router.push("/student/recovery-path")}
                    className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-600"
                  >
                    Continue Recovery Path
                  </button>
                  {learningState?.coachUnlocked ? (
                    <button
                      type="button"
                      onClick={() => router.push("/student/recovery-path?view=coach")}
                      className="rounded-xl border border-cyan-200 bg-white px-4 py-2 text-sm font-bold text-cyan-800 hover:bg-cyan-100"
                    >
                      Ask Coach first
                    </button>
                  ) : null}
                </div>
              </div>

              {learningState?.isFirstTimeStudent ? (
                <div className="mt-3 rounded-2xl border border-cyan-200 bg-white/70 p-4 text-sm text-cyan-900">
                  Recovery Path unlocks after your Quick Level Finder and first learning activities.
                </div>
              ) : null}

              {academicLoading ? (
                <div className="mt-3 space-y-2">
                  <p className="text-sm font-semibold text-cyan-800">Loading Recovery Path...</p>
                  <div className="h-12 animate-pulse rounded-2xl bg-cyan-100" />
                  <div className="h-12 animate-pulse rounded-2xl bg-cyan-100" />
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
              ) : recoveryPreviewTasks.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <p className="font-semibold">No recovery tasks pending right now.</p>
                  <p className="mt-1">You are on track. Keep going.</p>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {recoveryPreviewTasks.map((task) => {
                    const reason = recoveryReasonByRecommendationId.get(task.recommendationId) ?? "Targeted recovery task from your learning map.";
                    const severityChips = resolveRecoverySeverityChips({
                      status: task.status,
                      reason,
                      priority: task.priority,
                      dueDate: task.dueDate,
                    });
                    return (
                      <div key={task.taskId} className="rounded-2xl border border-cyan-200 bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-bold text-slate-900">{task.title}</p>
                          <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-bold text-cyan-700">
                            {task.status.replaceAll("_", " ")}
                          </span>
                        </div>
                        <p className="mt-1 text-xs uppercase tracking-[0.08em] text-slate-500">
                          {task.subject} {task.topic ? `• ${task.topic}` : ""} • {task.estimatedMinutes} min
                        </p>
                        <p className="mt-2 text-sm text-slate-700">{reason}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {severityChips.map((chip) => (
                            <span key={chip.key} className={`rounded-full px-2 py-0.5 text-xs font-bold ${chip.className}`}>
                              {chip.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {hiddenRecoveryCount > 0 ? (
                    <p className="text-xs font-semibold text-cyan-800">+{hiddenRecoveryCount} more inside Recovery Path.</p>
                  ) : null}
                </div>
              )}
            </section>

            <details id="weekly-homework-panel" className="mb-6 rounded-3xl border border-violet-200 bg-violet-50/70 p-5">
              <summary className="cursor-pointer list-none text-xs font-black uppercase tracking-[0.18em] text-violet-700">
                Weekly Homework Details (expand)
              </summary>
              <div className="mt-3 space-y-4">
                <div className="rounded-2xl border border-violet-200 bg-white/80 p-4">
                  <p className="text-sm font-bold text-slate-900">This week&apos;s homework</p>
                  {dashboardHomeworkTasks.length > 0 ? (
                    <div className="mt-3 space-y-3">
                      {dashboardHomeworkTasks.map((task) => {
                        const dueDate = task.dueDate ? new Date(task.dueDate) : null;
                        const dueLabel = task.status === "overdue"
                          ? "Overdue"
                          : dueDate && !Number.isNaN(dueDate.getTime())
                            ? `Due ${dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                            : "No due date";
                        const canStart = task.status === "assigned" || task.status === "overdue";
                        const canComplete = task.status === "in_progress";

                        return (
                          <div key={task.taskId} className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-3 text-sm text-slate-700">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-bold text-slate-900">{task.title}</p>
                                <p className="mt-1 text-xs text-slate-600">
                                  {task.subject ?? "General"}
                                  {task.topic ? ` · ${task.topic}` : ""}
                                  {` · ${task.estimatedMinutes} min`}
                                </p>
                              </div>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${task.status === "overdue" ? "bg-rose-100 text-rose-700" : "bg-violet-100 text-violet-700"}`}>
                                {dueLabel}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {canStart ? (
                                <button
                                  type="button"
                                  disabled={homeworkPendingId === task.taskId}
                                  onClick={async () => {
                                    const target = resolveHomeworkStartTarget(task);
                                    setHomeworkPendingId(task.taskId);
                                    setAcademicError("");
                                    try {
                                      const response = await fetchWithRefreshRetry("/api/student/academic-intelligence/homework-tasks", {
                                        method: "POST",
                                        credentials: "include",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ taskId: task.taskId, action: "start_homework" }),
                                      });

                                      if (!response.ok) {
                                        const payload = await response.json().catch(() => null) as { error?: string } | null;
                                        throw new Error(payload?.error ?? "Unable to update homework task.");
                                      }

                                      if (target.kind === "route") {
                                        router.push(target.href);
                                        return;
                                      }

                                      setPanelActionMessage(target.message);
                                    } catch (err) {
                                      setAcademicError(err instanceof Error ? err.message : "Unable to update homework task.");
                                    } finally {
                                      setHomeworkPendingId(null);
                                    }
                                  }}
                                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                                >
                                  Start
                                </button>
                              ) : null}
                              {canComplete ? (
                                <button
                                  type="button"
                                  disabled={homeworkPendingId === task.taskId}
                                  onClick={() => void handleStudentHomeworkTaskAction(task.taskId, "complete_homework")}
                                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                                >
                                  Complete
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-xl border border-dashed border-violet-200 bg-violet-50 px-3 py-3 text-sm text-violet-900">
                      No weekly homework ready yet.
                    </p>
                  )}
                </div>

                {weeklyHomeworkGate?.homework ? <WeeklyHomeworkPanel /> : null}
              </div>
            </details>

            {progression && (Array.isArray(progression.recommendations) ? progression.recommendations.length > 0 : Boolean(progression.message)) ? (
              <details className="mb-6 rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5">
                <summary className="cursor-pointer list-none text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
                  Subject Progression (expand)
                </summary>
                <div className="mt-3">
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
                </div>
              </details>
            ) : null}

            {certificateCenterEnabled && certificateEligibility && (certificateEligibility.summary || certificateEligibility.message) ? (
              <details id="certificate-progress-panel" open={openCertificateByDefault} className="mb-6 rounded-3xl border border-amber-200 bg-amber-50/70 p-5">
                <summary className="cursor-pointer list-none text-xs font-black uppercase tracking-[0.18em] text-amber-700">
                  Certificate Progress (expand)
                </summary>
                <div className="mt-3">
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
                </div>
              </details>
            ) : null}

            {!certificateCenterEnabled ? (
              <details id="certificate-progress-panel" className="mb-6 rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                <summary className="cursor-pointer list-none text-xs font-black uppercase tracking-[0.18em] text-slate-600">
                  Certificates (expand)
                </summary>
                <div className="mt-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-600">Certificates</p>
                <p className="mt-2 text-sm font-semibold text-slate-800">Certificate center is coming soon.</p>
                <p className="mt-1 text-sm text-slate-700">We are finalising student-facing certificate flows for launch safety.</p>
                </div>
              </details>
            ) : null}

          </div>
        )}
      </section>
    </main>
  );
}
