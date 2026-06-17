"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import AdminStatCard from "@/components/admin/AdminStatCard";
import CurriculumMasteryMap from "@/components/academic-intelligence/CurriculumMasteryMap";
import { buildAiGeneratorUrl } from "@/lib/admin-ai-generator-url";
import { mapHeartbeatActionButton, toHeartbeatDecisionViewModel } from "@/lib/academic-intelligence/heartbeatActionMap";
import type { CoachHeartbeatSignalSummary, CoverageEntry, HeartbeatDecision, SchoolWeekday } from "@/lib/academic-intelligence/types";
import { keyStageForYearGroup } from "@/lib/curriculum";
import type { UniversalAiPrefillContract } from "@/lib/ai-prefill-contract";
import { formatStudentId } from "@/lib/student-id";

type StudentDetail = {
  id: string;
  name: string;
  age: number | null;
  yearGroup: string | null;
  level: number;
  selectedVoice: string;
  studentProfile: {
    dateOfBirth: string | null;
    keyStageLevel: string | null;
    learningLevel: string | null;
    senSupportNeeds: string | null;
    readingLevel: string | null;
    weakAreasText: string | null;
    voiceProfile: string | null;
    curriculumPathway?: string | null;
    examBoard?: string | null;
    gcseSubjects?: string[];
    targetGrades?: Record<string, string>;
    guardianPermissions: string | null;
    schoolInformation: string | null;
    subjectFocus: string | null;
  } | null;
  stars: number;
  xp: number;
  coins: number;
  streak: number;
  accuracy: number | null;
  totalSessions: number;
  recommendedNextActivity: string;
  quickLevelFinder?: {
    completed?: boolean;
    status?: "in_progress" | "completed" | null;
    responseCount?: number;
    totalQuestions?: number;
    levels?: Record<string, { accuracy: number; level: "below" | "secure" | "advanced" }>;
  };
  learningDataState?: {
    state:
      | "new_no_activity"
      | "qlf_completed_no_activity"
      | "active_with_qlf"
      | "active_without_qlf_legacy"
      | "insufficient_evidence"
      | "inconsistent_profile_needs_review";
    checklistStatus: "pass" | "warning" | "fail";
    headline: string;
    detail: string;
    reviewRecommended: boolean;
  };
  adaptiveTutor?: {
    enoughHistory?: boolean;
    readinessLabel?: string;
    fallbackMessage?: string | null;
    totalAttempts?: number;
    confidenceTrend?: number;
    frustrationRisk?: number;
    updatedAt?: string;
  };
  recentLevelDecisions: { ts: string; subject: string; previousLevel: number; nextLevel: number; confidenceScore: number; reasons: string[] }[];
  walletSummary: {
    balance: number;
    totalEarned: number;
    totalSpent: number;
    recentActivity: { id: string; type: string; amount: number; source: string; reason: string | null; itemId: string | null; balanceBefore: number; balanceAfter: number; createdAt: string; metadata: { itemName?: string; activityName?: string; category?: string; failureCode?: string } | null }[];
    earnedBySource: { source: string; amount: number }[];
    spentByItem: { itemId: string; amount: number; count: number; itemName: string | null }[];
  };
  ownedItems: { id: string; name: string; category: string; equipped: boolean; purchasedAt: string }[];
  walletTransactions: { id: string; type: string; amount: number; source: string; itemId: string | null; reason: string | null; balanceBefore: number; balanceAfter: number; createdAt: string; metadata: { itemName?: string; activityName?: string; category?: string; failureCode?: string } | null }[];
  parent: { id: string; name: string | null; email: string };
  progressRecords: { id: string; activityType: string; activityName: string; correct: boolean | null; accuracy: number | null; completed: boolean; createdAt: string }[];
  attempts: { id: string; subject: string; spellingMode?: string | null; skillFocus: string; correct: boolean; responseTimeMs: number; hintsUsed: number; difficulty: number; createdAt: string }[];
  modeStruggles: { mode: string; accuracy: number; total: number }[];
  weakAreas: { id: string; subject: string; keyStage: string | null; yearGroup: string | null; skillFocus: string; weaknessType: string; accuracy: number; attemptsCount: number; currentDifficulty: number; status: string; lastDetectedAt: string; interventionLaunchedAt: string | null; interventionCompletedAt: string | null; interventionImprovementPct: number | null }[];
};

type AdminAcademicIntelligencePayload = {
  summary: {
    totalTopics: number;
    needsCatchUpCount: number;
    needsRevisionCount: number;
    coveredCount: number;
    averageScore: number;
  };
  curriculumCoverage?: CoverageEntry[];
  catchUpRecommendations: Array<{
    id: string;
    title: string;
    subject: string;
    topic?: string | null;
    reason: string;
    status: string;
    priority: string;
  }>;
  assessmentRecommendations: Array<{
    assessmentType: string;
    subject: string;
    topic?: string | null;
    readinessStatus: string;
    reason: string;
  }>;
  gcseReadiness: {
    applicable: boolean;
    readinessStatus: string;
    examBoard?: string | null;
    coverageGapCount: number;
  } | null;
  schoolWeekModePlan?: {
    enabled: boolean;
    strategy: string;
    totalEstimatedMinutes: number;
    dailySchedules: Array<{
      day: SchoolWeekday;
      totalMinutes: number;
      blocks: Array<{
        blockId: string;
        title: string;
        startTime: string;
        endTime: string;
      }>;
    }>;
  };
  heartbeatDecision?: HeartbeatDecision | null;
  coachHeartbeatSignals?: CoachHeartbeatSignalSummary | null;
  homeworkTasks?: Array<{
    taskId: string;
    blockId: string;
    title: string;
    subject?: string | null;
    topic?: string | null;
    status: "assigned" | "in_progress" | "completed" | "waived" | "overdue";
    estimatedMinutes: number;
    dueDate?: string | null;
    scheduledDay?: SchoolWeekday | null;
  }>;
  reviewActions: Array<{ action: string; label: string; persistenceSupported: boolean; message: string }>;
};

type SchoolWeekSettingsPayload = {
  enabled: boolean;
  activeDays: SchoolWeekday[];
  startTime: string;
  endTime: string;
  lessonBlockMinutes: number;
  shortBreakMinutes: number;
  lunchMinutes: number;
  dailySubjectLimit: number;
  weeklySubjectSelection: string[];
  includeCatchUpTasks: boolean;
  includeRevisionBlocks: boolean;
  includeHomeworkBlock: boolean;
  includeQuizReviewBlock: boolean;
  includeWellbeingBlock: boolean;
  includeEndOfDaySummary: boolean;
  parentAdminNotes?: string | null;
};

type DashboardAssignmentItem = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  content: {
    id: string;
    contentType: string;
    topic: string;
    skillFocus: string | null;
    level: number;
  };
};

type DashboardCatchUpTaskItem = {
  taskId: string;
  title: string;
  subject: string;
  topic?: string | null;
  status: string;
  priority: string;
  dueDate?: string | null;
};

type DashboardHomeworkTaskItem = {
  taskId: string;
  title: string;
  subject?: string | null;
  topic?: string | null;
  status: string;
  dueDate?: string | null;
};

type DashboardContentPayload = {
  assignments: DashboardAssignmentItem[];
  catchUpTasks: DashboardCatchUpTaskItem[];
  homeworkTasks: DashboardHomeworkTaskItem[];
};

type ChecklistStatus = "pass" | "warning" | "fail";

type ChecklistItem = {
  key: string;
  label: string;
  status: ChecklistStatus;
  detail: string;
};

/** Derives the expected UK school year group from a date of birth. */
function ukYearGroupFromDob(dob: Date): string | null {
  const today = new Date();
  const SEPT = 8; // September is month index 8 (0-based)
  // Current academic year started in September of 'schoolYearStart'
  const schoolYearStart = today.getMonth() < SEPT ? today.getFullYear() - 1 : today.getFullYear();
  // Birthday falls before September 1 in the year?
  const birthdayBeforeSept = dob.getMonth() < SEPT || (dob.getMonth() === SEPT && dob.getDate() === 1);
  let ageAtSchoolStart = schoolYearStart - dob.getFullYear();
  if (!birthdayBeforeSept) ageAtSchoolStart -= 1;
  // Reception is age 4; Year N is age 4+N
  const yearGroupNum = ageAtSchoolStart - 4;
  if (yearGroupNum < 0) return null;
  if (yearGroupNum === 0) return "Reception";
  if (yearGroupNum >= 1 && yearGroupNum <= 11) return `Year ${yearGroupNum}`;
  return null;
}

