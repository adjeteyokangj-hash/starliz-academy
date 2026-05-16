"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EXAM_BOARDS, KEY_STAGES, YEAR_GROUPS, keyStageForYearGroup, yearGroupsForKeyStage } from "@/lib/curriculum";

type AssignmentRow = {
  id: string;
  status: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  score: number | null;
  student: {
    id: string;
    name: string;
    yearGroup: string | null;
    parent: { email: string };
  };
  content: {
    id: string;
    contentType: string;
    topic: string;
    skillFocus: string | null;
    level: number;
    examBoard: string | null;
  };
  weakAreas: {
    subject: string;
    skillFocus: string;
    weaknessType: string;
    accuracy: number;
    currentDifficulty: number;
    weakWords: string[];
  }[];
  weakWords: string[];
};

function levelCapForSubject(subject: string): number {
  const normalized = subject.trim().toLowerCase();
  if (normalized === "reading" || normalized === "lesson" || normalized === "ai_daily" || normalized === "daily") {
    return 10;
  }
  return 5;
}

export default function AdminAssignmentsPage() {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [queryFilter, setQueryFilter] = useState("");
  const [keyStageFilter, setKeyStageFilter] = useState("");
  const [yearGroupFilter, setYearGroupFilter] = useState("");
  const [examBoardFilter, setExamBoardFilter] = useState("");

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (queryFilter.trim()) params.set("query", queryFilter.trim());
    if (keyStageFilter) params.set("keyStage", keyStageFilter);
    if (yearGroupFilter) params.set("yearGroup", yearGroupFilter);
    if (examBoardFilter) params.set("examBoard", examBoardFilter);
    const response = await fetch(`/api/admin/assignments?${params.toString()}`, { credentials: "include" });
    const payload = await response.json();
    setAssignments(payload.assignments ?? []);
    setLoading(false);
  }, [queryFilter, keyStageFilter, yearGroupFilter, examBoardFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAssignments();
  }, [loadAssignments]);

  const filteredAssignments = assignments;

  async function reassign(row: AssignmentRow) {
    const response = await fetch("/api/admin/assignments", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId: row.content.id, studentIds: [row.student.id], resend: true }),
    });
    const payload = await response.json();
    setMessage(response.ok ? "Assignment resent." : payload.error ?? "Could not reassign.");
    await loadAssignments();
  }

  async function generateFollowUp(row: AssignmentRow) {
    const response = await fetch("/api/lesson/auto-build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: row.student.id }),
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Follow-up lesson generated and assigned." : payload.error ?? "Could not generate follow-up lesson.");
    await loadAssignments();
  }

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-white">Assignments</h1>
          <p className="mt-2 text-sm text-slate-400">
            Track assigned AI content from generation through gameplay and progress.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadAssignments()}
            className="rounded-2xl border border-slate-700 px-5 py-3 font-semibold text-slate-200 hover:bg-slate-800"
          >
            🔄 Refresh
          </button>
          <Link href="/admin/content-library" className="rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500">
            Assign from Library
          </Link>
        </div>
      </div>

      {message ? <p className="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm font-bold text-blue-200">{message}</p> : null}
      {loading ? <p className="text-sm text-slate-400">Loading assignments...</p> : null}

      {!loading && assignments.length === 0 ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-8 text-center">
          <p className="text-slate-400">No assignments yet.</p>
          <Link href="/admin/content-library" className="mt-4 inline-block rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500">
            Create your first assignment
          </Link>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          value={queryFilter}
          onChange={(event) => setQueryFilter(event.target.value)}
          placeholder="Search student, parent, topic..."
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white lg:col-span-2"
        />
        <select
          value={keyStageFilter}
          onChange={(event) => {
            const nextStage = event.target.value;
            setKeyStageFilter(nextStage);
            if (!nextStage) {
              setYearGroupFilter("");
              return;
            }
            const options = yearGroupsForKeyStage(nextStage);
            setYearGroupFilter((current) => options.includes(current as (typeof YEAR_GROUPS)[number]) ? current : "");
            if (!nextStage.startsWith("KS4")) {
              setExamBoardFilter("");
            }
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
              setKeyStageFilter(keyStageForYearGroup(nextYear));
              if (!keyStageForYearGroup(nextYear).startsWith("KS4")) {
                setExamBoardFilter("");
              }
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

      <div className="grid gap-4">
        {filteredAssignments.map((assignment) => (
          <div
            key={assignment.id}
            className="rounded-3xl border border-slate-800 bg-slate-900 p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{assignment.content.contentType}</p>
                <h2 className="mt-1 text-xl font-bold text-white">
                  {assignment.content.topic || assignment.content.skillFocus || "Assigned content"}
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Assigned to {assignment.student.name}{assignment.student.yearGroup ? ` · ${assignment.student.yearGroup}` : ""} · {assignment.student.parent.email}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Exam board: {assignment.content.examBoard ?? "Not tagged"}
                </p>
              </div>
              <span className="rounded-full bg-blue-500/10 px-3 py-1 text-sm font-bold capitalize text-blue-300">
                {assignment.status.replace("_", " ")}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-2xl bg-slate-950 p-3">
                <p className="text-xs text-slate-500">Level</p>
                <p className="mt-1 font-black text-white">{assignment.content.level}/{levelCapForSubject(assignment.content.contentType)}</p>
              </div>
              <div className="rounded-2xl bg-slate-950 p-3">
                <p className="text-xs text-slate-500">Attempts</p>
                <p className="mt-1 font-black text-white">{assignment.attempts}</p>
              </div>
              <div className="rounded-2xl bg-slate-950 p-3">
                <p className="text-xs text-slate-500">Score</p>
                <p className="mt-1 font-black text-white">{assignment.score === null ? "-" : `${assignment.score}%`}</p>
              </div>
              <div className="rounded-2xl bg-slate-950 p-3">
                <p className="text-xs text-slate-500">Updated</p>
                <p className="mt-1 text-sm font-bold text-white">{new Date(assignment.updatedAt).toLocaleDateString()}</p>
              </div>
              <div className="rounded-2xl bg-slate-950 p-3">
                <p className="text-xs text-slate-500">Completed</p>
                <p className="mt-1 text-sm font-bold text-white">
                  {assignment.completedAt ? new Date(assignment.completedAt).toLocaleString() : "-"}
                </p>
              </div>
            </div>

            {(assignment.weakAreas.length || assignment.weakWords.length) ? (
              <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-amber-200">Weak Areas</h3>
                    <div className="mt-3 space-y-2">
                      {(assignment.weakAreas.length ? assignment.weakAreas : [{
                        subject: assignment.content.contentType,
                        skillFocus: assignment.content.skillFocus ?? "Practice",
                        weaknessType: "follow_up_needed",
                        accuracy: assignment.score ?? 0,
                        currentDifficulty: assignment.content.level,
                        weakWords: assignment.weakWords,
                      }]).map((area, index) => (
                        <div key={`${area.skillFocus}-${index}`} className="text-sm text-amber-50">
                          <span className="font-bold">{area.skillFocus}</span>
                          <span className="text-amber-200"> - {area.weakWords.length ? area.weakWords.join(", ") : area.weaknessType}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void generateFollowUp(assignment)}
                    className="rounded-xl bg-amber-400 px-4 py-3 text-xs font-black text-slate-950 hover:bg-amber-300"
                  >
                    Generate Follow-Up for Student
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/admin/content-library/${assignment.content.id}`} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800">
                Review Content
              </Link>
              <Link href={`/admin/students/${assignment.student.id}`} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800">
                View Student
              </Link>
              <button type="button" onClick={() => void reassign(assignment)} className="rounded-xl bg-indigo-500 px-3 py-2 text-xs font-black text-white">
                Resend
              </button>
            </div>
          </div>
        ))}

        {!loading && !filteredAssignments.length ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900/50 p-8 text-center text-slate-400">
            No assignments yet. Save AI content, then assign it from the Content Library.
          </div>
        ) : null}
      </div>
    </main>
  );
}
