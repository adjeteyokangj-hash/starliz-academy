"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { postSchoolAction } from "@/components/admin/schools/school-actions";
import { useSchoolDashboardRecord } from "@/components/admin/schools/school-dashboard-data";
import { formatStudentId } from "@/lib/student-id";
import { SCHOOL_YEAR_CLASS_GROUPS } from "@/lib/schools/ensure-year-classes";

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString();
}

function statusClass(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === "active") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (normalized === "invited" || normalized === "pilot") return "border-sky-500/40 bg-sky-500/10 text-sky-200";
  if (normalized === "suspended" || normalized === "transferred") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-slate-500/40 bg-slate-500/10 text-slate-300";
}

function normalizeYearGroup(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function yearGroupSortKey(value: string | null | undefined): number {
  const match = /(\d+)/.exec(value ?? "");
  return match ? Number(match[1]) : 999;
}

type DirectoryStudent = {
  id: string;
  name: string;
  age: number | null;
  yearGroup: string | null;
  parentName: string | null;
  parentEmail: string;
};

function LinkExistingStudentsPanel({ schoolId }: { schoolId: string }) {
  const { school, refresh } = useSchoolDashboardRecord(schoolId);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryStudent[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [saving, setSaving] = useState(false);
  const [ensuringYears, setEnsuringYears] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const classrooms = useMemo(() => {
    return (school?.classrooms ?? [])
      .filter((row) => row.status === "active")
      .map((row) => ({
        id: row.id,
        name: row.name ?? "Class",
        yearGroup: row.yearGroup ?? null,
        label: `${row.name ?? "Class"}${row.yearGroup ? ` · ${row.yearGroup}` : ""}`,
      }))
      .sort((left, right) => yearGroupSortKey(left.yearGroup) - yearGroupSortKey(right.yearGroup)
        || left.label.localeCompare(right.label));
  }, [school]);

  const yearLadderComplete = SCHOOL_YEAR_CLASS_GROUPS.every((yearGroup) =>
    classrooms.some((row) => normalizeYearGroup(row.yearGroup) === normalizeYearGroup(yearGroup)
      || normalizeYearGroup(row.name) === normalizeYearGroup(yearGroup)),
  );

  const selectedStudent = useMemo(
    () => results.find((row) => row.id === selectedChildId) ?? null,
    [results, selectedChildId],
  );

  const matchingClassrooms = useMemo(() => {
    const year = normalizeYearGroup(selectedStudent?.yearGroup);
    if (!year) return [];
    return classrooms.filter((row) => normalizeYearGroup(row.yearGroup) === year
      || normalizeYearGroup(row.name) === year);
  }, [classrooms, selectedStudent]);

  const selectedClassroom = classrooms.find((row) => row.id === classroomId) ?? null;
  const yearMismatch = Boolean(
    selectedStudent?.yearGroup
    && selectedClassroom?.yearGroup
    && normalizeYearGroup(selectedStudent.yearGroup) !== normalizeYearGroup(selectedClassroom.yearGroup)
    && normalizeYearGroup(selectedStudent.yearGroup) !== normalizeYearGroup(selectedClassroom.name),
  );
  const needsYearClass = Boolean(
    selectedStudent?.yearGroup
    && matchingClassrooms.length === 0,
  );

  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(async () => {
      setLoadingDirectory(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          excludeSchoolId: schoolId,
          take: "25",
        });
        if (query.trim()) params.set("q", query.trim());
        const response = await fetch(`/api/admin/students/directory?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof payload.error === "string" ? payload.error : "Unable to search platform students.");
        }
        if (!active) return;
        setResults((payload.students ?? []) as DirectoryStudent[]);
      } catch (cause) {
        if (!active) return;
        setResults([]);
        setError(cause instanceof Error ? cause.message : "Unable to search platform students.");
      } finally {
        if (active) setLoadingDirectory(false);
      }
    }, query.trim() ? 250 : 0);

    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [query, schoolId]);

  useEffect(() => {
    if (!selectedStudent?.yearGroup) return;
    if (matchingClassrooms.length === 1) {
      setClassroomId(matchingClassrooms[0].id);
    }
  }, [selectedChildId, selectedStudent?.yearGroup, matchingClassrooms]);

  async function ensureYearClasses() {
    setEnsuringYears(true);
    setError(null);
    setSuccess(null);
    const result = await postSchoolAction("ensureYearClasses", { schoolId });
    setEnsuringYears(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const created = Number(result.data.ensureYearClassesResult
      && typeof result.data.ensureYearClassesResult === "object"
      && "createdCount" in (result.data.ensureYearClassesResult as object)
      ? (result.data.ensureYearClassesResult as { createdCount?: number }).createdCount
      : 0);
    setSuccess(created > 0
      ? `Created Year 1–11 classes (${created} new). You can now assign Ephi to Year 10.`
      : "Year 1–11 classes are ready.");
    refresh();
  }

  async function handleLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedChildId) {
      setError("Select a platform student to link.");
      return;
    }
    if (yearMismatch) {
      setError(`Do not put a ${selectedStudent?.yearGroup} student into ${selectedClassroom?.yearGroup ?? selectedClassroom?.name}. Pick the matching Year class, or leave Unassigned.`);
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    const result = await postSchoolAction("assignStudent", {
      schoolId,
      childId: selectedChildId,
      classroomId: classroomId || null,
      status: "active",
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const linked = results.find((row) => row.id === selectedChildId);
    setSuccess(`${linked?.name ?? "Student"} is now enrolled in this school${classroomId ? "" : " (class unassigned)"}.`);
    setSelectedChildId("");
    setClassroomId("");
    refresh();
  }

  const preferredClassrooms = matchingClassrooms.length > 0 ? matchingClassrooms : classrooms;
  const otherClassrooms = matchingClassrooms.length > 0
    ? classrooms.filter((row) => !matchingClassrooms.some((match) => match.id === row.id))
    : [];

  return (
    <section className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
      <h2 className="text-sm font-semibold text-white">Link existing platform students</h2>
      <p className="mt-1 text-xs text-slate-400">
        Students registered under <Link href="/admin/students" className="text-sky-300 hover:text-sky-200">Admin → Students</Link> are
        platform learners. They only appear on this school roster after you link them here (or enrol new ones below).
      </p>

      {!yearLadderComplete ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <span>School year classes should be Year 1 through Year 11.</span>
          <button
            type="button"
            onClick={() => void ensureYearClasses()}
            disabled={ensuringYears}
            className="rounded-md border border-amber-300/40 bg-amber-500/20 px-2 py-1 font-semibold text-amber-50 hover:bg-amber-500/30 disabled:opacity-50"
          >
            {ensuringYears ? "Creating…" : "Create Year 1–11 classes"}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-emerald-200/90">Year 1–11 classes are available for linking.</p>
      )}

      <form onSubmit={handleLink} className="mt-3 space-y-3">
        <label className="block text-xs text-slate-300">
          Search by student or parent
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. Ephi, Kelvin, Evelyn"
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="block text-xs text-slate-300">
          Platform student
          <select
            value={selectedChildId}
            onChange={(event) => {
              setSelectedChildId(event.target.value);
              setClassroomId("");
              setError(null);
              setSuccess(null);
            }}
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            <option value="">{loadingDirectory ? "Searching…" : "Select a student"}</option>
            {results.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name} · {formatStudentId(student.id)}
                {student.yearGroup ? ` · ${student.yearGroup}` : ""}
                {student.parentEmail ? ` · ${student.parentEmail}` : ""}
              </option>
            ))}
          </select>
        </label>

        {selectedStudent?.yearGroup ? (
          <p className="rounded-lg border border-slate-600/70 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
            {selectedStudent.name} is <span className="font-semibold text-white">{selectedStudent.yearGroup}</span>.
            {" "}Assign them to the matching Year class (not the Year 5 bootstrap class).
          </p>
        ) : null}

        {needsYearClass ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            <span>No {selectedStudent?.yearGroup} class found yet.</span>
            <button
              type="button"
              onClick={() => void ensureYearClasses()}
              disabled={ensuringYears}
              className="rounded-md border border-amber-300/40 bg-amber-500/20 px-2 py-1 font-semibold text-amber-50 hover:bg-amber-500/30 disabled:opacity-50"
            >
              {ensuringYears ? "Creating…" : "Create Year 1–11 classes"}
            </button>
          </div>
        ) : null}

        <label className="block text-xs text-slate-300">
          Class (optional)
          <select
            value={classroomId}
            onChange={(event) => setClassroomId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            <option value="">Unassigned</option>
            {preferredClassrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>{classroom.label}</option>
            ))}
            {otherClassrooms.length > 0 ? (
              <optgroup label="Other year groups">
                {otherClassrooms.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>{classroom.label}</option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>

        {yearMismatch ? (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
            Year mismatch: {selectedStudent?.name} is {selectedStudent?.yearGroup}, but that class is {selectedClassroom?.yearGroup ?? selectedClassroom?.name}.
          </p>
        ) : null}

        {error ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p> : null}
        {success ? <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">{success}</p> : null}

        <button
          type="submit"
          disabled={saving || !selectedChildId || yearMismatch}
          className="rounded-lg border border-sky-400/50 bg-sky-500/20 px-3 py-2 text-xs font-semibold text-sky-50 transition hover:bg-sky-500/30 disabled:opacity-50"
        >
          {saving ? "Linking…" : "Link to this school"}
        </button>
      </form>
    </section>
  );
}

export function SchoolStudentsRegistry({ schoolId }: { schoolId: string }) {
  const { school, loading, error } = useSchoolDashboardRecord(schoolId);

  if (loading) {
    return <p className="text-sm text-slate-300">Loading student roster...</p>;
  }
  if (error || !school) {
    return <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error ?? "Unable to load students."}</p>;
  }

  const students = [...school.students].sort((left, right) => (left.childName ?? "").localeCompare(right.childName ?? ""));

  return (
    <div className="space-y-4">
      <LinkExistingStudentsPanel schoolId={schoolId} />

      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Enrol a new student</h2>
          <p className="mt-1 text-xs text-slate-400">Creates a new parent + child account and enrols them in this school.</p>
          <Link href={`/admin/schools/${schoolId}/students/new`} className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Enrol Student</Link>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Student CSV Import</h2>
          <p className="mt-1 text-xs text-slate-400">Import students by CSV with template guidance and validation checks.</p>
          <Link href={`/admin/schools/${schoolId}/students/import`} className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Open CSV Import</Link>
        </article>
      </div>

      <section className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Student Roster</h2>
          <p className="text-xs text-slate-400">{students.length} enrolled</p>
        </div>
        {students.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-600 bg-slate-900/40 p-4 text-sm text-slate-300">
            No students enrolled in this school yet. Link Ephi, Kelvin, Elizabeth (and others) from the panel above, or
            <Link href={`/admin/schools/${schoolId}/students/new`} className="ml-1 font-semibold text-sky-300 hover:text-sky-200">enrol a new student</Link>.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Class</th>
                  <th className="px-2 py-2">Parent email</th>
                  <th className="px-2 py-2">Joined</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id} className="border-t border-slate-800 text-slate-200">
                    <td className="px-2 py-2 font-semibold text-white">
                      {student.childName ?? "Unnamed student"}
                      {student.childId ? (
                        <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          {formatStudentId(student.childId)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass(student.status)}`}>{student.status}</span>
                    </td>
                    <td className="px-2 py-2">{student.classroomName ?? (student.classroomId ? "Assigned" : "Unassigned")}</td>
                    <td className="px-2 py-2">{student.parentEmail ?? "-"}</td>
                    <td className="px-2 py-2">{shortDate(student.joinedAt ?? student.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function SchoolTeachersRegistry({ schoolId }: { schoolId: string }) {
  const { school, loading, error } = useSchoolDashboardRecord(schoolId);

  if (loading) {
    return <p className="text-sm text-slate-300">Loading teacher directory...</p>;
  }
  if (error || !school) {
    return <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error ?? "Unable to load teachers."}</p>;
  }

  const teachers = [...school.teachers].sort((left, right) => (left.name ?? left.email ?? "").localeCompare(right.name ?? right.email ?? ""));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Invite Teacher</h2>
          <p className="mt-1 text-xs text-slate-400">Create staff profiles, assign school roles, and send invites.</p>
          <Link href={`/admin/schools/${schoolId}/staff/new?role=teacher`} className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Add Teacher</Link>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Staff CSV Import</h2>
          <p className="mt-1 text-xs text-slate-400">Import and validate staff profiles by CSV before invite dispatch.</p>
          <Link href={`/admin/schools/${schoolId}/staff/import`} className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">View CSV Import Plan</Link>
        </article>
      </div>

      <section className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Teacher Directory</h2>
          <p className="text-xs text-slate-400">{teachers.length} staff</p>
        </div>
        {teachers.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-600 bg-slate-900/40 p-4 text-sm text-slate-300">
            No teachers yet.
            <Link href={`/admin/schools/${schoolId}/staff/new?role=teacher`} className="ml-2 font-semibold text-sky-300 hover:text-sky-200">Invite the first teacher</Link>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Email</th>
                  <th className="px-2 py-2">Role</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((teacher) => (
                  <tr key={teacher.id} className="border-t border-slate-800 text-slate-200">
                    <td className="px-2 py-2 font-semibold text-white">{teacher.name ?? "Unnamed"}</td>
                    <td className="px-2 py-2">{teacher.email ?? "-"}</td>
                    <td className="px-2 py-2">{teacher.role}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass(teacher.status)}`}>{teacher.status}</span>
                    </td>
                    <td className="px-2 py-2">{shortDate(teacher.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function SchoolClassroomsRegistry({ schoolId }: { schoolId: string }) {
  const { school, loading, error, refresh } = useSchoolDashboardRecord(schoolId);
  const [ensuringYears, setEnsuringYears] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) {
    return <p className="text-sm text-slate-300">Loading classes...</p>;
  }
  if (error || !school) {
    return <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error ?? "Unable to load classes."}</p>;
  }

  const classrooms = [...school.classrooms].sort((left, right) =>
    yearGroupSortKey(left.yearGroup) - yearGroupSortKey(right.yearGroup)
    || (left.name ?? "").localeCompare(right.name ?? ""),
  );

  const yearLadderComplete = SCHOOL_YEAR_CLASS_GROUPS.every((yearGroup) =>
    classrooms.some((row) => normalizeYearGroup(row.yearGroup) === normalizeYearGroup(yearGroup)
      || normalizeYearGroup(row.name) === normalizeYearGroup(yearGroup)),
  );

  async function ensureYearClasses() {
    setEnsuringYears(true);
    setActionError(null);
    setActionMessage(null);
    const result = await postSchoolAction("ensureYearClasses", { schoolId });
    setEnsuringYears(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setActionMessage("Year 1–11 classes are ready.");
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Create Class</h2>
          <p className="mt-1 text-xs text-slate-400">Add a single class with year group and tutor ownership.</p>
          <Link href={`/admin/schools/${schoolId}/classrooms/new`} className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">New Class</Link>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Year 1–11 ladder</h2>
          <p className="mt-1 text-xs text-slate-400">Ensure standard year classes exist for every year group from 1 to 11.</p>
          <button
            type="button"
            onClick={() => void ensureYearClasses()}
            disabled={ensuringYears || yearLadderComplete}
            className="mt-3 inline-flex rounded-lg border border-sky-400/50 bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-50 transition hover:bg-sky-500/30 disabled:opacity-50"
          >
            {ensuringYears ? "Creating…" : yearLadderComplete ? "Year 1–11 ready" : "Create Year 1–11 classes"}
          </button>
        </article>
      </div>

      {actionError ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{actionError}</p> : null}
      {actionMessage ? <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">{actionMessage}</p> : null}

      <section className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Classes</h2>
          <p className="text-xs text-slate-400">{classrooms.length} classes</p>
        </div>
        {classrooms.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-600 bg-slate-900/40 p-4 text-sm text-slate-300">
            No classes yet.
            <button type="button" onClick={() => void ensureYearClasses()} className="ml-2 font-semibold text-sky-300 hover:text-sky-200">Create Year 1–11</button>
            {" "}or
            <Link href={`/admin/schools/${schoolId}/classrooms/new`} className="ml-1 font-semibold text-sky-300 hover:text-sky-200">create one class</Link>.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Year</th>
                  <th className="px-2 py-2">Tutor</th>
                  <th className="px-2 py-2">Students</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {classrooms.map((classroom) => (
                  <tr key={classroom.id} className="border-t border-slate-800 text-slate-200">
                    <td className="px-2 py-2 font-semibold text-white">{classroom.name ?? "Unnamed class"}</td>
                    <td className="px-2 py-2">{classroom.yearGroup ?? "-"}</td>
                    <td className="px-2 py-2">{classroom.teacherName ?? "Unassigned"}</td>
                    <td className="px-2 py-2">{classroom.studentsCount}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass(classroom.status)}`}>{classroom.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
