"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import AssignmentConfirmModal from "@/components/admin/content-library/AssignmentConfirmModal";
import AssignmentPanel from "@/components/admin/content-library/AssignmentPanel";
import ContentLibraryFilters from "@/components/admin/content-library/ContentLibraryFilters";
import ContentSummaryPanel from "@/components/admin/content-library/ContentSummaryPanel";
import ContentTopicGrid from "@/components/admin/content-library/ContentTopicGrid";
import ContentViewModal from "@/components/admin/content-library/ContentViewModal";
import type { AssignMode, AssignmentPayload, ContentItem, ContentReviewQueueBucket, SortMode, StudentAssignmentCandidate, StudentOption, ViewMode } from "@/components/admin/content-library/types";
import { evaluateAssignmentCandidate, getContentJsonSummary, getContentMeta, getContentReviewQueueBucket, normalizeText, parseBlackBoxContentTest } from "@/components/admin/content-library/utils";
import { keyStageForYearGroup } from "@/lib/curriculum";

type PendingAction = { type: "single"; candidate: StudentAssignmentCandidate } | null;

type FilterState = {
  query: string;
  studentYear: string;
  studentKeyStage: string;
  examBoardFilter: string;
  studentClass: string;
  studentParent: string;
  subjectTab: string;
  reviewBucket: ContentReviewQueueBucket | "all";
  minBlackBoxScore: string;
  generatedAfter: string;
  sortMode: SortMode;
};

function emptyFilters(): FilterState {
  return {
    query: "",
    studentYear: "",
    studentKeyStage: "",
    examBoardFilter: "",
    studentClass: "",
    studentParent: "",
    subjectTab: "all",
    reviewBucket: "awaiting_review",
    minBlackBoxScore: "",
    generatedAfter: "",
    sortMode: "newest",
  };
}

function parseFiltersFromSearchParams(searchParams: ReadonlyURLSearchParams): FilterState {
  return {
    query: searchParams.get("q") ?? "",
    studentYear: searchParams.get("year") ?? "",
    studentKeyStage: searchParams.get("ks") ?? "",
    examBoardFilter: searchParams.get("exam") ?? "",
    studentClass: searchParams.get("class") ?? "",
    studentParent: searchParams.get("parent") ?? "",
    subjectTab: searchParams.get("subject") ?? "all",
    reviewBucket: (searchParams.get("review") as ContentReviewQueueBucket | "all" | null) ?? "awaiting_review",
    minBlackBoxScore: searchParams.get("bbScore") ?? "",
    generatedAfter: searchParams.get("after") ?? "",
    sortMode: (searchParams.get("sort") as SortMode | null) ?? "newest",
  };
}

