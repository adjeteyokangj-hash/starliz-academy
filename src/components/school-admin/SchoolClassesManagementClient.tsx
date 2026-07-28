"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import CollapsibleCard from "@/components/school-admin/CollapsibleCard";

type ClassroomRow = {
  id: string;
  name: string;
  yearGroup: string | null;
  keyStage: string | null;
  academicYear: string | null;
  status: string;
  teacher: { id: string; user: { name: string | null; email: string } } | null;
  studentCount: number;
  timetablePeriodCount: number;
  capacity: number | null;
  updatedAt: string;
};

type Props = { schoolId: string; schoolName: string };

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SchoolClassesManagementClient({ schoolId, schoolName }: Props) {
  const [rows, setRows] = useState<ClassroomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [teacherFilter, setTeacherFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const [studentFilter, setStudentFilter] = useState<"all" | "assigned" | "unassigned">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/school/classrooms?schoolId=${encodeURIComponent(schoolId)}&status=all`,
        { credentials: "include" },
      );
      const payload = (await res.json()) as { classrooms?: ClassroomRow[]; error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Unable to load classes.");
      setRows(payload.classrooms ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load classes.");
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const yearOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) if (row.yearGroup) set.add(row.yearGroup);
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (yearFilter !== "all" && row.yearGroup !== yearFilter) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (teacherFilter === "assigned" && !row.teacher) return false;
      if (teacherFilter === "unassigned" && row.teacher) return false;
      if (studentFilter === "assigned" && row.studentCount === 0) return false;
      if (studentFilter === "unassigned" && row.studentCount > 0) return false;
      if (!q) return true;
      const teacher = (row.teacher?.user.name ?? row.teacher?.user.email ?? "").toLowerCase();
      return row.name.toLowerCase().includes(q) || teacher.includes(q);
    });
  }, [rows, search, yearFilter, statusFilter, teacherFilter, studentFilter]);

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Classes</h1>
          <p className="mt-0.5 text-sm text-foreground/60">
            School-scoped class management for {schoolName}
          </p>
        </div>
        <Link
          href="/school-admin/day-school/classes/new"
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Create class
        </Link>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-600/20 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search class or teacher"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm lg:col-span-2"
        />
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All year groups</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
        <select
          value={teacherFilter}
          onChange={(e) => setTeacherFilter(e.target.value as typeof teacherFilter)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All teachers</option>
          <option value="assigned">Teacher assigned</option>
          <option value="unassigned">No teacher assigned</option>
        </select>
        <select
          value={studentFilter}
          onChange={(e) => setStudentFilter(e.target.value as typeof studentFilter)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-2 lg:col-span-1"
        >
          <option value="all">All students</option>
          <option value="assigned">Students assigned</option>
          <option value="unassigned">No students assigned</option>
        </select>
      </div>

      <CollapsibleCard title="Classes" count={loading ? null : filtered.length}>
        {loading ? (
          <div className="p-10 text-center text-sm text-foreground/50">Loading classes…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-foreground/50">No classes created</p>
            <Link
              href="/school-admin/day-school/classes/new"
              className="mt-3 inline-block text-sm font-semibold text-primary underline"
            >
              Create the first class
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-foreground/50">
            No classes match these filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-muted/30 text-xs text-foreground/60">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Class</th>
                  <th className="px-4 py-3 text-left font-medium">Year</th>
                  <th className="px-4 py-3 text-left font-medium">Key stage</th>
                  <th className="px-4 py-3 text-left font-medium">Academic year</th>
                  <th className="px-4 py-3 text-left font-medium">Primary teacher</th>
                  <th className="px-4 py-3 text-left font-medium">Additional</th>
                  <th className="px-4 py-3 text-left font-medium">Students</th>
                  <th className="px-4 py-3 text-left font-medium">Capacity</th>
                  <th className="px-4 py-3 text-left font-medium">Periods</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Updated</th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{row.name}</td>
                    <td className="px-4 py-3 text-foreground/70">{row.yearGroup ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground/70">{row.keyStage ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground/70">{row.academicYear ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground/70">
                      {row.teacher ? (
                        row.teacher.user.name ?? row.teacher.user.email
                      ) : (
                        <span className="text-amber-700">No teacher assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-foreground/45">—</td>
                    <td className="px-4 py-3 text-foreground/70">
                      {row.studentCount === 0 ? (
                        <span className="text-amber-700">No students assigned</span>
                      ) : (
                        row.studentCount
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-foreground/45">—</td>
                    <td className="px-4 py-3 text-foreground/70">{row.timetablePeriodCount}</td>
                    <td className="px-4 py-3 capitalize text-foreground/70">{row.status}</td>
                    <td className="px-4 py-3 text-xs text-foreground/60">{fmtDate(row.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/school-admin/day-school/classes/${row.id}`}
                          className="rounded-lg border border-border px-2 py-1 text-xs"
                        >
                          View
                        </Link>
                        <Link
                          href={`/school-admin/day-school/classes/${row.id}/edit`}
                          className="rounded-lg border border-border px-2 py-1 text-xs"
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleCard>
    </div>
  );
}
