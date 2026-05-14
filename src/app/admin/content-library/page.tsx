"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import { skillsForSubject } from "@/lib/skills";
import { KEY_STAGES, YEAR_GROUPS, keyStageForYearGroup, yearGroupsForKeyStage } from "@/lib/curriculum";

type ContentItem = {
  id: string;
  contentType: string;
  level: number;
  topic: string;
  contentJson: string;
  usedCount: number;
  createdAt: string;
  createdBy: string;
  status: string;
};

type StudentOption = {
  id: string;
  name: string;
  yearGroup?: string | null;
};

function getContentJsonSummary(contentJson: string): { valid: boolean; itemCount: number; preview: string } {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    if (Array.isArray(parsed)) {
      const first = parsed[0] as Record<string, unknown> | undefined;
      return {
        valid: true,
        itemCount: parsed.length,
        preview: first ? JSON.stringify(first) : "[]",
      };
    }
    if (parsed && typeof parsed === "object") {
      return {
        valid: true,
        itemCount: 1,
        preview: JSON.stringify(parsed),
      };
    }
    return { valid: false, itemCount: 0, preview: "Invalid JSON shape" };
  } catch {
    return { valid: false, itemCount: 0, preview: "Invalid JSON" };
  }
}

export default function ContentLibraryPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [filter, setFilter] = useState("all");
  const [skillFilter, setSkillFilter] = useState("");
  const [keyStageFilter, setKeyStageFilter] = useState("");
  const [yearGroupFilter, setYearGroupFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("type", filter);
    if (skillFilter) params.set("skill", skillFilter);
    if (keyStageFilter) params.set("keyStage", keyStageFilter);
    if (yearGroupFilter) params.set("yearGroup", yearGroupFilter);
    const url = `/api/admin/content${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await fetch(url);
    const payload = await response.json();
    setItems(payload.items ?? []);
    setLoading(false);
  }, [filter, skillFilter, keyStageFilter, yearGroupFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    void fetch("/api/admin/students")
      .then((r) => r.ok ? r.json() : null)
      .then((payload: { students?: StudentOption[] } | null) => { if (payload) setStudents(payload.students ?? []); })
      .catch(() => setStudents([]));
  }, []);

  async function assignContent(item: ContentItem) {
    const studentId = selectedStudentIds[item.id];
    if (!studentId) {
      setMessage("Choose a student before assigning.");
      return;
    }
    setAssigningId(item.id);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId: item.id, studentIds: [studentId] }),
      });
      const payload = await response.json() as {
        count?: number;
        error?: string;
        blocked?: Array<{ studentId: string; reason: string; schoolName?: string }>;
      };
      setAssigningId(null);

      if (response.status === 402 && payload.blocked?.length) {
        const blockReasons = payload.blocked.map((b) => `${b.reason}${b.schoolName ? ` (${b.schoolName})` : ""}`).join(", ");
        setMessage(`Assignment blocked by school licence: ${blockReasons}`);
        return;
      }

      if (response.ok && payload.count) {
        setMessage(`✓ Assigned to ${payload.count} student(s). Refresh the Assignments page to see it.`);
        return;
      }

      setMessage(payload.error ?? "Assignment failed.");
    } catch (error) {
      setAssigningId(null);
      setMessage(error instanceof Error ? error.message : "Assignment request failed.");
    }
  }

  return (
    <AdminSectionCard
      title="Content Library"
      eyebrow="Review"
      action={
        <div className="flex flex-wrap gap-2">
          {["all", "spelling", "math", "reading"].map((type) => (
            <button
              key={type}
              onClick={() => {
                setLoading(true);
                setFilter(type);
                setSkillFilter("");
              }}
              className={`rounded-xl px-3 py-2 text-xs font-bold ${filter === type ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-300"}`}
            >
              {type}
            </button>
          ))}
          {filter !== "all" && (
            <select
              value={skillFilter}
              onChange={(e) => { setLoading(true); setSkillFilter(e.target.value); }}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200"
            >
              <option value="">All skills</option>
              {skillsForSubject(filter as "spelling" | "maths" | "reading").map((s) => (
                <option key={s.code} value={s.code}>{s.label}</option>
              ))}
            </select>
          )}
          <select
            value={keyStageFilter}
            onChange={(e) => {
              const nextStage = e.target.value;
              setLoading(true);
              setKeyStageFilter(nextStage);
              if (!nextStage) {
                setYearGroupFilter("");
                return;
              }
              const available = yearGroupsForKeyStage(nextStage);
              setYearGroupFilter((current) => available.includes(current as (typeof YEAR_GROUPS)[number]) ? current : "");
            }}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200"
          >
            <option value="">All key stages</option>
            {KEY_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
          </select>
          <select
            value={yearGroupFilter}
            onChange={(e) => {
              const nextYear = e.target.value;
              setLoading(true);
              setYearGroupFilter(nextYear);
              if (nextYear) {
                setKeyStageFilter(keyStageForYearGroup(nextYear));
              }
            }}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200"
          >
            <option value="">All year groups</option>
            {(keyStageFilter ? yearGroupsForKeyStage(keyStageFilter) : [...YEAR_GROUPS]).map((group) => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>
        </div>
      }
    >
      {message ? <p className="mb-4 rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm font-bold text-blue-200">{message}</p> : null}
      {!loading && students.length === 0 && items.length > 0 ? (
        <p className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-200">
          ⚠️ No students found. <Link href="/admin/students" className="underline">Create a student</Link> first to enable assignments.
        </p>
      ) : null}
      {loading ? <p className="text-sm text-slate-400">Loading content...</p> : null}
      {!loading && items.length === 0 ? (
        <AdminEmptyState
          title="No reviewed content yet"
          description="AI generated words, questions and passages should be reviewed here before children use them."
          actionLabel="Generate Content"
          href="/admin/ai-generator"
        />
      ) : null}
      {items.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
              {(() => {
                const summary = getContentJsonSummary(item.contentJson);
                return (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black capitalize text-white">{item.contentType}</p>
                        <p className="text-xs text-slate-500">Level {item.level}{item.topic ? ` · ${item.topic}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-bold ${summary.valid ? "bg-emerald-400/15 text-emerald-200" : "bg-rose-400/15 text-rose-200"}`}>
                          {summary.valid ? "Valid JSON" : "Invalid JSON"}
                        </span>
                        <span className="rounded-full bg-amber-400/12 px-2 py-1 text-xs font-bold capitalize text-amber-200">{item.status}</span>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">Created by {item.createdBy} · Used {item.usedCount}x · {summary.itemCount} item(s)</p>
                    <pre className="mt-3 max-h-36 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-400">
                      {summary.preview}
                    </pre>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={`/admin/content-library/${item.id}`} className="inline-flex rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800">
                        Review item
                      </Link>
                      <select
                        value={selectedStudentIds[item.id] ?? ""}
                        onChange={(event) => setSelectedStudentIds((current) => ({ ...current, [item.id]: event.target.value }))}
                        className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200"
                      >
                        <option value="">Choose student</option>
                        {students.map((student) => (
                          <option key={`${item.id}-${student.id}`} value={student.id}>
                            {student.name}{student.yearGroup ? ` · ${student.yearGroup}` : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void assignContent(item)}
                        disabled={assigningId === item.id}
                        className="rounded-xl bg-indigo-500 px-3 py-2 text-xs font-black text-white disabled:opacity-60"
                      >
                        {assigningId === item.id ? "Assigning..." : "Assign"}
                      </button>
                    </div>
                  </>
                );
              })()}
            </article>
          ))}
        </div>
      ) : null}
    </AdminSectionCard>
  );
}