export default function ContentLibraryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [contentLoading, setContentLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [operating, setOperating] = useState<{ id: string; action: "view" | "select" | "duplicate" | "archive" | "publish" | "review" } | null>(null);

  const [draftFilters, setDraftFilters] = useState<FilterState>(() => parseFiltersFromSearchParams(searchParams));
  const [applyingFilters, setApplyingFilters] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const [selectedContentId, setSelectedContentId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [showBlocked, setShowBlocked] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [pendingResendIds, setPendingResendIds] = useState<string[] | null>(null);
  const [localDuplicateByContent, setLocalDuplicateByContent] = useState<Record<string, Set<string>>>({});
  const [viewModalContent, setViewModalContent] = useState<ContentItem | null>(null);
  const [overrideAssigning, setOverrideAssigning] = useState(false);
  const [bulkApproveSelectedIds, setBulkApproveSelectedIds] = useState<string[]>([]);

  const fetchContent = useCallback(async () => {
    const contentRes = await fetch("/api/admin/content", { cache: "no-store" });
    const contentPayload = await contentRes.json() as { items?: ContentItem[] };
    return (contentPayload.items ?? []).filter((item) => String(item.status).toLowerCase() !== "archived");
  }, []);

  const fetchStudents = useCallback(async () => {
    const studentsRes = await fetch("/api/admin/students?context=assignment");
    const studentsPayload = await studentsRes.json() as { students?: StudentOption[] };
    return studentsPayload.students ?? [];
  }, []);

  const loadData = useCallback(async () => {
    setContentLoading(true);
    try {
      const data = await fetchContent();
      setItems(data);
    } finally {
      setContentLoading(false);
    }
  }, [fetchContent]);

  const refreshDuplicateSummaryForContent = useCallback(async (contentId: string) => {
    const response = await fetch(`/api/admin/content/governance?contentId=${encodeURIComponent(contentId)}`);
    if (!response.ok) return null;
    const payload = await response.json() as { questionDuplicateSummary?: ContentItem["globalDuplicateSummary"] };
    return payload.questionDuplicateSummary ?? null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchContent()
      .then((data) => {
        if (cancelled) return;
        queueMicrotask(() => {
          if (cancelled) return;
          setItems(data);
        });
      })
      .finally(() => {
        if (!cancelled) {
          queueMicrotask(() => {
            if (!cancelled) {
              setContentLoading(false);
            }
          });
        }
      });
    void fetchStudents().then((data) => {
      if (cancelled) return;
      queueMicrotask(() => {
        if (!cancelled) {
          setStudents(data);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [fetchContent, fetchStudents]);

  useEffect(() => {
    queueMicrotask(() => {
      setBulkApproveSelectedIds((current) => {
        const validIds = new Set(items.map((item) => item.id));
        return current.filter((id) => validIds.has(id));
      });
    });
  }, [items]);

  const activeFilters = draftFilters;

  function applyFilters(nextFilters?: FilterState) {
    const resolved = nextFilters ?? draftFilters;
    setApplyingFilters(true);

    const params = new URLSearchParams();
    if (resolved.query) params.set("q", resolved.query);
    if (resolved.studentYear) params.set("year", resolved.studentYear);
    if (resolved.studentKeyStage) params.set("ks", resolved.studentKeyStage);
    if (resolved.examBoardFilter) params.set("exam", resolved.examBoardFilter);
    if (resolved.studentClass) params.set("class", resolved.studentClass);
    if (resolved.studentParent) params.set("parent", resolved.studentParent);
    if (resolved.subjectTab && resolved.subjectTab !== "all") params.set("subject", resolved.subjectTab);
    if (resolved.reviewBucket && resolved.reviewBucket !== "all") params.set("review", resolved.reviewBucket);
    if (resolved.minBlackBoxScore) params.set("bbScore", resolved.minBlackBoxScore);
    if (resolved.generatedAfter) params.set("after", resolved.generatedAfter);
    if (resolved.sortMode !== "newest") params.set("sort", resolved.sortMode);
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    window.setTimeout(() => setApplyingFilters(false), 150);
  }

  function resetFilters() {
    const reset = emptyFilters();
    setDraftFilters(reset);
    applyFilters(reset);
  }

  const classGroups = useMemo(() => {
    const values = new Set<string>();
    for (const student of students) {
      if (student.classGroup) values.add(student.classGroup);
      for (const group of student.classGroups ?? []) values.add(group);
    }
    return Array.from(values).sort();
  }, [students]);

  const parents = useMemo(() => {
    const values = new Set<string>();
    for (const student of students) {
      if (student.parentName) values.add(student.parentName);
    }
    return Array.from(values).sort();
  }, [students]);

  const filteredStudents = useMemo(() => {
    const needle = normalizeText(activeFilters.query);
    return students.filter((student) => {
      const studentYearValue = student.yearGroup ?? "";
      const stage = student.keyStageLevel || (studentYearValue ? keyStageForYearGroup(studentYearValue) : "");
      const matchesSearch = !needle
        || normalizeText(student.name).includes(needle)
        || normalizeText(student.parentName).includes(needle)
        || normalizeText(student.classGroup).includes(needle);
      const matchesYear = !activeFilters.studentYear || studentYearValue === activeFilters.studentYear;
      const matchesStage = !activeFilters.studentKeyStage || stage === activeFilters.studentKeyStage;
      const matchesClass = !activeFilters.studentClass || student.classGroup === activeFilters.studentClass || (student.classGroups ?? []).includes(activeFilters.studentClass);
      const matchesParent = !activeFilters.studentParent || student.parentName === activeFilters.studentParent;
      return matchesSearch && matchesYear && matchesStage && matchesClass && matchesParent;
    });
  }, [students, activeFilters]);

  const filteredItems = useMemo(() => {
    const activeItems = items.filter((item) => String(item.status).toLowerCase() !== "archived");

    const bySubject = activeItems.filter((item) => {
      if (activeFilters.subjectTab === "all") return true;
      return getContentMeta(item).subject === activeFilters.subjectTab;
    });

    const byCurriculum = bySubject.filter((item) => {
      const meta = getContentMeta(item);
      const blackBox = parseBlackBoxContentTest(item);
      const minBlackBoxScore = Number(activeFilters.minBlackBoxScore);
      const matchesExamBoard = !activeFilters.examBoardFilter || meta.examBoard === activeFilters.examBoardFilter;
      const matchesYear = !activeFilters.studentYear || normalizeText(meta.yearGroup).includes(normalizeText(activeFilters.studentYear));
      const matchesKeyStage = !activeFilters.studentKeyStage || normalizeText(meta.keyStage).includes(normalizeText(activeFilters.studentKeyStage));
      const matchesReview = activeFilters.reviewBucket === "all" || getContentReviewQueueBucket(item) === activeFilters.reviewBucket;
      const matchesBlackBoxScore = !activeFilters.minBlackBoxScore
        || (typeof blackBox?.score === "number" && Number.isFinite(minBlackBoxScore) && blackBox.score >= minBlackBoxScore);
      const matchesGeneratedAfter = !activeFilters.generatedAfter || Date.parse(item.createdAt) >= Date.parse(activeFilters.generatedAfter);
      return matchesExamBoard && matchesYear && matchesKeyStage && matchesReview && matchesBlackBoxScore && matchesGeneratedAfter;
    });

    return [...byCurriculum].sort((a, b) => {
      if (activeFilters.sortMode === "newest") return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (activeFilters.sortMode === "oldest") return Date.parse(a.createdAt) - Date.parse(b.createdAt);
      if (activeFilters.sortMode === "most-used") return b.usedCount - a.usedCount;
      return (b.usedCount - a.usedCount) || (Date.parse(b.createdAt) - Date.parse(a.createdAt));
    });
  }, [items, activeFilters]);

  const selectedContent = useMemo(
    () => filteredItems.find((item) => item.id === selectedContentId) ?? null,
    [filteredItems, selectedContentId],
  );

  const candidates = useMemo(() => {
    if (!selectedContent) return [] as StudentAssignmentCandidate[];
    const localDuplicates = localDuplicateByContent[selectedContent.id] ?? new Set<string>();
    return filteredStudents
      .map((student) => evaluateAssignmentCandidate(selectedContent, student, localDuplicates, false))
      .sort((a, b) => b.recommendationScore - a.recommendationScore || a.student.name.localeCompare(b.student.name));
  }, [selectedContent, filteredStudents, localDuplicateByContent]);

  const recommended = useMemo(() => candidates.filter((entry) => entry.hardEligible && entry.recommendationLevel === "recommended"), [candidates]);
  const eligibleManual = useMemo(() => candidates.filter((entry) => entry.hardEligible && entry.recommendationLevel === "eligible_manual"), [candidates]);
  const blocked = useMemo(() => candidates.filter((entry) => !entry.hardEligible), [candidates]);

  const selectedCandidate = useMemo(
    () => candidates.find((entry) => entry.student.id === selectedStudentId) ?? null,
    [candidates, selectedStudentId],
  );

  const totals = useMemo(() => {
    const reviewedPublished = filteredItems.filter((item) => ["reviewed", "approved", "published"].includes(item.status)).length;
    const draft = filteredItems.filter((item) => item.status === "draft").length;
    const invalidJson = filteredItems.filter((item) => !getContentJsonSummary(item.contentJson).valid).length;
    const awaitingReview = items.filter((item) => getContentReviewQueueBucket(item) === "awaiting_review").length;
    const reclassified = items.filter((item) => getContentReviewQueueBucket(item) === "reclassified").length;
    const rejected = items.filter((item) => getContentReviewQueueBucket(item) === "rejected").length;
    const approved = items.filter((item) => getContentReviewQueueBucket(item) === "approved").length;
    const published = items.filter((item) => getContentReviewQueueBucket(item) === "published").length;
    return { reviewedPublished, draft, invalidJson, awaitingReview, reclassified, rejected, approved, published };
  }, [filteredItems, items]);

  function selectContent(item: ContentItem) {
    setOperating({ id: item.id, action: "select" });
    setSelectedContentId(item.id);
    setSelectedStudentId(null);
    setShowBlocked(false);
    window.setTimeout(() => setOperating(null), 180);
  }

  function openSingleAssignment() {
    if (!selectedContent || !selectedCandidate || !selectedCandidate.hardEligible) {
      setMessage("Choose an eligible student before assigning.");
      return;
    }
    setPendingAction({ type: "single", candidate: selectedCandidate });
  }

  function openModeAssignment(mode: AssignMode) {
    if (!selectedContent) return;
    const ids = mode === "recommended"
      ? recommended.map((entry) => entry.student.id)
      : [...recommended, ...eligibleManual].map((entry) => entry.student.id);
    if (!ids.length) {
      setMessage(mode === "recommended" ? "No recommended students" : "No eligible students");
      return;
    }
    void applyAssignment(ids, mode);
  }

  async function applyAssignment(ids: string[], modeLabel: string, resend = false) {
    if (!selectedContent || ids.length === 0) return;
    return applyAssignmentWithOptions(ids, modeLabel, { resend });
  }

  async function applyAssignmentWithOptions(ids: string[], modeLabel: string, options: { resend?: boolean; adminOverride?: boolean; overrideReason?: string } = {}) {
    if (!selectedContent || ids.length === 0) return;
    const { resend = false, adminOverride = false, overrideReason } = options;

    setAssigning(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId: selectedContent.id,
          studentIds: ids,
          resend,
          ...(adminOverride ? { adminOverride: true, overrideReason: overrideReason ?? "Admin manual assignment after Level Finder review" } : {}),
        }),
      });
      const payload = await response.json() as AssignmentPayload;

      if (!response.ok) {
        const duplicateBlocked = payload.blocked?.filter((b) => b.code === "DUPLICATE_ASSIGNMENT") ?? [];
        const otherBlocked = payload.blocked?.filter((b) => b.code !== "DUPLICATE_ASSIGNMENT") ?? [];
        if (otherBlocked.length) {
          const reason = otherBlocked.map((entry) => entry.reason).join(", ") || payload.error || "Assignment failed.";
          setMessage(`Assignment blocked: ${reason}`);
        } else if (duplicateBlocked.length) {
          // All blocked are duplicates — surface resend option
          setPendingResendIds(ids);
          setMessage(`Content is already assigned to these students. Use \u201cResend\u201d to re-notify them.`);
        } else {
          setMessage(payload.error ?? "Assignment failed.");
        }
        return;
      }

      // 200 all-duplicate case: API returns ok but allDuplicates flag set
      if (payload.allDuplicates) {
        setPendingResendIds(ids);
        setMessage(`Content is already assigned to these students. Use \u201cResend\u201d to re-notify them.`);
        return;
      }

      const count = payload.count ?? ids.length;
      setItems((current) => current.map((item) => item.id === selectedContent.id ? { ...item, usedCount: item.usedCount + count } : item));
      setLocalDuplicateByContent((current) => {
        const next = { ...current };
        const existing = new Set(next[selectedContent.id] ?? []);
        for (const id of ids) existing.add(id);
        next[selectedContent.id] = existing;
        return next;
      });

      // Partial success: some assigned, some blocked
      if (payload.blocked?.length) {
        const dupBlocked = payload.blocked.filter((b) => b.code === "DUPLICATE_ASSIGNMENT");
        const otherBl = payload.blocked.filter((b) => b.code !== "DUPLICATE_ASSIGNMENT");
        const parts: string[] = [`${count} assigned`];
        if (dupBlocked.length) parts.push(`${dupBlocked.length} already assigned`);
        if (otherBl.length) parts.push(`${otherBl.length} blocked: ${otherBl.map((b) => b.reason).join(", ")}`);
        setMessage(parts.join(", ") + ".");
      } else if (resend) {
        const name = ids.length === 1 ? (selectedCandidate?.student.name || "student") : `${count} students`;
        setMessage(`Resent to ${name} successfully.`);
        setPendingResendIds(null);
      } else if (ids.length === 1) {
        const name = selectedCandidate?.student.name || "student";
        setMessage(`Assigned to ${name} successfully.`);
      } else {
        setMessage(`Assigned to ${count} students successfully.`);
      }

      if (modeLabel === "single") {
        setSelectedStudentId(null);
      }
    } catch {
      setMessage("Assignment request failed.");
    } finally {
      setAssigning(false);
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction) return;
    await applyAssignment([pendingAction.candidate.student.id], "single");
    setPendingAction(null);
  }

  async function handleOverrideAssign(studentId: string, overrideReason: string) {
    if (!selectedContent) return;
    setOverrideAssigning(true);
    setMessage(null);
    try {
      await applyAssignmentWithOptions([studentId], "override", { adminOverride: true, overrideReason });
    } finally {
      setOverrideAssigning(false);
    }
  }

  function handleReview(item: ContentItem) {
    setOperating({ id: item.id, action: "review" });
    setViewModalContent(item);
    void refreshDuplicateSummaryForContent(item.id).then((summary) => {
      if (!summary) return;
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, globalDuplicateSummary: summary } : entry));
      setViewModalContent((current) => current?.id === item.id ? { ...current, globalDuplicateSummary: summary } : current);
    });
    window.setTimeout(() => setOperating(null), 180);
  }

  async function handleDuplicate(item: ContentItem) {
    setOperating({ id: item.id, action: "duplicate" });
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/content/${item.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json() as { id: string; topic: string };
      if (!response.ok) {
        setMessage("Failed to duplicate content");
        return;
      }
      setMessage(`Duplicated as "${result.topic}"`);
      await loadData();
    } catch {
      setMessage("Duplicate request failed");
    } finally {
      setOperating(null);
    }
  }

  async function handleArchive(item: ContentItem) {
    setOperating({ id: item.id, action: "archive" });
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/content/${item.id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        setMessage("Failed to archive content");
        return;
      }
      setMessage("Content archived");
      setItems((current) => current.filter((c) => c.id !== item.id));
      if (selectedContentId === item.id) {
        setSelectedContentId(null);
      }
    } catch {
      setMessage("Archive request failed");
    } finally {
      setOperating(null);
    }
  }

  async function handlePublish(item: ContentItem) {
    setOperating({ id: item.id, action: "publish" });
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/content/${item.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) {
        setMessage(payload.error ?? "Failed to publish content");
        return;
      }
      setMessage("Content published");
      setItems((current) => current.map((c) => c.id === item.id ? { ...c, status: "published" } : c));
    } catch {
      setMessage("Publish request failed");
    } finally {
      setOperating(null);
    }
  }

  function toggleBulkApproveItem(item: ContentItem) {
    if (item.status === "published" || item.status === "archived") return;
    setBulkApproveSelectedIds((current) => (
      current.includes(item.id)
        ? current.filter((id) => id !== item.id)
        : [...current, item.id]
    ));
  }

  function clearBulkApproveSelection() {
    setBulkApproveSelectedIds([]);
  }

  async function approveSelectedCardsInList() {
    if (!bulkApproveSelectedIds.length) {
      setMessage("Select one or more cards for bulk approval.");
      return;
    }
    setMessage(null);
    let successCount = 0;
    const failures: string[] = [];
    let latestStatus: string | null = null;

    for (const id of bulkApproveSelectedIds) {
      try {
        const response = await fetch(`/api/admin/content/${id}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "approve",
            notes: "Bulk approved from content library list.",
          }),
        });
        const payload = await response.json() as { item?: { status: string; metadataJson?: string | null }; error?: string };
        if (!response.ok || !payload.item) {
          failures.push(payload.error ?? `Card ${id} failed to approve.`);
          continue;
        }
        latestStatus = payload.item.status;
        successCount += 1;
        setItems((current) => current.map((entry) => (
          entry.id === id
            ? {
                ...entry,
                status: payload.item?.status ?? entry.status,
                metadataJson: payload.item?.metadataJson ?? entry.metadataJson,
              }
            : entry
        )));
      } catch {
        failures.push(`Card ${id} approval request failed.`);
      }
    }

    if (successCount > 0 && failures.length === 0) {
      setMessage(`Approved ${successCount} card${successCount === 1 ? "" : "s"} successfully${latestStatus ? ` (${latestStatus})` : ""}.`);
      clearBulkApproveSelection();
      return;
    }

    if (successCount > 0 && failures.length > 0) {
      setMessage(`Approved ${successCount} card${successCount === 1 ? "" : "s"}; ${failures.length} failed: ${failures.slice(0, 2).join(" | ")}`);
      setBulkApproveSelectedIds((current) => current.filter((id) => failures.some((failure) => failure.includes(id))));
      return;
    }

    setMessage(failures.length ? `Bulk approval failed: ${failures.slice(0, 2).join(" | ")}` : "Bulk approval failed.");
  }

  function handleOpenView(item: ContentItem) {
    setOperating({ id: item.id, action: "view" });
    setViewModalContent(item);
    void refreshDuplicateSummaryForContent(item.id).then((summary) => {
      if (!summary) return;
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, globalDuplicateSummary: summary } : entry));
      setViewModalContent((current) => current?.id === item.id ? { ...current, globalDuplicateSummary: summary } : current);
    });
    window.setTimeout(() => setOperating(null), 180);
  }

  function handleVerified(updated: ContentItem) {
    setItems((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    setViewModalContent((current) => current?.id === updated.id ? { ...current, ...updated } : current);
    setMessage(`Verification saved. Content is now ${updated.status}.`);

    void refreshDuplicateSummaryForContent(updated.id).then((summary) => {
      if (!summary) return;
      setItems((current) => current.map((item) => item.id === updated.id ? { ...item, globalDuplicateSummary: summary } : item));
      setViewModalContent((current) => current?.id === updated.id ? { ...current, globalDuplicateSummary: summary } : current);
    });
  }

  return (
    <div className="space-y-6 pb-24">
      <header>
        <h1 className="text-2xl font-black text-white">Content Library</h1>
        <p className="text-sm text-slate-400">Create, review and assign high-quality curriculum content to students.</p>
      </header>

      <ContentLibraryFilters
        query={draftFilters.query}
        onQueryChange={(value) => setDraftFilters((current) => ({ ...current, query: value }))}
        onApplyFilters={() => applyFilters()}
        onResetFilters={resetFilters}
        applyingFilters={applyingFilters}
        yearGroup={draftFilters.studentYear}
        onYearGroupChange={(value) => setDraftFilters((current) => ({ ...current, studentYear: value }))}
        keyStage={draftFilters.studentKeyStage}
        onKeyStageChange={(value) => setDraftFilters((current) => ({ ...current, studentKeyStage: value }))}
        examBoard={draftFilters.examBoardFilter}
        onExamBoardChange={(value) => setDraftFilters((current) => ({ ...current, examBoardFilter: value }))}
        classGroup={draftFilters.studentClass}
        classGroups={classGroups}
        onClassGroupChange={(value) => setDraftFilters((current) => ({ ...current, studentClass: value }))}
        parent={draftFilters.studentParent}
        parents={parents}
        onParentChange={(value) => setDraftFilters((current) => ({ ...current, studentParent: value }))}
        subject={draftFilters.subjectTab}
        onSubjectChange={(value) => setDraftFilters((current) => ({ ...current, subjectTab: value }))}
        reviewBucket={draftFilters.reviewBucket}
        onReviewBucketChange={(value) => setDraftFilters((current) => ({ ...current, reviewBucket: value }))}
        sortMode={draftFilters.sortMode}
        onSortModeChange={(value) => setDraftFilters((current) => ({ ...current, sortMode: value }))}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-200">Admin Review Queue</p>
            <h2 className="text-lg font-black text-white">Black Box Verification</h2>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-black">
            {([
              ["all", "All"],
              ["awaiting_review", "Awaiting"],
              ["reclassified", "Reclassified"],
              ["rejected", "Rejected"],
              ["approved", "Approved"],
              ["published", "Published"],
            ] as Array<[ContentReviewQueueBucket | "all", string]>).map(([bucket, label]) => (
              <button
                key={bucket}
                type="button"
                onClick={() => setDraftFilters((current) => ({ ...current, reviewBucket: bucket }))}
                className={`rounded-full px-3 py-1 ${draftFilters.reviewBucket === bucket ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-xs font-bold text-slate-300">
            Min Black Box score
            <input
              value={draftFilters.minBlackBoxScore}
              onChange={(event) => setDraftFilters((current) => ({ ...current, minBlackBoxScore: event.target.value }))}
              type="number"
              min={0}
              max={100}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-indigo-400"
              placeholder="0-100"
            />
          </label>
          <label className="text-xs font-bold text-slate-300">
            Generated after
            <input
              value={draftFilters.generatedAfter}
              onChange={(event) => setDraftFilters((current) => ({ ...current, generatedAfter: event.target.value }))}
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-indigo-400"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => applyFilters()}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-xs font-black text-white hover:bg-indigo-400"
            >
              Apply Queue Filters
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-300">Bulk Card Approval</p>
            <p className="mt-1 text-xs text-slate-400">Select cards and approve them without opening each modal.</p>
          </div>
          <p className="text-xs font-bold text-slate-300">Selected cards: {bulkApproveSelectedIds.length}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void approveSelectedCardsInList()}
            disabled={bulkApproveSelectedIds.length === 0}
            className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-black text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Approve Selected Cards ({bulkApproveSelectedIds.length})
          </button>
          <button
            type="button"
            onClick={clearBulkApproveSelection}
            disabled={bulkApproveSelectedIds.length === 0}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear Card Selection
          </button>
        </div>
      </section>

      {message ? (
        <div className="space-y-2">
          <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-200">{message}</p>
          {pendingResendIds && pendingResendIds.length > 0 && selectedContent ? (
            <button
              type="button"
              disabled={assigning}
              onClick={() => void applyAssignment(pendingResendIds, "resend", true)}
              className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-black text-amber-100 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {assigning ? "Resending..." : `Resend to ${pendingResendIds.length} already-assigned student${pendingResendIds.length === 1 ? "" : "s"}`}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <AdminSectionCard title="Content by Topic" eyebrow="Library">
          {contentLoading ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {[0, 1, 2, 3].map((idx) => (
                <div key={idx} className="h-40 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />
              ))}
            </div>
          ) : (
            <ContentTopicGrid
              items={filteredItems}
              selectedContentId={selectedContentId}
              viewMode={viewMode}
              onSelect={selectContent}
              onView={handleOpenView}
              onDuplicate={handleDuplicate}
              onArchive={handleArchive}
              onPublish={handlePublish}
              onReview={handleReview}
              onToggleBulkApprove={toggleBulkApproveItem}
              bulkApproveSelectedIds={bulkApproveSelectedIds}
              operatingAction={operating?.action ?? null}
              operatingId={operating?.id ?? null}
              assigning={assigning}
            />
          )}
        </AdminSectionCard>

        <ContentSummaryPanel
          total={filteredItems.length}
          reviewedPublished={totals.reviewedPublished}
          draft={totals.draft}
          invalidJson={totals.invalidJson}
          awaitingReview={totals.awaitingReview}
          reclassified={totals.reclassified}
          rejected={totals.rejected}
          approved={totals.approved}
          published={totals.published}
        />
      </div>

      <AssignmentPanel
        selectedContent={selectedContent}
        recommended={recommended}
        eligibleManual={eligibleManual}
        blocked={blocked}
        selectedStudentId={selectedStudentId}
        assigning={assigning}
        showBlocked={showBlocked}
        onToggleBlocked={() => setShowBlocked((current) => !current)}
        onSelectStudent={setSelectedStudentId}
        onAssignSelected={openSingleAssignment}
        onAssignByMode={openModeAssignment}
        onOverrideAssign={(studentId, overrideReason) => void handleOverrideAssign(studentId, overrideReason)}
        overrideAssigning={overrideAssigning}
      />

      <AssignmentConfirmModal
        open={pendingAction?.type === "single"}
        content={selectedContent}
        candidate={pendingAction?.type === "single" ? pendingAction.candidate : null}
        onClose={() => setPendingAction(null)}
        onConfirm={() => void confirmPendingAction()}
        confirming={assigning}
      />

      <ContentViewModal
        open={viewModalContent !== null}
        content={viewModalContent}
        onClose={() => setViewModalContent(null)}
        onVerified={handleVerified}
      />
    </div>
  );
}
