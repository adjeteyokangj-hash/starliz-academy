"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type Student = {
  id: string;
  name: string;
  age: number | null;
  keyStageLevel: string | null;
  readingLevel: string | null;
  subjectFocus: string | null;
  spellingLevel: number;
  mathLevel: number;
  level: number;
  accuracy: number | null;
  lastActive: string;
  parentEmail: string;
  parentName: string | null;
  frustrationCount: number;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [frustrationThreshold, setFrustrationThreshold] = useState(3);
  const [loading, setLoading] = useState(true);
  const [busyStudentId, setBusyStudentId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [accuracyFilter, setAccuracyFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  async function archiveStudent(student: Student) {
    if (!window.confirm(`Archive ${student.name}?`)) return;
    setBusyStudentId(student.id);
    try {
      const response = await fetch(`/api/admin/students/${student.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        window.alert(payload?.error ?? "Unable to archive student.");
        return;
      }
      setStudents((current) => current.filter((entry) => entry.id !== student.id));
    } finally {
      setBusyStudentId(null);
    }
  }

  useEffect(() => {
    fetch("/api/admin/students")
      .then((response) => {
        if (response.status === 401) { window.location.replace("/admin/login?next=/admin/students"); return null; }
        if (!response.ok) throw new Error("Failed to load students");
        return response.json() as Promise<{ students: Student[]; frustrationThreshold?: number }>;
      })
      .then((payload) => {
        if (payload) {
          setStudents(payload.students ?? []);
          if (payload.frustrationThreshold) setFrustrationThreshold(payload.frustrationThreshold);
        }
      })
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = students.filter((student) => {
    const query = search.toLowerCase();
    const matchesSearch =
      student.name.toLowerCase().includes(query) ||
      student.parentEmail.toLowerCase().includes(query) ||
      (student.parentName ?? "").toLowerCase().includes(query);
    const matchesAccuracy =
      accuracyFilter === "all" ||
      (accuracyFilter === "no-data" && student.accuracy === null) ||
      (accuracyFilter === "low" && student.accuracy !== null && student.accuracy < 60) ||
      (accuracyFilter === "good" && student.accuracy !== null && student.accuracy >= 60);
    return matchesSearch && matchesAccuracy;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <AdminSectionCard
      title="Students"
      eyebrow="Learners"
      action={<Link href="/admin/students/new" className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white">Add Student</Link>}
    >
      {loading ? <p className="text-sm text-slate-400">Loading students...</p> : null}
      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search students or parent email"
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white placeholder:text-slate-600"
        />
        <select
          value={accuracyFilter}
          onChange={(event) => {
            setAccuracyFilter(event.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"
        >
          <option value="all">All accuracy</option>
          <option value="good">60% and above</option>
          <option value="low">Below 60%</option>
          <option value="no-data">No data</option>
        </select>
      </div>
      {!loading && students.length === 0 ? (
        <AdminEmptyState
          title="No students yet"
          description="Students must belong to a parent account. Once added, their progress, level and accuracy will appear here."
          actionLabel="Add Student"
        />
      ) : null}
      {students.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase text-slate-500">
                <th className="px-3 py-3">Student</th>
                <th className="px-3 py-3">Parent</th>
                <th className="px-3 py-3">Age / Year</th>
                <th className="px-3 py-3">KS</th>
                <th className="px-3 py-3">Reading</th>
                <th className="px-3 py-3">Focus</th>
                <th className="px-3 py-3">Spelling</th>
                <th className="px-3 py-3">Maths</th>
                <th className="px-3 py-3">Reading</th>
                <th className="px-3 py-3">Accuracy</th>
                <th className="px-3 py-3">Last Active</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((student) => (
                <tr key={student.id} className="border-b border-slate-800/70 text-slate-300">
                  <td className="px-3 py-3 font-bold text-white">
                    <span className="flex items-center gap-2">
                      <Link href={`/admin/students/${student.id}`} className="hover:text-blue-200">{student.name}</Link>
                      {student.frustrationCount >= frustrationThreshold ? (
                        <span title={`High frustration: ${student.frustrationCount} sessions in last 7 days`} className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-black text-red-400">
                          🚨 {student.frustrationCount}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-3 py-3">{student.parentName ?? student.parentEmail}</td>
                  <td className="px-3 py-3">{student.age ?? "Not set"}</td>
                  <td className="px-3 py-3">{student.keyStageLevel ?? "-"}</td>
                  <td className="px-3 py-3">{student.readingLevel ?? "-"}</td>
                  <td className="px-3 py-3">{student.subjectFocus ?? "-"}</td>
                  <td className="px-3 py-3">Lv {student.spellingLevel}</td>
                  <td className="px-3 py-3">Lv {student.mathLevel}</td>
                  <td className="px-3 py-3">Lv {student.level}</td>
                  <td className="px-3 py-3">{student.accuracy !== null ? `${student.accuracy}%` : "No data"}</td>
                  <td className="px-3 py-3">{timeAgo(student.lastActive)}</td>
                  <td className="px-3 py-3">
                    <Link href={`/admin/students/${student.id}/edit`} className="mb-2 inline-flex rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-400">
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => archiveStudent(student)}
                      disabled={busyStudentId === student.id}
                      className="ml-2 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
                    >
                      {busyStudentId === student.id ? "Archiving..." : "Archive"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-slate-800 px-3 py-3 text-sm text-slate-400">
            <span>Showing {visible.length} of {filtered.length}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-slate-700 px-3 py-1.5 disabled:opacity-40">Previous</button>
              <span className="px-2 py-1.5">Page {page} of {pageCount}</span>
              <button disabled={page === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} className="rounded-lg border border-slate-700 px-3 py-1.5 disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminSectionCard>
  );
}
