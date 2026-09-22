"use client";

import { useState } from "react";
import type { DashboardProps } from "./dashboardTypes";
import { defaultStudentDashboardSections, DEFAULT_MASTERED_REVIEW_POLICY } from "./dashboardTypes";
import { useRouter } from "next/navigation";
import StudyPlanBadge from "@/components/learning/StudyPlanBadge";
import LearningTwinInsight from "@/components/academic-intelligence/LearningTwinInsight";
import { percentageWidthClass } from "@/lib/progress-class";
import { deriveStudyPlanProgress } from "@/lib/study-plan";
import {
  masteredReviewDaysRemaining,
  selectFocusAreaSkills,
  selectImprovingSkills,
  selectMasteredReviewSkills,
} from "@/lib/student-dashboard-sections";
import { IMPROVING_SESSION_MINUTES } from "@/lib/improving-session";

function accuracyBand(accuracy: number): { label: string; color: string } {
  if (accuracy >= 80) return { label: "Strong", color: "text-emerald-700 bg-emerald-100" };
  if (accuracy >= 60) return { label: "Developing", color: "text-amber-700 bg-amber-100" };
  return { label: "Needs Work", color: "text-rose-700 bg-rose-100" };
}

function subjectLabel(subject: string): string {
  if (subject === "math" || subject === "maths") return "Mathematics";
  if (subject === "reading") return "English / Reading";
  if (subject === "lesson" || subject === "ai_daily" || subject === "daily") return "Daily Revision";
  if (subject === "ga" || subject === "ga-language") return "Ga";
  return subject.charAt(0).toUpperCase() + subject.slice(1);
}

/** Ga / language adventure is admin-gated and must not appear as a GCSE track by default. */
function isLanguageAdventureSubject(subject: string): boolean {
  const normalized = subject.trim().toLowerCase().replace(/\s+/g, "-");
  return (
    normalized === "ga"
    || normalized === "ga-language"
    || normalized === "gcse-ga"
    || normalized.includes("ga-language")
    || normalized === "language-adventure"
  );
}

function assignmentSessionLabel(title: string, skillFocus?: string | null): string {
  if (skillFocus?.trim()) return `${title} · ${skillFocus.trim()}`;
  return title;
}

