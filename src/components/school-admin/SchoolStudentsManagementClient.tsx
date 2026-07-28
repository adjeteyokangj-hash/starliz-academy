"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import CollapsibleCard from "@/components/school-admin/CollapsibleCard";

type StudentRow = {
  id: string;
  status: string;
  joinedAt: string;
  child: { name: string; yearGroup: string | null };
  classroom: { id: string; name: string } | null;
  guardianCount: number;
  primaryGuardian: { name: string | null; email: string; consentLabel: string } | null;
  shortLearningBookingsCount: number;
};

type Props = { schoolId: string; schoolName: string };

export default function SchoolStudentsManagementClient({ schoolId, schoolName }: Props) {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [guardianFilter, setGuardianFilter] = useState<"all" | "linked" | "unlinked">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/school/students?schoolId=${encodeURIComponent(schoolId)}&status=all`, {
        credentials: "include",
      });
      const payload = await res.json() as { students?: StudentRow[]; error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Unable to load students.");
      setRows(payload.students ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load students.");
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    queueMicrotask(() => { void load(); });
  }, [load]);

  const years = useMemo(() => [...new Set(rows.map((r) => r.child.yearGroup).filter(Boolean) as string[])].sort(), [rows]);
  const classes = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) if (r.classroom) map.set(r.classroom.id, r.classroom.name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (yearFilter !== "all" && r.child.yearGroup !== yearFilter) return false;
      if (classFilter !== "all" && r.classroom?.id !== classFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (guardianFilter === "linked" && r.guardianCount === 0) return false;
      if (guardianFilter === "unlinked" && r.guardianCount > 0) return false;
      if (!q) return true;
      const g = `${r.primaryGuardian?.name ?? ""} ${r.primaryGuardian?.email ?? ""}`.toLowerCase();
      return r.child.name.toLowerCase().includes(q) || g.includes(q);
    });
  }, [rows, search, yearFilter, classFilter, statusFilter, guardianFilter]);

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Students</h1>
          <p className="mt-0.5 text-sm text-foreground/60">School-scoped students and guardians for {schoolName}</p>
        </div>
        <Link href="/school-admin/day-school/students/new" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
          Add student
        </Link>
      </div>

      {error ? <div className="mb-4 rounded-xl border border-red-600/20 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student or guardian" className="rounded-lg border border-border bg-background px-3 py-2 text-sm lg:col-span-2" />
        <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option value="all">All year groups</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option value="all">All classes</option>
          {classes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="transferred">Transferred</option>
        </select>
        <select value={guardianFilter} onChange={(e) => setGuardianFilter(e.target.value as typeof guardianFilter)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-2 lg:col-span-1">
          <option value="all">All guardians</option>
          <option value="linked">Guardian linked</option>
          <option value="unlinked">No guardian linked</option>
        </select>
      </div>

      <CollapsibleCard title="Students" count={loading ? null : filtered.length}>
        {loading ? (
          <div className="p-10 text-center text-sm text-foreground/50">Loading students…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-foreground/50">No students enrolled</p>
            <Link href="/school-admin/day-school/students/new" className="mt-3 inline-block text-sm font-semibold text-primary underline">Add the first student</Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-foreground/50">No students match these filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-muted/30 text-xs text-foreground/60">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Student</th>
                  <th className="px-4 py-3 text-left font-medium">Year</th>
                  <th className="px-4 py-3 text-left font-medium">Class</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Guardians</th>
                  <th className="px-4 py-3 text-left font-medium">Primary guardian</th>
                  <th className="px-4 py-3 text-left font-medium">Consent</th>
                  <th className="px-4 py-3 text-left font-medium">Short Learning</th>
                  <th className="px-4 py-3 text-left font-medium">Enrolled</th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{r.child.name}</td>
                    <td className="px-4 py-3 text-foreground/70">{r.child.yearGroup ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground/70">{r.classroom?.name ?? <span className="text-amber-700">No class</span>}</td>
                    <td className="px-4 py-3 capitalize text-foreground/70">{r.status}</td>
                    <td className="px-4 py-3 text-foreground/70">
                      {r.guardianCount === 0 ? <span className="text-amber-700">None linked</span> : r.guardianCount}
                    </td>
                    <td className="px-4 py-3 text-foreground/70">{r.primaryGuardian?.name ?? r.primaryGuardian?.email ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-foreground/60">{r.primaryGuardian?.consentLabel ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground/70">{r.shortLearningBookingsCount}</td>
                    <td className="px-4 py-3 text-xs text-foreground/60">{new Date(r.joinedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/school-admin/day-school/students/${r.id}`} className="rounded-lg border border-border px-2 py-1 text-xs">View</Link>
                        <Link href={`/school-admin/day-school/students/${r.id}/edit`} className="rounded-lg border border-border px-2 py-1 text-xs">Edit</Link>
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