type AdminProgressionPayload = {
  ok?: boolean;
  message?: string;
  summary?: {
    total: number;
    needsSupport: number;
    readyToAdvance: number;
    reviewNeeded: number;
    friendlyHeadline: string;
  };
  recommendations?: Array<{
    scopedSubject: string;
    subject: string;
    strand: string | null;
    currentLevel: number;
    recommendedLevel: number;
    status: string;
    action: string;
    confidence: number;
    nextBestStep: string;
    reasons: string[];
    adminAppliedLevel?: number | null;
    adminAppliedAt?: string | null;
    adminAppliedBy?: string | null;
  }>;
  generationTargets?: Array<{
    scopedSubject: string;
    subject: string;
    strand: string | null;
    yearGroup: string | null;
    keyStage: string | null;
    studentYearGroup?: string | null;
    studentKeyStage?: string | null;
    targetLearningYearGroup?: string | null;
    targetLearningKeyStage?: string | null;
    subjectLevel?: number | null;
    strandLevel?: number | null;
    levelSource?: string | null;
    skillFocus: string;
    difficulty: number;
    accuracy: number;
    reason: string;
    prefillContract?: UniversalAiPrefillContract;
  }>;
  autoPromotion?: {
    appliedCount?: number;
    applied?: Array<{
      scopedSubject: string;
      previousLevel: number | null;
      promotedToLevel: number;
      confidence: number;
      reason: string;
    }>;
    evaluations?: Array<{
      scopedSubject: string;
      status: "applied" | "blocked";
      recommendedLevel: number;
      currentLevel: number;
      confidence: number;
      candidateStreak: number;
      gateFailures: string[];
      latestMasteryCheckStatus: "missing" | "completed" | "not_completed";
      cooldownActive: boolean;
    }>;
  };
};

