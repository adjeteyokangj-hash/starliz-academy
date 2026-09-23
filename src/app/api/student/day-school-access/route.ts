import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveActiveChildForSession, resolveParentActiveChildId } from "@/lib/activeChild";
import { resolveParentScope } from "@/lib/parent_scope";
import { loadDaySchoolAccess } from "@/lib/schools/day-school-access";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  let childId: string | null = null;
  if (session.role === "student") {
    const resolved = await resolveActiveChildForSession(session);
    childId = resolved.ok ? resolved.childId : null;
  } else if (session.role === "parent" || session.role === "admin") {
    const parentScope = await resolveParentScope(session);
    childId = parentScope ? await resolveParentActiveChildId(parentScope.parentId) : null;
  }

  if (!childId) {
    return NextResponse.json({ ok: true, daySchool: false });
  }

  const access = await loadDaySchoolAccess(childId);
  return NextResponse.json({ ok: true, daySchool: access.allowed });
}
