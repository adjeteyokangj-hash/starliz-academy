"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SchoolRecord = {
  id: string;
  name: string;
  status: string;
  ownerName: string | null;
  ownerEmail: string | null;
  contactEmail: string | null;
  licence: {
    status: string;
    seatsUsed: number;
    seatLimit: number;
  } | null;
  teachers: Array<{ id: string; status: string }>;
  students: Array<{ id: string; status: string }>;
  classrooms: Array<{ id: string; status: string }>;
  safeguarding: {
    openAlerts: number;
    criticalAlerts: number;
  };
  activityTimeline: Array<{ id: string; createdAt: string }>;
};

type ApiResponse = {
  schools?: SchoolRecord[];
};

function badgeClass(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === "active") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (normalized === "pilot" || normalized === "trialing") return "border-sky-500/40 bg-sky-500/10 text-sky-200";
  if (normalized === "suspended" || normalized === "past_due") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  if (normalized === "archived" || normalized === "cancelled") return "border-slate-500/40 bg-slate-500/10 text-slate-300";
  return "border-rose-500/40 bg-rose-500/10 text-rose-200";
}

function shortDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString();
}

function setupStatus(school: SchoolRecord): string {
  const activeTeachers = school.teachers.filter((row) => row.status === "active").length;
  const activeStudents = school.students.filter((row) => row.status === "active").length;
  if (activeTeachers > 0 && activeStudents > 0 && school.classrooms.length > 0) return "Configured";
  if (activeTeachers > 0 || activeStudents > 0 || school.classrooms.length > 0) return "In Progress";
  return "Not Started";
}