function recommendationTone(status: "assigned" | "ready" | "content_needed" | "blocked"): string {
  if (status === "assigned") return "bg-emerald-100 text-emerald-700";
  if (status === "ready") return "bg-sky-100 text-sky-700";
  if (status === "blocked") return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

type StatMetricKey = "streak" | "mastered" | "improving" | "focus";

type StatMetricCard = {
  key: StatMetricKey;
  label: string;
  value: string;
  valueClassName: string;
  meaning: string;
  improve: string;
  detailLines?: string[];
  ctaLabel: string | null;
  ctaAction: "journey" | "assignment" | "review" | "improvingBoost" | "practiseFocus" | "shortLearning" | "recovery" | null;
};

function skillDisplayLabel(skill: string): string {
  return skill
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function SecondaryDashboard({
  childName,
  stats,
  visibleAssignments,
  skills,
  coachRows,
  focusAssignment,
  weakAssignment,
  reviewAssignment,
  bossUnlocked,
  bossPlayedToday,
  sessionSummary,
  learningTwin,
  learningState,
  quickLevelFinderRetestEnabled,
  placementLevels,
  placementLessonGroups,
  placementContentGaps,
  loading,
  error,
  startingJourney,
  pathway,
  allAssignments,
  onStartJourney,
  onStartAssignment,
  onStartImprovingBoost,
  improvingBoostStarting,
  onStartBossBattle,
  bossLaunching,
  pendingAssignmentId,
  dashboardSections,
}: DashboardProps) {
  const router = useRouter();
  const [selectedMetric, setSelectedMetric] = useState<StatMetricKey | null>(null);
  const sections = dashboardSections ?? defaultStudentDashboardSections();
  // Platform policy is automatic — no per-student admin tuning required.
  const reviewPolicy = DEFAULT_MASTERED_REVIEW_POLICY;
  const isGcse = pathway === "gcse";
  const isFirstTimeStudent = Boolean(learningState?.isFirstTimeStudent);
  const needsPlacement = Boolean(learningState && !learningState.hasCompletedPlacement);
  const showOnboardingCta = isFirstTimeStudent || needsPlacement || quickLevelFinderRetestEnabled === true;
  const coachAwaitingAssessment = !learningState?.coachUnlocked;
  const allMasteredSkills = skills.filter((s) => s.status === "mastered");
  const masteredCount = allMasteredSkills.length;
  const allImprovingSkills = skills.filter((s) => s.status === "improving");
  const improvingCount = allImprovingSkills.length;
  const allWeakSkills = skills.filter((s) => s.status === "weak");
  const weakCount = allWeakSkills.length;
  const activeMasteredReviews = selectMasteredReviewSkills(skills, reviewPolicy);
  const activeImprovingSkills = selectImprovingSkills(skills, reviewPolicy);
  const activeFocusSkills = selectFocusAreaSkills(skills, reviewPolicy);
  const sourceAssignments = (allAssignments && allAssignments.length ? allAssignments : visibleAssignments);

  function skillPoolLabels(rows: typeof activeMasteredReviews): string[] {
    return rows.map((row) => {
      const daysLeft = masteredReviewDaysRemaining(row.updatedAt, reviewPolicy.replaceAfterDays);
      const base = skillDisplayLabel(row.skill);
      return daysLeft === null ? base : `${base} · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
    });
  }

  function findAssignmentForSkillPool(poolSkills: typeof activeMasteredReviews) {
    if (poolSkills.length === 0) return null;
    const codes = new Set(poolSkills.map((row) => row.skill.toLowerCase()));
    const pool = [...sourceAssignments].sort((a, b) => {
      const aDone = a.status === "completed" ? 0 : 1;
      const bDone = b.status === "completed" ? 0 : 1;
      return aDone - bDone;
    });
    return pool.find((assignment) => {
      const focus = (assignment.skillFocus ?? "").toLowerCase();
      const title = assignment.title.toLowerCase();
      return [...codes].some((code) => {
        const label = skillDisplayLabel(code).toLowerCase();
        return focus.includes(code) || focus.includes(label) || title.includes(code) || title.includes(label);
      });
    }) ?? null;
  }

  const masteredLabels = skillPoolLabels(activeMasteredReviews);
  const improvingLabels = skillPoolLabels(activeImprovingSkills);
  const focusLabels = skillPoolLabels(activeFocusSkills);
  const priorityAssignments = [focusAssignment, weakAssignment, reviewAssignment]
    .filter((assignment, index, array): assignment is NonNullable<typeof assignment> => {
      return Boolean(assignment) && array.findIndex((candidate) => candidate?.id === assignment?.id) === index;
    })
    .slice(0, 3);
  const sessionAssignments = priorityAssignments;
  const masteredReviewAssignment = findAssignmentForSkillPool(activeMasteredReviews) ?? (activeMasteredReviews.length > 0 ? reviewAssignment : null);
  const canStartImprovingBoost = activeImprovingSkills.length > 0 && Boolean(onStartImprovingBoost);
  const focusPracticeAssignment = findAssignmentForSkillPool(activeFocusSkills) ?? (activeFocusSkills.length > 0 ? (weakAssignment ?? focusAssignment) : null);
  const examReadiness = Math.max(0, Math.min(100, Math.round((masteredCount * 2 + improvingCount - weakCount) * 8)));
  const weakTopics = coachRows.filter((row) => row.status === "weak").map((row) => row.label).slice(0, 4);
  const revisionTasks = visibleAssignments.filter((assignment) => {
    const haystack = `${assignment.title} ${assignment.skillFocus ?? ""} ${assignment.subject}`.toLowerCase();
    return haystack.includes("revision") || haystack.includes("mock") || haystack.includes("gcse") || haystack.includes("exam");
  });
  const trackedSubjects = Array.from(new Set(
    sourceAssignments
      .map((assignment) => assignment.subject)
      .filter((subject) => {
        if (!subject || subjectLabel(subject) === "Daily Revision") return false;
        // Only show Ga in GCSE tracking when admin enabled Language Adventure for this student.
        if (isLanguageAdventureSubject(subject) && !sections.languageAdventure) return false;
        return true;
      })
      .map((subject) => subjectLabel(subject))
  )).slice(0, 6);

  const subjectDashboardRows = trackedSubjects.map((subjectName) => {
    const subjectAssignments = sourceAssignments.filter((assignment) => subjectLabel(assignment.subject) === subjectName);
    const completedCount = subjectAssignments.filter((assignment) => assignment.status === "completed").length;
    const totalCount = subjectAssignments.length;
    const revisionStatus = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const examBoard = subjectAssignments.find((assignment) => assignment.examBoard)?.examBoard ?? "Not tagged";
    const weakTopicHint = weakTopics.find((topic) => {
      const haystack = `${subjectName} ${topic}`.toLowerCase();
      return haystack.includes(subjectName.toLowerCase().split("/")[0].trim());
    }) ?? (weakTopics[0] ?? "No weak topics detected");
    const readiness = Math.max(0, Math.min(100, Math.round(examReadiness * 0.7 + revisionStatus * 0.3)));
    return {
      subjectName,
      examBoard,
      revisionStatus,
      weakTopicHint,
      readiness,
    };
  });

  const metricCards: StatMetricCard[] = [
    {
      key: "streak",
      label: "Study Streak",
      value: `🔥 ${stats.streak}`,
      valueClassName: "text-slate-900",
      meaning: "Days in a row you have completed learning activity on StarLiz.",
      improve: stats.streak > 0
        ? "Keep the streak by finishing one assigned task or Short Learning session today."
        : "Start today's study session or a Short Learning block to begin a streak.",
      ctaLabel: sessionAssignments.length > 0 ? "Start today's session" : "Open Short Learning",
      ctaAction: sessionAssignments.length > 0 ? "journey" : "shortLearning",
    },
    {
      key: "mastered",
      label: "Mastered",
      value: String(masteredCount),
      valueClassName: "text-emerald-700",
      meaning: `Skills you have already secured — review only. StarLiz automatically keeps up to ${reviewPolicy.maxSubjectSessions} subject sessions available and replaces each one after ${reviewPolicy.replaceAfterDays} days.`,
      improve: activeMasteredReviews.length > 0
        ? "Review one of the sessions below. When its window ends, StarLiz automatically replaces it with newer mastered work."
        : masteredCount > 0
          ? "Older mastered skills have automatically rotated out. Keep learning — newer mastery will appear here."
          : "Nothing to review yet. Mastery appears after you finish lessons with consistently strong accuracy.",
      detailLines: activeMasteredReviews.length > 0 ? masteredLabels : undefined,
      ctaLabel: activeMasteredReviews.length > 0 && masteredReviewAssignment
        ? "Review mastered work"
        : null,
      ctaAction: activeMasteredReviews.length > 0 && masteredReviewAssignment ? "review" : null,
    },
    {
      key: "improving",
      label: "Improving",
      value: String(improvingCount),
      valueClassName: "text-amber-700",
      meaning: `What you can improve next. StarLiz automatically picks the subject and questions for a short ${IMPROVING_SESSION_MINUTES}-minute boost (up to ${reviewPolicy.maxSubjectSessions} skills rotate every ${reviewPolicy.replaceAfterDays} days).`,
      improve: activeImprovingSkills.length > 0
        ? `Start the ${IMPROVING_SESSION_MINUTES}-min boost below. StarLiz chooses one improving skill and a matching question set for you.`
        : improvingCount > 0
          ? "Older improving skills have automatically rotated out. Keep practising — newer progress will appear here."
          : `Nothing to improve on yet. Complete lessons first — then StarLiz will auto-build a ${IMPROVING_SESSION_MINUTES}-min boost from your progress.`,
      detailLines: activeImprovingSkills.length > 0 ? improvingLabels : undefined,
      ctaLabel: canStartImprovingBoost
        ? `Start ${IMPROVING_SESSION_MINUTES}-min boost`
        : null,
      ctaAction: canStartImprovingBoost ? "improvingBoost" : null,
    },
    {
      key: "focus",
      label: "Focus Areas",
      value: String(weakCount),
      valueClassName: "text-rose-700",
      meaning: `Skills that need extra support from work you have already attempted. StarLiz automatically keeps up to ${reviewPolicy.maxSubjectSessions} subject sessions available and replaces each one after ${reviewPolicy.replaceAfterDays} days.`,
      improve: activeFocusSkills.length > 0
        ? "Practise one of the focus sessions below, or open Recovery Path for guided support."
        : weakCount > 0
          ? "Older focus skills have automatically rotated out. Keep learning — new focus areas will appear here."
          : "Great — no weak skills flagged yet. Keep completing lessons to stay on track.",
      detailLines: activeFocusSkills.length > 0 ? focusLabels : undefined,
      ctaLabel: activeFocusSkills.length > 0
        ? (focusPracticeAssignment ? "Practise focus skill" : "Open Recovery Path")
        : null,
      ctaAction: activeFocusSkills.length > 0
        ? (focusPracticeAssignment ? "practiseFocus" : "recovery")
        : null,
    },
  ];

  const selectedCard = metricCards.find((card) => card.key === selectedMetric) ?? null;

  function runMetricCta(card: StatMetricCard) {
    if (!card.ctaAction) return;
    if (card.ctaAction === "shortLearning") {
      router.push("/student/short-learning");
      return;
    }
    if (card.ctaAction === "recovery") {
      router.push("/student/recovery-path");
      return;
    }
    if (card.ctaAction === "review") {
      if (masteredReviewAssignment) {
        onStartAssignment(masteredReviewAssignment);
      }
      return;
    }
    if (card.ctaAction === "improvingBoost") {
      if (onStartImprovingBoost) {
        void onStartImprovingBoost();
      }
      return;
    }
    if (card.ctaAction === "practiseFocus") {
      if (focusPracticeAssignment) {
        onStartAssignment(focusPracticeAssignment);
      }
      return;
    }
    if (card.ctaAction === "assignment") {
      const target = weakAssignment && card.key === "improving"
        ? weakAssignment
        : focusAssignment ?? weakAssignment ?? reviewAssignment;
      if (target) {
        onStartAssignment(target);
        return;
      }
    }
    void onStartJourney();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Study Dashboard</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{childName}</h1>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {metricCards.map((card) => {
            const selected = selectedMetric === card.key;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setSelectedMetric(selected ? null : card.key)}
                aria-expanded={selected}
                aria-controls="study-stat-help"
                className={`rounded-xl border p-3 text-left transition ${
                  selected
                    ? "border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200"
                    : "border-slate-100 bg-slate-50 hover:border-slate-300 hover:bg-white"
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{card.label}</p>
                <p className={`mt-1 text-lg font-black ${card.valueClassName}`}>{card.value}</p>
              </button>
            );
          })}
        </div>
        {selectedCard ? (
          <div
            id="study-stat-help"
            className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/80 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-700">
                  How {selectedCard.label} works
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-800">{selectedCard.meaning}</p>
                <p className="mt-2 text-sm text-slate-700">
                  <span className="font-bold text-slate-900">How to improve: </span>
                  {selectedCard.improve}
                </p>
                {selectedCard.detailLines && selectedCard.detailLines.length > 0 ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm font-semibold text-slate-700">
                    {selectedCard.detailLines.map((line) => (
                      <li key={line} className="capitalize">{line}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {selectedCard.ctaLabel && selectedCard.ctaAction ? (
                <button
                  type="button"
                  onClick={() => runMetricCta(selectedCard)}
                  disabled={startingJourney || loading || Boolean(improvingBoostStarting)}
                  className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {improvingBoostStarting && selectedCard.ctaAction === "improvingBoost"
                    ? "Preparing boost..."
                    : selectedCard.ctaLabel}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs font-semibold text-slate-500">
            Tap a score for what it means and how to improve it.
          </p>
        )}
      </header>

      {showOnboardingCta ? (
        <section className="rounded-3xl border border-indigo-200 bg-indigo-950 p-6 text-indigo-50">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-indigo-300">Welcome</p>
          <h2 className="mt-2 text-xl font-black">
            {isFirstTimeStudent
              ? "Welcome to StarLiz Academy"
              : quickLevelFinderRetestEnabled
                ? "Level Finder retest is ready"
                : "Complete onboarding to unlock your journey"}
          </h2>
          <p className="mt-2 text-sm text-indigo-100">
            {isFirstTimeStudent
              ? "We need to learn your level before we build your personalised learning journey."
              : quickLevelFinderRetestEnabled
                ? "Your admin enabled a retest. Run Quick Level Finder again to refresh your placement level."
                : "Your placement check is still pending. Complete Quick Level Finder to unlock the right learning level."}
          </p>
          <button
            type="button"
            onClick={() => {
              router.push("/student/onboarding");
            }}
            className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-indigo-400 px-5 py-3 font-black text-indigo-950 hover:bg-indigo-300"
          >
            {quickLevelFinderRetestEnabled ? "Retest My Level Finder" : isFirstTimeStudent ? "Start My Level Finder" : "Continue Onboarding"}
          </button>
        </section>
      ) : null}

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-slate-600">
          Loading your study plan...
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{error}</div>
      )}

      {placementLevels && Object.keys(placementLevels).length > 0 ? (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Placement Baseline</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(placementLevels).map(([subject, level]) => (
              <div key={subject} className="rounded-xl border border-emerald-200 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">{subject}</p>
                <p className="mt-1 text-sm font-black capitalize text-slate-900">{level.level}</p>
                <p className="text-xs font-semibold text-slate-600">Accuracy: {level.accuracy}%</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {sections.firstLessons && placementLessonGroups && placementLessonGroups.length > 0 ? (
        <section className="rounded-3xl border border-violet-200 bg-violet-50 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Your First Lessons</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {placementLessonGroups.map((group) => (
              <div key={group.parentSubject} className="rounded-2xl border border-violet-200 bg-white p-4">
                <p className="text-sm font-black text-slate-900">{group.label}</p>
                <div className="mt-3 space-y-2">
                  {group.recommendations.map((lesson) => (
                    <div key={lesson.scopedSubject} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-slate-900">{lesson.strandLabel ?? lesson.subjectLabel}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${recommendationTone(lesson.status)}`}>
                          {lesson.status.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">L{lesson.level} {lesson.levelLabel} · Accuracy {lesson.accuracy}%</p>
                      <p className="text-xs text-slate-600">{lesson.reason}</p>
                      {lesson.assignmentId && lesson.href ? (
                        <button
                          type="button"
                          onClick={() => onStartAssignment({
                            id: lesson.assignmentId!,
                            status: "assigned",
                            subject: lesson.parentSubject,
                            title: lesson.strandLabel ?? lesson.subjectLabel,
                            skillFocus: lesson.strandLabel,
                            updatedAt: new Date().toISOString(),
                            href: lesson.href ?? undefined,
                            contentId: lesson.contentId ?? undefined,
                          })}
                          className="mt-2 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-black text-white hover:bg-violet-500"
                        >
                          Open lesson
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {placementContentGaps && placementContentGaps.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">Content Needed</p>
              <ul className="mt-2 space-y-1 text-sm font-semibold">
                {placementContentGaps.slice(0, 6).map((gap) => (
                  <li key={gap.scopedSubject}>
                    {gap.subjectLabel}{gap.strandLabel ? ` - ${gap.strandLabel}` : ""}: {gap.generatorHint?.skillFocus ?? "Generate matching content"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Daily Study Session */}
      <section className="rounded-3xl border border-indigo-200 bg-indigo-950 p-6 text-indigo-50">
        {!showOnboardingCta ? (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-indigo-300">Today&apos;s Session</p>
            <h2 className="mt-2 text-xl font-black">{isGcse ? "Revision Session" : "Adaptive Study Session"}</h2>
            {sessionAssignments.length > 0 ? (
          <div className="mt-3 space-y-2 text-sm text-indigo-100">
            {sessionAssignments.map((assignment, index) => (
              <button
                key={assignment.id}
                type="button"
                onClick={() => onStartAssignment(assignment)}
                disabled={pendingAssignmentId === assignment.id}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-indigo-800 bg-indigo-900/70 px-4 py-3 text-left transition hover:bg-indigo-900 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span>
                  {index + 1}. {pendingAssignmentId === assignment.id ? "Opening..." : assignmentSessionLabel(assignment.title, assignment.skillFocus)}
                </span>
                <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-indigo-300">
                  {subjectLabel(assignment.subject)}
                </span>
              </button>
            ))}
          </div>
            ) : (
              <p className="mt-1 text-sm text-indigo-200">
                No assigned tasks are queued yet. Ask your teacher/admin to assign work.
              </p>
            )}
            {sessionAssignments.length > 0 ? (
              <>
                <p className="mt-3 text-sm text-indigo-200">Estimated time: {Math.max(7, sessionAssignments.length * 4)} minutes.</p>
                <button
                  type="button"
                  onClick={() => void onStartJourney()}
                  disabled={startingJourney || loading || sessionAssignments.length === 0}
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-indigo-400 px-5 py-3 font-black text-indigo-950 hover:bg-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {startingJourney ? "Starting session..." : "Begin Session"}
                </button>
              </>
            ) : null}
          </>
        ) : null}
      </section>

      {isGcse ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">GCSE Progress</p>
          <h2 className="mt-1 text-lg font-black text-slate-900">Exam Preparation</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Exam Readiness</p>
              <p className="mt-1 text-lg font-black text-slate-900">{examReadiness}%</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Revision Planner</p>
              <p className="mt-1 text-lg font-black text-slate-900">{Math.max(3, sessionAssignments.length)} tasks</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Mock Support</p>
              <p className="mt-1 text-lg font-black text-slate-900">{revisionTasks.length} queued</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Weak Topics</p>
              <p className="mt-1 text-lg font-black text-slate-900">{weakTopics.length}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Study Goals</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                <li>Complete at least one focused revision block today.</li>
                <li>Review one weak topic with accuracy above 70%.</li>
                <li>Finish one exam-style task before ending session.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">GCSE Subject Tracking</p>
              {subjectDashboardRows.length ? (
                <div className="mt-3 space-y-2">
                  {subjectDashboardRows.map((row) => (
                    <div key={row.subjectName} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-black text-slate-900">{row.subjectName}</p>
                        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white">{row.readiness}% ready</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">Exam board: {row.examBoard}</p>
                      <p className="text-xs text-slate-600">Revision status: {row.revisionStatus}% complete</p>
                      <p className="text-xs text-slate-600">Weak GCSE topic: {row.weakTopicHint}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-600">No GCSE subjects tracked yet.</p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* Assigned Tasks */}
      {sections.assignedWork ? (
      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Assigned Work</p>
        <h2 className="mt-1 text-lg font-black text-slate-900">Your Study Tasks</h2>
        {!loading && visibleAssignments.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No tasks assigned yet. Ask your teacher/admin to assign work.</p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {visibleAssignments.slice(0, 8).map((assignment) => (
              <div key={assignment.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800 truncate">{assignment.title}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{subjectLabel(assignment.subject)}{assignment.skillFocus ? ` · ${assignment.skillFocus}` : ""}</p>
                  <div className="mt-1">
                    <StudyPlanBadge
                      compact
                      progress={deriveStudyPlanProgress({ status: assignment.status })}
                    />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    assignment.status === "in_progress"
                      ? "bg-amber-100 text-amber-700"
                      : assignment.status === "completed"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-sky-100 text-sky-700"
                  }`}>
                    {assignment.status === "in_progress" ? "In Progress" : assignment.status === "completed" ? "Complete" : "Not Started"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onStartAssignment(assignment)}
                    disabled={pendingAssignmentId === assignment.id}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {pendingAssignmentId === assignment.id ? "Opening..." : assignment.status === "in_progress" ? "Continue" : "Start"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      ) : null}

      {/* Skill Mastery */}
      {!coachAwaitingAssessment && coachRows.length > 0 && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Skill Tracker</p>
          <h2 className="mt-1 text-lg font-black text-slate-900">Your Progress</h2>
          <div className="mt-4 space-y-3">
            {coachRows.map((row) => {
              const band = accuracyBand(row.accuracy);
              return (
                <div key={row.code} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-800">{row.label}</p>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${band.color}`}>{band.label}</span>
                      <span className="text-sm font-bold text-slate-600">{row.accuracy}%</span>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all ${
                        row.accuracy >= 80 ? "bg-emerald-500" : row.accuracy >= 60 ? "bg-amber-500" : "bg-rose-500"
                      } ${percentageWidthClass(row.accuracy)}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {sections.learningTwin ? (
        <LearningTwinInsight profile={learningTwin} />
      ) : null}

      {/* Session insights */}
      {sections.lastSession && sessionSummary ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Last Session</p>
          <h2 className="mt-1 text-lg font-black text-slate-900">Session Insights</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { label: "Engagement", value: sessionSummary.engagementLevel },
              { label: "Confidence", value: sessionSummary.learningConfidence },
              { label: "Session Mood", value: sessionSummary.dominantMood?.replace("_", " ") },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                <p className="mt-1 text-sm font-bold capitalize text-slate-900">{value ?? "—"}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Boss Battle (academic framing) */}
      {bossUnlocked && (
        <section className="rounded-3xl border border-slate-300 bg-slate-900 p-6 text-slate-100">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Assessment Challenge</p>
          <h2 className="mt-1 text-lg font-black">Progress Check Unlocked</h2>
          {bossPlayedToday ? (
            <p className="mt-2 text-sm text-slate-400">{"You've already completed today's challenge. Check back tomorrow."}</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-300">Test your skills across everything you have studied. Good luck!</p>
              <button
                type="button"
                onClick={() => {
                  if (!onStartBossBattle) return;
                  void onStartBossBattle();
                }}
                disabled={Boolean(bossLaunching) || !onStartBossBattle}
                className="mt-4 inline-flex rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-200"
              >
                {bossLaunching ? "Preparing challenge..." : "Take Challenge"}
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
