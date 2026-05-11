import { redirect } from "next/navigation";
import TeacherGovernancePanel from "@/components/teacher/TeacherGovernancePanel";
import { readSessionFromCookie } from "@/lib/auth";
import { canDo, getSchoolTeacherContext } from "@/lib/schools/rbac";

export default async function TeacherGovernancePage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/teacher/governance");

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) redirect("/teacher");

  const canView = canDo(ctx.role, "viewAuditLog") || canDo(ctx.role, "manageSchoolSettings") || canDo(ctx.role, "manageSafeguarding");
  if (!canView) redirect("/teacher");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <TeacherGovernancePanel
        schoolId={ctx.schoolId}
        schoolName={ctx.schoolName}
        canManageInvites={canDo(ctx.role, "manageTeachers")}
        canManageCompliance={canDo(ctx.role, "manageSchoolSettings")}
        canManageSafeguarding={canDo(ctx.role, "manageSafeguarding")}
      />
    </div>
  );
}
