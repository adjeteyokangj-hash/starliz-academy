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
import type { AssignMode, AssignmentPayload, ContentItem, SortMode, StudentAssignmentCandidate, StudentOption, ViewMode } from "@/components/admin/content-library/types";
import { evaluateAssignmentCandidate, getContentJsonSummary, getContentMeta, normalizeText } from "@/components/admin/content-library/utils";
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
    sortMode: (searchParams.get("sort") as SortMode | null) ?? "newest",
  };
}

export default function ContentLibraryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [, setOperating] = useState(false);

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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [contentRes, studentsRes] = await Promise.all([
        fetch("/api/admin/content"),
        fetch("/api/admin/students"),
      ]);
      const contentPayload = await contentRes.json() as { items?: ContentItem[] };
      const studentsPayload = await studentsRes.json() as { students?: StudentOption[] };
      setItems(contentPayload.items ?? []);
      setStudents(studentsPayload.students ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  const appliedFilters = useMemo(() => parseFiltersFromSearchParams(searchParams), [searchParams]);

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
    const needle = normalizeText(appliedFilters.query);
    return students.filter((student) => {
      const studentYearValue = student.yearGroup ?? "";
      const stage = student.keyStageLevel || (studentYearValue ? keyStageForYearGroup(studentYearValue) : "");
      const matchesSearch = !needle
        || normalizeText(student.name).includes(needle)
        || normalizeText(student.parentName).includes(needle)
        || normalizeText(student.classGroup).includes(needle);
      const matchesYear = !appliedFilters.studentYear || studentYearValue === appliedFilters.studentYear;
      const matchesStage = !appliedFilters.studentKeyStage || stage === appliedFilters.studentKeyStage;
      const matchesClass = !appliedFilters.studentClass || student.classGroup === appliedFilters.studentClass || (student.classGroups ?? []).includes(appliedFilters.studentClass);
      const matchesParent = !appliedFilters.studentParent || student.parentName === appliedFilters.studentParent;
      return matchesSearch && matchesYear && matchesStage && matchesClass && matchesParent;
    });
  }, [students, appliedFilters]);

  const filteredItems = useMemo(() => {
    const bySubject = items.filter((item) => {
      if (appliedFilters.subjectTab === "all") return true;
      return getContentMeta(item).subject === appliedFilters.subjectTab;
    });

    const byExamBoard = bySubject.filter((item) => {
      if (!appliedFilters.examBoardFilter) return true;
      return getContentMeta(item).examBoard === appliedFilters.examBoardFilter;
    });

    return [...byExamBoard].sort((a, b) => {
      if (appliedFilters.sortMode === "newest") return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (appliedFilters.sortMode === "oldest") return Date.parse(a.createdAt) - Date.parse(b.createdAt);
      if (appliedFilters.sortMode === "most-used") return b.usedCount - a.usedCount;
      return (b.usedCount - a.usedCount) || (Date.parse(b.createdAt) - Date.parse(a.createdAt));
    });
  }, [items, appliedFilters]);

  const selectedContent = useMemo(
    () => filteredItems.find((item) => item.id === selectedContentId) ?? null,
    [filteredItems, selectedContentId],
  );

  const candidates = useMemo(() => {
    if (!selectedContent) return [] as StudentAssignmentCandidate[];
    const localDuplicates = localDuplicateByContent[selectedContent.id] ?? new Set<string>();
    return filteredStudents
      .map((student) => evaluateAssignmentCandidate(selectedContent, student, localDuplicates))
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
    const reviewedPublished = filteredItems.filter((item) => ["reviewed", "published"].includes(item.status)).length;
    const draft = filteredItems.filter((item) => item.status === "draft").length;
    const invalidJson = filteredItems.filter((item) => !getContentJsonSummary(item.contentJson).valid).length;
    return { reviewedPublished, draft, invalidJson };
  }, [filteredItems]);

  function selectContent(item: ContentItem) {
    setSelectedContentId(item.id);
    setSelectedStudentId(null);
    setShowBlocked(false);
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

    setAssigning(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId: selectedContent.id, studentIds: ids, resend }),
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

  async function handleReview(item: ContentItem) {
    setOperating(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/content/${item.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json() as { id: string; status: string };
      if (!response.ok) {
        setMessage((result as { error?: string }).error ?? "Failed to mark content as reviewed");
        return;
      }
      setMessage(`Content marked as reviewed. You can now assign or publish it.`);
      setItems((current) => current.map((c) => c.id === item.id ? { ...c, status: "reviewed" } : c));
    } catch {
      setMessage("Review request failed");
    } finally {
      setOperating(false);
    }
  }

  async function handleDuplicate(item: ContentItem) {
    setOperating(true);
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
      setOperating(false);
    }
  }

  async function handleArchive(item: ContentItem) {
    setOperating(true);
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
      setOperating(false);
    }
  }

  async function handlePublish(item: ContentItem) {
    setOperating(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/content/${item.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        setMessage("Failed to publish content");
        return;
      }
      setMessage("Content published");
      setItems((current) => current.map((c) => c.id === item.id ? { ...c, status: "published" } : c));
    } catch {
      setMessage("Publish request failed");
    } finally {
      setOperating(false);
    }
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
        sortMode={draftFilters.sortMode}
        onSortModeChange={(value) => setDraftFilters((current) => ({ ...current, sortMode: value }))}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

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
          {loading ? <p className="text-sm text-slate-400">Loading content...</p> : (
            <ContentTopicGrid
              items={filteredItems}
              selectedContentId={selectedContentId}
              viewMode={viewMode}
              onSelect={selectContent}
              onView={setViewModalContent}
              onDuplicate={handleDuplicate}
              onArchive={handleArchive}
              onPublish={handlePublish}
              onReview={handleReview}
            />
          )}
        </AdminSectionCard>

        <ContentSummaryPanel
          total={filteredItems.length}
          reviewedPublished={totals.reviewedPublished}
          draft={totals.draft}
          invalidJson={totals.invalidJson}
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
      />
    </div>
  );
}
