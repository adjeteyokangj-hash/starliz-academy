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
  if (!iso) return "—";
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
    return { label: "Watch", className: "border-amber-500/40 bg-amber-500/10 text-amber-200" };
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
    <main className="space-y-8 text-slate-100">
      <section className="relative overflow-hidden rounded-3xl border border-slate-700/60 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 py-7 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.12),transparent_55%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Schools</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400 sm:text-base">
              Registry of registered schools — readiness, safeguarding signals, and licence status.
            </p>
          </div>
          <div className="relative flex flex-wrap gap-2">
            <Link
              href="/admin/schools?start=add-school"
              className="rounded-xl border border-sky-400/50 bg-sky-500/15 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/25"
            >
              Add School
            </Link>
            <Link
              href="/admin/schools?start=onboarding-setup"
              className="rounded-xl border border-slate-600/80 bg-slate-950/50 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              Onboarding Setup
            </Link>
          </div>
        </div>

        <div className="relative mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Registered", value: summary.totalSchools, tone: "text-white" },
            { label: "Active students", value: summary.totalStudents, tone: "text-white" },
            { label: "Active teachers", value: summary.totalTeachers, tone: "text-white" },
            { label: "Safeguarding watch", value: summary.schoolsAtRisk, tone: "text-rose-200" },
          ].map((metric) => (
            <article
              key={metric.label}
              className="rounded-2xl border border-slate-700/60 bg-slate-950/55 px-4 py-4 backdrop-blur-sm"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{metric.label}</p>
              <p className={`mt-2 text-3xl font-semibold tracking-tight ${metric.tone}`}>{metric.value}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700/60 bg-slate-950/40 p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <label className="space-y-1.5 text-xs font-semibold text-slate-400">
            Search
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="School name, admin lead, or email"
              className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-500/50"
            />
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-slate-400">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition focus:border-sky-500/50"
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
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200/90">Needs attention</p>
          <p className="mt-1 text-sm text-amber-100/80">Safeguarding signals requiring follow-up.</p>
          <ul className="mt-4 space-y-2">
            {escalationPreview.map((school) => (
              <li key={school.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/15 bg-slate-950/40 px-3.5 py-2.5 text-sm">
                <Link href={`/admin/schools/${school.id}`} className="font-semibold text-white hover:text-sky-200">
                  {school.name}
                </Link>
                <span className="text-xs text-amber-100/70">
                  Critical {school.safeguarding.criticalAlerts} · Open {school.safeguarding.openAlerts}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {loading ? (
        <section className="rounded-2xl border border-slate-700/60 bg-slate-950/40 px-6 py-10 text-sm text-slate-400">
          Loading schools…
        </section>
      ) : null}

      {error ? (
        <section className="rounded-2xl border border-rose-500/35 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          <p className="font-semibold text-rose-50">{error}</p>
          <p className="mt-1 text-rose-100/75">Refresh the page, or check that the admin API is reachable.</p>
        </section>
      ) : null}

      {!loading && !error && filteredSchools.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-slate-600/70 bg-slate-950/30 px-6 py-12 text-center">
          <h2 className="text-xl font-semibold text-white">No schools yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            Add your first school, then run onboarding to set up staff, classes, and licences.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link
              href="/admin/schools?start=add-school"
              className="rounded-xl border border-sky-400/50 bg-sky-500/15 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/25"
            >
              Add School
            </Link>
            <Link
              href="/admin/schools?start=onboarding-setup"
              className="rounded-xl border border-slate-600/80 bg-slate-950/50 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500"
            >
              Onboarding Setup
            </Link>
          </div>
        </section>
      ) : null}

      {!loading && !error && filteredSchools.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/40">
          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-5 py-3.5 font-semibold">School</th>
                  <th className="px-4 py-3.5 font-semibold">Admin lead</th>
                  <th className="px-4 py-3.5 font-semibold">Students</th>
                  <th className="px-4 py-3.5 font-semibold">Teachers</th>
                  <th className="px-4 py-3.5 font-semibold">Safeguarding</th>
                  <th className="px-4 py-3.5 font-semibold">Licence</th>
                  <th className="px-4 py-3.5 font-semibold">Setup</th>
                  <th className="px-4 py-3.5 font-semibold">Activity</th>
                  <th className="px-5 py-3.5 font-semibold" />
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
                    <tr key={school.id} className="border-b border-slate-800/70 text-slate-300 transition hover:bg-slate-900/50">
                      <td className="px-5 py-4">
                        <Link href={`/admin/schools/${school.id}`} className="font-semibold text-white hover:text-sky-200">
                          {school.name}
                        </Link>
                        <p className="mt-0.5 text-xs text-slate-500 capitalize">{school.status}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-slate-200">{school.ownerName ?? "—"}</p>
                        <p className="text-xs text-slate-500">{school.ownerEmail ?? school.contactEmail ?? "No email"}</p>
                      </td>
                      <td className="px-4 py-4 tabular-nums text-slate-200">{activeStudents}</td>
                      <td className="px-4 py-4 tabular-nums text-slate-200">{activeTeachers}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-lg border px-2 py-1 text-xs font-semibold ${safeguarding.className}`}>
                          {safeguarding.label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-lg border px-2 py-1 text-xs font-semibold ${badgeClass(school.licence?.status ?? "pilot")}`}>
                          {school.licence?.status ?? "pilot"}
                        </span>
                        <p className="mt-1 text-xs text-slate-500">
                          {school.licence?.seatsUsed ?? 0}/{school.licence?.seatLimit ?? "—"} seats
                        </p>
                      </td>
                      <td className="px-4 py-4 text-slate-300">{setupStatus(school)}</td>
                      <td className="px-4 py-4 text-slate-400">{shortDate(lastActivity)}</td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/admin/schools/${school.id}`}
                          className="inline-flex rounded-lg border border-slate-600/80 bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 p-4 lg:hidden">
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
                <article key={school.id} className="rounded-2xl border border-slate-700/60 bg-slate-950/55 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`/admin/schools/${school.id}`} className="text-base font-semibold text-white hover:text-sky-200">
                        {school.name}
                      </Link>
                      <p className="text-xs text-slate-500">{school.ownerName ?? "No admin lead"}</p>
                    </div>
                    <span className={`inline-flex rounded-lg border px-2 py-1 text-xs font-semibold ${badgeClass(school.status)}`}>
                      {school.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                    <p>Students: <span className="text-slate-200">{activeStudents}</span></p>
                    <p>Teachers: <span className="text-slate-200">{activeTeachers}</span></p>
                    <p>Safeguarding: <span className="text-slate-200">{safeguarding.label}</span></p>
                    <p>Setup: <span className="text-slate-200">{setupStatus(school)}</span></p>
                    <p>Licence: <span className="text-slate-200">{school.licence?.status ?? "pilot"}</span></p>
                    <p>Activity: <span className="text-slate-200">{shortDate(lastActivity)}</span></p>
                  </div>
                  <Link
                    href={`/admin/schools/${school.id}`}
                    className="mt-4 inline-flex rounded-lg border border-slate-600/80 bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                  >
                    Open school
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
