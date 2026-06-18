"use client";

import { useMemo, useState } from "react";
import type { CoverageEntry } from "@/lib/academic-intelligence/types";

type MasterySummaryView = {
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
  };
};

type CurriculumMasteryMapProps = {
  rows: CoverageEntry[];
  summary: MasterySummaryView;
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  variant?: "light" | "dark";
  emptyMessage?: string;
  className?: string;
};

type StatusTone = {
  label: string;
  className: string;
};

const masteryOrder: Array<CoverageEntry["masteryStatus"]> = [
  "needs_catch_up",
  "needs_revision",
  "started",
  "practising",
  "nearly_secure",
  "mastered",
  "not_started",
];

const coverageOrder: Array<CoverageEntry["coverageStatus"]> = [
  "gap_detected",
  "overdue_revision",
  "not_covered",
  "partially_covered",
  "covered",
];

function subjectLabel(subject: string): string {
  if (!subject) return "General";
  return subject
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function topicLabel(row: CoverageEntry): string {
  return row.topic ?? row.subtopic ?? row.skill ?? row.learningObjective ?? "General topic";
}

function levelLabel(row: CoverageEntry): string {
  const parts: string[] = [];
  if (row.keyStage) parts.push(row.keyStage);
  if (row.yearGroup) parts.push(row.yearGroup);
  if (row.foundationTier) parts.push("Foundation");
  if (row.higherTier) parts.push("Higher");
  if (row.examBoard) parts.push(row.examBoard);
  return parts.length ? parts.join(" · ") : "General level";
}

function formatDate(value: string | null): string {
  if (!value) return "No recent activity";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No recent activity";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function masteryTone(status: CoverageEntry["masteryStatus"]): StatusTone {
  if (status === "mastered") return { label: "Mastered", className: "border-emerald-400/30 bg-emerald-500/15 text-emerald-100" };
  if (status === "nearly_secure") return { label: "Nearly secure", className: "border-cyan-400/30 bg-cyan-500/15 text-cyan-100" };
  if (status === "needs_catch_up") return { label: "Catch-up needed", className: "border-rose-400/30 bg-rose-500/15 text-rose-100" };
  if (status === "needs_revision") return { label: "Needs revision", className: "border-amber-400/30 bg-amber-500/15 text-amber-100" };
  if (status === "practising") return { label: "Practising", className: "border-sky-400/30 bg-sky-500/15 text-sky-100" };
  if (status === "started") return { label: "Started", className: "border-slate-400/30 bg-slate-500/15 text-slate-100" };
  return { label: "Not started", className: "border-slate-400/20 bg-white/10 text-slate-200" };
}

function coverageTone(status: CoverageEntry["coverageStatus"]): StatusTone {
  if (status === "covered") return { label: "Secure", className: "border-emerald-400/30 bg-emerald-400/15 text-emerald-100" };
  if (status === "partially_covered") return { label: "Building", className: "border-cyan-400/30 bg-cyan-400/15 text-cyan-100" };
  if (status === "overdue_revision") return { label: "Overdue revision", className: "border-orange-400/30 bg-orange-500/15 text-orange-100" };
  if (status === "gap_detected") return { label: "Catch-up needed", className: "border-rose-400/30 bg-rose-500/15 text-rose-100" };
  return { label: "Not covered", className: "border-slate-400/20 bg-white/10 text-slate-200" };
}

function severityScore(row: CoverageEntry): number {
  const masteryScore = masteryOrder.indexOf(row.masteryStatus);
  const coverageScore = coverageOrder.indexOf(row.coverageStatus);
  return masteryScore * 10 + coverageScore;
}

function countByCoverageStatus(rows: CoverageEntry[], status: CoverageEntry["coverageStatus"]): number {
  return rows.filter((row) => row.coverageStatus === status).length;
}

function countByMasteryStatus(rows: CoverageEntry[], status: CoverageEntry["masteryStatus"]): number {
  return rows.filter((row) => row.masteryStatus === status).length;
}

const variantStyles = {
  light: {
    root: "border-cyan-200 bg-gradient-to-br from-white via-cyan-50/75 to-sky-50/85 shadow-cyan-100/60",
    title: "text-slate-950",
    eyebrow: "text-cyan-700",
    subtitle: "text-slate-600",
    panel: "border-cyan-200 bg-white/85",
    row: "border-slate-200 bg-white",
    muted: "text-slate-600",
    label: "border-cyan-200 bg-white text-slate-700",
  },
  dark: {
    root: "border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(8,15,32,0.98))] shadow-slate-950/35",
    title: "text-white",
    eyebrow: "text-cyan-300",
    subtitle: "text-slate-300",
    panel: "border-white/10 bg-white/5",
    row: "border-white/10 bg-white/5",
    muted: "text-slate-300",
    label: "border-white/10 bg-white/5 text-slate-100",
  },
} as const;

export default function CurriculumMasteryMap({
  rows,
  summary,
  title = "Curriculum Mastery Map",
  subtitle = "Subjects, levels, and topic status at a glance.",
  eyebrow = "Learning map",
  variant = "light",
  emptyMessage = "No mastery data yet. Complete a lesson to build the mastery map.",
  className = "",
}: CurriculumMasteryMapProps) {
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedLevels, setExpandedLevels] = useState<Record<string, boolean>>({});
  const styles = variantStyles[variant];
  const filteredRows = useMemo(() => rows.filter((row) => {
    const subjectMatch = subjectFilter === "all" || (row.subject || "General") === subjectFilter;
    const statusMatch = statusFilter === "all" || row.masteryStatus === statusFilter || row.coverageStatus === statusFilter;
    return subjectMatch && statusMatch;
  }), [rows, statusFilter, subjectFilter]);
  const rowsBySubject = new Map<string, CoverageEntry[]>();

  for (const row of filteredRows) {
    const key = row.subject || "General";
    const next = rowsBySubject.get(key) ?? [];
    next.push(row);
    rowsBySubject.set(key, next);
  }

  const subjectGroups = Array.from(rowsBySubject.entries())
    .map(([subject, subjectRows]) => ({ subject, rows: subjectRows }))
    .sort((left, right) => {
      const leftScore = Math.max(...left.rows.map((row) => severityScore(row)), 0);
      const rightScore = Math.max(...right.rows.map((row) => severityScore(row)), 0);
      if (leftScore !== rightScore) return rightScore - leftScore;
      return subjectLabel(left.subject).localeCompare(subjectLabel(right.subject));
    });

  const overdueRevisionCount = countByCoverageStatus(filteredRows, "overdue_revision");
  const secureCount = countByCoverageStatus(filteredRows, "covered");
  const nearlySecureCount = countByMasteryStatus(filteredRows, "nearly_secure");
  const catchUpCount = filteredRows.filter((row) => row.masteryStatus === "needs_catch_up").length;
  const averageScore = summary.averageScore;
  const denominator = summary.denominatorCoverage;
  const subjectOptions = Array.from(new Set(rows.map((row) => row.subject || "General"))).sort((left, right) => subjectLabel(left).localeCompare(subjectLabel(right)));

  return (
    <div className={`rounded-3xl border p-5 ${styles.root} ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className={`text-xs font-black uppercase tracking-[0.22em] ${styles.eyebrow}`}>{eyebrow}</p>
          <h3 className={`mt-1 text-2xl font-black tracking-tight ${styles.title}`}>{title}</h3>
          <p className={`mt-2 text-sm ${styles.subtitle}`}>{subtitle}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div className={`rounded-2xl border px-3 py-2 ${styles.panel}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wide ${styles.eyebrow}`}>Topics</p>
            <p className={`mt-1 text-lg font-black ${styles.title}`}>{filteredRows.length}</p>
          </div>
          <div className={`rounded-2xl border px-3 py-2 ${styles.panel}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wide ${styles.eyebrow}`}>Secure</p>
            <p className={`mt-1 text-lg font-black ${styles.title}`}>{secureCount}</p>
          </div>
          <div className={`rounded-2xl border px-3 py-2 ${styles.panel}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wide ${styles.eyebrow}`}>Nearly secure</p>
            <p className={`mt-1 text-lg font-black ${styles.title}`}>{nearlySecureCount}</p>
          </div>
          <div className={`rounded-2xl border px-3 py-2 ${styles.panel}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wide ${styles.eyebrow}`}>Catch-up</p>
            <p className={`mt-1 text-lg font-black ${styles.title}`}>{catchUpCount}</p>
          </div>
          <div className={`rounded-2xl border px-3 py-2 ${styles.panel}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wide ${styles.eyebrow}`}>Overdue revision</p>
            <p className={`mt-1 text-lg font-black ${styles.title}`}>{overdueRevisionCount}</p>
          </div>
        </div>
      </div>

      {denominator ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <div className={`rounded-2xl border px-3 py-2 ${styles.panel}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wide ${styles.eyebrow}`}>Expected topics</p>
            <p className={`mt-1 text-lg font-black ${styles.title}`}>{denominator.expectedTopics}</p>
          </div>
          <div className={`rounded-2xl border px-3 py-2 ${styles.panel}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wide ${styles.eyebrow}`}>Covered topics</p>
            <p className={`mt-1 text-lg font-black ${styles.title}`}>{denominator.coveredTopics}</p>
          </div>
          <div className={`rounded-2xl border px-3 py-2 ${styles.panel}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wide ${styles.eyebrow}`}>Coverage %</p>
            <p className={`mt-1 text-lg font-black ${styles.title}`}>{denominator.coveragePercent}%</p>
          </div>
          <div className={`rounded-2xl border px-3 py-2 ${styles.panel}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wide ${styles.eyebrow}`}>Missing topics</p>
            <p className={`mt-1 text-lg font-black ${styles.title}`}>{denominator.missingTopics}</p>
          </div>
        </div>
      ) : null}

      {filteredRows.length > 0 ? (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <label className={`rounded-xl border px-3 py-2 text-xs ${styles.panel}`}>
              Subject
              <select
                value={subjectFilter}
                onChange={(event) => setSubjectFilter(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-transparent px-2 py-1 text-xs"
              >
                <option value="all">All subjects</option>
                {subjectOptions.map((subject) => (
                  <option key={subject} value={subject}>{subjectLabel(subject)}</option>
                ))}
              </select>
            </label>

            <label className={`rounded-xl border px-3 py-2 text-xs ${styles.panel}`}>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-transparent px-2 py-1 text-xs"
              >
                <option value="all">All statuses</option>
                <option value="needs_catch_up">Needs catch-up</option>
                <option value="needs_revision">Needs revision</option>
                <option value="nearly_secure">Nearly secure</option>
                <option value="mastered">Mastered</option>
                <option value="overdue_revision">Overdue revision</option>
                <option value="gap_detected">Gap detected</option>
              </select>
            </label>

            <div className={`rounded-xl border px-3 py-2 text-xs ${styles.panel}`}>
              Showing {filteredRows.length} of {rows.length} topics • Avg {averageScore}%
            </div>
          </div>

          <div className={`mt-4 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-[0.16em] ${styles.muted}`}>
            <span className={`rounded-full border px-3 py-1 ${styles.label}`}>Mastered</span>
            <span className={`rounded-full border px-3 py-1 ${styles.label}`}>Nearly secure</span>
            <span className={`rounded-full border px-3 py-1 ${styles.label}`}>Secure</span>
            <span className={`rounded-full border px-3 py-1 ${styles.label}`}>Catch-up needed</span>
            <span className={`rounded-full border px-3 py-1 ${styles.label}`}>Overdue revision</span>
          </div>

          <div className="mt-5 space-y-5">
            {subjectGroups.map((group) => {
              const levelGroups = new Map<string, CoverageEntry[]>();
              for (const row of group.rows) {
                const key = levelLabel(row);
                const next = levelGroups.get(key) ?? [];
                next.push(row);
                levelGroups.set(key, next);
              }

              const levels = Array.from(levelGroups.entries())
                .map(([level, levelRows]) => ({ level, rows: levelRows }))
                .sort((left, right) => {
                  const leftScore = Math.max(...left.rows.map((row) => severityScore(row)), 0);
                  const rightScore = Math.max(...right.rows.map((row) => severityScore(row)), 0);
                  if (leftScore !== rightScore) return rightScore - leftScore;
                  return left.level.localeCompare(right.level);
                });

              const groupMastered = countByMasteryStatus(group.rows, "mastered");
              const groupNearlySecure = countByMasteryStatus(group.rows, "nearly_secure");
              const groupCatchUp = group.rows.filter((row) => row.masteryStatus === "needs_catch_up" || row.coverageStatus === "gap_detected").length;
              const groupOverdue = countByCoverageStatus(group.rows, "overdue_revision");

              return (
                <div key={group.subject} className={`rounded-2xl border p-4 ${styles.panel}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className={`text-lg font-black ${styles.title}`}>{subjectLabel(group.subject)}</p>
                      <p className={`text-xs font-semibold ${styles.subtitle}`}>
                        {group.rows.length} topics · {groupMastered} mastered · {groupNearlySecure} nearly secure · {groupCatchUp} catch-up · {groupOverdue} overdue revision
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-[0.14em]">
                      <span className={`rounded-full border px-2 py-1 ${styles.label}`}>Levels: {levels.length}</span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {levels.map((levelGroup) => {
                      const levelKey = `${group.subject}-${levelGroup.level}`;
                      const isExpanded = Boolean(expandedLevels[levelKey]);
                      const sortedRows = levelGroup.rows.slice().sort((left, right) => severityScore(left) - severityScore(right));
                      const visibleRows = isExpanded ? sortedRows : sortedRows.slice(0, 5);
                      const hiddenCount = Math.max(0, levelGroup.rows.length - visibleRows.length);

                      return (
                        <div key={`${group.subject}-${levelGroup.level}`} className={`rounded-2xl border p-3 ${styles.row}`}>
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className={`text-sm font-bold ${styles.title}`}>{levelGroup.level}</p>
                              <p className={`text-[11px] ${styles.subtitle}`}>{levelGroup.rows.length} topic{levelGroup.rows.length === 1 ? "" : "s"}</p>
                            </div>
                            <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${styles.label}`}>Level</span>
                          </div>

                          <div className="mt-3 space-y-2">
                            {visibleRows.map((row) => {
                              const mastery = masteryTone(row.masteryStatus);
                              const coverage = coverageTone(row.coverageStatus);

                              return (
                                <div key={row.topicKey} className={`rounded-2xl border p-3 ${styles.row}`}>
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <p className={`text-sm font-semibold ${styles.title}`}>{topicLabel(row)}</p>
                                      <p className={`mt-1 text-[11px] ${styles.subtitle}`}>
                                        {row.subtopic ?? row.skill ?? row.learningObjective ?? "Curriculum topic"}
                                      </p>
                                    </div>
                                    <div className="flex shrink-0 flex-col items-end gap-1">
                                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${mastery.className}`}>{mastery.label}</span>
                                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${coverage.className}`}>{coverage.label}</span>
                                    </div>
                                  </div>
                                  <p className={`mt-2 text-xs ${styles.subtitle}`}>{row.recommendedNextStep}</p>
                                  <p className={`mt-1 text-[11px] ${styles.subtitle}`}>Last activity: {formatDate(row.lastActivityAt)}</p>
                                </div>
                              );
                            })}
                          </div>

                          {hiddenCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => setExpandedLevels((current) => ({ ...current, [levelKey]: !isExpanded }))}
                              className={`mt-2 text-[11px] font-semibold ${styles.subtitle}`}
                            >
                              {isExpanded ? "Show less" : `+ ${hiddenCount} more topic${hiddenCount === 1 ? "" : "s"}`}
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${styles.panel} ${styles.subtitle}`}>
          {emptyMessage}
        </div>
      )}
    </div>
  );
}