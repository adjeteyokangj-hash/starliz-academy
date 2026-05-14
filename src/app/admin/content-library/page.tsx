"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import { skillsForSubject } from "@/lib/skills";
import {
  AGE_GROUPS,
  KEY_STAGES,
  YEAR_GROUPS,
  ageGroupForYearGroup,
  keyStageForYearGroup,
  yearGroupsForKeyStage,
} from "@/lib/curriculum";

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
  keyStage?: string | null;
  yearGroup?: string | null;
  skillFocus?: string | null;
  metadataJson?: string | null;
};

type ContentSummary = {
  valid: boolean;
  itemCount: number;
  preview: string;
};

type ContentMeta = {
  title: string;
  subject: string;
  keyStage: string | null;
  yearGroup: string | null;
  ageGroup: string | null;
  topic: string | null;
  skillFocus: string | null;
  schoolId: string | null;
};

type StudentOption = {
  id: string;
  name: string;
  age?: number | null;
  yearGroup?: string | null;
  keyStageLevel?: string | null;
  classGroup?: string | null;
  classGroups?: string[];
  parentName?: string | null;
  subjectFocus?: string | null;
  weakPatterns?: string[];
  schoolIds?: string[];
};

type StudentAssignmentCandidate = {
  student: StudentOption;
  hardEligible: boolean;
  hardBlockReason: string | null;
  recommendationLevel: "recommended" | "eligible_manual";
  recommendationReason: string;
  matchedWeakAreas: string[];
  recommendationScore: number;
};

type AssignmentPayload = {
  count?: number;
  error?: string;
  blocked?: Array<{
    studentId: string;
    reason: string;
    schoolName?: string;
    code?: string;
  }>;
};

