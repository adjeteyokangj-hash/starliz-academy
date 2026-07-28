/**
 * Local UAT fixture account names used by launch-verification runners.
 *
 * These are intentionally non-production fixture credentials for local/dev UAT only.
 * Prefer overriding via environment variables (see docs/LAUNCH_VERIFICATION.md).
 * Never use these values in production. Never commit real production secrets.
 *
 * Access model:
 * - platform admin: platform-admin@starliz.dev (User.role=admin + AdminUser)
 * - school owner: ops-owner@starliz.dev (User.role=teacher + SchoolTeacher.role=owner for StarLiz Academy School only)
 * - school admin: admin@starlizacademy.com (User.role=teacher + SchoolTeacher.role=admin for StarLiz Academy School only)
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
    process.env.UAT_ADMIN_EMAIL ?? process.env.E2E_OPS_ADMIN_EMAIL ?? "platform-admin@starliz.dev",
  adminPassword:
    process.env.UAT_ADMIN_PASSWORD ?? process.env.E2E_OPS_ADMIN_PASSWORD ?? "PlatformAdmin#2026",
  /** School Owner fixture (ops-owner). Prefer schoolOwner* aliases for clarity. */
  schoolOwnerEmail:
    process.env.UAT_SCHOOL_OWNER_EMAIL ?? "ops-owner@starliz.dev",
  schoolOwnerPassword:
    process.env.UAT_SCHOOL_OWNER_PASSWORD ?? "OpsAdmin#2026",
  /** School Admin fixture (admin@starlizacademy.com) — not platform admin. */
  schoolAdminEmail:
    process.env.UAT_SCHOOL_ADMIN_EMAIL ?? "admin@starlizacademy.com",
  schoolAdminPassword:
    process.env.UAT_SCHOOL_ADMIN_PASSWORD ?? "Admin#2026",
} as const;

/** Generated bulky evidence root (gitignored). Permanent summaries live under docs/assurance/. */
export const ARTIFACTS_UAT_ROOT = "artifacts/uat";
export const ARTIFACTS_SCREENSHOTS_ROOT = "artifacts/screenshots";
