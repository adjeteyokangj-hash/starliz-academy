"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AssignmentRow = {
  id: string;
  status: string;
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

  async function loadAssignments() {
    setLoading(true);
    const response = await fetch("/api/admin/assignments");
    const payload = await response.json();
    setAssignments(payload.assignments ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAssignments();
  }, []);

  async function reassign(row: AssignmentRow) {
    const response = await fetch("/api/admin/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId: row.content.id, studentIds: [row.student.id] }),
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
        <Link href="/admin/content-library" className="rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500">
          Assign from Library
        </Link>
      </div>

      {message ? <p className="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm font-bold text-blue-200">{message}</p> : null}
      {loading ? <p className="text-sm text-slate-400">Loading assignments...</p> : null}

      <div className="grid gap-4">
        {assignments.map((assignment) => (
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

        {!loading && !assignments.length ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900/50 p-8 text-center text-slate-400">
            No assignments yet. Save AI content, then assign it from the Content Library.
          </div>
        ) : null}
      </div>
    </main>
  );
}
