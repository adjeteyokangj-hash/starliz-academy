"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import { GA_LEVELS } from "@/lib/ga-word-bank";
import { BEGINNER_PACK_1_LESSONS, GA_LESSON_STATUSES } from "@/lib/ga-lessons";
import { GA_APPROVED_CATEGORIES } from "@/lib/ga-word-categories";
import {
  buildLessonEditorStateById,
  getLessonUpsertRequest,
  mergeLessonLinkedWords,
} from "@/lib/ga-lessons-admin";

type ApprovedWord = { id: string; englishWord: string; gaWord: string; category: string; level: string };
type LessonRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  level: string;
  category: string;
  objective: string;
  publishStatus: string;
  packKey: string | null;
  lessonOrder: number;
  words: Array<{ wordId: string; word: ApprovedWord }>;
  quizQuestions: Array<{ id: string }>;
};

type GaCategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  isArchived: boolean;
  usedByWordBank: boolean;
  usedByLessons: boolean;
};

const defaultForm = {
  title: "Hello, Yes, No",
  description: "",
  level: "Foundation",
  category: "Greetings",
  objective: "Recognise and practise hello, yes, and no.",
  publishStatus: "Draft",
  packKey: "beginner-pack-1",
  lessonOrder: "1",
};

const DEFAULT_FALLBACK_CATEGORIES = [...GA_APPROVED_CATEGORIES].sort((left, right) => left.localeCompare(right));

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "ga-lesson";
}

