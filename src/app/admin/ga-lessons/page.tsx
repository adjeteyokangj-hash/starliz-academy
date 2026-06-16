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
  parentEmail?: string | null;
};

type AssignmentListRow = {
  id: string;
  status: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  student: { id: string; name: string; yearGroup?: string | null; parent?: { email?: string | null } };
  content: { id: string; topic: string; skillFocus: string | null; contentType: string };
  score: number | null;
  attempts: number;
  weakWords: string[];
  weakAreas: Array<{ weaknessType: string; accuracy: number }>;
};

type AssignmentDrawerState = {
  lesson: LessonRow;
  mode: "student" | "yearGroup";
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

type AssignmentDisplayStatus = "Assigned" | "In Progress" | "Completed" | "Needs Support" | "Overdue";

function toScorePercent(score: number | null, attempts: number, status: string): number {
  if (status === "completed") return 100;
  if (score != null) return Math.max(0, Math.min(100, score));
  if (attempts <= 0) return 0;
  return Math.max(5, Math.min(95, attempts * 20));
}

function formatDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function buildSupportRecommendations(input: {
  overdue: boolean;
  attempts: number;
  completionPercent: number;
  weakWords: string[];
  weakAreas: Array<{ weaknessType: string; accuracy: number }>;
}): string[] {
  const recommendations: string[] = [];
  if (input.overdue) {
    recommendations.push("Schedule a check-in and re-activate this lesson with a smaller target.");
  }
  if (input.weakAreas.some((area) => area.accuracy < 60)) {
    recommendations.push("Assign targeted support content for the weakest skills before the next full lesson attempt.");
  }
  if (input.weakWords.length > 0) {
    recommendations.push("Run a short flashcard review for flagged weak words before retry.");
  }
  if (input.attempts >= 3 && input.completionPercent < 50) {
    recommendations.push("Reduce lesson complexity and provide guided practice for one sub-skill at a time.");
  }
  return recommendations;
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
  const [assignmentDrawer, setAssignmentDrawer] = useState<AssignmentDrawerState | null>(null);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [targetYearGroup, setTargetYearGroup] = useState<string>("");
  const [assigningLessonId, setAssigningLessonId] = useState<string | null>(null);
  const [assignmentBusyId, setAssignmentBusyId] = useState<string | null>(null);
  const [progressPanelAssignmentId, setProgressPanelAssignmentId] = useState<string | null>(null);
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
  const availableYearGroups = useMemo(
    () => Array.from(new Set(students.map((student) => student.yearGroup).filter((value): value is string => Boolean(value)))).sort((left, right) => left.localeCompare(right)),
    [students],
  );
  const assignmentMode = assignmentDrawer?.mode ?? "student";
  const filteredStudents = useMemo(() => {
    const query = assignmentSearch.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => {
      const haystack = [student.name, student.yearGroup, student.classGroup, student.parentEmail]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [assignmentSearch, students]);
  const lessonById = useMemo(() => new Map(lessons.map((lesson) => [lesson.id, lesson])), [lessons]);
  const activeLessons = useMemo(() => lessons.filter((lesson) => lesson.publishStatus !== "Archived"), [lessons]);
  const archivedLessons = useMemo(() => lessons.filter((lesson) => lesson.publishStatus === "Archived"), [lessons]);

  const gaAssignments = useMemo(() => {
    return lessonAssignments
      .map((assignment) => {
        const skillFocus = assignment.content.skillFocus ?? "";
        const lessonId = skillFocus.startsWith("ga_lesson:") ? skillFocus.replace("ga_lesson:", "") : "";
        const lesson = lessonById.get(lessonId) ?? null;
        const completionPercent = toScorePercent(assignment.score, assignment.attempts, assignment.status);
        const started = assignment.attempts > 0 || assignment.status === "in_progress" || assignment.status === "completed" || Boolean(assignment.completedAt);
        const completed = assignment.status === "completed" || Boolean(assignment.completedAt) || completionPercent >= 100;
        const weakSignalCount = assignment.weakWords.length + assignment.weakAreas.length;
        const stalled = !completed && assignment.status === "in_progress" && assignment.attempts >= 3 && completionPercent < 50;
        const overdue = assignment.status === "overdue" || stalled;
        const needsSupport = !overdue && !completed && weakSignalCount > 0;
        const displayStatus: AssignmentDisplayStatus = overdue
          ? "Overdue"
          : needsSupport
            ? "Needs Support"
            : completed
              ? "Completed"
              : started
                ? "In Progress"
                : "Assigned";

        const rowToneClass = displayStatus === "Completed"
          ? "border-l-4 border-l-emerald-400 bg-emerald-500/10"
          : displayStatus === "In Progress"
            ? "border-l-4 border-l-sky-400 bg-sky-500/10"
            : displayStatus === "Needs Support"
              ? "border-l-4 border-l-amber-400 bg-amber-500/10"
              : displayStatus === "Overdue"
                ? "border-l-4 border-l-rose-400 bg-rose-500/10"
                : "border-l-4 border-l-slate-500 bg-slate-800/35";

        const supportSignals = weakSignalCount > 0
          ? `${weakSignalCount} support signal${weakSignalCount === 1 ? "" : "s"}`
          : null;

        const supportRecommendations = buildSupportRecommendations({
          overdue,
          attempts: assignment.attempts,
          completionPercent,
          weakWords: assignment.weakWords,
          weakAreas: assignment.weakAreas,
        });

        return {
          ...assignment,
          lessonId,
          lessonTitle: lesson?.title ?? assignment.content.topic ?? "Ga lesson",
          completionPercent,
          started,
          completed,
          displayStatus,
          supportSignals,
          supportRecommendations,
          rowToneClass,
        };
      })
      .filter((assignment) => assignment.lessonId || assignment.content.contentType === "ga");
  }, [lessonAssignments, lessonById]);

  const activeProgressPanelAssignmentId = useMemo(() => {
    if (!gaAssignments.length) return null;
    if (progressPanelAssignmentId && gaAssignments.some((assignment) => assignment.id === progressPanelAssignmentId)) {
      return progressPanelAssignmentId;
    }
    return gaAssignments[0].id;
  }, [gaAssignments, progressPanelAssignmentId]);

  const progressPanelAssignment = useMemo(
    () => gaAssignments.find((assignment) => assignment.id === activeProgressPanelAssignmentId) ?? null,
    [gaAssignments, activeProgressPanelAssignmentId],
  );

  const load = useCallback(async (): Promise<LessonRow[]> => {
    const [lessonResponse, wordResponse, categoryResponse, studentResponse, assignmentResponse] = await Promise.all([
      fetch("/api/admin/ga/lessons"),
      fetch("/api/admin/ga/words?reviewStatus=Approved&limit=200"),
      fetch("/api/admin/ga/categories"),
      fetch("/api/admin/students?context=assignment"),
      fetch("/api/admin/assignments?query=ga_lesson&limit=1000"),
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

  function openAssignDrawer(lesson: LessonRow) {
    setAssignmentSearch("");
    setSelectedStudentIds([]);
    setAssignmentDrawer({ lesson, mode: "student" });
  }

  function closeAssignDrawer() {
    if (assigningLessonId) return;
    setAssignmentDrawer(null);
    setAssignmentSearch("");
    setSelectedStudentIds([]);
  }

  function toggleStudentSelection(studentId: string) {
    setSelectedStudentIds((current) => current.includes(studentId)
      ? current.filter((id) => id !== studentId)
      : [...current, studentId]);
  }

  function setAssignmentDrawerMode(mode: "student" | "yearGroup") {
    setAssignmentDrawer((current) => current ? { ...current, mode } : current);
    setSelectedStudentIds([]);
  }

  function getLessonAssignmentSummary(lessonId: string) {
    return gaAssignments.filter((assignment) => assignment.lessonId === lessonId);
  }

  async function assignLessonFromDrawer() {
    const lesson = assignmentDrawer?.lesson;
    if (!lesson) return;
    if (assignmentMode === "student" && !selectedStudentIds.length) {
      setMessage("Choose at least one student before assigning a lesson.");
      return;
    }
    if (assignmentMode === "yearGroup" && !targetYearGroup) {
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
          assignmentMode === "student"
            ? { contentId: assignmentContentPayload.contentId, studentIds: selectedStudentIds }
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
        if (assignmentMode === "yearGroup") {
          setMessage(`This lesson is already assigned to active students in ${targetYearGroup}.`);
          return;
        }
        setMessage(`This lesson is already assigned to the selected student set.`);
        return;
      }

      if (assignmentMode === "yearGroup") {
        setMessage(`Assigned \"${lesson.title}\" to ${targetYearGroup}.`);
        await load();
        closeAssignDrawer();
        return;
      }
      setMessage(`Assigned \"${lesson.title}\" to ${selectedStudentIds.length} student${selectedStudentIds.length === 1 ? "" : "s"}.`);
      await load();
      closeAssignDrawer();
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

      <GaHubAccordionSection title="Assignment Workflow" eyebrow="Row-level assign drawer" defaultOpen={true}>
        <p className="text-sm text-slate-300">Click <span className="font-black text-white">Assign</span> on a lesson row to open a searchable student assignment drawer with current assignment status.</p>
        {!students.length ? <p className="mt-2 text-sm text-amber-200">No eligible students found for assignment.</p> : null}
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
            <article key={lesson.slug} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-left text-xs text-slate-300">
              <p className="font-black text-white">Lesson {lesson.lessonOrder}: {lesson.title}</p>
              <p>{lesson.category} · {lesson.level}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-cyan-200">{lessons.some((item) => item.slug === lesson.slug) ? "Editable draft exists" : "Draft not created yet"}</p>
                <button
                  type="button"
                  onClick={() => void openOrCreateBeginnerPackLesson(lesson)}
                  className="rounded-lg border border-cyan-500/60 px-2 py-1 text-[11px] font-black text-cyan-100 transition hover:bg-cyan-500/10"
                >
                  {lessons.some((item) => item.slug === lesson.slug) ? "Edit lesson" : "Create + edit"}
                </button>
              </div>
            </article>
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
        defaultOpen={true}
        helperText="Manage publish, assign, and archive actions for active lessons."
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
                          || !students.length
                          || lesson.publishStatus !== "Published"
                        }
                        onClick={() => openAssignDrawer(lesson)}
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
        defaultOpen={true}
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
        defaultOpen={true}
        helperText="Active Ga lesson assignments across all students."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-7xl text-left text-xs">
            <thead className="uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2">Student</th>
                <th className="px-2 py-2">Year</th>
                <th className="px-2 py-2">Lesson</th>
                <th className="px-2 py-2">Assigned date</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Progress %</th>
                <th className="px-2 py-2">Attempts</th>
                <th className="px-2 py-2">Started?</th>
                <th className="px-2 py-2">Completed?</th>
                <th className="px-2 py-2">Last activity</th>
                <th className="px-2 py-2">Support signals</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {gaAssignments.length === 0 ? (
                <tr><td colSpan={12} className="px-2 py-4 text-sm text-slate-400">No Ga lessons assigned yet.</td></tr>
              ) : gaAssignments.map((assignment) => (
                <tr key={assignment.id} className={`border-t border-slate-800 text-slate-200 ${assignment.rowToneClass}`}>
                  <td className="px-2 py-2 font-bold text-white">{assignment.student.name}</td>
                  <td className="px-2 py-2">{assignment.student.yearGroup ?? "-"}</td>
                  <td className="px-2 py-2">{assignment.lessonTitle}</td>
                  <td className="px-2 py-2">{formatDateLabel(assignment.createdAt)}</td>
                  <td className="px-2 py-2 font-bold">{assignment.displayStatus}</td>
                  <td className="px-2 py-2">{assignment.completionPercent}%</td>
                  <td className="px-2 py-2">{assignment.attempts}</td>
                  <td className="px-2 py-2">{assignment.started ? "Yes" : "No"}</td>
                  <td className="px-2 py-2">{assignment.completed ? "Yes" : "No"}</td>
                  <td className="px-2 py-2">{formatDateLabel(assignment.updatedAt)}</td>
                  <td className="px-2 py-2">{assignment.supportSignals ?? "-"}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setProgressPanelAssignmentId((current) => current === assignment.id ? null : assignment.id)}
                        className="rounded-lg border border-cyan-500/70 px-3 py-1 font-bold text-cyan-100"
                      >
                        View Progress
                      </button>
                      <button
                        type="button"
                        disabled={assignmentBusyId === assignment.id}
                        onClick={() => void removeAssignment(assignment.id)}
                        className="rounded-lg border border-rose-600/70 px-3 py-1 font-bold text-rose-100 disabled:opacity-60"
                      >
                        {assignmentBusyId === assignment.id ? "Removing..." : "Remove Assignment"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {progressPanelAssignment ? (
          <div className="mt-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200">Student lesson progress</p>
                <h3 className="mt-1 text-lg font-black text-white">{progressPanelAssignment.student.name} · {progressPanelAssignment.lessonTitle}</h3>
              </div>
              <button
                type="button"
                onClick={() => setProgressPanelAssignmentId(null)}
                className="rounded-lg border border-slate-700 px-3 py-1 text-xs font-black text-slate-100"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3 text-sm text-slate-300"><p className="text-xs uppercase text-slate-500">Lesson assigned</p><p className="mt-1 font-bold text-white">{progressPanelAssignment.lessonTitle}</p></div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3 text-sm text-slate-300"><p className="text-xs uppercase text-slate-500">Date assigned</p><p className="mt-1 font-bold text-white">{formatDateLabel(progressPanelAssignment.createdAt)}</p></div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3 text-sm text-slate-300"><p className="text-xs uppercase text-slate-500">Attempts</p><p className="mt-1 font-bold text-white">{progressPanelAssignment.attempts}</p></div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3 text-sm text-slate-300"><p className="text-xs uppercase text-slate-500">Quiz score</p><p className="mt-1 font-bold text-white">{progressPanelAssignment.score == null ? "Not scored yet" : `${progressPanelAssignment.score}%`}</p></div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3 text-sm text-slate-300"><p className="text-xs uppercase text-slate-500">Completion %</p><p className="mt-1 font-bold text-white">{progressPanelAssignment.completionPercent}%</p></div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3 text-sm text-slate-300"><p className="text-xs uppercase text-slate-500">Last activity</p><p className="mt-1 font-bold text-white">{formatDateLabel(progressPanelAssignment.updatedAt)}</p></div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-100">Weak areas</p>
                {progressPanelAssignment.weakAreas.length === 0 && progressPanelAssignment.weakWords.length === 0 ? (
                  <p className="mt-2 text-sm text-amber-50/80">No active weak-area signal yet.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm text-amber-50/90">
                    {progressPanelAssignment.weakAreas.map((area, index) => (
                      <li key={`${area.weaknessType}-${index}`}>{area.weaknessType} ({area.accuracy}% accuracy)</li>
                    ))}
                    {progressPanelAssignment.weakWords.slice(0, 5).map((word) => (
                      <li key={word}>Word focus: {word}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100">Support recommendations</p>
                {progressPanelAssignment.supportRecommendations.length === 0 ? (
                  <p className="mt-2 text-sm text-cyan-50/85">No immediate support intervention required from current signals.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm text-cyan-50/95">
                    {progressPanelAssignment.supportRecommendations.map((recommendation) => (
                      <li key={recommendation}>{recommendation}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </GaHubAccordionSection>

      {assignmentDrawer ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/75">
          <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Assign Ga lesson</p>
                <h2 className="mt-2 text-2xl font-black text-white">{assignmentDrawer.lesson.title}</h2>
                <p className="mt-2 text-sm text-slate-300">Choose specific students or assign this published lesson to an entire year group.</p>
              </div>
              <button type="button" onClick={closeAssignDrawer} disabled={Boolean(assigningLessonId)} className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-black text-slate-200 disabled:opacity-60">Close</button>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAssignmentDrawerMode("student")}
                className={`rounded-xl px-4 py-2 text-sm font-black ${assignmentMode === "student" ? "bg-cyan-500 text-white" : "border border-slate-700 text-slate-200"}`}
              >
                Student selection
              </button>
              <button
                type="button"
                onClick={() => setAssignmentDrawerMode("yearGroup")}
                className={`rounded-xl px-4 py-2 text-sm font-black ${assignmentMode === "yearGroup" ? "bg-cyan-500 text-white" : "border border-slate-700 text-slate-200"}`}
              >
                Year group
              </button>
            </div>

            {assignmentMode === "student" ? (
              <>
                <div className="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                  <label className="text-xs font-bold uppercase text-slate-400">
                    Search students
                    <input
                      value={assignmentSearch}
                      onChange={(event) => setAssignmentSearch(event.target.value)}
                      placeholder="Name, year group, class, parent email"
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
                    <p className="font-black text-white">Selected</p>
                    <p className="mt-1">{selectedStudentIds.length} student{selectedStudentIds.length === 1 ? "" : "s"}</p>
                    <p className="mt-1 text-xs text-slate-400">Current assignments are marked per student below.</p>
                  </div>
                </div>

                <div className="mt-4 max-h-112 overflow-y-auto rounded-2xl border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-950 uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-3">Pick</th>
                        <th className="px-3 py-3">Student</th>
                        <th className="px-3 py-3">Year</th>
                        <th className="px-3 py-3">Class</th>
                        <th className="px-3 py-3">Current status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.length === 0 ? (
                        <tr><td colSpan={5} className="px-3 py-6 text-sm text-slate-400">No students match your search.</td></tr>
                      ) : filteredStudents.map((student) => {
                        const existing = getLessonAssignmentSummary(assignmentDrawer.lesson.id).find((assignment) => assignment.student.id === student.id) ?? null;
                        const checked = selectedStudentIds.includes(student.id);
                        return (
                          <tr key={student.id} className="border-t border-slate-800 text-slate-300">
                            <td className="px-3 py-3 align-top">
                              <label className="inline-flex items-center gap-2 text-slate-300">
                                <input type="checkbox" checked={checked} onChange={() => toggleStudentSelection(student.id)} />
                                <span className="sr-only">Select {student.name}</span>
                              </label>
                            </td>
                            <td className="px-3 py-3 align-top font-bold text-white">{student.name}<div className="mt-1 text-[11px] font-normal text-slate-500">{student.parentEmail ?? "No parent email"}</div></td>
                            <td className="px-3 py-3 align-top">{student.yearGroup ?? "-"}</td>
                            <td className="px-3 py-3 align-top">{student.classGroup ?? "-"}</td>
                            <td className="px-3 py-3 align-top">{existing ? `${existing.status} · ${existing.attempts} attempt${existing.attempts === 1 ? "" : "s"}` : "Not assigned"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <label className="text-xs font-bold uppercase text-slate-400">
                  Year group
                  <select
                    value={targetYearGroup}
                    onChange={(event) => setTargetYearGroup(event.target.value)}
                    className="mt-1 w-full max-w-xs rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  >
                    {availableYearGroups.map((yearGroup) => (
                      <option key={yearGroup} value={yearGroup}>{yearGroup}</option>
                    ))}
                  </select>
                </label>
                <p className="mt-3 text-sm text-slate-300">This assigns the lesson to all active students in the selected year group using the existing assignment API.</p>
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Current lesson assignments</p>
              <div className="mt-3 space-y-2">
                {getLessonAssignmentSummary(assignmentDrawer.lesson.id).length === 0 ? (
                  <p className="text-sm text-slate-400">No active assignments for this lesson yet.</p>
                ) : getLessonAssignmentSummary(assignmentDrawer.lesson.id).map((assignment) => (
                  <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-300">
                    <span className="font-bold text-white">{assignment.student.name}</span>
                    <span>{assignment.student.yearGroup ?? "-"}</span>
                    <span>{assignment.status}</span>
                    <span>{assignment.score == null ? `Attempts ${assignment.attempts}` : `${assignment.score}%`}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={closeAssignDrawer} disabled={Boolean(assigningLessonId)} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-200 disabled:opacity-60">Cancel</button>
              <button
                type="button"
                onClick={() => void assignLessonFromDrawer()}
                disabled={Boolean(assigningLessonId) || (assignmentMode === "student" ? !selectedStudentIds.length : !targetYearGroup)}
                className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {assigningLessonId === assignmentDrawer.lesson.id ? "Assigning..." : assignmentMode === "student" ? `Assign to ${selectedStudentIds.length || 0} student${selectedStudentIds.length === 1 ? "" : "s"}` : `Assign to ${targetYearGroup || "year group"}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
