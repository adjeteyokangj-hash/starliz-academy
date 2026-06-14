"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import GaHubAccordionSection from "@/components/admin/GaHubAccordionSection";
import { GA_LEVELS } from "@/lib/ga-word-bank";
import { BEGINNER_PACK_1_LESSONS, GA_LESSON_STATUSES } from "@/lib/ga-lessons";
import { GA_APPROVED_CATEGORIES } from "@/lib/ga-word-categories";
import {
  buildLessonEditorStateById,
  getLessonPreviewHref,
  getLessonPublishToggleRequest,
  getLessonPublishRequest,
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
  wordCount?: number;
  lessonCount?: number;
  source?: "database" | "fallback";
};

type StudentAssignmentCandidate = {
  id: string;
  name: string;
  yearGroup?: string | null;
  classGroup?: string | null;
};

type AssignmentListRow = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  student: { id: string; name: string; yearGroup?: string | null; parent?: { email?: string | null } };
  content: { id: string; topic: string; skillFocus: string | null; contentType: string };
  score: number | null;
  attempts: number;
  weakWords: string[];
  weakAreas: Array<{ weaknessType: string; accuracy: number }>;
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
  const [lessonAssignments, setLessonAssignments] = useState<AssignmentListRow[]>([]);
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentAssignmentCandidate[]>([]);
  const [assignmentTargetMode, setAssignmentTargetMode] = useState<"student" | "yearGroup">("student");
  const [targetStudentId, setTargetStudentId] = useState<string>("");
  const [targetYearGroup, setTargetYearGroup] = useState<string>("");
  const [assigningLessonId, setAssigningLessonId] = useState<string | null>(null);
  const [assignmentBusyId, setAssignmentBusyId] = useState<string | null>(null);
  const [lessonActionBusyId, setLessonActionBusyId] = useState<string | null>(null);
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
      wordCount: 0,
      lessonCount: 0,
      source: "fallback" as const,
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
  const selectedStudent = students.find((student) => student.id === targetStudentId) ?? null;
  const availableYearGroups = useMemo(
    () => Array.from(new Set(students.map((student) => student.yearGroup).filter((value): value is string => Boolean(value)))).sort((left, right) => left.localeCompare(right)),
    [students],
  );
  const lessonById = useMemo(() => new Map(lessons.map((lesson) => [lesson.id, lesson])), [lessons]);
  const activeLessons = useMemo(() => lessons.filter((lesson) => lesson.publishStatus !== "Archived"), [lessons]);
  const archivedLessons = useMemo(() => lessons.filter((lesson) => lesson.publishStatus === "Archived"), [lessons]);

  const gaAssignments = useMemo(() => {
    return lessonAssignments
      .map((assignment) => {
        const skillFocus = assignment.content.skillFocus ?? "";
        const lessonId = skillFocus.startsWith("ga_lesson:") ? skillFocus.replace("ga_lesson:", "") : "";
        const lesson = lessonById.get(lessonId) ?? null;
        return { ...assignment, lessonId, lessonTitle: lesson?.title ?? assignment.content.topic ?? "Ga lesson" };
      })
      .filter((assignment) => assignment.lessonId || assignment.content.contentType === "ga");
  }, [lessonAssignments, lessonById]);

  const load = useCallback(async (): Promise<LessonRow[]> => {
    const [lessonResponse, wordResponse, categoryResponse, studentResponse, assignmentResponse] = await Promise.all([
      fetch("/api/admin/ga/lessons"),
      fetch("/api/admin/ga/words?reviewStatus=Approved&limit=200"),
      fetch("/api/admin/ga/categories"),
      fetch("/api/admin/students?context=assignment"),
      fetch("/api/admin/assignments?query=ga_lesson"),
    ]);
    if (
      lessonResponse.status === 401
      || wordResponse.status === 401
      || categoryResponse.status === 401
      || studentResponse.status === 401
      || assignmentResponse.status === 401
    ) {
      window.location.replace("/admin/login?next=/admin/ga-lessons");
      return [];
    }
    const lessonPayload = await lessonResponse.json().catch(() => null) as { items?: LessonRow[] } | null;
    const wordPayload = await wordResponse.json().catch(() => null) as { items?: ApprovedWord[] } | null;
    const categoryPayload = await categoryResponse.json().catch(() => null) as { items?: GaCategoryRow[] } | null;
    const studentPayload = await studentResponse.json().catch(() => null) as { students?: StudentAssignmentCandidate[] } | null;
    const assignmentPayload = await assignmentResponse.json().catch(() => null) as { assignments?: AssignmentListRow[] } | null;
    const lessonItems = lessonPayload?.items ?? [];
    const approvedItems = wordPayload?.items ?? [];
    const nextCategories = categoryPayload?.items ?? [];
    setLessons(lessonItems);
    setApprovedWords(mergeLessonLinkedWords(approvedItems, lessonItems));
    setCategories(nextCategories);
    setLessonAssignments(Array.isArray(assignmentPayload?.assignments) ? assignmentPayload.assignments : []);
    const studentItems = Array.isArray(studentPayload?.students) ? studentPayload.students : [];
    setStudents(studentItems);
    setTargetStudentId((current) => {
      if (current && studentItems.some((student) => student.id === current)) return current;
      return studentItems[0]?.id ?? "";
    });
    setTargetYearGroup((current) => {
      if (current && studentItems.some((student) => student.yearGroup === current)) return current;
      return studentItems.find((student) => Boolean(student.yearGroup))?.yearGroup ?? "";
    });
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
    return lessonItems;
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

  function editLesson(lesson: LessonRow, sourceLessons: LessonRow[] = lessons) {
    const editorState = buildLessonEditorStateById(lesson.id, sourceLessons);
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

  async function publishLesson() {
    const request = getLessonPublishRequest(editingId);
    if (!request || saving) return;
    setSaving(true);
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.body),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(body?.error ?? "Unable to publish Ga lesson.");
        return;
      }
      setForm((current) => ({ ...current, publishStatus: "Published" }));
      setMessage("Ga lesson published and now visible in Ga Learning Hub.");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleLessonPublishStatus(lesson: LessonRow) {
    if (saving) return;
    setSaving(true);
    try {
      const request = getLessonPublishToggleRequest(lesson);
      const response = await fetch(request.url, {
        method: request.method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.body),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(body?.error ?? "Unable to update Ga lesson publish status.");
        return;
      }
      setMessage(request.nextStatus === "Published" ? "Ga lesson published." : "Ga lesson moved to draft.");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function assignLesson(lesson: LessonRow) {
    if (assignmentTargetMode === "student" && !targetStudentId) {
      setMessage("Choose a student before assigning a lesson.");
      return;
    }
    if (assignmentTargetMode === "yearGroup" && !targetYearGroup) {
      setMessage("Choose a year group before assigning a lesson.");
      return;
    }
    setAssigningLessonId(lesson.id);
    try {
      const assignmentContentResponse = await fetch(`/api/admin/ga/lessons/${lesson.id}/assignment-content`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const assignmentContentPayload = await assignmentContentResponse.json().catch(() => null) as { contentId?: string; error?: string } | null;
      if (!assignmentContentResponse.ok || !assignmentContentPayload?.contentId) {
        setMessage(assignmentContentPayload?.error ?? "Could not prepare lesson assignment content.");
        return;
      }

      const assignResponse = await fetch("/api/admin/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          assignmentTargetMode === "student"
            ? { contentId: assignmentContentPayload.contentId, studentIds: [targetStudentId] }
            : { contentId: assignmentContentPayload.contentId, yearGroup: targetYearGroup },
        ),
      });
      const assignPayload = await assignResponse.json().catch(() => null) as {
        count?: number;
        allDuplicates?: boolean;
        blocked?: Array<{ code?: string; reason?: string }>;
        error?: string;
      } | null;

      if (!assignResponse.ok) {
        const reason = assignPayload?.blocked?.[0]?.reason;
        setMessage(reason ?? assignPayload?.error ?? "Could not assign Ga lesson.");
        return;
      }

      if (assignPayload?.allDuplicates) {
        if (assignmentTargetMode === "yearGroup") {
          setMessage(`This lesson is already assigned to active students in ${targetYearGroup}.`);
          return;
        }
        setMessage(`This lesson is already assigned to ${selectedStudent?.name ?? "the selected student"}.`);
        return;
      }

      if (assignmentTargetMode === "yearGroup") {
        setMessage(`Assigned \"${lesson.title}\" to ${targetYearGroup}.`);
        await load();
        return;
      }
      setMessage(`Assigned \"${lesson.title}\" to ${selectedStudent?.name ?? "student"}.`);
      await load();
    } finally {
      setAssigningLessonId(null);
    }
  }

  async function removeAssignment(assignmentId: string) {
    const confirmed = window.confirm("Remove this student lesson assignment? This archives the assignment and removes it from active lists.");
    if (!confirmed) return;
    setAssignmentBusyId(assignmentId);
    try {
      const response = await fetch(`/api/admin/assignments/${assignmentId}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "Unable to remove assignment.");
        return;
      }
      setMessage(payload?.message ?? "Assignment removed.");
      await load();
    } finally {
      setAssignmentBusyId(null);
    }
  }

  async function runLessonLifecycleAction(lesson: LessonRow, mode: "archive" | "delete" | "restore") {
    const confirmationText = mode === "archive"
      ? `Archive \"${lesson.title}\"? Students cannot be assigned from archived lessons.`
      : mode === "delete"
        ? `Delete \"${lesson.title}\" permanently? This only succeeds when there is no assignment/progress/history.`
        : `Restore \"${lesson.title}\" to Draft?`;

    if (!window.confirm(confirmationText)) return;

    setLessonActionBusyId(lesson.id);
    try {
      if (mode === "restore") {
        const response = await fetch(`/api/admin/ga/lessons/${lesson.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ publishStatus: "Draft" }),
        });
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok) {
          setMessage(payload?.error ?? "Unable to restore lesson.");
          return;
        }
        setMessage("Lesson restored to draft.");
        await load();
        return;
      }

      const response = await fetch(`/api/admin/ga/lessons/${lesson.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; message?: string; usage?: Record<string, number> } | null;
      if (!response.ok) {
        if (payload?.usage) {
          setMessage(`Cannot delete lesson: assignments ${payload.usage.assignmentCount ?? 0}, progress ${payload.usage.progressCount ?? 0}, recordings ${payload.usage.recordingCount ?? 0}.`);
          return;
        }
        setMessage(payload?.error ?? "Unable to update lesson lifecycle.");
        return;
      }
      setMessage(payload?.message ?? (mode === "archive" ? "Lesson archived." : "Lesson deleted."));
      await load();
    } finally {
      setLessonActionBusyId(null);
    }
  }

  async function openOrCreateBeginnerPackLesson(template: typeof BEGINNER_PACK_1_LESSONS[number]) {
    const existing = lessons.find((lesson) => lesson.slug === template.slug);
    if (existing) {
      editLesson(existing);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/ga/lessons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: template.title,
          slug: template.slug,
          description: "Beginner Pack 1 framework. Add Approved Ga words before publishing.",
          level: template.level,
          category: template.category,
          objective: template.objective,
          packKey: "beginner-pack-1",
          lessonOrder: template.lessonOrder,
          publishStatus: "Draft",
          wordIds: [],
          activities: [],
          quizQuestions: [],
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "Unable to create Beginner Pack lesson draft.");
        return;
      }
      const refreshedLessons = await load();
      const refreshedLesson = refreshedLessons.find((lesson) => lesson.slug === template.slug);
      if (refreshedLesson) {
        editLesson(refreshedLesson, refreshedLessons);
      } else {
        setMessage("Draft created. Refreshing lesson list...");
      }
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

      <GaHubAccordionSection title="Assignment Target" eyebrow="Applies to row-level Assign actions" defaultOpen={true}>
        {!students.length ? (
          <p className="text-sm text-amber-200">No eligible students found for assignment.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-bold uppercase text-slate-400">
              Assign mode
              <select
                value={assignmentTargetMode}
                onChange={(event) => setAssignmentTargetMode(event.target.value as "student" | "yearGroup")}
                className="mt-1 w-48 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                <option value="student">Student</option>
                <option value="yearGroup">Year group</option>
              </select>
            </label>
            <label className="text-xs font-bold uppercase text-slate-400">
              {assignmentTargetMode === "student" ? "Student" : "Year group"}
              {assignmentTargetMode === "student" ? (
                <select
                  value={targetStudentId}
                  onChange={(event) => setTargetStudentId(event.target.value)}
                  className="mt-1 w-72 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name}{student.yearGroup ? ` · ${student.yearGroup}` : ""}{student.classGroup ? ` · ${student.classGroup}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={targetYearGroup}
                  onChange={(event) => setTargetYearGroup(event.target.value)}
                  className="mt-1 w-56 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  {availableYearGroups.map((yearGroup) => (
                    <option key={yearGroup} value={yearGroup}>{yearGroup}</option>
                  ))}
                </select>
              )}
            </label>
            <p className="text-xs text-slate-400">Set once, then use Assign on any lesson row.</p>
          </div>
        )}
      </GaHubAccordionSection>

      <GaHubAccordionSection title={editingId ? "Edit Ga Lesson" : "Create Ga Lesson"} eyebrow="Approved words only" defaultOpen={true}>
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

        <GaHubAccordionSection title="Approved Words" defaultOpen={true} className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
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
        </GaHubAccordionSection>

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={saveLesson} disabled={saving} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{editingId ? "Update lesson" : "Create lesson"}</button>
          {editingId && form.publishStatus !== "Published" ? (
            <button
              type="button"
              onClick={publishLesson}
              disabled={saving}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              Publish lesson
            </button>
          ) : null}
          {editingId ? <button type="button" onClick={() => { setEditingId(null); setActiveLessonId(null); setSelectedWordIds([]); setForm(defaultForm); }} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-200">Cancel edit</button> : null}
        </div>
      </GaHubAccordionSection>

      <GaHubAccordionSection
        title="Beginner Pack 1 Framework"
        eyebrow="Drafts are safe until approved words exist"
        defaultOpen={true}
        helperText="Click a lesson card to open or create its draft in the editor above."
      >
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {BEGINNER_PACK_1_LESSONS.map((lesson) => (
            <button
              key={lesson.slug}
              type="button"
              onClick={() => void openOrCreateBeginnerPackLesson(lesson)}
              className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-left text-xs text-slate-300 transition hover:border-cyan-400/60 hover:bg-cyan-500/10"
            >
              <p className="font-black text-white">Lesson {lesson.lessonOrder}: {lesson.title}</p>
              <p>{lesson.category} · {lesson.level}</p>
              <p className="mt-2 text-[11px] font-bold text-cyan-200">Open in editor</p>
            </button>
          ))}
        </div>
      </GaHubAccordionSection>

      <GaHubAccordionSection
        title="Approved Categories Coverage"
        eyebrow="Lessons + Word Bank visibility"
        defaultOpen={true}
        helperText="Counts help validate category/word alignment and fallback safety."
      >
        <div className="overflow-x-auto">
            <table className="w-full min-w-180 text-left text-xs">
              <thead className="uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-2">Category</th>
                  <th className="px-2 py-2">Slug</th>
                  <th className="px-2 py-2">Lessons</th>
                  <th className="px-2 py-2">Word Bank</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {resolvedCategories.map((category) => {
                  const wordsInCategory = category.wordCount ?? approvedWords.filter((word) => word.category === category.name).length;
                  const lessonsInCategory = category.lessonCount ?? lessons.filter((lesson) => lesson.category === category.name).length;
                  const isFallback = category.source === "fallback" || category.id.startsWith("fallback-");
                  return (
                    <tr key={category.id} className="border-t border-slate-800 text-slate-300">
                      <td className="px-2 py-2 font-bold text-white">{category.name}</td>
                      <td className="px-2 py-2">{category.slug}</td>
                      <td className="px-2 py-2">{lessonsInCategory}</td>
                      <td className="px-2 py-2">{wordsInCategory}</td>
                      <td className="px-2 py-2">
                        {isFallback
                          ? "Fallback only"
                          : !category.isActive || category.isArchived
                            ? "Inactive"
                            : "Active"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
      </GaHubAccordionSection>

      <GaHubAccordionSection
        title={`Active Lessons (${activeLessons.length})`}
        eyebrow="Archive before delete"
        defaultOpen={false}
        helperText="Large lesson table is collapsed by default. Expand to manage publish, assign, and archive actions."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-180 text-left text-xs">
            <thead className="uppercase text-slate-500"><tr><th className="px-2 py-2">Lesson</th><th className="px-2 py-2">Level</th><th className="px-2 py-2">Words</th><th className="px-2 py-2">Quiz</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Actions</th></tr></thead>
            <tbody>
              {activeLessons.map((lesson) => (
                <tr key={lesson.id} className={`border-t border-slate-800 text-slate-300 ${activeLessonId === lesson.id ? "bg-emerald-500/10" : ""}`}>
                  <td className="px-2 py-2 font-bold text-white">
                    <button type="button" onClick={() => editLesson(lesson)} className="text-left text-cyan-200 underline-offset-2 hover:underline">{lesson.title}</button>
                  </td>
                  <td className="px-2 py-2">{lesson.level}</td>
                  <td className="px-2 py-2">{lesson.words.length}</td>
                  <td className="px-2 py-2">{lesson.quizQuestions.length}</td>
                  <td className="px-2 py-2">{lesson.publishStatus}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => editLesson(lesson)} className="rounded-lg border border-slate-700 px-3 py-1 font-bold text-slate-100">Edit</button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void toggleLessonPublishStatus(lesson)}
                        className="rounded-lg border border-emerald-500/60 px-3 py-1 font-bold text-emerald-200 disabled:opacity-60"
                      >
                        {lesson.publishStatus === "Published" ? "Unpublish" : "Publish"}
                      </button>
                      <button
                        type="button"
                        disabled={
                          assigningLessonId === lesson.id
                          || (assignmentTargetMode === "student" ? !targetStudentId : !targetYearGroup)
                          || lesson.publishStatus !== "Published"
                        }
                        onClick={() => void assignLesson(lesson)}
                        className="rounded-lg bg-cyan-500 px-3 py-1 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {assigningLessonId === lesson.id ? "Assigning..." : "Assign"}
                      </button>
                      <Link
                        href={getLessonPreviewHref(lesson)}
                        className="rounded-lg border border-slate-700 px-3 py-1 font-bold text-slate-100"
                      >
                        Preview as student
                      </Link>
                      <button
                        type="button"
                        disabled={lessonActionBusyId === lesson.id}
                        onClick={() => void runLessonLifecycleAction(lesson, "archive")}
                        className="rounded-lg border border-amber-600/70 px-3 py-1 font-bold text-amber-100 disabled:opacity-60"
                      >
                        {lessonActionBusyId === lesson.id ? "Working..." : "Archive"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GaHubAccordionSection>

      <GaHubAccordionSection
        title={`Archived Lessons (${archivedLessons.length})`}
        eyebrow="Delete only after archive and no usage"
        defaultOpen={false}
        helperText="Archived lessons cannot be assigned. Restore to Draft or delete permanently if there is no usage history."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-180 text-left text-xs">
            <thead className="uppercase text-slate-500"><tr><th className="px-2 py-2">Lesson</th><th className="px-2 py-2">Level</th><th className="px-2 py-2">Words</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Actions</th></tr></thead>
            <tbody>
              {archivedLessons.map((lesson) => (
                <tr key={lesson.id} className="border-t border-slate-800 text-slate-300">
                  <td className="px-2 py-2 font-bold text-white">{lesson.title}</td>
                  <td className="px-2 py-2">{lesson.level}</td>
                  <td className="px-2 py-2">{lesson.words.length}</td>
                  <td className="px-2 py-2">{lesson.publishStatus}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={lessonActionBusyId === lesson.id}
                        onClick={() => void runLessonLifecycleAction(lesson, "restore")}
                        className="rounded-lg border border-slate-700 px-3 py-1 font-bold text-slate-100 disabled:opacity-60"
                      >
                        {lessonActionBusyId === lesson.id ? "Working..." : "Restore"}
                      </button>
                      <button
                        type="button"
                        disabled={lessonActionBusyId === lesson.id}
                        onClick={() => void runLessonLifecycleAction(lesson, "delete")}
                        className="rounded-lg border border-rose-600/70 px-3 py-1 font-bold text-rose-100 disabled:opacity-60"
                      >
                        {lessonActionBusyId === lesson.id ? "Working..." : "Delete permanently"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GaHubAccordionSection>

      <GaHubAccordionSection
        title={`Lesson Assignments (${gaAssignments.length})`}
        eyebrow="Progress, support signals, and removal"
        defaultOpen={false}
        helperText="Active Ga lesson assignments across all students."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-260 text-left text-xs">
            <thead className="uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2">Student</th>
                <th className="px-2 py-2">Lesson</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Progress</th>
                <th className="px-2 py-2">Last activity</th>
                <th className="px-2 py-2">Support signals</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {gaAssignments.length === 0 ? (
                <tr><td colSpan={7} className="px-2 py-4 text-sm text-slate-400">No Ga lessons assigned yet.</td></tr>
              ) : gaAssignments.map((assignment) => {
                const weakSignalCount = assignment.weakWords.length + assignment.weakAreas.length;
                return (
                  <tr key={assignment.id} className="border-t border-slate-800 text-slate-300">
                    <td className="px-2 py-2 font-bold text-white">{assignment.student.name}{assignment.student.yearGroup ? ` · ${assignment.student.yearGroup}` : ""}</td>
                    <td className="px-2 py-2">{assignment.lessonTitle}</td>
                    <td className="px-2 py-2">{assignment.status}</td>
                    <td className="px-2 py-2">{assignment.score == null ? `Attempts ${assignment.attempts}` : `${assignment.score}% · Attempts ${assignment.attempts}`}</td>
                    <td className="px-2 py-2">{new Date(assignment.updatedAt).toLocaleString()}</td>
                    <td className="px-2 py-2">{weakSignalCount > 0 ? `${weakSignalCount} attention signal${weakSignalCount === 1 ? "" : "s"}` : "Stable"}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        disabled={assignmentBusyId === assignment.id}
                        onClick={() => void removeAssignment(assignment.id)}
                        className="rounded-lg border border-rose-600/70 px-3 py-1 font-bold text-rose-100 disabled:opacity-60"
                      >
                        {assignmentBusyId === assignment.id ? "Removing..." : "Remove assignment"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GaHubAccordionSection>
    </div>
  );
}