export default function AdminGaLessonsPage() {
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [approvedWords, setApprovedWords] = useState<ApprovedWord[]>([]);
  const [categories, setCategories] = useState<GaCategoryRow[]>([]);
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);

  const selectedWords = useMemo(
    () => approvedWords.filter((word) => selectedWordIds.includes(word.id)),
    [approvedWords, selectedWordIds],
  );
  const fallbackCategories = useMemo(
    () => DEFAULT_FALLBACK_CATEGORIES.map((name, index) => ({
      id: `fallback-${index + 1}`,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      description: null,
      isActive: true,
      isArchived: false,
      usedByWordBank: true,
      usedByLessons: true,
    })),
    [],
  );
  const resolvedCategories = categories.length ? categories : fallbackCategories;
  const activeLessonCategories = useMemo(
    () => resolvedCategories
      .filter((category) => category.usedByLessons && category.isActive && !category.isArchived)
      .map((category) => category.name)
      .sort((left, right) => left.localeCompare(right)),
    [resolvedCategories],
  );
  const lessonFormCategoryOptions = useMemo(() => {
    if (!form.category || activeLessonCategories.includes(form.category)) return activeLessonCategories;
    return [...activeLessonCategories, form.category].sort((left, right) => left.localeCompare(right));
  }, [activeLessonCategories, form.category]);
  const categoryMap = useMemo(() => new Map(resolvedCategories.map((category) => [category.name, category])), [resolvedCategories]);
  const selectedCategoryState = categoryMap.get(form.category) ?? null;
  const selectedCategoryInactive = selectedCategoryState ? (!selectedCategoryState.isActive || selectedCategoryState.isArchived) : false;

  const load = useCallback(async () => {
    const [lessonResponse, wordResponse, categoryResponse] = await Promise.all([
      fetch("/api/admin/ga/lessons"),
      fetch("/api/admin/ga/words?reviewStatus=Approved&limit=200"),
      fetch("/api/admin/ga/categories"),
    ]);
    if (lessonResponse.status === 401 || wordResponse.status === 401 || categoryResponse.status === 401) {
      window.location.replace("/admin/login?next=/admin/ga-lessons");
      return;
    }
    const lessonPayload = await lessonResponse.json().catch(() => null) as { items?: LessonRow[] } | null;
    const wordPayload = await wordResponse.json().catch(() => null) as { items?: ApprovedWord[] } | null;
    const categoryPayload = await categoryResponse.json().catch(() => null) as { items?: GaCategoryRow[] } | null;
    const lessonItems = lessonPayload?.items ?? [];
    const approvedItems = wordPayload?.items ?? [];
    const nextCategories = categoryPayload?.items ?? [];
    setLessons(lessonItems);
    setApprovedWords(mergeLessonLinkedWords(approvedItems, lessonItems));
    setCategories(nextCategories);
    const activeCategoryNames = nextCategories
      .filter((category) => category.usedByLessons && category.isActive && !category.isArchived)
      .map((category) => category.name)
      .sort((left, right) => left.localeCompare(right));
    setForm((current) => {
      if (!activeCategoryNames.length) return current;
      const knownCategoryNames = new Set(nextCategories.map((category) => category.name));
      if (current.category && knownCategoryNames.has(current.category)) return current;
      return { ...current, category: activeCategoryNames[0] };
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function setField(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleWord(id: string) {
    setSelectedWordIds((current) => current.includes(id) ? current.filter((wordId) => wordId !== id) : [...current, id]);
  }

  function editLesson(lesson: LessonRow) {
    const editorState = buildLessonEditorStateById(lesson.id, lessons);
    if (!editorState) {
      setMessage("Selected lesson could not be loaded. Refresh and try again.");
      return;
    }

    setActiveLessonId(editorState.lessonId);
    setEditingId(editorState.lessonId);
    setForm(editorState.form);
    setSelectedWordIds(editorState.selectedWordIds);
    setMessage(null);
    document.getElementById("ga-lesson-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function buildQuizQuestions() {
    return selectedWords.map((word, index) => ({
      questionType: "english_to_ga",
      wordId: word.id,
      prompt: `What is "${word.englishWord}" in Ga?`,
      options: [...new Set([word.gaWord, ...selectedWords.filter((item) => item.id !== word.id).slice(0, 3).map((item) => item.gaWord)])],
      correctAnswer: word.gaWord,
      explanation: `${word.englishWord} = ${word.gaWord}`,
      sortOrder: index + 1,
    })).filter((question) => question.options.length >= 2);
  }

  async function saveLesson() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        slug: slugify(form.title),
        lessonOrder: Number(form.lessonOrder) || 0,
        wordIds: selectedWordIds,
        activities: selectedWordIds.length ? [
          { activityType: "flashcards", title: "Flashcards", instructions: "Read the English word, then practise the Ga word.", sortOrder: 1 },
          { activityType: "quiz", title: "Mini Quiz", instructions: "Choose the correct Ga word.", sortOrder: 2 },
        ] : [],
        quizQuestions: buildQuizQuestions(),
      };
      const request = getLessonUpsertRequest(editingId);
      const response = await fetch(request.url, {
        method: request.method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(body?.error ?? "Unable to save Ga lesson.");
        return;
      }
      setMessage(editingId ? "Ga lesson updated." : "Ga lesson created.");
      setEditingId(null);
      setActiveLessonId(null);
      setSelectedWordIds([]);
      setForm(defaultForm);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function prepareBeginnerPack() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/ga/lessons/beginner-pack-1", { method: "POST" });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(body?.error ?? "Unable to prepare Beginner Pack 1.");
        return;
      }
      setMessage("Beginner Pack 1 lesson framework prepared as drafts.");
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <section className="rounded-3xl border border-slate-800/80 bg-linear-to-br from-emerald-500/15 via-slate-950 to-cyan-500/10 p-6">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Ga Learning Hub</p>
        <h1 className="mt-2 text-3xl font-black text-white">Ga Lessons, Flashcards & Quizzes</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-300">Build Beginner Pack 1 from Approved Ga words only. Draft lessons can exist before the required approved vocabulary is ready.</p>
        <button type="button" onClick={prepareBeginnerPack} disabled={saving} className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Prepare Beginner Pack 1 drafts</button>
      </section>

      {message ? <p className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100">{message}</p> : null}

      <AdminSectionCard title={editingId ? "Edit Ga Lesson" : "Create Ga Lesson"} eyebrow="Approved words only">
        <div id="ga-lesson-editor" />
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs font-bold uppercase text-slate-400">Title<input value={form.title} onChange={(event) => setField("title", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs font-bold uppercase text-slate-400">Level<select value={form.level} onChange={(event) => setField("level", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">{GA_LEVELS.map((level) => <option key={level}>{level}</option>)}</select></label>
          <label className="text-xs font-bold uppercase text-slate-400">Category<select value={form.category} onChange={(event) => setField("category", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">{lessonFormCategoryOptions.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label className="text-xs font-bold uppercase text-slate-400">Publish status<select value={form.publishStatus} onChange={(event) => setField("publishStatus", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">{GA_LESSON_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label className="text-xs font-bold uppercase text-slate-400">Pack key<input value={form.packKey} onChange={(event) => setField("packKey", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs font-bold uppercase text-slate-400">Order<input value={form.lessonOrder} onChange={(event) => setField("lessonOrder", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
          <label className="md:col-span-3 text-xs font-bold uppercase text-slate-400">Objective<textarea value={form.objective} onChange={(event) => setField("objective", event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
        </div>
        {selectedCategoryInactive ? <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-100">Selected category is inactive or archived. Review category settings before saving this lesson.</p> : null}

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-xs font-black uppercase text-slate-400">Approved words</p>
          {!approvedWords.length ? <p className="mt-2 text-sm text-amber-200">No Approved Ga words yet. Add and approve words in the Ga Word Bank before publishing lessons.</p> : null}
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {approvedWords.map((word) => (
              <label key={word.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
                <input type="checkbox" checked={selectedWordIds.includes(word.id)} onChange={() => toggleWord(word.id)} />
                <span><b>{word.englishWord}</b> · {word.gaWord}</span>
              </label>
            ))}
          </div>
          {selectedWords.length ? (
            <p className="mt-3 text-xs text-emerald-200">Linked approved words: {selectedWords.map((word) => `${word.englishWord} (${word.gaWord})`).join(", ")}</p>
          ) : null}
        </div>

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={saveLesson} disabled={saving} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{editingId ? "Update lesson" : "Create lesson"}</button>
          {editingId ? <button type="button" onClick={() => { setEditingId(null); setActiveLessonId(null); setSelectedWordIds([]); setForm(defaultForm); }} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-200">Cancel edit</button> : null}
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="Beginner Pack 1 Framework" eyebrow="Drafts are safe until approved words exist">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {BEGINNER_PACK_1_LESSONS.map((lesson) => (
            <article key={lesson.slug} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
              <p className="font-black text-white">Lesson {lesson.lessonOrder}: {lesson.title}</p>
              <p>{lesson.category} · {lesson.level}</p>
            </article>
          ))}
        </div>
      </AdminSectionCard>

      <AdminSectionCard title={`Ga Lessons (${lessons.length})`} eyebrow="Admin view">
        <div className="overflow-x-auto">
          <table className="w-full min-w-180 text-left text-xs">
            <thead className="uppercase text-slate-500"><tr><th className="px-2 py-2">Lesson</th><th className="px-2 py-2">Level</th><th className="px-2 py-2">Words</th><th className="px-2 py-2">Quiz</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Action</th></tr></thead>
            <tbody>
              {lessons.map((lesson) => (
                <tr key={lesson.id} className={`border-t border-slate-800 text-slate-300 ${activeLessonId === lesson.id ? "bg-emerald-500/10" : ""}`}>
                  <td className="px-2 py-2 font-bold text-white">
                    <button type="button" onClick={() => editLesson(lesson)} className="text-left text-cyan-200 underline-offset-2 hover:underline">{lesson.title}</button>
                  </td>
                  <td className="px-2 py-2">{lesson.level}</td>
                  <td className="px-2 py-2">{lesson.words.length}</td>
                  <td className="px-2 py-2">{lesson.quizQuestions.length}</td>
                  <td className="px-2 py-2">{lesson.publishStatus}</td>
                  <td className="px-2 py-2"><button type="button" onClick={() => editLesson(lesson)} className="rounded-lg border border-slate-700 px-3 py-1 font-bold text-slate-100">View/Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSectionCard>
    </div>
  );
}
