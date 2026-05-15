"use client";

import { useCallback, useEffect, useState } from "react";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import { EXAM_BOARDS, KEY_STAGES, YEAR_GROUPS, keyStageForYearGroup, yearGroupsForKeyStage } from "@/lib/curriculum";

type Report = {
  filters?: { keyStage: string | null; yearGroup: string | null; examBoard: string | null };
  overview: Record<string, number>;
  ai: { contentItems: number; estimatedCostPence: number; totalUses: number };
  weakTopics: { topic: string; count: number }[];
};

const CARD_LINKS: Record<string, string> = {
  parents:             "/admin/parents",
  students:            "/admin/students",
  activestudents:      "/admin/students",
  activeparents:       "/admin/parents",
  avgaccuracy:         "/admin/students",
  completed:           "/admin/students",
  activesubscriptions: "/admin/subscriptions",
  lessons:             "/admin/lessons",
  rewards:             "/admin/rewards",
  storeitems:          "/admin/store",
  supporttickets:      "/admin/support",
};

const CARD_LABELS: Record<string, string> = {
  parents:             "Parents",
  students:            "Students",
  activestudents:      "Active Students",
  activeparents:       "Active Parents",
  avgaccuracy:         "Avg Accuracy",
  completed:           "Completed",
  activesubscriptions: "Active Subscriptions",
  lessons:             "Lessons",
  rewards:             "Rewards",
  storeitems:          "Store Items",
  supporttickets:      "Support Tickets",
};

export default function ReportsPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [keyStageFilter, setKeyStageFilter] = useState("");
  const [yearGroupFilter, setYearGroupFilter] = useState("");
  const [examBoardFilter, setExamBoardFilter] = useState("");

  const loadReport = useCallback(async () => {
    const params = new URLSearchParams();
    if (keyStageFilter) params.set("keyStage", keyStageFilter);
    if (yearGroupFilter) params.set("yearGroup", yearGroupFilter);
    if (examBoardFilter) params.set("examBoard", examBoardFilter);
    const response = await fetch(`/api/admin/reports?${params.toString()}`);
    if (!response.ok) return;
    setReport(await response.json());
  }, [keyStageFilter, yearGroupFilter, examBoardFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadReport();
  }, [loadReport]);

  const exportParams = new URLSearchParams();
  exportParams.set("format", "csv");
  if (keyStageFilter) exportParams.set("keyStage", keyStageFilter);
  if (yearGroupFilter) exportParams.set("yearGroup", yearGroupFilter);
  if (examBoardFilter) exportParams.set("examBoard", examBoardFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-white">Reports</h1>
          <p className="mt-1 text-slate-400">Learning, engagement, subscription and AI usage insights.</p>
        </div>
        <a className="rounded-2xl bg-violet-500 px-5 py-3 font-bold text-white" href={`/api/admin/reports?${exportParams.toString()}`}>
          Export CSV
        </a>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <select
          value={keyStageFilter}
          onChange={(event) => {
            const nextStage = event.target.value;
            setKeyStageFilter(nextStage);
            if (!nextStage) {
              setYearGroupFilter("");
            } else {
              const options = yearGroupsForKeyStage(nextStage);
              setYearGroupFilter((current) => (current && !options.includes(current as (typeof YEAR_GROUPS)[number]) ? "" : current));
            }
            if (!nextStage.startsWith("KS4")) setExamBoardFilter("");
          }}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"
        >
          <option value="">All key stages</option>
          {KEY_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
        </select>
        <select
          value={yearGroupFilter}
          onChange={(event) => {
            const nextYear = event.target.value;
            setYearGroupFilter(nextYear);
            if (nextYear) {
              const stage = keyStageForYearGroup(nextYear);
              setKeyStageFilter(stage);
              if (!stage.startsWith("KS4")) setExamBoardFilter("");
            }
          }}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"
        >
          <option value="">All year groups</option>
          {(keyStageFilter ? yearGroupsForKeyStage(keyStageFilter) : [...YEAR_GROUPS]).map((group) => (
            <option key={group} value={group}>{group}</option>
          ))}
        </select>
        <select
          value={examBoardFilter}
          onChange={(event) => setExamBoardFilter(event.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"
        >
          <option value="">All exam boards</option>
          {EXAM_BOARDS.map((board) => <option key={board} value={board}>{board}</option>)}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {Object.entries(report?.overview ?? {}).map(([rawLabel, value]) => {
          const key = rawLabel.toLowerCase();
          const href = CARD_LINKS[key];
          const label = CARD_LABELS[key] ?? rawLabel;
          const cardBody = (
            <div className={`rounded-3xl border border-white/10 bg-linear-to-br from-indigo-500/20 to-blue-500/10 p-5 transition group ${href ? "hover:border-violet-500/50 hover:from-violet-500/20 hover:to-indigo-500/10 cursor-pointer" : ""}`}>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400 group-hover:text-violet-300 transition">{label}</p>
              <p className="mt-3 text-3xl font-black text-white">{value}</p>
              {href && (
                <p className="mt-2 text-[11px] font-semibold text-slate-600 group-hover:text-violet-400 transition">View →</p>
              )}
            </div>
          );
          return href ? (
            <a key={rawLabel} href={href}>{cardBody}</a>
          ) : (
            <div key={rawLabel}>{cardBody}</div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <AdminSectionCard title="Weak Topics">
          <div className="space-y-3">
            {(report?.weakTopics ?? []).map((topic) => (
              <div key={topic.topic} className="flex items-center justify-between rounded-2xl bg-white/4 p-3">
                <span className="text-sm font-semibold text-white">{topic.topic}</span>
                <span className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-bold text-rose-200">{topic.count} misses</span>
              </div>
            ))}
            {report && !report.weakTopics.length ? <p className="py-8 text-center text-sm text-slate-500">No weak topics detected yet.</p> : null}
          </div>
        </AdminSectionCard>

        <AdminSectionCard title="AI Usage">
          <div className="space-y-4 text-sm text-slate-300">
            <p>Content items: <span className="font-bold text-white">{report?.ai.contentItems ?? 0}</span></p>
            <p>Total uses: <span className="font-bold text-white">{report?.ai.totalUses ?? 0}</span></p>
            <p>Estimated cost: <span className="font-bold text-white">£{((report?.ai.estimatedCostPence ?? 0) / 100).toFixed(2)}</span></p>
          </div>
        </AdminSectionCard>
      </div>
    </div>
  );
}
