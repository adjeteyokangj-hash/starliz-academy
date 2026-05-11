import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { readSessionFromCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SchoolDashboardPage() {
  const session = await readSessionFromCookie();
  if (!session) {
    redirect("/auth/login?next=/school");
  }

  const school = await prisma.school.findFirst({
    where: {
      OR: [
        { ownerUserId: session.userId },
        {
          teachers: {
            some: {
              userId: session.userId,
              status: { in: ["active", "invited"] },
            },
          },
        },
      ],
      status: { not: "archived" },
    },
    include: {
      licence: true,
      classrooms: {
        orderBy: [{ updatedAt: "desc" }],
        include: {
          _count: { select: { students: { where: { status: "active" } } } },
        },
      },
      teachers: {
        where: { status: { in: ["active", "invited"] } },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ updatedAt: "desc" }],
      },
      students: {
        where: { status: "active" },
        include: {
          child: { select: { id: true, name: true } },
          classroom: { select: { id: true, name: true } },
        },
        orderBy: [{ updatedAt: "desc" }],
      },
    },
  });

  if (!school) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 text-slate-200">
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">School Dashboard</p>
          <h1 className="mt-2 text-3xl font-black text-white">No school workspace found</h1>
          <p className="mt-3 text-sm text-slate-400">
            Your account is not linked to a school yet. Ask an admin to invite you, or visit the admin schools console.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/admin/schools" className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400">
              Open Admin Schools
            </Link>
            <Link href="/dashboard" className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-900">
              Go to Dashboard
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const seatLimit = school.licence?.seatLimit ?? 0;
  const seatsUsed = school.students.length;
  const seatsDisplay = seatLimit === 0 ? `${seatsUsed} / unlimited` : `${seatsUsed} / ${seatLimit}`;
  const studentIds = school.students.map((row) => row.childId);
  const assignmentsCount = studentIds.length
    ? await prisma.assignment.count({ where: { studentId: { in: studentIds }, status: { in: ["assigned", "in_progress"] } } })
    : 0;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <section className="rounded-3xl border border-slate-800 bg-linear-to-br from-indigo-900/40 via-slate-950 to-blue-900/30 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-blue-200">School Dashboard</p>
        <h1 className="mt-2 text-3xl font-black text-white">{school.name}</h1>
        <p className="mt-2 text-sm text-slate-300">
          Monitor licence health, classrooms, teachers, and learner allocation in one place.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs uppercase text-slate-400">Licence</p>
          <p className="mt-1 text-2xl font-black text-white capitalize">{school.licence?.status ?? "none"}</p>
        </article>
        <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs uppercase text-slate-400">Seats</p>
          <p className="mt-1 text-2xl font-black text-white">{seatsDisplay}</p>
        </article>
        <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs uppercase text-slate-400">Classrooms</p>
          <p className="mt-1 text-2xl font-black text-white">{school.classrooms.length}</p>
        </article>
        <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs uppercase text-slate-400">Open Assignments</p>
          <p className="mt-1 text-2xl font-black text-white">{assignmentsCount}</p>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <h2 className="text-xl font-black text-white">Classroom Management</h2>
          <div className="mt-4 space-y-3">
            {school.classrooms.map((classroom) => (
              <div key={classroom.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="font-bold text-white">{classroom.name}</p>
                <p className="text-xs text-slate-400">
                  {classroom.yearGroup ?? "No year group"} • {classroom.academicYear ?? "No academic year"} • {classroom._count.students} learners
                </p>
              </div>
            ))}
            {school.classrooms.length === 0 ? <p className="text-sm text-slate-400">No classrooms created yet.</p> : null}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <h2 className="text-xl font-black text-white">Teacher Assignment</h2>
          <div className="mt-4 space-y-3">
            {school.teachers.map((teacher) => (
              <div key={teacher.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="font-bold text-white">{teacher.user.name ?? teacher.user.email}</p>
                <p className="text-xs text-slate-400">
                  {teacher.user.email} • {teacher.role} • {teacher.status}
                </p>
              </div>
            ))}
            {school.teachers.length === 0 ? <p className="text-sm text-slate-400">No teachers assigned yet.</p> : null}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
        <h2 className="text-xl font-black text-white">Student Assignment to Classrooms</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {school.students.map((student) => (
            <div key={student.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="font-bold text-white">{student.child.name}</p>
              <p className="text-xs text-slate-400">Classroom: {student.classroom?.name ?? "Not assigned"}</p>
            </div>
          ))}
        </div>
        {school.students.length === 0 ? <p className="mt-2 text-sm text-slate-400">No active students assigned yet.</p> : null}
      </section>
    </main>
  );
}
