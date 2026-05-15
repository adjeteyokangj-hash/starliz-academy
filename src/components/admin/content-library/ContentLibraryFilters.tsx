"use client";

import { EXAM_BOARDS, KEY_STAGES, YEAR_GROUPS } from "@/lib/curriculum";
import type { SortMode, ViewMode } from "./types";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  applyingFilters: boolean;
  yearGroup: string;
  onYearGroupChange: (value: string) => void;
  keyStage: string;
  onKeyStageChange: (value: string) => void;
  examBoard: string;
  onExamBoardChange: (value: string) => void;
  classGroup: string;
  classGroups: string[];
  onClassGroupChange: (value: string) => void;
  parent: string;
  parents: string[];
  onParentChange: (value: string) => void;
  subject: string;
  onSubjectChange: (value: string) => void;
  sortMode: SortMode;
  onSortModeChange: (value: SortMode) => void;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
};

const SUBJECT_TABS = ["all", "spelling", "punctuation", "maths", "reading", "grammar", "science"];

export default function ContentLibraryFilters(props: Props) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="mb-3 flex flex-wrap gap-2">
        {SUBJECT_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => props.onSubjectChange(tab)}
            className={`rounded-xl px-3 py-2 text-xs font-black ${props.subject === tab ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-300"}`}
          >
            {tab === "all" ? "All" : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>
      <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-9">
        <input
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              props.onApplyFilters();
            }
          }}
          placeholder="Search name, parent or class..."
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-100 md:col-span-2"
        />
        <select value={props.yearGroup} onChange={(event) => props.onYearGroupChange(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-100">
          <option value="">Year group: all</option>
          {YEAR_GROUPS.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
        <select value={props.keyStage} onChange={(event) => props.onKeyStageChange(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-100">
          <option value="">Key stage: all</option>
          {KEY_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
        </select>
        <select value={props.examBoard} onChange={(event) => props.onExamBoardChange(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-100">
          <option value="">Exam board: all</option>
          {EXAM_BOARDS.map((board) => <option key={board} value={board}>{board}</option>)}
        </select>
        <select value={props.classGroup} onChange={(event) => props.onClassGroupChange(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-100">
          <option value="">Class/group: all</option>
          {props.classGroups.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={props.parent} onChange={(event) => props.onParentChange(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-100">
          <option value="">Parent: all</option>
          {props.parents.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={props.sortMode} onChange={(event) => props.onSortModeChange(event.target.value as SortMode)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-100">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="most-used">Most used</option>
          <option value="recently-assigned">Recently assigned</option>
        </select>
        <button
          type="button"
          onClick={props.onApplyFilters}
          disabled={props.applyingFilters}
          className="rounded-xl bg-indigo-500 px-3 py-2 text-xs font-black text-white hover:bg-indigo-400 disabled:opacity-60"
        >
          {props.applyingFilters ? "Applying..." : "Apply Filters"}
        </button>
        <button
          type="button"
          onClick={props.onResetFilters}
          disabled={props.applyingFilters}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-black text-slate-100 hover:bg-slate-800 disabled:opacity-60"
        >
          Reset
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={() => props.onViewModeChange("grid")} className={`rounded-xl px-3 py-2 text-xs font-black ${props.viewMode === "grid" ? "bg-slate-200 text-slate-900" : "bg-slate-800 text-slate-200"}`}>Grid</button>
          <button type="button" onClick={() => props.onViewModeChange("list")} className={`rounded-xl px-3 py-2 text-xs font-black ${props.viewMode === "list" ? "bg-slate-200 text-slate-900" : "bg-slate-800 text-slate-200"}`}>List</button>
        </div>
      </div>
    </section>
  );
}
