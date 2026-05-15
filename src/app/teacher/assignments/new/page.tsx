import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readSessionFromCookie } from "@/lib/auth";
import { getSchoolTeacherContext, canDo } from "@/lib/schools/rbac";
import { getAccessibleStudents } from "@/lib/schools/scoping";
import { assignContentToStudent, SchoolLicenceAccessError } from "@/lib/assignments";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import { prisma } from "@/lib/db";

type Props = {
  searchParams: Promise<{
    studentId?: string;
    subject?: string;
    skill?: string;
    examBoard?: string;
    error?: string;
  }>;
};

export default async function TeacherNewAssignmentPage({ searchParams }: Props) {
  const params = await searchParams;

  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/teacher/assignments/new");

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) redirect("/dashboard");
  if (!canDo(ctx.role, "issueAssignment")) redirect("/teacher");

  const [students, contentLibrary] = await Promise.all([
    getAccessibleStudents(ctx.schoolId, ctx.schoolTeacherId, ctx.role),
    prisma.aIContentCache.findMany({
      where: {
        status: { in: ["approved", "published"] },
        ...(params.subject ? { contentType: params.subject } : {}),
        ...(params.skill ? { skillFocus: params.skill } : {}),
        ...(params.examBoard ? { metadataJson: { contains: `\"examBoard\":\"${params.examBoard}\"` } } : {}),
      },
      orderBy: [{ contentType: "asc" }, { level: "asc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        contentType: true,
        topic: true,
        skillFocus: true,
        level: true,
        status: true,
        metadataJson: true,
      },
    }),
  ]);

  async function issueAssignmentAction(formData: FormData) {
    "use server";

    const currentSession = await readSessionFromCookie();
    if (!currentSession) redirect("/auth/login?next=/teacher/assignments/new");

    const currentCtx = await getSchoolTeacherContext(currentSession.userId);
    if (!currentCtx || !canDo(currentCtx.role, "issueAssignment")) {
      redirect("/teacher");
    }

    const studentId = String(formData.get("studentId") ?? "").trim();
    const contentId = String(formData.get("contentId") ?? "").trim();
    if (!studentId || !contentId) {
      redirect("/teacher/assignments/new?error=missing");
    }

    const accessible = await getAccessibleStudents(currentCtx.schoolId, currentCtx.schoolTeacherId, currentCtx.role);
    const allowedStudent = accessible.find((s) => s.childId === studentId);
    if (!allowedStudent) {
      redirect("/teacher/assignments/new?error=student");
    }

    try {
      const assignment = await assignContentToStudent({
        studentId,
        contentId,
        actorUserId: currentSession.userId,
        reason: "teacher_manual_assignment",
      });

      await writeSchoolAuditLog({
        schoolId: currentCtx.schoolId,
        actorUserId: currentSession.userId,
        action: "assignment_issued",
        entityType: "assignment",
        entityId: assignment.id,
        severity: "info",
        metadata: {
          studentId,
          contentId,
          issuedByRole: currentCtx.role,
        },
      });
    } catch (error) {
      if (error instanceof SchoolLicenceAccessError) {
        redirect("/teacher/assignments/new?error=licence");
      }
      redirect("/teacher/assignments/new?error=unknown");
    }

    revalidatePath("/teacher/assignments");
    redirect("/teacher/assignments?created=1");
  }

  const errorMessage = params.error === "missing"
    ? "Please select both a student and content item."
    : params.error === "student"
      ? "That student is outside your classroom scope."
      : params.error === "licence"
        ? "Assignment blocked by school licence limits."
        : params.error === "unknown"
          ? "Could not create assignment. Please try again."
          : null;

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto space-y-6">
      <nav className="text-sm text-foreground/50">
        <Link href="/teacher" className="hover:text-foreground">Dashboard</Link>
        {" / "}
        <Link href="/teacher/assignments" className="hover:text-foreground">Assignments</Link>
        {" / "}
        <span className="text-foreground font-medium">New</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Issue Assignment</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Choose a student and approved content from the library.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <form action={issueAssignmentAction} className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <div>
          <label htmlFor="studentId" className="mb-1 block text-sm font-medium text-foreground">Student</label>
          <select
            id="studentId"
            name="studentId"
            defaultValue={params.studentId ?? ""}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
            required
          >
            <option value="">Select student…</option>
            {students.map((s) => (
              <option key={s.id} value={s.childId}>
                {s.child.name} {s.classroom?.name ? `(${s.classroom.name})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="contentId" className="mb-1 block text-sm font-medium text-foreground">Content</label>
          <select
            id="contentId"
            name="contentId"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
            required
          >
            <option value="">Select content…</option>
            {contentLibrary.map((content) => (
              <option key={content.id} value={content.id}>
                {content.contentType} · L{content.level} · {content.topic || content.skillFocus || "Untitled"}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-foreground/50">
            GCSE content is easier to keep aligned when exam-board tagged. Use the filter when choosing revision content.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Issue Assignment
          </button>
          <Link
            href="/teacher/assignments"
            className="rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/40"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