const SCHOOL_WEEK_DAYS: SchoolWeekday[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const defaultSchoolWeekSettings: SchoolWeekSettingsPayload = {
  enabled: true,
  activeDays: [...SCHOOL_WEEK_DAYS],
  startTime: "16:00",
  endTime: "19:00",
  lessonBlockMinutes: 35,
  shortBreakMinutes: 10,
  lunchMinutes: 30,
  dailySubjectLimit: 2,
  weeklySubjectSelection: [],
  includeCatchUpTasks: true,
  includeRevisionBlocks: true,
  includeHomeworkBlock: true,
  includeQuizReviewBlock: true,
  includeWellbeingBlock: false,
  includeEndOfDaySummary: true,
  parentAdminNotes: null,
};

type StudentFocusTarget = "qlf-baseline" | "attempts" | "weak-areas";

const studentFocusTargets = new Set<string>(["qlf-baseline", "attempts", "weak-areas"]);
const qlfBaselineInstructions = "Please log in to StarLiz Academy, open the Student Dashboard, and select Start My Level Finder to complete the Quick Level Finder baseline.";

function isStudentFocusTarget(value: string | null): value is StudentFocusTarget {
  return Boolean(value && studentFocusTargets.has(value));
}

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const focus = searchParams.get("focus");
  const showDevAttemptSeeding = process.env.NODE_ENV !== "production";
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [auditFilter, setAuditFilter] = useState<"all" | "earn" | "spend" | "failed" | "equip">("all");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustMessage, setAdjustMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [academicIntelligence, setAcademicIntelligence] = useState<AdminAcademicIntelligencePayload | null>(null);
  const [academicLoading, setAcademicLoading] = useState(true);
  const [academicError, setAcademicError] = useState<string | null>(null);
  const [schoolWeekSettings, setSchoolWeekSettings] = useState<SchoolWeekSettingsPayload>(defaultSchoolWeekSettings);
  const [schoolWeekSaving, setSchoolWeekSaving] = useState(false);
  const [schoolWeekMessage, setSchoolWeekMessage] = useState<string | null>(null);
  const [quickLevelFinderRetestEnabled, setQuickLevelFinderRetestEnabled] = useState(false);
  const [quickLevelFinderCompleted, setQuickLevelFinderCompleted] = useState(false);
  const [quickLevelFinderResponses, setQuickLevelFinderResponses] = useState(0);
  const [quickLevelFinderSaving, setQuickLevelFinderSaving] = useState(false);
  const [quickLevelFinderMessage, setQuickLevelFinderMessage] = useState<string | null>(null);
  const [quickLevelFinderInstructionMessage, setQuickLevelFinderInstructionMessage] = useState<string | null>(null);
  const [progression, setProgression] = useState<AdminProgressionPayload | null>(null);
  const [progressionLoading, setProgressionLoading] = useState(true);
  const [progressionError, setProgressionError] = useState<string | null>(null);
  const [progressionActionPendingId, setProgressionActionPendingId] = useState<string | null>(null);
  const [progressionActionMessage, setProgressionActionMessage] = useState<string | null>(null);
  const [dashboardContent, setDashboardContent] = useState<DashboardContentPayload | null>(null);
  const [dashboardContentLoading, setDashboardContentLoading] = useState(true);
  const [dashboardContentError, setDashboardContentError] = useState<string | null>(null);
  const [dashboardContentMessage, setDashboardContentMessage] = useState<string | null>(null);
  const [dashboardContentBusyKey, setDashboardContentBusyKey] = useState<string | null>(null);

  async function loadStudent() {
    const response = await fetch(`/api/admin/students/${params.id}`);
    if (!response.ok) {
      setStudent(null);
      setQuickLevelFinderCompleted(false);
      setQuickLevelFinderResponses(0);
      return;
    }

    const payload = (await response.json()) as { student?: StudentDetail | null };
    const nextStudent = payload.student ?? null;
    setStudent(nextStudent);
    setQuickLevelFinderCompleted(nextStudent?.quickLevelFinder?.completed === true);
    setQuickLevelFinderResponses(nextStudent?.quickLevelFinder?.responseCount ?? 0);
  }

  async function loadAcademicIntelligence() {
    await Promise.resolve();
    setAcademicLoading(true);
    setAcademicError(null);
    const response = await fetch(`/api/admin/academic-intelligence?studentId=${params.id}`);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setAcademicError(payload?.error ?? "Unable to load academic intelligence.");
      setAcademicIntelligence(null);
      setAcademicLoading(false);
      return;
    }
    const payload = (await response.json()) as AdminAcademicIntelligencePayload;
    setAcademicIntelligence(payload);
    setAcademicLoading(false);
  }

  async function loadSchoolWeekSettings() {
    const response = await fetch(`/api/admin/students/${params.id}/school-week-settings`);
    if (!response.ok) {
      setSchoolWeekSettings(defaultSchoolWeekSettings);
      return;
    }
    const payload = (await response.json()) as { settings?: SchoolWeekSettingsPayload };
    setSchoolWeekSettings(payload.settings ?? defaultSchoolWeekSettings);
  }

  async function loadQuickLevelFinderControl() {
    const response = await fetch(`/api/admin/students/${params.id}/quick-level-finder/retest`);
    if (!response.ok) {
      setQuickLevelFinderRetestEnabled(false);
      return;
    }
    const payload = (await response.json()) as {
      retestEnabled?: boolean;
    };
    setQuickLevelFinderRetestEnabled(payload.retestEnabled === true);
  }

  async function loadProgressionRecommendations() {
    setProgressionLoading(true);
    setProgressionError(null);
    const response = await fetch(`/api/admin/students/${params.id}/progression-recommendations`);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      setProgression(null);
      setProgressionError(payload?.error ?? payload?.message ?? "Unable to load progression recommendations.");
      setProgressionLoading(false);
      return;
    }
    const payload = (await response.json()) as AdminProgressionPayload;
    setProgression(payload);
    setProgressionLoading(false);
  }

  async function loadDashboardContent() {
    setDashboardContentLoading(true);
    setDashboardContentError(null);
    const response = await fetch(`/api/admin/students/${params.id}/dashboard-content`);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setDashboardContent(null);
      setDashboardContentError(payload?.error ?? "Unable to load removable dashboard content.");
      setDashboardContentLoading(false);
      return;
    }
    const payload = (await response.json()) as DashboardContentPayload;
    setDashboardContent(payload);
    setDashboardContentLoading(false);
  }

  async function removeDashboardContent(input: {
    contentType: "assignment" | "catch_up" | "homework";
    itemId: string;
    label: string;
  }) {
    setDashboardContentMessage(null);
    setDashboardContentBusyKey(`${input.contentType}:${input.itemId}`);
    const response = await fetch(`/api/admin/students/${params.id}/dashboard-content`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: input.contentType, itemId: input.itemId }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setDashboardContentMessage(payload?.error ?? "Unable to remove dashboard content.");
      setDashboardContentBusyKey(null);
      return;
    }
    setDashboardContentMessage(`Removed ${input.label} from this learner dashboard.`);
    await loadDashboardContent();
    await loadAcademicIntelligence();
    setDashboardContentBusyKey(null);
  }

  async function applySubjectLevelRecommendation(input: {
    scopedSubject: string;
    recommendedLevel: number;
    confidence: number;
    reasons: string[];
    action: "apply" | "revert";
  }) {
    setProgressionActionPendingId(input.scopedSubject);
    setProgressionActionMessage(null);
    const response = await fetch(`/api/admin/students/${params.id}/progression-recommendations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setProgressionActionMessage(payload?.error ?? "Unable to apply recommendation.");
      setProgressionActionPendingId(null);
      return;
    }
    setProgressionActionMessage(input.action === "apply"
      ? "Suggested level applied."
      : "Applied level override reverted.");
    await loadProgressionRecommendations();
    setProgressionActionPendingId(null);
  }

  async function toggleQuickLevelFinderRetest(enabled: boolean) {
    setQuickLevelFinderSaving(true);
    setQuickLevelFinderMessage(null);
    const response = await fetch(`/api/admin/students/${params.id}/quick-level-finder/retest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      retestEnabled?: boolean;
      completed?: boolean;
      responseCount?: number;
    } | null;
    if (!response.ok) {
      setQuickLevelFinderMessage(payload?.error ?? "Unable to update Level Finder retest setting.");
      setQuickLevelFinderSaving(false);
      return;
    }
    setQuickLevelFinderRetestEnabled(payload?.retestEnabled === true);
    await loadStudent();
    setQuickLevelFinderMessage(enabled
      ? "Level Finder retest is now enabled for this learner."
      : "Level Finder retest is now disabled.");
    setQuickLevelFinderSaving(false);
  }

  async function copyQuickLevelFinderInstructions() {
    setQuickLevelFinderInstructionMessage(null);
    try {
      await navigator.clipboard.writeText(qlfBaselineInstructions);
      setQuickLevelFinderInstructionMessage("Student instructions copied.");
    } catch {
      setQuickLevelFinderInstructionMessage(qlfBaselineInstructions);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStudent();
    void loadAcademicIntelligence();
    void loadSchoolWeekSettings();
    void loadQuickLevelFinderControl();
    void loadProgressionRecommendations();
    void loadDashboardContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    if (!student || !isStudentFocusTarget(focus)) return;
    const element = document.getElementById(focus);
    if (!element) return;

    const highlightClasses = [
      "ring-2",
      "ring-cyan-300",
      "ring-offset-2",
      "ring-offset-slate-950",
      "bg-cyan-500/10",
    ];

    const scrollTimer = window.setTimeout(() => {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add(...highlightClasses);
    }, 100);
    const clearTimer = window.setTimeout(() => {
      element.classList.remove(...highlightClasses);
    }, 3000);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
      element.classList.remove(...highlightClasses);
    };
  }, [focus, student]);

  async function saveSchoolWeekSettings() {
    setSchoolWeekSaving(true);
    setSchoolWeekMessage(null);
    const response = await fetch(`/api/admin/students/${params.id}/school-week-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schoolWeekSettings),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string; settings?: SchoolWeekSettingsPayload } | null;
    if (!response.ok) {
      setSchoolWeekMessage(payload?.error ?? "Unable to save school week settings.");
      setSchoolWeekSaving(false);
      return;
    }
    if (payload?.settings) {
      setSchoolWeekSettings(payload.settings);
    }
    await loadAcademicIntelligence();
    setSchoolWeekMessage("School week controls saved.");
    setSchoolWeekSaving(false);
  }

  async function seedAttempts(mode: "low" | "high") {
    const response = await fetch(`/api/admin/students/${params.id}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, skillFocus: "Silent e" }),
    });
    const payload = await response.json();
    setSeedMessage(response.ok ? payload.message : payload.error ?? "Could not seed attempts.");
    await loadStudent();
  }

  async function submitWalletAdjustment() {
    const parsed = parseInt(adjustAmount, 10);
    if (Number.isNaN(parsed) || parsed === 0) {
      setAdjustMessage({ ok: false, text: "Enter a non-zero integer amount (e.g. 10 or -5)." });
      return;
    }
    if (!adjustReason.trim()) {
      setAdjustMessage({ ok: false, text: "Reason is required." });
      return;
    }
    setAdjusting(true);
    setAdjustMessage(null);
    const response = await fetch("/api/admin/wallet/adjust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childId: params.id, amount: parsed, reason: adjustReason.trim() }),
    });
    const payload = await response.json();
    setAdjusting(false);
    if (!response.ok) {
      setAdjustMessage({ ok: false, text: payload.error ?? "Adjustment failed." });
      return;
    }
    setAdjustMessage({ ok: true, text: `Done — new balance: ${payload.newBalance} coins.` });
    setAdjustAmount("");
    setAdjustReason("");
    await loadStudent();
  }

  if (!student) {
    return <AdminSectionCard title="Student Profile"><p className="text-sm text-slate-400">Loading student...</p></AdminSectionCard>;
  }

  const canonicalKeyStage = student.yearGroup ? keyStageForYearGroup(student.yearGroup) : null;
  const onboardingKeyStage = student.studentProfile?.keyStageLevel ?? null;
  const keyStageMismatch = Boolean(canonicalKeyStage && onboardingKeyStage && canonicalKeyStage !== onboardingKeyStage);
  const filteredWalletTransactions = student.walletTransactions.filter((entry) => auditFilter === "all" ? true : entry.type === auditFilter);
  const hasPlacementLevels = Object.keys(student.quickLevelFinder?.levels ?? {}).length > 0;
  const qlfBaselineMissing = !quickLevelFinderCompleted || !hasPlacementLevels;
  const hasLessonSignals = student.totalSessions > 0 || student.progressRecords.length > 0 || student.attempts.length > 0;
  const generationTargetsCount = progression?.generationTargets?.length ?? 0;
  const hasGenerationTargetSignals = generationTargetsCount > 0;
  const progressionRecommendationCount = progression?.recommendations?.length ?? 0;
  const academicRecommendationCount = (academicIntelligence?.catchUpRecommendations.length ?? 0)
    + (academicIntelligence?.assessmentRecommendations.length ?? 0);
  const totalRecommendationSignals = progressionRecommendationCount + academicRecommendationCount;
  const hasRecommendationSignals = totalRecommendationSignals > 0;
  const hasFirstLearningPathEvidence = hasLessonSignals || hasGenerationTargetSignals;
  const qlfChecklistStatus: ChecklistStatus = quickLevelFinderCompleted
    ? "pass"
    : student.learningDataState?.checklistStatus === "warning"
      ? "warning"
      : "fail";
  const qlfChecklistDetail = quickLevelFinderCompleted
    ? `Completed with ${quickLevelFinderResponses} response${quickLevelFinderResponses === 1 ? "" : "s"}.`
    : student.learningDataState
      ? `${student.learningDataState.headline}: ${student.learningDataState.detail}`
      : "Not completed yet.";

  const adminHealthChecklist: ChecklistItem[] = [
    {
      key: "qlf",
      label: "Quick Level Finder completion",
      status: qlfChecklistStatus,
      detail: qlfChecklistDetail,
    },
    {
      key: "placement",
      label: "Placement levels captured",
      status: hasPlacementLevels ? "pass" : quickLevelFinderCompleted ? "warning" : "fail",
      detail: hasPlacementLevels
        ? `${Object.keys(student.quickLevelFinder?.levels ?? {}).length} subject/strand placement signal(s) available.`
        : "No subject-level placements available yet.",
    },
    {
      key: "recommendation-signals",
      label: "Recommendation signals ready",
      status: hasRecommendationSignals ? "pass" : quickLevelFinderCompleted ? "warning" : "fail",
      detail: hasRecommendationSignals
        ? `${totalRecommendationSignals} recommendation signal${totalRecommendationSignals === 1 ? "" : "s"} ready for admin review.`
        : "No recommendation signals yet. Complete more activity to unlock next-step guidance.",
    },
    {
      key: "first-path",
      label: "First learning path available",
      status: hasFirstLearningPathEvidence
        ? "pass"
        : hasRecommendationSignals
          ? "warning"
          : quickLevelFinderCompleted
            ? "warning"
            : "fail",
      detail: hasFirstLearningPathEvidence
        ? hasGenerationTargetSignals
          ? `${generationTargetsCount} generation target${generationTargetsCount === 1 ? "" : "s"} ready for assignment.`
          : "Lesson and assignment activity evidence detected."
        : hasRecommendationSignals
          ? "Recommendations are ready, but no live learning path is active yet. Assign or generate the first path to move this to pass."
          : "No first learning path evidence yet. Review approved content and assignment feed.",
    },
    {
      key: "adaptive",
      label: "Adaptive / catch-up signal readiness",
      status: student.adaptiveTutor?.enoughHistory
        ? "pass"
        : quickLevelFinderCompleted
          ? "warning"
          : "fail",
      detail: student.adaptiveTutor?.enoughHistory
        ? "Adaptive tutor has enough history for stable learning DNA."
        : "Baseline exists, but more activity is needed for stronger adaptive confidence.",
    },
    {
      key: "heartbeat",
      label: "HEART BEAT engine link",
      status: "pass",
      detail: "Use Open HEART BEAT Engine to inspect system, student, and decision layers.",
    },
    ...(keyStageMismatch ? [{
      key: "ks-mismatch",
      label: "Key stage mismatch",
      status: "warning" as ChecklistStatus,
      detail: `Student year group (${student.yearGroup ?? "not set"}) maps to ${canonicalKeyStage}, but the onboarding profile has ${onboardingKeyStage}. Edit the student profile to correct the key stage.`,
    }] : []),
    ...((() => {
      const dobStr = student.studentProfile?.dateOfBirth ?? null;
      if (!dobStr || !student.yearGroup) return [];
      const derivedYear = ukYearGroupFromDob(new Date(dobStr));
      if (!derivedYear || derivedYear === student.yearGroup) return [];
      return [{
        key: "dob-year-group",
        label: "Year group vs date of birth",
        status: "warning" as ChecklistStatus,
        detail: `Stored year group is ${student.yearGroup}, but DOB (${new Date(dobStr).toLocaleDateString()}) suggests ${derivedYear}. Edit the student profile to correct the year group and key stage so AI generation targets the right curriculum level.`,
      }];
    })()),
  ];

  const failCount = adminHealthChecklist.filter((item) => item.status === "fail").length;
  const warningCount = adminHealthChecklist.filter((item) => item.status === "warning").length;
  const overallChecklistStatus: ChecklistStatus = failCount > 0 ? "fail" : warningCount > 0 ? "warning" : "pass";
  const checklistTone = overallChecklistStatus === "pass"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
    : overallChecklistStatus === "warning"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
      : "border-rose-500/30 bg-rose-500/10 text-rose-100";

  return (
    <div className="space-y-6">
      <AdminSectionCard
        title={student.name}
        eyebrow="Student profile"
        action={<Link href={`/admin/students/${student.id}/edit`} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white">Edit Student</Link>}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard title="Accuracy" value={student.accuracy !== null ? `${student.accuracy}%` : "No data"} icon="%" tone="amber" />
          <AdminStatCard title="Level" value={student.level} icon="L" tone="blue" />
          <AdminStatCard title="AI Difficulty" value={student.weakAreas[0]?.currentDifficulty ?? student.level} icon="D" tone="rose" />
          <AdminStatCard title="Stars" value={student.stars} icon="S" tone="purple" />
          <AdminStatCard title="Sessions" value={student.totalSessions} icon="A" tone="green" />
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="Admin Health Checklist" eyebrow="Pass / Warning / Fail">
        <div className={`rounded-2xl border p-3 ${checklistTone}`}>
          <p className="text-xs font-black uppercase tracking-[0.14em]">Overall Status</p>
          <p className="mt-1 text-base font-black uppercase">{overallChecklistStatus}</p>
          <p className="mt-1 text-xs">
            {adminHealthChecklist.filter((item) => item.status === "pass").length} pass · {warningCount} warning · {failCount} fail
          </p>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {adminHealthChecklist.map((item) => {
            const tone = item.status === "pass"
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-100"
              : item.status === "warning"
                ? "border-amber-500/25 bg-amber-500/10 text-amber-100"
                : "border-rose-500/25 bg-rose-500/10 text-rose-100";

            return (
              <div key={item.key} className={`rounded-xl border p-3 ${tone}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[0.08em]">{item.label}</p>
                  <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em]">
                    {item.status}
                  </span>
                </div>
                <p className="mt-1 text-xs">{item.detail}</p>
              </div>
            );
          })}
        </div>
      </AdminSectionCard>

      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <AdminSectionCard title="Linked Parent">
          <p className="font-black text-white">{student.parent.name ?? "Parent"}</p>
          <p className="mt-1 text-sm text-slate-400">{student.parent.email}</p>
          <Link href={`/admin/parents/${student.parent.id}`} className="mt-4 inline-flex rounded-xl border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800">
            View Parent
          </Link>
        </AdminSectionCard>

        <AdminSectionCard title="Student Onboarding Profile">
          {keyStageMismatch ? (
            <p className="mb-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100">
              Student year group suggests {canonicalKeyStage}, but onboarding profile shows {onboardingKeyStage}. Review student setup.
            </p>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">DOB: {student.studentProfile?.dateOfBirth ? new Date(student.studentProfile.dateOfBirth).toLocaleDateString() : "Not set"}</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Voice: {student.studentProfile?.voiceProfile ?? student.selectedVoice}</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">KS Level: {student.studentProfile?.keyStageLevel ?? "Not set"}</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Pathway: {student.studentProfile?.curriculumPathway?.toUpperCase() ?? "Not set"}</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Exam Board: {student.studentProfile?.examBoard ?? "Not set"}</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Learning Level: {student.studentProfile?.learningLevel ?? "Not set"}</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Reading Level: {student.studentProfile?.readingLevel ?? "Not set"}</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Subject Focus: {student.studentProfile?.subjectFocus ?? "Not set"}</div>
          </div>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <p>GCSE Subjects: {(student.studentProfile?.gcseSubjects ?? []).join(", ") || "Not set"}</p>
            <p>Target Grades: {student.studentProfile?.targetGrades ? JSON.stringify(student.studentProfile.targetGrades) : "Not set"}</p>
            <p>SEN Support: {student.studentProfile?.senSupportNeeds ?? "Not set"}</p>
            <p>Weak Areas: {student.studentProfile?.weakAreasText ?? "Not set"}</p>
            <p>Guardian Permissions: {student.studentProfile?.guardianPermissions ?? "Not set"}</p>
            <p>School Information: {student.studentProfile?.schoolInformation ?? "Not set"}</p>
          </div>
          <div id="qlf-baseline" className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/50 p-3 transition">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Quick Level Finder Control</p>
            <p className="mt-2 text-sm text-slate-300">
              Status: {quickLevelFinderCompleted ? "Completed" : "Not completed"} · Responses: {quickLevelFinderResponses}
            </p>
            {student.quickLevelFinder?.totalQuestions ? (
              <p className="text-sm text-slate-300">
                Session progress: {student.quickLevelFinder.responseCount ?? 0}/{student.quickLevelFinder.totalQuestions}
              </p>
            ) : null}
            <p className="text-sm text-slate-300">
              Retest button: {quickLevelFinderRetestEnabled ? "Enabled for learner" : "Disabled"}
            </p>

            {qlfBaselineMissing ? (
              <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-50">
                <p className="font-black">Quick Level Finder baseline has not been completed.</p>
                <p className="mt-1">The student must complete Quick Level Finder from their student dashboard.</p>
                <p className="mt-1">Ask the student/parent to log in and open Student Dashboard -&gt; Start My Level Finder.</p>
                <button
                  type="button"
                  onClick={() => void copyQuickLevelFinderInstructions()}
                  className="mt-3 rounded-xl border border-amber-200/50 bg-amber-300/20 px-3 py-2 text-xs font-bold text-amber-50 transition hover:bg-amber-300/30"
                >
                  Copy student instructions
                </button>
                {quickLevelFinderInstructionMessage ? (
                  <p className="mt-2 text-xs text-amber-100">{quickLevelFinderInstructionMessage}</p>
                ) : null}
              </div>
            ) : null}

            {student.quickLevelFinder?.levels && Object.keys(student.quickLevelFinder.levels).length > 0 ? (
              <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-3">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200">Placement Results</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {Object.entries(student.quickLevelFinder.levels).map(([subject, level]) => (
                    <div key={subject} className="rounded-lg border border-cyan-400/20 bg-slate-900/40 px-3 py-2 text-xs text-slate-100">
                      <p className="font-bold uppercase tracking-wide text-cyan-100">{subject}</p>
                      <p className="mt-1">Level: <span className="font-semibold capitalize">{level.level}</span></p>
                      <p>Accuracy: <span className="font-semibold">{level.accuracy}%</span></p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">No subject-level placement results yet.</p>
            )}

            {qlfBaselineMissing ? (
              <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900/50 p-3">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Secondary admin override</p>
                <p className="mt-1 text-xs text-slate-400">Use this only if you need to force the dashboard QLF prompt; it does not create or complete a baseline.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void toggleQuickLevelFinderRetest(true)}
                    disabled={quickLevelFinderSaving || quickLevelFinderRetestEnabled}
                    className="rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {quickLevelFinderSaving ? "Saving..." : "Enable dashboard QLF prompt"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleQuickLevelFinderRetest(false)}
                    disabled={quickLevelFinderSaving || !quickLevelFinderRetestEnabled}
                    className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-bold text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Disable dashboard QLF prompt
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void toggleQuickLevelFinderRetest(true)}
                  disabled={quickLevelFinderSaving || quickLevelFinderRetestEnabled}
                  className="rounded-xl bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {quickLevelFinderSaving ? "Saving..." : "Enable Retest Button"}
                </button>
                <button
                  type="button"
                  onClick={() => void toggleQuickLevelFinderRetest(false)}
                  disabled={quickLevelFinderSaving || !quickLevelFinderRetestEnabled}
                  className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-bold text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Disable Retest Button
                </button>
              </div>
            )}
            <div className="mt-3">
              <Link
                href={`/admin/knowledge-graph?mode=academic_intelligence&studentId=${encodeURIComponent(params.id)}&tab=overview`}
                className="inline-flex rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-100"
              >
                Open HEART BEAT Engine
              </Link>
            </div>
            {quickLevelFinderMessage ? (
              <p className="mt-2 text-xs text-cyan-100">{quickLevelFinderMessage}</p>
            ) : null}
          </div>
        </AdminSectionCard>

        <AdminSectionCard title="Adaptive Tutor Readiness">
          {student.adaptiveTutor?.enoughHistory ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Status: {student.adaptiveTutor.readinessLabel ?? "Active"}</div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Attempts used: {student.adaptiveTutor.totalAttempts ?? 0}</div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Confidence signal: {student.adaptiveTutor.confidenceTrend ?? 0}%</div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Frustration risk: {student.adaptiveTutor.frustrationRisk ?? 0}%</div>
            </div>
          ) : (
            <p className="text-sm text-slate-300">{student.adaptiveTutor?.fallbackMessage ?? "Not enough learning history yet. The tutor will adapt as more activities are completed."}</p>
          )}
        </AdminSectionCard>

        {showDevAttemptSeeding ? (
          <AdminSectionCard title="Dev Attempt Seeding">
            <p className="text-sm text-slate-400">Create fake Silent e attempts to test weak-area detection and resolved/improving status.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => void seedAttempts("low")} className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-bold text-white">Seed Low Silent e</button>
              <button onClick={() => void seedAttempts("high")} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white">Seed High Silent e</button>
            </div>
            {seedMessage ? <p className="mt-3 text-sm text-slate-300">{seedMessage}</p> : null}
          </AdminSectionCard>
        ) : null}

        <AdminSectionCard title="Weak Areas & Adaptive Difficulty">
          <div id="weak-areas" className="rounded-2xl transition">
          {student.weakAreas.length === 0 ? (
            <p className="text-sm text-slate-400">No weak areas detected yet.</p>
          ) : (
            <div className="space-y-3">
              {student.weakAreas.map((area) => (
                <div key={area.id} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-white">{area.skillFocus}</p>
                      <p className="text-xs text-slate-400">{area.subject} · {area.keyStage ?? "KS"} · {area.yearGroup ?? "Year"} · {area.weaknessType}</p>
                      {area.interventionLaunchedAt ? (
                        <p className="mt-1 text-xs text-cyan-300">
                          Intervention launched: {new Date(area.interventionLaunchedAt).toLocaleString()}
                        </p>
                      ) : null}
                      {area.interventionCompletedAt ? (
                        <p className="text-xs text-emerald-300">
                          Intervention completed: {new Date(area.interventionCompletedAt).toLocaleString()}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-black text-white">{area.accuracy}%</p>
                      <p className="text-xs text-slate-500">Difficulty {area.currentDifficulty} · {area.status}</p>
                      {area.interventionImprovementPct !== null ? (
                        <p className="text-xs font-black text-amber-300">
                          Improvement {area.interventionImprovementPct >= 0 ? "+" : ""}{Math.round(area.interventionImprovementPct)}%
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </AdminSectionCard>

        <AdminSectionCard title="Dashboard Content Removal" eyebrow="Remove stuck learner items">
          <p className="text-sm text-slate-300">
            Remove content that is still visible on the learner dashboard. This works for assigned content, Smart Catch-Up tasks, and homework tasks.
          </p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Student ID: <span className="text-slate-200">{formatStudentId(params.id)}</span>
          </p>
          <div className="mt-3">
            <Link
              href={`/student/dashboard?studentId=${encodeURIComponent(params.id)}`}
              className="inline-flex rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-100"
            >
              Open this learner dashboard
            </Link>
          </div>
          {dashboardContentMessage ? (
            <p className="mt-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
              {dashboardContentMessage}
            </p>
          ) : null}

          {dashboardContentLoading ? (
            <p className="mt-3 text-sm text-slate-400">Loading dashboard content...</p>
          ) : dashboardContentError ? (
            <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
              <p>{dashboardContentError}</p>
              <button
                type="button"
                onClick={() => void loadDashboardContent()}
                className="mt-2 rounded-lg bg-rose-500 px-3 py-1 text-xs font-bold text-white"
              >
                Retry
              </button>
            </div>
          ) : !dashboardContent ? (
            <p className="mt-3 text-sm text-slate-400">No dashboard content found.</p>
          ) : (
            <div className="mt-3 grid gap-4 xl:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3">
                <p className="text-sm font-bold text-white">Assignments ({dashboardContent.assignments.length})</p>
                <div className="mt-2 space-y-2">
                  {dashboardContent.assignments.length === 0 ? (
                    <p className="text-xs text-slate-400">No active assignments.</p>
                  ) : (
                    dashboardContent.assignments.slice(0, 12).map((item) => {
                      const busyKey = `assignment:${item.id}`;
                      return (
                        <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-2 text-xs text-slate-200">
                          <p className="font-semibold text-white">{item.content.contentType} - {item.content.topic}</p>
                          <p className="mt-0.5 text-slate-400">{item.content.skillFocus ?? "No skill focus"} • Level {item.content.level}</p>
                          <button
                            type="button"
                            disabled={dashboardContentBusyKey === busyKey}
                            onClick={() => void removeDashboardContent({
                              contentType: "assignment",
                              itemId: item.id,
                              label: "assignment",
                            })}
                            className="mt-2 rounded-lg bg-rose-500 px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-60"
                          >
                            {dashboardContentBusyKey === busyKey ? "Removing..." : "Remove"}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3">
                <p className="text-sm font-bold text-white">Catch-Up Tasks ({dashboardContent.catchUpTasks.length})</p>
                <div className="mt-2 space-y-2">
                  {dashboardContent.catchUpTasks.length === 0 ? (
                    <p className="text-xs text-slate-400">No catch-up tasks.</p>
                  ) : (
                    dashboardContent.catchUpTasks.slice(0, 12).map((item) => {
                      const busyKey = `catch_up:${item.taskId}`;
                      return (
                        <div key={item.taskId} className="rounded-xl border border-slate-800 bg-slate-900/40 p-2 text-xs text-slate-200">
                          <p className="font-semibold text-white">{item.title}</p>
                          <p className="mt-0.5 text-slate-400">{item.subject}{item.topic ? ` • ${item.topic}` : ""} • {item.status.replaceAll("_", " ")}</p>
                          <button
                            type="button"
                            disabled={dashboardContentBusyKey === busyKey}
                            onClick={() => void removeDashboardContent({
                              contentType: "catch_up",
                              itemId: item.taskId,
                              label: "catch-up task",
                            })}
                            className="mt-2 rounded-lg bg-rose-500 px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-60"
                          >
                            {dashboardContentBusyKey === busyKey ? "Removing..." : "Remove"}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3">
                <p className="text-sm font-bold text-white">Homework Tasks ({dashboardContent.homeworkTasks.length})</p>
                <div className="mt-2 space-y-2">
                  {dashboardContent.homeworkTasks.length === 0 ? (
                    <p className="text-xs text-slate-400">No homework tasks.</p>
                  ) : (
                    dashboardContent.homeworkTasks.slice(0, 12).map((item) => {
                      const busyKey = `homework:${item.taskId}`;
                      return (
                        <div key={item.taskId} className="rounded-xl border border-slate-800 bg-slate-900/40 p-2 text-xs text-slate-200">
                          <p className="font-semibold text-white">{item.title}</p>
                          <p className="mt-0.5 text-slate-400">{item.subject ?? "General"}{item.topic ? ` • ${item.topic}` : ""} • {item.status.replaceAll("_", " ")}</p>
                          <button
                            type="button"
                            disabled={dashboardContentBusyKey === busyKey}
                            onClick={() => void removeDashboardContent({
                              contentType: "homework",
                              itemId: item.taskId,
                              label: "homework task",
                            })}
                            className="mt-2 rounded-lg bg-rose-500 px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-60"
                          >
                            {dashboardContentBusyKey === busyKey ? "Removing..." : "Remove"}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </AdminSectionCard>

        <AdminSectionCard title="Academic Intelligence" eyebrow="Smart Catch-Up & Exam Readiness">
          {academicLoading ? (
            <p className="text-sm text-slate-400">Loading academic intelligence...</p>
          ) : academicError ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
              <p>{academicError}</p>
              <button
                type="button"
                onClick={() => void loadAcademicIntelligence()}
                className="mt-2 rounded-lg bg-rose-500 px-3 py-1 text-xs font-bold text-white"
              >
                Retry
              </button>
            </div>
          ) : !academicIntelligence ? (
            <p className="text-sm text-slate-400">No mastery data yet. Complete a lesson to build the mastery map.</p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-bold text-emerald-100">HEART BEAT Next Best Action</p>
                  <Link
                    href={`/admin/knowledge-graph?mode=academic_intelligence&studentId=${encodeURIComponent(params.id)}&tab=overview`}
                    className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-100"
                  >
                    Open HEART BEAT Engine
                  </Link>
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5 text-xs">
                  <p className="rounded-lg border border-emerald-400/20 bg-slate-900/40 px-2 py-1 text-emerald-100">Action: <span className="font-black uppercase">{toHeartbeatDecisionViewModel(academicIntelligence.heartbeatDecision).action}</span></p>
                  <p className="rounded-lg border border-emerald-400/20 bg-slate-900/40 px-2 py-1 text-emerald-100">Urgency: <span className="font-black uppercase">{toHeartbeatDecisionViewModel(academicIntelligence.heartbeatDecision).urgency}</span></p>
                  <p className="rounded-lg border border-emerald-400/20 bg-slate-900/40 px-2 py-1 text-emerald-100">Risk: <span className="font-black uppercase">{toHeartbeatDecisionViewModel(academicIntelligence.heartbeatDecision).riskLevel}</span></p>
                  <p className="rounded-lg border border-emerald-400/20 bg-slate-900/40 px-2 py-1 text-emerald-100">Confidence: <span className="font-black uppercase">{toHeartbeatDecisionViewModel(academicIntelligence.heartbeatDecision).confidence}</span></p>
                  <p className="rounded-lg border border-emerald-400/20 bg-slate-900/40 px-2 py-1 text-emerald-100">Actor: <span className="font-black uppercase">{toHeartbeatDecisionViewModel(academicIntelligence.heartbeatDecision).actorRequired}</span></p>
                </div>

                <p className="mt-2 text-xs text-emerald-50">Suggested next step: {toHeartbeatDecisionViewModel(academicIntelligence.heartbeatDecision).suggestedNextStep}</p>
                <p className="mt-1 text-xs text-emerald-50">Reasons: {toHeartbeatDecisionViewModel(academicIntelligence.heartbeatDecision).reasonsSummary}</p>
                <p className="mt-1 text-xs text-emerald-50">Blockers: {toHeartbeatDecisionViewModel(academicIntelligence.heartbeatDecision).blockersSummary}</p>

                <div className="mt-3 rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100">Coach Signals</p>
                  {!academicIntelligence.coachHeartbeatSignals || academicIntelligence.coachHeartbeatSignals.totalCoachSignals === 0 ? (
                    <p className="mt-1 text-xs text-cyan-100/80">No recent Coach heartbeat signals in the last {academicIntelligence.coachHeartbeatSignals?.windowDays ?? 14} days.</p>
                  ) : (
                    <>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3 text-xs">
                        <p className="rounded-lg border border-cyan-400/30 bg-slate-900/40 px-2 py-1 text-cyan-100">Recent signals: <span className="font-black">{academicIntelligence.coachHeartbeatSignals.totalCoachSignals}</span></p>
                        <p className="rounded-lg border border-cyan-400/30 bg-slate-900/40 px-2 py-1 text-cyan-100">Understood after help: <span className="font-black">{academicIntelligence.coachHeartbeatSignals.understoodAfterHelpCount}</span></p>
                        <p className="rounded-lg border border-cyan-400/30 bg-slate-900/40 px-2 py-1 text-cyan-100">Still struggling: <span className="font-black">{academicIntelligence.coachHeartbeatSignals.stillStrugglingCount}</span></p>
                        <p className="rounded-lg border border-cyan-400/30 bg-slate-900/40 px-2 py-1 text-cyan-100">Catch-up signals: <span className="font-black">{academicIntelligence.coachHeartbeatSignals.needsCatchUpCount}</span></p>
                        <p className="rounded-lg border border-cyan-400/30 bg-slate-900/40 px-2 py-1 text-cyan-100">Different style signals: <span className="font-black">{academicIntelligence.coachHeartbeatSignals.needsDifferentExplanationStyleCount}</span></p>
                        <p className="rounded-lg border border-cyan-400/30 bg-slate-900/40 px-2 py-1 text-cyan-100">Tutor support signals: <span className="font-black">{academicIntelligence.coachHeartbeatSignals.needsLiveTutorSupportCount}</span></p>
                      </div>
                      <p className="mt-2 text-xs text-cyan-100/90">
                        Top subject: <span className="font-bold">{academicIntelligence.coachHeartbeatSignals.topSubjects[0]?.value ?? "N/A"}</span>
                        {" · "}
                        Top skill: <span className="font-bold">{academicIntelligence.coachHeartbeatSignals.topSkillTopics[0]?.value ?? "N/A"}</span>
                      </p>
                    </>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {(() => {
                    const actionButton = mapHeartbeatActionButton({
                      action: academicIntelligence.heartbeatDecision?.primaryAction ?? "review_placement",
                      studentId: params.id,
                      parentId: student.parent.id,
                    });

                    const fallbackButtons = [
                      mapHeartbeatActionButton({ action: "review_placement", studentId: params.id, parentId: student.parent.id }),
                      mapHeartbeatActionButton({ action: "assign_catch_up", studentId: params.id, parentId: student.parent.id }),
                      mapHeartbeatActionButton({ action: "generate_assessment", studentId: params.id, parentId: student.parent.id }),
                      mapHeartbeatActionButton({ action: "advance_student", studentId: params.id, parentId: student.parent.id }),
                    ];

                    const buttons = academicIntelligence.heartbeatDecision
                      ? [actionButton]
                      : fallbackButtons;

                    return buttons.map((button) => (
                      <Link
                        key={`${button.action}-${button.href}`}
                        href={button.href}
                        className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-100"
                      >
                        {button.label}
                      </Link>
                    ));
                  })()}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Covered: <span className="font-black text-white">{academicIntelligence.summary.coveredCount}/{academicIntelligence.summary.totalTopics}</span></div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Catch-up required: <span className="font-black text-white">{academicIntelligence.summary.needsCatchUpCount}</span></div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Needs revision: <span className="font-black text-white">{academicIntelligence.summary.needsRevisionCount}</span></div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Avg score: <span className="font-black text-white">{academicIntelligence.summary.averageScore}%</span></div>
              </div>

              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-bold text-cyan-100">School Day and School Week Controls</p>
                  <button
                    type="button"
                    onClick={() => void saveSchoolWeekSettings()}
                    disabled={schoolWeekSaving}
                    className="rounded-lg border border-cyan-400/40 bg-cyan-400/20 px-3 py-1 text-xs font-bold text-cyan-100 disabled:opacity-60"
                  >
                    {schoolWeekSaving ? "Saving..." : "Save controls"}
                  </button>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <label className="text-xs text-slate-300">Start
                    <input
                      type="time"
                      value={schoolWeekSettings.startTime}
                      onChange={(event) => setSchoolWeekSettings((current) => ({ ...current, startTime: event.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                    />
                  </label>
                  <label className="text-xs text-slate-300">End
                    <input
                      type="time"
                      value={schoolWeekSettings.endTime}
                      onChange={(event) => setSchoolWeekSettings((current) => ({ ...current, endTime: event.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                    />
                  </label>
                  <label className="text-xs text-slate-300">Lesson mins
                    <input
                      type="number"
                      min={20}
                      max={90}
                      value={schoolWeekSettings.lessonBlockMinutes}
                      onChange={(event) => setSchoolWeekSettings((current) => ({ ...current, lessonBlockMinutes: Number(event.target.value) || 35 }))}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                    />
                  </label>
                  <label className="text-xs text-slate-300">Subjects/day
                    <input
                      type="number"
                      min={1}
                      max={4}
                      value={schoolWeekSettings.dailySubjectLimit}
                      onChange={(event) => setSchoolWeekSettings((current) => ({ ...current, dailySubjectLimit: Number(event.target.value) || 2 }))}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                    />
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {SCHOOL_WEEK_DAYS.map((day) => {
                    const selected = schoolWeekSettings.activeDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setSchoolWeekSettings((current) => ({
                          ...current,
                          activeDays: selected
                            ? current.activeDays.filter((item) => item !== day)
                            : [...current.activeDays, day],
                        }))}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${selected ? "border-cyan-300/50 bg-cyan-400/20 text-cyan-100" : "border-slate-700 bg-slate-900 text-slate-300"}`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>

                {academicIntelligence.schoolWeekModePlan?.dailySchedules?.length ? (
                  <div className="mt-3 grid gap-2 xl:grid-cols-2">
                    {academicIntelligence.schoolWeekModePlan.dailySchedules.slice(0, 2).map((day) => (
                      <div key={day.day} className="rounded-xl border border-cyan-500/20 bg-slate-900/40 p-2 text-xs text-slate-200">
                        <p className="font-semibold text-cyan-100">{day.day} ({day.totalMinutes} mins)</p>
                        <p className="mt-1 text-slate-300">{day.blocks.slice(0, 2).map((item) => `${item.startTime} ${item.title}`).join(" • ") || "No planned blocks"}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {schoolWeekMessage ? <p className="mt-2 text-xs text-cyan-100">{schoolWeekMessage}</p> : null}
              </div>

              <CurriculumMasteryMap
                variant="dark"
                title="Curriculum Mastery Map"
                subtitle="Subjects, levels, and topic statuses for this learner."
                eyebrow="Mastery map"
                summary={academicIntelligence.summary}
                rows={academicIntelligence.curriculumCoverage ?? []}
              />

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3">
                  <p className="text-sm font-bold text-white">Top Catch-Up Tasks</p>
                  {academicIntelligence.catchUpRecommendations.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">No catch-up needed right now.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {academicIntelligence.catchUpRecommendations.slice(0, 4).map((task, index) => (
                        <div key={`${task.id}-${task.subject}-${task.topic ?? ""}-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/40 p-2 text-xs">
                          <p className="font-semibold text-white">{task.title}</p>
                          <p className="mt-0.5 text-slate-400">{task.subject}{task.topic ? ` • ${task.topic}` : ""}</p>
                          <p className="mt-1 text-slate-300">{task.reason}</p>
                          <p className="mt-1 text-[11px] text-amber-300">{task.priority} priority • {task.status}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3">
                  <p className="text-sm font-bold text-white">Assessment Recommendations</p>
                  {academicIntelligence.assessmentRecommendations.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">No assessment due right now.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {academicIntelligence.assessmentRecommendations.slice(0, 4).map((assessment, index) => (
                        <div key={`${assessment.assessmentType}-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/40 p-2 text-xs">
                          <p className="font-semibold text-white">{assessment.assessmentType.replaceAll("_", " ")}</p>
                          <p className="mt-0.5 text-slate-400">{assessment.subject}{assessment.topic ? ` • ${assessment.topic}` : ""}</p>
                          <p className="mt-1 text-slate-300">{assessment.reason}</p>
                          <p className="mt-1 text-[11px] text-cyan-300">Readiness: {assessment.readinessStatus.replaceAll("_", " ")}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">
                <p className="font-bold text-white">GCSE readiness</p>
                {academicIntelligence.gcseReadiness?.applicable ? (
                  <p className="mt-1">
                    {academicIntelligence.gcseReadiness.readinessStatus.replaceAll("_", " ")} •
                    {" "}{academicIntelligence.gcseReadiness.examBoard ?? "Exam board pending"} •
                    {" "}{academicIntelligence.gcseReadiness.coverageGapCount} coverage gaps
                  </p>
                ) : (
                  <p className="mt-1">Not currently applicable for this learner.</p>
                )}
              </div>

              <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-sm text-indigo-100">
                <p className="font-bold text-white">School Week Report</p>
                <p className="mt-1 text-xs">
                  Catch-up completed: {academicIntelligence.catchUpRecommendations.filter((task) => task.status === "completed").length} •
                  Homework completed: {(academicIntelligence.homeworkTasks ?? []).filter((task) => task.status === "completed").length} •
                  Overdue: {academicIntelligence.catchUpRecommendations.filter((task) => task.status === "overdue").length + (academicIntelligence.homeworkTasks ?? []).filter((task) => task.status === "overdue").length}
                </p>
              </div>

              {(academicIntelligence.homeworkTasks ?? []).length > 0 ? (
                <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-3">
                  <p className="text-sm font-bold text-white">Homework Tracking</p>
                  <div className="mt-2 space-y-2">
                    {(academicIntelligence.homeworkTasks ?? []).slice(0, 5).map((task) => (
                      <div key={task.taskId} className="rounded-xl border border-indigo-400/20 bg-slate-900/40 p-2 text-xs text-indigo-100">
                        <p className="font-semibold text-white">{task.title}</p>
                        <p className="mt-0.5">{task.subject ?? "General"}{task.topic ? ` • ${task.topic}` : ""} • {task.estimatedMinutes}m</p>
                        <p className="mt-1 text-indigo-200">Status: {task.status.replaceAll("_", " ")}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-sm font-bold text-amber-200">Parent/Admin review actions</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {academicIntelligence.reviewActions.map((action) => (
                    <button
                      key={action.action}
                      type="button"
                      disabled
                      title={action.message}
                      className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200 opacity-70"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-amber-100/90">Actions are placeholder-safe and currently require persistence setup.</p>
              </div>
            </div>
          )}
        </AdminSectionCard>

        <AdminSectionCard title="Wallet Summary">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AdminStatCard title="Balance" value={student.walletSummary.balance} icon="C" tone="green" />
            <AdminStatCard title="Earned" value={student.walletSummary.totalEarned} icon="+" tone="blue" />
            <AdminStatCard title="Spent" value={student.walletSummary.totalSpent} icon="-" tone="rose" />
            <AdminStatCard title="Owned Items" value={student.ownedItems.length} icon="I" tone="purple" />
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
              <p className="text-sm font-bold text-white">Earned by source</p>
              <div className="mt-3 space-y-2">
                {student.walletSummary.earnedBySource.map((entry) => (
                  <div key={entry.source} className="flex items-center justify-between gap-3 text-sm text-slate-300">
                    <span className="capitalize">{entry.source.replaceAll("_", " ")}</span>
                    <span className="font-black text-emerald-300">+{entry.amount}</span>
                  </div>
                ))}
                {!student.walletSummary.earnedBySource.length ? <p className="text-sm text-slate-500">No earned transactions yet.</p> : null}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
              <p className="text-sm font-bold text-white">Owned / purchased items</p>
              <div className="mt-3 space-y-2">
                {student.ownedItems.slice(0, 8).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 text-sm text-slate-300">
                    <span>{item.name} {item.equipped ? "• equipped" : ""}</span>
                    <span className="text-slate-500">{new Date(item.purchasedAt).toLocaleString()}</span>
                  </div>
                ))}
                {!student.ownedItems.length ? <p className="text-sm text-slate-500">No owned items yet.</p> : null}
              </div>
            </div>
          </div>
        </AdminSectionCard>

        <AdminSectionCard title="Manual Wallet Adjustment">
          <p className="mb-4 text-sm text-slate-400">
            Write a <span className="text-white">manual_adjustment</span> ledger entry. Use positive values to add coins and negative to deduct.
          </p>
          {adjustMessage ? (
            <p className={`mb-4 rounded-xl border px-3 py-2 text-sm ${adjustMessage.ok ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100" : "border-rose-400/20 bg-rose-400/10 text-rose-100"}`}>
              {adjustMessage.text}
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase text-slate-500">Amount (coins)</span>
              <input
                type="number"
                step="1"
                placeholder="e.g. 10 or -5"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                className="w-36 rounded-xl bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 ring-1 ring-slate-700 focus:outline-none focus:ring-indigo-500"
              />
            </label>
            <label className="flex min-w-56 flex-1 flex-col gap-1">
              <span className="text-xs uppercase text-slate-500">Reason</span>
              <input
                type="text"
                placeholder="e.g. Bonus for completion"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="rounded-xl bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 ring-1 ring-slate-700 focus:outline-none focus:ring-indigo-500"
              />
            </label>
            <button
              type="button"
              disabled={adjusting}
              onClick={() => void submitWalletAdjustment()}
              className="rounded-xl bg-indigo-500 px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {adjusting ? "Saving…" : "Apply"}
            </button>
          </div>
        </AdminSectionCard>

        <AdminSectionCard title="Adaptive Level Decisions">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
            <p className="text-sm font-bold text-white">Recommended next activity</p>
            <p className="mt-2 text-sm text-slate-300">{student.recommendedNextActivity}</p>
          </div>
          <div className="mt-4 space-y-3">
            {student.recentLevelDecisions.map((decision) => (
              <div key={`${decision.subject}-${decision.ts}`} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-white capitalize">{decision.subject} level {decision.previousLevel} → {decision.nextLevel}</p>
                  <p className="text-xs text-slate-500">Confidence {decision.confidenceScore}%</p>
                </div>
                <p className="mt-2 text-sm text-slate-300">{decision.reasons[0] ?? "No reason recorded."}</p>
              </div>
            ))}
            {!student.recentLevelDecisions.length ? <p className="text-sm text-slate-500">No level decisions recorded yet.</p> : null}
          </div>
        </AdminSectionCard>

        <AdminSectionCard title="Recommended Subject Levels" eyebrow="Session progression guidance">
          <div id="subject-progression" />
          {progressionLoading ? (
            <p className="text-sm text-slate-400">Loading progression recommendations...</p>
          ) : progressionError ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
              <p>{progressionError}</p>
              <button
                type="button"
                onClick={() => void loadProgressionRecommendations()}
                className="mt-2 rounded-lg bg-rose-500 px-3 py-1 text-xs font-bold text-white"
              >
                Retry
              </button>
            </div>
          ) : !progression?.recommendations?.length ? (
            <p className="text-sm text-slate-400">No progression suggestions yet. More learning evidence is needed.</p>
          ) : (
            <div className="space-y-4">
              {progressionActionMessage ? (
                <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">{progressionActionMessage}</p>
              ) : null}
              {progression.autoPromotion?.evaluations?.length ? (
                <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">Auto-Promotion Gates</p>
                      <p className="mt-1 text-sm text-violet-100">Visibility into why each subject was promoted or blocked this cycle.</p>
                    </div>
                    <p className="text-xs text-violet-100/80">
                      Applied {progression.autoPromotion.appliedCount ?? 0} · Evaluated {progression.autoPromotion.evaluations.length}
                    </p>
                  </div>
                  <div className="mt-3 grid gap-3 xl:grid-cols-2">
                    {progression.autoPromotion.evaluations.map((row) => (
                      <div key={row.scopedSubject} className="rounded-2xl border border-violet-400/20 bg-slate-950/40 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-white capitalize">{row.scopedSubject.replace(":", " - ")}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${row.status === "applied" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-amber-400/30 bg-amber-500/10 text-amber-200"}`}>
                            {row.status === "applied" ? "Applied" : "Blocked"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-300">Level {row.currentLevel} → {row.recommendedLevel} · Confidence {row.confidence}% · Streak {row.candidateStreak}/2</p>
                        <p className="mt-1 text-xs text-slate-400">
                          Mastery check: {row.latestMasteryCheckStatus.replaceAll("_", " ")}{row.cooldownActive ? " · Cooldown active" : ""}
                        </p>
                        {row.gateFailures.length ? (
                          <div className="mt-2 space-y-1">
                            {row.gateFailures.slice(0, 3).map((failure, index) => (
                              <p key={`${row.scopedSubject}-gate-${index}`} className="text-xs text-amber-200">• {failure}</p>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-emerald-200">All gates passed in this cycle.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {progression.generationTargets?.length ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">AI Generate</p>
                      <p className="mt-1 text-sm text-emerald-100">Create draft content from the parent subject choices and placement results.</p>
                    </div>
                    <p className="text-xs text-emerald-100/80">{progression.generationTargets.length} target{progression.generationTargets.length === 1 ? "" : "s"} ready</p>
                  </div>
                  <div className="mt-3 grid gap-3 xl:grid-cols-2">
                    {progression.generationTargets.map((target) => {
                      const aiGeneratorHref = buildAiGeneratorUrl({
                        studentId: student.id,
                        subject: target.subject,
                        skill: target.skillFocus,
                        strand: target.strand,
                        englishStrand: target.strand,
                        topic: target.skillFocus,
                        activityType: "targeted practice",
                        masteryOutcome: target.reason,
                        source: "student-profile",
                        yearGroup: target.yearGroup,
                        keyStage: target.keyStage,
                        studentYearGroup: target.studentYearGroup,
                        studentKeyStage: target.studentKeyStage,
                        targetLearningYearGroup: target.targetLearningYearGroup,
                        targetLearningKeyStage: target.targetLearningKeyStage,
                        subjectLevel: target.subjectLevel,
                        strandLevel: target.strandLevel,
                        levelSource: target.levelSource,
                        difficulty: target.difficulty,
                        prefillContract: target.prefillContract ?? null,
                      });

                      return (
                        <div key={target.scopedSubject} className="rounded-2xl border border-emerald-400/20 bg-slate-950/40 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-bold text-white capitalize">{target.scopedSubject.replace(":", " - ")}</p>
                            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-200">Level {target.difficulty}</span>
                          </div>
                          <p className="mt-2 text-sm text-slate-300">{target.skillFocus}</p>
                          <p className="mt-1 text-xs text-slate-400">Accuracy {target.accuracy}% · {target.reason}</p>
                          <Link
                            href={aiGeneratorHref}
                            className="mt-3 inline-flex rounded-xl bg-emerald-400 px-3 py-2 text-xs font-black text-slate-950 transition hover:bg-emerald-300"
                          >
                            Open AI Generate
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {progression.summary ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Headline: <span className="font-black text-white">{progression.summary.friendlyHeadline}</span></div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Needs support: <span className="font-black text-white">{progression.summary.needsSupport}</span></div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Ready to advance: <span className="font-black text-white">{progression.summary.readyToAdvance}</span></div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-300">Review needed: <span className="font-black text-white">{progression.summary.reviewNeeded}</span></div>
                </div>
              ) : null}

              <div className="grid gap-3 xl:grid-cols-2">
                {progression.recommendations.slice(0, 8).map((item) => (
                  <div key={item.scopedSubject} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-white capitalize">{item.subject}{item.strand ? ` - ${item.strand}` : ""}</p>
                      <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-xs font-bold text-cyan-200">Confidence {item.confidence}%</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-300">Current Level {item.currentLevel} {"->"} Suggested Level {item.recommendedLevel}</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-amber-300">{item.status.replaceAll("_", " ")} • {item.action.replaceAll("_", " ")}</p>
                    <p className="mt-2 text-sm text-slate-300">{item.nextBestStep}</p>
                    {item.reasons.length > 0 ? (
                      <p className="mt-1 text-xs text-slate-400">Reason: {item.reasons[0]}</p>
                    ) : null}
                    {item.adminAppliedLevel ? (
                      <p className="mt-2 text-xs text-emerald-300">
                        Applied override: Level {item.adminAppliedLevel}
                        {item.adminAppliedAt ? ` • ${new Date(item.adminAppliedAt).toLocaleString()}` : ""}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={progressionActionPendingId === item.scopedSubject}
                        onClick={() => void applySubjectLevelRecommendation({
                          scopedSubject: item.scopedSubject,
                          recommendedLevel: item.recommendedLevel,
                          confidence: item.confidence,
                          reasons: item.reasons,
                          action: "apply",
                        })}
                        className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {progressionActionPendingId === item.scopedSubject ? "Applying..." : "Apply Suggested Level"}
                      </button>
                      {item.adminAppliedLevel ? (
                        <button
                          type="button"
                          disabled={progressionActionPendingId === item.scopedSubject}
                          onClick={() => void applySubjectLevelRecommendation({
                            scopedSubject: item.scopedSubject,
                            recommendedLevel: item.recommendedLevel,
                            confidence: item.confidence,
                            reasons: item.reasons,
                            action: "revert",
                          })}
                          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Revert Override
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </AdminSectionCard>

        <AdminSectionCard title="Mode Struggles">
          {student.modeStruggles.length === 0 ? (
            <p className="text-sm text-slate-400">No repeated spelling mode struggles recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {student.modeStruggles.map((item) => (
                <div key={item.mode} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold capitalize text-white">{item.mode.replaceAll("_", " ")}</p>
                    <p className="text-sm text-slate-300">{item.accuracy}% across {item.total} attempts</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminSectionCard>

        <AdminSectionCard title="Recent Progress">
          <div id="attempts" className="rounded-2xl transition">
          {student.attempts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase text-slate-500">
                    <th className="px-3 py-3">Subject</th>
                    <th className="px-3 py-3">Mode</th>
                    <th className="px-3 py-3">Skill</th>
                    <th className="px-3 py-3">Correct</th>
                    <th className="px-3 py-3">Difficulty</th>
                  </tr>
                </thead>
                <tbody>
                  {student.attempts.slice(0, 20).map((attempt) => (
                    <tr key={attempt.id} className="border-b border-slate-800/70 text-slate-300">
                      <td className="px-3 py-3 capitalize">{attempt.subject}</td>
                      <td className="px-3 py-3 capitalize">{attempt.spellingMode ? attempt.spellingMode.replaceAll("_", " ") : "—"}</td>
                      <td className="px-3 py-3">{attempt.skillFocus}</td>
                      <td className="px-3 py-3">{attempt.correct ? "Yes" : "No"}</td>
                      <td className="px-3 py-3">{attempt.difficulty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : student.progressRecords.length === 0 ? (
            <p className="text-sm text-slate-400">No activity yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase text-slate-500">
                    <th className="px-3 py-3">Subject</th>
                    <th className="px-3 py-3">Activity</th>
                    <th className="px-3 py-3">Accuracy</th>
                    <th className="px-3 py-3">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {student.progressRecords.map((record) => (
                    <tr key={record.id} className="border-b border-slate-800/70 text-slate-300">
                      <td className="px-3 py-3 capitalize">{record.activityType}</td>
                      <td className="px-3 py-3">{record.activityName}</td>
                      <td className="px-3 py-3">{record.accuracy !== null ? `${record.accuracy}%` : "—"}</td>
                      <td className="px-3 py-3">{record.completed ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>
        </AdminSectionCard>

        <AdminSectionCard title="Wallet Audit Log">
          <div className="mb-4 flex flex-wrap gap-2">
            {[
              { key: "all", label: "All" },
              { key: "earn", label: "Earned" },
              { key: "spend", label: "Spent" },
              { key: "failed", label: "Failed" },
              { key: "equip", label: "Equipped" },
            ].map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setAuditFilter(filter.key as typeof auditFilter)}
                className={`rounded-xl px-4 py-2 text-sm font-bold ${auditFilter === filter.key ? "bg-indigo-500 text-white" : "border border-slate-700 text-slate-200 hover:bg-slate-800"}`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {filteredWalletTransactions.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="font-bold text-white">
                    {entry.type === "spend" ? `-${Math.abs(entry.amount)} coins` : entry.type === "failed" ? "Failed purchase" : entry.type === "equip" ? "Item equipped" : `+${entry.amount} coins`}
                    {entry.metadata?.itemName ? ` — ${entry.metadata.itemName}` : ""}
                  </p>
                  <span className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
                <div className="mt-2 grid gap-1 text-sm text-slate-300">
                  <p className="m-0">Source: {entry.source}</p>
                  <p className="m-0">Reason: {entry.reason ?? entry.metadata?.activityName ?? entry.metadata?.failureCode ?? "—"}</p>
                  <p className="m-0">Balance: {entry.balanceBefore} → {entry.balanceAfter}</p>
                </div>
              </div>
            ))}
            {!filteredWalletTransactions.length ? <p className="text-sm text-slate-500">No audit rows for this filter.</p> : null}
          </div>
        </AdminSectionCard>
      </div>
    </div>
  );
}
