import { redirect } from "next/navigation";
import Link from "next/link";
import { readSessionFromCookie } from "@/lib/auth";
import { getSchoolTeacherContext, canDo } from "@/lib/schools/rbac";
import { getAccessibleClassrooms } from "@/lib/schools/scoping";

export default async function TeacherClassroomsPage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/teacher/classrooms");

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) redirect("/dashboard");
  if (!canDo(ctx.role, "viewClassrooms")) redirect("/teacher");

  const classrooms = await getAccessibleClassrooms(ctx.schoolId, ctx.schoolTeacherId, ctx.role);

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Classrooms</h1>
          <p className="mt-0.5 text-sm text-foreground/60">{classrooms.length} classroom{classrooms.length !== 1 ? "s" : ""}</p>
        </div>
        {canDo(ctx.role, "manageClassrooms") && (
          <Link
            href="/teacher/classrooms/new"
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            + New Classroom
          </Link>
        )}
      </div>

      {classrooms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <p className="text-foreground/50">No classrooms yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classrooms.map((classroom) => (
            <Link
              key={classroom.id}
              href={`/teacher/classrooms/${classroom.id}`}
              className="group rounded-xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md hover:border-primary/40"
            >
              <div className="mb-3 flex items-start justify-between">
                <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                  {classroom.name}
                </p>
                <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs text-foreground/60">
                  {classroom.status}
                </span>
              </div>
              <p className="text-xs text-foreground/50 mb-1">
                {classroom.yearGroup ? `Year ${classroom.yearGroup}` : "No year group"}
                {classroom.academicYear ? ` · ${classroom.academicYear}` : ""}
              </p>
              <p className="text-xs text-foreground/50">
                Teacher: {classroom.teacher?.user.name ?? "Unassigned"}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  👤 {classroom._count.students} student{classroom._count.students !== 1 ? "s" : ""}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
