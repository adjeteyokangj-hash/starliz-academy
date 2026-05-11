"use client";

import { useCallback, useEffect, useState } from "react";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import Link from "next/link";

type ContentItem = {
  id: string;
  contentType: string;
  level: number;
  topic: string;
  status: string;
  skillFocus?: string | null;
  createdAt: string;
};

type Lesson = {
  id: string;
  title: string;
  subject: string;
  ageGroup?: string | null;
  difficulty: number;
  status: string;
  contentRefs?: string | null;
  createdAt: string;
  updatedAt: string;
};

const SUBJECTS = ["spelling", "maths", "reading"] as const;
type Subject = (typeof SUBJECTS)[number];
const MAX_DIFFICULTY: Record<Subject, number> = { reading: 10, spelling: 5, maths: 5 };

const emptyForm = () => ({
  title: "",
  subject: "reading" as Subject,
  ageGroup: "",
  difficulty: 1,
  status: "draft",
  selectedContentIds: [] as string[],
});

export default function LessonsPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [contentSearch, setContentSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // ------------------------------------------------------------------
  // Data loading
  // ------------------------------------------------------------------
  const loadLessons = useCallback(async () => {
    const res = await fetch("/api/admin/resources/lessons?orderBy=createdAt&dir=desc");
    if (!res.ok) return;
    const data = (await res.json()) as { records: Lesson[] };
    setLessons(data.records ?? []);
  }, []);

  const loadContent = useCallback(
    async (subject: Subject) => {
      const type = subject === "maths" ? "math" : subject;
      const params = new URLSearchParams({ type });
      if (contentSearch.trim()) params.set("search", contentSearch.trim());
      const res = await fetch(`/api/admin/content?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { items: ContentItem[] };
      setContentItems(data.items ?? []);
    },
    [contentSearch],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLessons();
  }, [loadLessons]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadContent(form.subject);
  }, [form.subject, loadContent]);

  // ------------------------------------------------------------------
  // Form helpers
  // ------------------------------------------------------------------
  function setField<K extends keyof ReturnType<typeof emptyForm>>(key: K, value: ReturnType<typeof emptyForm>[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleContentId(id: string) {
    setForm((prev) => ({
      ...prev,
      selectedContentIds: prev.selectedContentIds.includes(id)
        ? prev.selectedContentIds.filter((x) => x !== id)
        : [...prev.selectedContentIds, id],
    }));
  }

  function startEdit(lesson: Lesson) {
    setEditingId(lesson.id);
    const ids = lesson.contentRefs
      ? lesson.contentRefs
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    setForm({
      title: lesson.title,
      subject: (SUBJECTS.includes(lesson.subject as Subject) ? lesson.subject : "reading") as Subject,
      ageGroup: lesson.ageGroup ?? "",
      difficulty: lesson.difficulty,
      status: lesson.status,
      selectedContentIds: ids,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setMsg(null);
  }

  // ------------------------------------------------------------------
  // Save / Delete
  // ------------------------------------------------------------------
  async function save() {
    if (!form.title.trim()) {
      setMsg({ text: "Lesson title is required.", ok: false });
      return;
    }
    setBusy(true);
    setMsg(null);
    const body = {
      title: form.title.trim(),
      subject: form.subject,
      ageGroup: form.ageGroup.trim() || null,
      difficulty: form.difficulty,
      status: form.status,
      contentRefs: form.selectedContentIds.join(",") || null,
    };
    const url = editingId ? `/api/admin/resources/lessons/${editingId}` : "/api/admin/resources/lessons";
    const res = await fetch(url, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      setMsg({ text: err.error ?? "Could not save. Check the required fields.", ok: false });
      return;
    }
    setMsg({ text: editingId ? "Lesson updated." : "Lesson created.", ok: true });
    cancelEdit();
    await loadLessons();
  }

  async function remove(id: string, title: string) {
    if (!window.confirm(`Delete lesson "${title}"? This cannot be undone.`)) return;
    setBusy(true);
    await fetch(`/api/admin/resources/lessons/${id}`, { method: "DELETE" });
    setBusy(false);
    await loadLessons();
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  const diffMax = MAX_DIFFICULTY[form.subject];

  const filteredContent = contentItems.filter((item) => {
    if (!contentSearch.trim()) return true;
    const q = contentSearch.toLowerCase();
    return item.topic.toLowerCase().includes(q) || (item.skillFocus ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-white">Lessons</h1>
          <p className="mt-1 text-slate-400">Create structured learning paths and link approved content.</p>
        </div>
        <Link
          href="/admin/ai-generator"
          className="rounded-2xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm font-bold text-violet-300 hover:bg-violet-500/20"
        >
          ✦ Open AI Generator
        </Link>
      </div>

      {/* Form */}
      <AdminSectionCard title={editingId ? "Edit Lesson" : "Create New Lesson"}>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Title */}
          <label className="md:col-span-2">
            <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Lesson Title *</span>
            <input
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-violet-500"
              placeholder="e.g. Reading Comprehension: Inference"
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
            />
          </label>

          {/* Subject */}
          <label>
            <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Subject</span>
            <select
              className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-violet-500"
              value={form.subject}
              onChange={(e) => {
                const s = e.target.value as Subject;
                setField("subject", s);
                setField("difficulty", Math.min(form.difficulty, MAX_DIFFICULTY[s]));
              }}
            >
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </label>

          {/* Age group */}
          <label>
            <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Age Group</span>
            <input
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-violet-500"
              placeholder="e.g. 6-8"
              value={form.ageGroup}
              onChange={(e) => setField("ageGroup", e.target.value)}
            />
          </label>

          {/* Difficulty */}
          <label>
            <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">
              Difficulty — <span className="text-violet-300">{form.difficulty}</span>
              <span className="ml-1 text-slate-600">/ {diffMax}</span>
            </span>
            <input
              type="range"
              min={1}
              max={diffMax}
              value={form.difficulty}
              onChange={(e) => setField("difficulty", Number(e.target.value))}
              className="w-full accent-violet-500"
            />
          </label>

          {/* Status */}
          <label>
            <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Status</span>
            <select
              className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-violet-500"
              value={form.status}
              onChange={(e) => setField("status", e.target.value)}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
        </div>

        {/* Content picker */}
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Link Content ({form.selectedContentIds.length} selected)
            </span>
            <div className="flex gap-2">
              <input
                className="w-52 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none"
                placeholder="Filter by topic or skill…"
                value={contentSearch}
                onChange={(e) => setContentSearch(e.target.value)}
              />
              <button
                type="button"
                onClick={() => void loadContent(form.subject)}
                className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white"
              >
                Refresh
              </button>
            </div>
          </div>

          {filteredContent.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 py-6 text-center text-sm text-slate-500">
              No {form.subject} content found.{" "}
              <Link href="/admin/ai-generator" className="text-violet-400 underline">
                Generate some
              </Link>{" "}
              first.
            </p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-2xl border border-white/10 p-2">
              {filteredContent.map((item) => {
                const selected = form.selectedContentIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleContentId(item.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                      selected ? "bg-violet-600/30 text-white" : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                        selected ? "border-violet-500 bg-violet-500 text-white" : "border-white/20"
                      }`}
                    >
                      {selected ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {item.topic || "(no topic)"}{" "}
                      {item.skillFocus ? <span className="text-slate-500">· {item.skillFocus}</span> : null}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">Lv {item.level}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                        item.status === "published"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : item.status === "approved"
                            ? "bg-sky-500/20 text-sky-300"
                            : "bg-slate-500/20 text-slate-400"
                      }`}
                    >
                      {item.status}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="rounded-2xl bg-violet-500 px-6 py-3 font-bold text-white disabled:opacity-60 hover:bg-violet-400"
          >
            {busy ? "Saving…" : editingId ? "Update Lesson" : "Create Lesson"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-2xl border border-white/10 px-6 py-3 font-bold text-slate-200 hover:bg-white/5"
            >
              Cancel
            </button>
          ) : null}
          {msg ? <span className={`text-sm ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}>{msg.text}</span> : null}
        </div>
      </AdminSectionCard>

      {/* Lessons table */}
      <AdminSectionCard title="All Lessons">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Difficulty</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Content</th>
                <th className="px-3 py-2">Updated</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-slate-300">
              {lessons.map((lesson) => {
                const refs = lesson.contentRefs
                  ? lesson.contentRefs
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : [];
                return (
                  <tr key={lesson.id} className="hover:bg-white/5">
                    <td className="px-3 py-3 font-semibold text-white">{lesson.title}</td>
                    <td className="px-3 py-3 capitalize">{lesson.subject}</td>
                    <td className="px-3 py-3">{lesson.difficulty}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          lesson.status === "published"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-slate-500/20 text-slate-400"
                        }`}
                      >
                        {lesson.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-400">{refs.length > 0 ? `${refs.length} item${refs.length !== 1 ? "s" : ""}` : "—"}</td>
                    <td className="px-3 py-3 text-slate-400">{new Date(lesson.updatedAt).toLocaleDateString()}</td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(lesson)}
                          className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(lesson.id, lesson.title)}
                          className="rounded-xl border border-rose-400/30 px-3 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-500/10"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!lessons.length ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                    No lessons yet. Create the first one above.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminSectionCard>
    </div>
  );
}
