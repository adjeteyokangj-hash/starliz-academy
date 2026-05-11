import Link from "next/link";
import { redirect } from "next/navigation";
import { readSessionFromCookie } from "@/lib/auth";
import { getSchoolTeacherContext, canDo } from "@/lib/schools/rbac";
import { getSchoolAssignments } from "@/lib/schools/scoping";

export default async function TeacherAssignmentsPage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/teacher/assignments");

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) redirect("/dashboard");
  if (!canDo(ctx.role, "issueAssignment")) redirect("/teacher");

  const assignments = await getSchoolAssignments(ctx.schoolId, ctx.schoolTeacherId, ctx.role);

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