function safeguardingLabel(school: SchoolRecord): { label: string; className: string } {
  if (school.safeguarding.criticalAlerts > 0) {
    return { label: "Critical", className: "border-rose-500/40 bg-rose-500/10 text-rose-200" };
  }
  if (school.safeguarding.openAlerts > 0) {
    return { label: "Warning", className: "border-amber-500/40 bg-amber-500/10 text-amber-200" };
  }
  return { label: "Clear", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" };
}

export default function AdminSchoolsPage() {
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    let active = true;

    async function loadSchools() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/admin/schools", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          if (!active) return;
          setError("Unable to load registered schools.");
          return;
        }

        const payload = (await response.json()) as ApiResponse;
        if (!active) return;
        setSchools(payload.schools ?? []);
      } catch {
        if (!active) return;
        setError("Unable to load registered schools.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadSchools();

    return () => {
      active = false;
    };
  }, []);

  const filteredSchools = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return schools.filter((school) => {
      const byStatus = statusFilter === "all" || school.status.toLowerCase() === statusFilter;
      if (!byStatus) return false;
      if (!normalizedSearch) return true;

      const searchFields = [
        school.name,
        school.ownerName ?? "",
        school.ownerEmail ?? "",
        school.contactEmail ?? "",
      ].join(" ").toLowerCase();

      return searchFields.includes(normalizedSearch);
    });
  }, [schools, search, statusFilter]);

  const summary = useMemo(() => {
    const totalSchools = filteredSchools.length;
    const totalStudents = filteredSchools.reduce(
      (acc, school) => acc + school.students.filter((row) => row.status === "active").length,
      0,
    );
    const totalTeachers = filteredSchools.reduce(
      (acc, school) => acc + school.teachers.filter((row) => row.status === "active").length,
      0,
    );
    const schoolsAtRisk = filteredSchools.filter(
      (school) => school.safeguarding.criticalAlerts > 0 || school.status.toLowerCase() === "suspended",
    ).length;

    return { totalSchools, totalStudents, totalTeachers, schoolsAtRisk };
  }, [filteredSchools]);

  const escalationPreview = useMemo(() => {
    return filteredSchools
      .filter((school) => school.safeguarding.criticalAlerts > 0 || school.safeguarding.openAlerts > 0)
      .sort((a, b) => {
        const aScore = a.safeguarding.criticalAlerts * 10 + a.safeguarding.openAlerts;
        const bScore = b.safeguarding.criticalAlerts * 10 + b.safeguarding.openAlerts;
        return bScore - aScore;
      })
      .slice(0, 3);
  }, [filteredSchools]);

  return (
    <main className="space-y-6 text-slate-100">
      <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Schools</p>
        <h1 className="mt-1 text-2xl font-black text-white">Schools</h1>
        <p className="mt-1 text-sm text-slate-300">Registered schools list with operational readiness and status overview.</p>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-lg border border-slate-600 bg-slate-950/70 px-2.5 py-1.5 font-semibold text-slate-200">Schools</span>
          <Link
            href="/admin/schools?start=add-school"
            className="rounded-lg border border-slate-600 bg-slate-950/70 px-2.5 py-1.5 font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
          >
            Add School
          </Link>
          <Link
            href="/admin/schools?start=onboarding-setup"
            className="rounded-lg border border-sky-500/60 bg-sky-500/10 px-2.5 py-1.5 font-semibold text-sky-100 transition hover:bg-sky-500/20"
          >
            School Onboarding Setup
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Registered Schools</p>
            <p className="mt-1 text-2xl font-black text-white">{summary.totalSchools}</p>
          </article>
          <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Active Students</p>
            <p className="mt-1 text-2xl font-black text-white">{summary.totalStudents}</p>
          </article>
          <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Active Teachers</p>
            <p className="mt-1 text-2xl font-black text-white">{summary.totalTeachers}</p>
          </article>
          <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Safeguarding Watch</p>
            <p className="mt-1 text-2xl font-black text-rose-200">{summary.schoolsAtRisk}</p>
          </article>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-xs font-semibold text-slate-300 md:col-span-2">
            Search schools
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by school name, admin lead, or email"
              className="w-full rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-400"
            />
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-300">
            Filter by status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-400"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="pilot">Pilot</option>
              <option value="suspended">Suspended</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
      </section>

      {escalationPreview.length > 0 ? (
        <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-200">Escalation Warning</p>
              <p className="mt-1 text-sm text-amber-100">Top safeguarding signals requiring governance follow-up.</p>
            </div>
            <p className="text-xs text-amber-100/80">Queue is intentionally compact on this page.</p>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-amber-100">
            {escalationPreview.map((school) => (
              <li key={school.id} className="rounded-lg border border-amber-300/20 bg-slate-950/35 px-3 py-2">
                <Link href={`/admin/schools/${school.id}`} className="font-semibold text-white hover:text-sky-200">
                  {school.name}
                </Link>
                <span className="ml-2 text-xs text-amber-100/80">
                  Critical: {school.safeguarding.criticalAlerts} | Open: {school.safeguarding.openAlerts}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {loading ? (
        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6 text-sm text-slate-300">Loading schools...</section>
      ) : null}

      {error ? (
        <section className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</section>
      ) : null}

      {!loading && !error && filteredSchools.length === 0 ? (
        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6">
          <h2 className="text-xl font-black text-white">No schools registered yet</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Start by adding your first school, then complete onboarding setup to configure staff, classes, and licence settings.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/admin/schools?start=add-school"
              className="rounded-lg border border-sky-500/60 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20"
            >
              Add School
            </Link>
            <Link
              href="/admin/schools?start=onboarding-setup"
              className="rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              Open School Onboarding Setup
            </Link>
          </div>
        </section>
      ) : null}

      {!loading && !error && filteredSchools.length > 0 ? (
        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4">
          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-xs uppercase tracking-[0.08em] text-slate-400">
                  <th className="px-2 py-2">School Name</th>
                  <th className="px-2 py-2">Contact/Admin Lead</th>
                  <th className="px-2 py-2">Students</th>
                  <th className="px-2 py-2">Teachers</th>
                  <th className="px-2 py-2">Safeguarding</th>
                  <th className="px-2 py-2">Subscription/Licence</th>
                  <th className="px-2 py-2">Setup Status</th>
                  <th className="px-2 py-2">Last Activity</th>
                  <th className="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredSchools.map((school) => {
                  const activeTeachers = school.teachers.filter((row) => row.status === "active").length;
                  const activeStudents = school.students.filter((row) => row.status === "active").length;
                  const safeguarding = safeguardingLabel(school);
                  const lastActivity =
                    school.activityTimeline.length > 0
                      ? [...school.activityTimeline].sort(
                        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                      )[0]?.createdAt ?? null
                      : null;

                  return (
                    <tr key={school.id} className="border-b border-slate-800/80 text-slate-200">
                      <td className="px-2 py-3">
                        <Link href={`/admin/schools/${school.id}`} className="font-semibold text-white hover:text-sky-200">
                          {school.name}
                        </Link>
                        <p className="text-xs text-slate-400">Status: {school.status}</p>
                      </td>
                      <td className="px-2 py-3">
                        <p>{school.ownerName ?? "-"}</p>
                        <p className="text-xs text-slate-400">{school.ownerEmail ?? school.contactEmail ?? "No contact email"}</p>
                      </td>
                      <td className="px-2 py-3">{activeStudents}</td>
                      <td className="px-2 py-3">{activeTeachers}</td>
                      <td className="px-2 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${safeguarding.className}`}>
                          {safeguarding.label}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${badgeClass(school.licence?.status ?? "pilot")}`}>
                          {school.licence?.status ?? "pilot"}
                        </span>
                        <p className="mt-1 text-xs text-slate-400">
                          Seats: {school.licence?.seatsUsed ?? 0}/{school.licence?.seatLimit ?? "-"}
                        </p>
                      </td>
                      <td className="px-2 py-3">{setupStatus(school)}</td>
                      <td className="px-2 py-3">{shortDate(lastActivity)}</td>
                      <td className="px-2 py-3">
                        <Link
                          href={`/admin/schools/${school.id}`}
                          className="inline-flex rounded-lg border border-slate-600 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                        >
                          View School Dashboard
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:hidden">
            {filteredSchools.map((school) => {
              const activeTeachers = school.teachers.filter((row) => row.status === "active").length;
              const activeStudents = school.students.filter((row) => row.status === "active").length;
              const safeguarding = safeguardingLabel(school);
              const lastActivity =
                school.activityTimeline.length > 0
                  ? [...school.activityTimeline].sort(
                    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                  )[0]?.createdAt ?? null
                  : null;

              return (
                <article key={school.id} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`/admin/schools/${school.id}`} className="text-base font-semibold text-white hover:text-sky-200">
                        {school.name}
                      </Link>
                      <p className="text-xs text-slate-400">{school.ownerName ?? "No admin lead assigned"}</p>
                    </div>
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${badgeClass(school.status)}`}>
                      {school.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
                    <p>Students: {activeStudents}</p>
                    <p>Teachers: {activeTeachers}</p>
                    <p>Safeguarding: {safeguarding.label}</p>
                    <p>Setup: {setupStatus(school)}</p>
                    <p>Licence: {school.licence?.status ?? "pilot"}</p>
                    <p>Last activity: {shortDate(lastActivity)}</p>
                  </div>
                  <Link
                    href={`/admin/schools/${school.id}`}
                    className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                  >
                    View School Dashboard
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}