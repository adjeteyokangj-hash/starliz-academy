import Link from "next/link";
import { redirect } from "next/navigation";
import { readSessionFromCookie } from "@/lib/auth";
import { getSchoolTeacherContext, canDo } from "@/lib/schools/rbac";
import { getSchoolAssignments } from "@/lib/schools/scoping";
import { EXAM_BOARDS, KEY_STAGES, yearGroupsForKeyStage } from "@/lib/curriculum";

type Props = {
  searchParams: Promise<{
    query?: string;
    keyStage?: string;
    yearGroup?: string;
    examBoard?: string;
  }>;
};

export default async function TeacherAssignmentsPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/teacher/assignments");

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) redirect("/dashboard");
  if (!canDo(ctx.role, "issueAssignment")) redirect("/teacher");

  const assignments = await getSchoolAssignments(ctx.schoolId, ctx.schoolTeacherId, ctx.role, {
    query: params.query,
    keyStage: params.keyStage,
    yearGroup: params.yearGroup,
    examBoard: params.examBoard,
  });

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Assignments</h1>
          <p className="mt-0.5 text-sm text-foreground/60">Latest assignment activity for your accessible students</p>
        </div>
        <Link
          href="/teacher/assignments/new"
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          + New Assignment
        </Link>
      </div>

      <form className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          name="query"
          defaultValue={params.query ?? ""}
          placeholder="Search student, subject, topic..."
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground lg:col-span-2"
        />
        <select
          name="keyStage"
          defaultValue={params.keyStage ?? ""}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="">All key stages</option>
          {KEY_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
        </select>
        <select
          name="yearGroup"
          defaultValue={params.yearGroup ?? ""}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="">All year groups</option>
          {KEY_STAGES.flatMap((stage) => yearGroupsForKeyStage(stage)).filter((value, index, array) => array.indexOf(value) === index).map((group) => <option key={group} value={group}>{group}</option>)}
        </select>
        <select
          name="examBoard"
          defaultValue={params.examBoard ?? ""}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="">All exam boards</option>
          {EXAM_BOARDS.map((board) => <option key={board} value={board}>{board}</option>)}
        </select>
        <div className="lg:col-span-4 flex justify-end">
          <button type="submit" className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted/40">
            Apply filters
          </button>
        </div>
      </form>

      {assignments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <p className="text-foreground/50">No assignments yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-foreground/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Student</th>
                <th className="px-4 py-3 text-left font-medium">Subject</th>
                <th className="px-4 py-3 text-left font-medium">Topic</th>
                <th className="px-4 py-3 text-left font-medium">Level</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Assigned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assignments.map((a) => (
                <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{a.student.name}</td>
                  <td className="px-4 py-3 capitalize text-foreground/70">{a.content.contentType}</td>
                  <td className="px-4 py-3 text-foreground/70">{a.content.topic || "—"}</td>
                  <td className="px-4 py-3 text-foreground/70">{a.content.level}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary capitalize">
                      {a.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground/60">
                    {new Date(a.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
