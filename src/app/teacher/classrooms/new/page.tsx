import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readSessionFromCookie } from "@/lib/auth";
import { getSchoolTeacherContext, canDo } from "@/lib/schools/rbac";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import { prisma } from "@/lib/db";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function TeacherNewClassroomPage({ searchParams }: Props) {
  const params = await searchParams;

  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/teacher/classrooms/new");

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) redirect("/dashboard");
  if (!canDo(ctx.role, "manageClassrooms")) redirect("/teacher/classrooms");

  async function createClassroomAction(formData: FormData) {
    "use server";

    const currentSession = await readSessionFromCookie();
    if (!currentSession) redirect("/auth/login?next=/teacher/classrooms/new");

    const currentCtx = await getSchoolTeacherContext(currentSession.userId);
    if (!currentCtx || !canDo(currentCtx.role, "manageClassrooms")) {
      redirect("/teacher/classrooms");
    }

    const name = String(formData.get("name") ?? "").trim();
    const yearGroupRaw = String(formData.get("yearGroup") ?? "").trim();
    const academicYearRaw = String(formData.get("academicYear") ?? "").trim();

    if (!name) {
      redirect("/teacher/classrooms/new?error=missing");
    }

    try {
      const classroom = await prisma.classroom.create({
        data: {
          schoolId: currentCtx.schoolId,
          name,
          yearGroup: yearGroupRaw || null,
          academicYear: academicYearRaw || null,
          teacherId: currentCtx.role === "teacher" ? currentCtx.schoolTeacherId : null,
        },
      });

      await writeSchoolAuditLog({
        schoolId: currentCtx.schoolId,
        actorUserId: currentSession.userId,
        action: "classroom_created",
        entityType: "classroom",
        entityId: classroom.id,
        severity: "info",
        metadata: {
          name,
          yearGroup: yearGroupRaw || null,
          academicYear: academicYearRaw || null,
          createdByRole: currentCtx.role,
        },
      });
    } catch {
      redirect("/teacher/classrooms/new?error=duplicate");
    }

    revalidatePath("/teacher/classrooms");
    redirect("/teacher/classrooms");
  }

  const errorMessage = params.error === "missing"
    ? "Classroom name is required."
    : params.error === "duplicate"
      ? "A classroom with this name already exists for that academic year."
      : null;

  return (
    <div className="p-6 lg:p-10 max-w-3xl mx-auto space-y-6">
      <nav className="text-sm text-foreground/50">
        <Link href="/teacher" className="hover:text-foreground">Dashboard</Link>
        {" / "}
        <Link href="/teacher/classrooms" className="hover:text-foreground">Classrooms</Link>
        {" / "}
        <span className="text-foreground font-medium">New</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Create Classroom</h1>
        <p className="mt-1 text-sm text-foreground/60">Create a new classroom within your school scope.</p>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <form action={createClassroomAction} className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-foreground">Classroom Name</label>
          <input
            id="name"
            name="name"
            placeholder="e.g. Year 4 - Falcons"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="yearGroup" className="mb-1 block text-sm font-medium text-foreground">Year Group</label>
            <input
              id="yearGroup"
              name="yearGroup"
              placeholder="e.g. 4"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div>
            <label htmlFor="academicYear" className="mb-1 block text-sm font-medium text-foreground">Academic Year</label>
            <input
              id="academicYear"
              name="academicYear"
              placeholder="e.g. 2026-2027"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Create Classroom
          </button>
          <Link
            href="/teacher/classrooms"
            className="rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/40"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
