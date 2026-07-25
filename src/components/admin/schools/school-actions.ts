"use client";

import { mapStaffUiRoleToSchoolRole } from "@/lib/schools/staff-role-map";

export type SchoolActionName =
  | "createSchool"
  | "updateSchool"
  | "createClassroom"
  | "inviteTeacher"
  | "enrolStudent"
  | "assignStudent"
  | "ensureYearClasses"
  | "updateClassroom"
  | "updateTeacher"
  | "updateStudentAssignment"
  | "bootstrapDaytimeSchool"
  | "assignSchoolLesson"
  | "updateSchoolDayLesson"
  | "generateDaytimeLessonContent"
  | "approveDaytimeLesson"
  | "regenerateDaytimeLesson"
  | "approveDaytimeDay";

export async function postSchoolAction<TPayload extends Record<string, unknown>>(
  action: SchoolActionName,
  payload: TPayload,
): Promise<
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; status: number; blockers?: string[] }
> {
  try {
    const response = await fetch("/api/admin/schools", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      blockers?: string[];
    };
    if (!response.ok) {
      return {
        ok: false,
        error: typeof data.error === "string" ? data.error : "Unable to save school changes.",
        status: response.status,
        blockers: Array.isArray(data.blockers) ? data.blockers.filter((row): row is string => typeof row === "string") : undefined,
      };
    }
    return { ok: true, data: data as Record<string, unknown> };
  } catch {
    return { ok: false, error: "Unable to reach the school API.", status: 0 };
  }
}

export { mapStaffUiRoleToSchoolRole };
