"use client";

import { mapStaffUiRoleToSchoolRole } from "@/lib/schools/staff-role-map";

export type SchoolActionName =
  | "createClassroom"
  | "inviteTeacher"
  | "enrolStudent"
  | "updateClassroom"
  | "updateTeacher"
  | "updateStudentAssignment"
  | "bootstrapDaytimeSchool"
  | "assignSchoolLesson"
  | "updateSchoolDayLesson";

export async function postSchoolAction<TPayload extends Record<string, unknown>>(
  action: SchoolActionName,
  payload: TPayload,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string; status: number }> {
  try {
    const response = await fetch("/api/admin/schools", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      return {
        ok: false,
        error: typeof data.error === "string" ? data.error : "Unable to save school changes.",
        status: response.status,
      };
    }
    return { ok: true, data: data as Record<string, unknown> };
  } catch {
    return { ok: false, error: "Unable to reach the school API.", status: 0 };
  }
}

export { mapStaffUiRoleToSchoolRole };
