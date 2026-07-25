/**
 * Local UAT fixture account names used by launch-verification runners.
 *
 * These are intentionally non-production fixture credentials for local/dev UAT only.
 * Prefer overriding via environment variables (see docs/LAUNCH_VERIFICATION.md).
 * Never use these values in production. Never commit real production secrets.
 */
export const UAT_FIXTURES = {
  baseUrl: process.env.UAT_BASE_URL ?? "http://localhost:3000",
  parentEmail: process.env.UAT_STUDENT_PARENT_EMAIL ?? "uat.daytime.y6.parent@starliz.dev",
  parentPassword: process.env.UAT_STUDENT_PARENT_PASSWORD ?? "UatDaytimeParent#2026",
  teacherEmail: process.env.UAT_LIVE_TEACHER_EMAIL ?? "uat.live.classroom.teacher@starliz.dev",
  teacherPassword: process.env.UAT_LIVE_TEACHER_PASSWORD ?? "UatLiveTeacher#2026",
  otherTeacherEmail: process.env.UAT_OTHER_TEACHER_EMAIL ?? "uat.live.other.teacher@starliz.dev",
  otherTeacherPassword: process.env.UAT_OTHER_TEACHER_PASSWORD ?? "UatOtherTeacher#2026",
  adminEmail:
    process.env.UAT_ADMIN_EMAIL ?? process.env.E2E_OPS_ADMIN_EMAIL ?? "ops-owner@starliz.dev",
  adminPassword:
    process.env.UAT_ADMIN_PASSWORD ?? process.env.E2E_OPS_ADMIN_PASSWORD ?? "OpsAdmin#2026",
  schoolAdminEmail: process.env.UAT_SCHOOL_ADMIN_EMAIL ?? "admin@starlizacademy.com",
  schoolAdminPassword: process.env.UAT_SCHOOL_ADMIN_PASSWORD ?? "Admin#2026",
} as const;

/** Generated bulky evidence root (gitignored). Permanent summaries live under docs/assurance/. */
export const ARTIFACTS_UAT_ROOT = "artifacts/uat";
export const ARTIFACTS_SCREENSHOTS_ROOT = "artifacts/screenshots";
