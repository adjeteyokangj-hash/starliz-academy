import { redirect } from "next/navigation";
import { readSessionFromCookie } from "@/lib/auth";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";
import { getSchoolAssignments } from "@/lib/schools/scoping";
import CollapsibleCard from "@/components/school-admin/CollapsibleCard";

type Props = {
  searchParams: Promise<{ query?: string; keyStage?: string; yearGroup?: string; examBoard?: string }>;
};

export default async function SchoolAdminDaySchoolLessonsPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/school-admin/day-school/lessons");

  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) redirect("/teacher");
  if (!canDo(ctx.role, "issueAssignment") && !canDo(ctx.role, "viewProgress")) {
    redirect("/school-admin");
  }

  const assignments = await getSchoolAssignments(ctx.schoolId, ctx.schoolTeacherId, ctx.role, {
    query: params.query,
    keyStage: params.keyStage,
    yearGroup: params.yearGroup,
    examBoard: params.examBoard,
  });

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Lessons</h1>
        <p className="mt-0.5 text-sm text-foreground/60">
          School-wide assignment activity for students at {ctx.schoolName}
        </p>
      </div>

      <form className="mb-6">
        <input
          name="query"
          defaultValue={params.query ?? ""}
          placeholder="Search student, subject, topic…"
          className="w-full max-w-md rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </form>

      {assignments.length === 0 ? (
        <CollapsibleCard title="Lessons" count={0} bodyClassName="p-12 text-center">
          <p className="text-foreground/50">No lessons or assignments found.</p>
        </CollapsibleCard>
      ) : (
        <CollapsibleCard title="Lessons" count={assignments.length}>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-foreground/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Student</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Topic</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assignments.map((row) => (
                <tr key={row.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium text-foreground">{row.student.name}</td>
                  <td className="px-4 py-3 text-foreground/70">{row.content.contentType}</td>
                  <td className="px-4 py-3 text-foreground/70">{row.content.topic ?? "—"}</td>
                  <td className="px-4 py-3 text-xs capitalize text-foreground/60">{row.status}</td>
                  <td className="px-4 py-3 text-xs text-foreground/50">
                    {new Date(row.createdAt).toLocaleDateString("en-GB")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </CollapsibleCard>
      )}
    </div>
  );
}