type AssignMode = "recommended" | "eligible_manual";

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function getContentJsonSummary(contentJson: string): ContentSummary {
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

function parseMetadata(item: ContentItem): Record<string, unknown> {
  if (!item.metadataJson) return {};
  try {
    return JSON.parse(item.metadataJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getContentMeta(item: ContentItem): ContentMeta {
  const metadata = parseMetadata(item);
  const title = typeof metadata.title === "string"
    ? metadata.title
    : typeof metadata.name === "string"
      ? metadata.name
      : item.topic || `${item.contentType} practice`;
  const subjectRaw = typeof metadata.subject === "string" ? metadata.subject : item.contentType;
  const subject = normalizeText(subjectRaw) || "unknown";
  const keyStage = item.keyStage ?? (typeof metadata.keyStage === "string" ? metadata.keyStage : null);
  const yearGroup = item.yearGroup ?? (typeof metadata.yearGroup === "string" ? metadata.yearGroup : null);
  const ageGroup = typeof metadata.ageGroup === "string"
    ? metadata.ageGroup
    : yearGroup
      ? ageGroupForYearGroup(yearGroup)
      : null;

  return {
    title,
    subject,
    keyStage,
    yearGroup,
    ageGroup,
    topic: typeof metadata.topic === "string" ? metadata.topic : item.topic || null,
    skillFocus: typeof metadata.skillFocus === "string" ? metadata.skillFocus : item.skillFocus || null,
    schoolId: typeof metadata.schoolId === "string" ? metadata.schoolId : null,
  };
}

function parseAgeGroupRange(ageGroup: string | null | undefined): { min: number; max: number } | null {
  if (!ageGroup) return null;
  const match = ageGroup.match(/(\d{1,2})\s*[\u2013\-]\s*(\d{1,2})/);
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

function evaluateAssignmentCandidate(item: ContentItem, student: StudentOption): StudentAssignmentCandidate {
  const summary = getContentJsonSummary(item.contentJson);
  const meta = getContentMeta(item);
  const studentYear = student.yearGroup ?? null;
  const studentKeyStage = student.keyStageLevel || (studentYear ? keyStageForYearGroup(studentYear) : null);
  const strictAgeRange = parseAgeGroupRange(meta.ageGroup);
  const studentSchoolIds = student.schoolIds ?? [];

  if (!["reviewed", "published"].includes(item.status)) {
    return {
      student,
      hardEligible: false,
      hardBlockReason: "Only reviewed or published content can be assigned.",
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
  }
  if (!summary.valid) {
    return {
      student,
      hardEligible: false,
      hardBlockReason: "Content JSON is invalid.",
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
  }
  if (meta.yearGroup && studentYear && meta.yearGroup !== studentYear) {
    return {
      student,
      hardEligible: false,
      hardBlockReason: `Year mismatch (${meta.yearGroup} required).`,
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
  }
  if (meta.keyStage && studentKeyStage && meta.keyStage !== studentKeyStage) {
    return {
      student,
      hardEligible: false,
      hardBlockReason: `Key stage mismatch (${meta.keyStage} required).`,
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
  }
  if (strictAgeRange && typeof student.age === "number" && (student.age < strictAgeRange.min || student.age > strictAgeRange.max)) {
    return {
      student,
      hardEligible: false,
      hardBlockReason: `Age group mismatch (${meta.ageGroup} required).`,
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
  }

  if (meta.schoolId && studentSchoolIds.length > 0 && !studentSchoolIds.includes(meta.schoolId)) {
    return {
      student,
      hardEligible: false,
      hardBlockReason: "School mismatch for this school-scoped content.",
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
  }

  if (meta.schoolId && studentSchoolIds.length === 0) {
    return {
      student,
      hardEligible: false,
      hardBlockReason: "No active school context for this school-scoped content.",
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
  }

  const studentSubjectFocus = normalizeText(student.subjectFocus);
  const metaSubject = normalizeText(meta.subject);
  const skillNeedle = normalizeText(meta.skillFocus);
  const topicNeedle = normalizeText(meta.topic);
  const matchedWeakAreas = (student.weakPatterns ?? []).filter((pattern) => {
    const normalizedPattern = normalizeText(pattern);
    const hasNeedle = Boolean(skillNeedle) || Boolean(topicNeedle);
    return Boolean(normalizedPattern)
      && hasNeedle
      && (skillNeedle.includes(normalizedPattern)
        || topicNeedle.includes(normalizedPattern)
        || (Boolean(skillNeedle) && normalizedPattern.includes(skillNeedle)));
  });

  let recommendationScore = 0;
  if (matchedWeakAreas.length > 0) {
    recommendationScore += matchedWeakAreas.length * 3;
  }
  if (studentSubjectFocus && metaSubject && (studentSubjectFocus.includes(metaSubject) || metaSubject.includes(studentSubjectFocus))) {
    recommendationScore += 1;
  }

  const recommendationLevel = recommendationScore > 0 ? "recommended" : "eligible_manual";
  const recommendationReason = recommendationLevel === "recommended"
    ? "Recommended match: this content supports the student's weak area."
    : "Eligible manual assignment: no matching weak area detected.";

  return {
    student,
    hardEligible: true,
    hardBlockReason: null,
    recommendationLevel,
    recommendationReason,
    matchedWeakAreas,
    recommendationScore,
  };
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

  const [studentSearch, setStudentSearch] = useState("");
  const [studentYearFilter, setStudentYearFilter] = useState("");
  const [studentKeyStageFilter, setStudentKeyStageFilter] = useState("");
  const [studentClassFilter, setStudentClassFilter] = useState("");
  const [studentParentFilter, setStudentParentFilter] = useState("");

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
      .then((payload: { students?: StudentOption[] } | null) => {
        if (payload) setStudents(payload.students ?? []);
      })
      .catch(() => setStudents([]));
  }, []);

  const classOptions = useMemo(() => {
    const values = new Set<string>();
    for (const student of students) {
      if (student.classGroup) values.add(student.classGroup);
      for (const cls of student.classGroups ?? []) values.add(cls);
    }
    return Array.from(values).sort();
  }, [students]);

  const parentOptions = useMemo(() => {
    const values = new Set<string>();
    for (const student of students) {
      if (student.parentName) values.add(student.parentName);
    }
    return Array.from(values).sort();
  }, [students]);

  const filteredStudents = useMemo(() => {
    const query = normalizeText(studentSearch);
    return students.filter((student) => {
      const studentYear = student.yearGroup ?? "";
      const studentStage = student.keyStageLevel || (studentYear ? keyStageForYearGroup(studentYear) : "");
      const matchesSearch = !query
        || normalizeText(student.name).includes(query)
        || normalizeText(student.parentName).includes(query)
        || normalizeText(student.classGroup).includes(query);
      const matchesYear = !studentYearFilter || studentYear === studentYearFilter;
      const matchesStage = !studentKeyStageFilter || studentStage === studentKeyStageFilter;
      const matchesClass = !studentClassFilter
        || student.classGroup === studentClassFilter
        || (student.classGroups ?? []).includes(studentClassFilter);
      const matchesParent = !studentParentFilter || student.parentName === studentParentFilter;
      return matchesSearch && matchesYear && matchesStage && matchesClass && matchesParent;
    });
  }, [students, studentSearch, studentYearFilter, studentKeyStageFilter, studentClassFilter, studentParentFilter]);

  async function submitAssignment(item: ContentItem, studentIds: string[], label: string) {
    if (!studentIds.length) {
      setMessage("No eligible students selected.");
      return;
    }
    setAssigningId(item.id);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId: item.id, studentIds }),
      });
      const payload = await response.json() as AssignmentPayload;
      setAssigningId(null);

      if (!response.ok && payload.blocked?.length) {
        const blockReasons = payload.blocked
          .map((b) => `${b.reason}${b.schoolName ? ` (${b.schoolName})` : ""}`)
          .join(", ");
        setMessage(`Assignment blocked: ${blockReasons}`);
        return;
      }

      if (response.ok && (payload.count ?? 0) > 0) {
        const blockedCount = payload.blocked?.length ?? 0;
        setMessage(`Assigned ${payload.count} student(s) for ${label}.${blockedCount ? ` ${blockedCount} blocked.` : ""}`);
        return;
      }

      setMessage(payload.error ?? "Assignment failed.");
    } catch (error) {
      setAssigningId(null);
      setMessage(error instanceof Error ? error.message : "Assignment request failed.");
    }
  }

  async function assignSingle(item: ContentItem, entry: StudentAssignmentCandidate | undefined) {
    if (!entry || !entry.hardEligible) {
      setMessage("Choose an eligible student before assigning.");
      return;
    }

    const meta = getContentMeta(item);
    const summary = getContentJsonSummary(item.contentJson);
    const weakAreasText = (entry.student.weakPatterns ?? []).length
      ? (entry.student.weakPatterns ?? []).join(", ")
      : "None detected";
    const recommendationText = entry.recommendationLevel === "recommended"
      ? "Recommended match: this content supports the student's weak area."
      : "Eligible manual assignment: no matching weak area detected.";
    const confirmation = window.confirm(
      [
        `Assign \"${meta.title}\" to ${entry.student.name}?`,
        `Year group: ${meta.yearGroup ?? "all years"}`,
        `Key stage: ${meta.keyStage ?? "all key stages"}`,
        `Difficulty: ${item.level}`,
        `Item count: ${summary.itemCount}`,
        `Student weak areas: ${weakAreasText}`,
        `Recommendation: ${recommendationText}`,
      ].join("\n")
    );
    if (!confirmation) return;

    await submitAssignment(item, [entry.student.id], entry.student.name);
  }

  async function assignByMode(item: ContentItem, mode: AssignMode, ids: string[]) {
    if (!ids.length) {
      setMessage(mode === "recommended" ? "No recommended students available." : "No eligible students available.");
      return;
    }
    const meta = getContentMeta(item);
    const summary = getContentJsonSummary(item.contentJson);
    const modeLabel = mode === "recommended" ? "recommended weak-area matches" : "eligible students";
    const modeReason = mode === "recommended"
      ? "Recommended match: this content supports students' weak areas."
      : "Eligible manual assignment: no matching weak area detected for some students.";
    const confirmation = window.confirm(
      [
        `Assign \"${meta.title}\" to ${ids.length} ${modeLabel}?`,
        `Year group: ${meta.yearGroup ?? "all years"}`,
        `Key stage: ${meta.keyStage ?? "all key stages"}`,
        `Difficulty: ${item.level}`,
        `Item count: ${summary.itemCount}`,
        `Recommendation: ${modeReason}`,
      ].join("\n")
    );
    if (!confirmation) return;
    await submitAssignment(item, ids, modeLabel);
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
              if (nextYear) setKeyStageFilter(keyStageForYearGroup(nextYear));
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
          No students found. <Link href="/admin/students" className="underline">Create a student</Link> first to enable assignments.
        </p>
      ) : null}

      <div className="mb-4 grid gap-2 md:grid-cols-5">
        <input
          value={studentSearch}
          onChange={(e) => setStudentSearch(e.target.value)}
          placeholder="Search name, parent or class"
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200"
        />
        <select
          value={studentYearFilter}
          onChange={(e) => setStudentYearFilter(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200"
        >
          <option value="">Student year: all</option>
          {YEAR_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
        </select>
        <select
          value={studentKeyStageFilter}
          onChange={(e) => setStudentKeyStageFilter(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200"
        >
          <option value="">Student key stage: all</option>
          {KEY_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
        </select>
        <select
          value={studentClassFilter}
          onChange={(e) => setStudentClassFilter(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200"
        >
          <option value="">Class/group: all</option>
          {classOptions.map((cls) => <option key={cls} value={cls}>{cls}</option>)}
        </select>
        <select
          value={studentParentFilter}
          onChange={(e) => setStudentParentFilter(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200"
        >
          <option value="">Parent: all</option>
          {parentOptions.map((parent) => <option key={parent} value={parent}>{parent}</option>)}
        </select>
      </div>

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
          {items.map((item) => {
            const summary = getContentJsonSummary(item.contentJson);
            const meta = getContentMeta(item);
            const evaluated = filteredStudents
              .map((student) => evaluateAssignmentCandidate(item, student))
              .sort((a, b) => b.recommendationScore - a.recommendationScore || a.student.name.localeCompare(b.student.name));
            const recommended = evaluated.filter((entry) => entry.hardEligible && entry.recommendationLevel === "recommended");
            const eligibleManual = evaluated.filter((entry) => entry.hardEligible && entry.recommendationLevel === "eligible_manual");
            const blocked = evaluated.filter((entry) => !entry.hardEligible);
            const assignable = [...recommended, ...eligibleManual];

            const selectedId = selectedStudentIds[item.id] ?? "";
            const selectedEntry = evaluated.find((entry) => entry.student.id === selectedId);
            const canAssignSelected = Boolean(selectedEntry?.hardEligible) && assigningId !== item.id;

            return (
              <article key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black capitalize text-white">{meta.subject}</p>
                    <p className="text-xs text-slate-500">
                      {meta.yearGroup ?? "All years"} | {meta.keyStage ?? "All key stages"} | {meta.ageGroup ?? "Any age"}
                    </p>
                    <p className="text-xs text-slate-500">Level {item.level}{meta.topic ? ` | ${meta.topic}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${summary.valid ? "bg-emerald-400/15 text-emerald-200" : "bg-rose-400/15 text-rose-200"}`}>
                      {summary.valid ? "Valid JSON" : "Invalid JSON"}
                    </span>
                    <span className="rounded-full bg-amber-400/12 px-2 py-1 text-xs font-bold capitalize text-amber-200">{item.status}</span>
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-500">Created by {item.createdBy} | Used {item.usedCount}x | {summary.itemCount} item(s)</p>
                <pre className="mt-3 max-h-36 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-400">{summary.preview}</pre>

                {recommended.length > 0 ? (
                  <p className="mt-3 text-xs font-bold text-emerald-200">
                    Recommended students: {recommended.slice(0, 5).map((entry) => entry.student.name).join(", ")}
                  </p>
                ) : null}

                {assignable.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200">
                    No eligible students for this content.
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/admin/content-library/${item.id}`} className="inline-flex rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800">
                    Review item
                  </Link>
                  <select
                    value={selectedId}
                    onChange={(event) => setSelectedStudentIds((current) => ({ ...current, [item.id]: event.target.value }))}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200"
                  >
                    <option value="">Choose eligible student</option>
                    {recommended.length > 0 ? <optgroup label="Recommended">{recommended.map((entry) => (
                      <option key={`${item.id}-recommended-${entry.student.id}`} value={entry.student.id}>
                        {entry.student.name}{entry.student.yearGroup ? ` | ${entry.student.yearGroup}` : ""} | Recommended match: this content supports {entry.matchedWeakAreas[0] ?? "a weak area"}
                      </option>
                    ))}</optgroup> : null}
                    {eligibleManual.length > 0 ? <optgroup label="Eligible">{eligibleManual.map((entry) => (
                      <option key={`${item.id}-eligible-${entry.student.id}`} value={entry.student.id}>
                        {entry.student.name}{entry.student.yearGroup ? ` | ${entry.student.yearGroup}` : ""} | Eligible - no matching weak area detected
                      </option>
                    ))}</optgroup> : null}
                    {blocked.length > 0 ? <optgroup label="Blocked">{blocked.map((entry) => (
                      <option key={`${item.id}-blocked-${entry.student.id}`} value={entry.student.id} disabled>
                        {entry.student.name}{entry.student.yearGroup ? ` | ${entry.student.yearGroup}` : ""} | Blocked: {entry.hardBlockReason}
                      </option>
                    ))}</optgroup> : null}
                  </select>
                  <button
                    type="button"
                    onClick={() => void assignSingle(item, selectedEntry)}
                    disabled={!canAssignSelected}
                    className="rounded-xl bg-indigo-500 px-3 py-2 text-xs font-black text-white disabled:opacity-60"
                  >
                    {assigningId === item.id ? "Assigning..." : "Assign"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void assignByMode(item, "recommended", recommended.map((entry) => entry.student.id))}
                    disabled={assigningId === item.id || recommended.length === 0}
                    className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-100 disabled:opacity-60"
                  >
                    Smart assign ({recommended.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => void assignByMode(item, "eligible_manual", assignable.map((entry) => entry.student.id))}
                    disabled={assigningId === item.id || assignable.length === 0}
                    className="rounded-xl border border-indigo-400/40 bg-indigo-500/10 px-3 py-2 text-xs font-black text-indigo-100 disabled:opacity-60"
                  >
                    Assign all eligible ({assignable.length})
                  </button>
                </div>

                {selectedEntry && !selectedEntry.hardEligible ? (
                  <p className="mt-2 text-xs font-bold text-rose-300">This student is blocked: {selectedEntry.hardBlockReason}</p>
                ) : null}
                {selectedEntry && selectedEntry.hardEligible ? (
                  <p className="mt-2 text-xs font-bold text-sky-200">{selectedEntry.recommendationReason}</p>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      <p className="mt-4 text-xs text-slate-500">Eligibility = hard safety checks (status, valid JSON, year group, key stage, strict age, tenant school, duplicate prevention). Recommendation = weak-area and subject-focus guidance.</p>
      <p className="mt-1 text-xs text-slate-500">Supported age groups: {AGE_GROUPS.join(", ")}</p>
    </AdminSectionCard>
  );
}
