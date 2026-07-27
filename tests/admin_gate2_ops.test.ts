import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("broken Admin aliases redirect to canonical destinations", () => {
  assert.match(read("src/app/admin/(secure)/ai/page.tsx"), /redirect\("\/admin\/ai-generator"\)/);
  assert.match(read("src/app/admin/(secure)/content/page.tsx"), /redirect\("\/admin\/content-library"\)/);
  assert.match(read("src/app/admin/(secure)/system-health/page.tsx"), /redirect\("\/admin\/settings\/system-health"\)/);
  const dashboard = read("src/app/admin/(secure)/page.tsx");
  assert.doesNotMatch(dashboard, /href:\s*"\/admin\/ai"/);
  assert.doesNotMatch(dashboard, /href:\s*"\/admin\/content"/);
  assert.doesNotMatch(dashboard, /href:\s*"\/admin\/system-health"/);
  assert.match(dashboard, /\/admin\/ai-generator/);
  assert.match(dashboard, /\/admin\/content-library/);
  assert.match(dashboard, /\/admin\/settings\/system-health/);
});

test("support hard-delete is rejected with retention audit", () => {
  const route = read("src/app/api/admin/resources/[resource]/[id]/route.ts");
  assert.match(route, /support_ticket_delete_rejected/);
  assert.match(route, /RETENTION_PROTECTED_RESOURCES/);
  assert.match(route, /status:\s*409/);
  assert.match(route, /support_ticket_archived/);
  const ui = read("src/app/admin/(secure)/support/page.tsx");
  assert.doesNotMatch(ui, /Delete this ticket/);
  assert.match(ui, /Close &amp; archive|Close & archive|archiveTicket/);
});

test("audit-log API supports date/actor/entity/result filters and CSV export", () => {
  const route = read("src/app/api/admin/audit-logs/route.ts");
  assert.match(route, /actorUserId/);
  assert.match(route, /entityId/);
  assert.match(route, /parseDateStart|from/);
  assert.match(route, /result === "denied"/);
  assert.match(route, /format"\) === "csv"/);
});

test("school teacher/classroom updates require school ownership", () => {
  const route = read("src/app/api/admin/schools/route.ts");
  assert.match(route, /school_teacher_update_rejected/);
  assert.match(route, /school_classroom_update_rejected/);
  assert.match(route, /id:\s*parsed\.payload\.classroomId,\s*schoolId:\s*parsed\.payload\.schoolId/);
  assert.match(route, /id:\s*parsed\.payload\.teacherId,\s*schoolId:\s*parsed\.payload\.schoolId/);
});

test("dashboard no longer hard-codes Online/Protected platform status", () => {
  const page = read("src/app/admin/(secure)/page.tsx");
  assert.doesNotMatch(page, /\["Database",\s*"Online"\]/);
  assert.doesNotMatch(page, /\["Admin access",\s*"Protected"\]/);
  assert.match(page, /\/api\/admin\/ops\/health/);
  assert.match(page, /Operational alerts/);
});

test("ops health distinguishes misconfigured from healthy", () => {
  const health = read("src/app/api/admin/ops/health/route.ts");
  assert.match(health, /misconfigured/);
  assert.match(health, /never_run/);
  assert.match(health, /tutor-presence-sweep/);
  assert.match(health, /short-learning-lifecycle/);
  assert.match(health, /value:\s*null,\s*error:\s*true/);
});

test("subscription list uses batched pricing resolver", () => {
  const route = read("src/app/api/admin/subscriptions/route.ts");
  assert.match(route, /createPricingPlanResolver/);
  assert.doesNotMatch(route, /await resolveCurrentPricingPlan/);
});

test("attendance intelligence hides sample data for enrolled schools", () => {
  const data = read(
    "src/app/admin/(secure)/schools/[schoolId]/attendance-activity/attendance-intelligence-data.ts",
  );
  assert.match(data, /enrolled > 0 \? "unavailable" : "sample"/);
  assert.match(data, /mode === "sample" \? SAMPLE_STUDENT_SIGNALS : \[\]/);
});

test("complaints workflow uses locked working-day SLA", () => {
  const service = read("src/lib/complaints/service.ts");
  assert.match(service, /computeComplaintSlaDueDates/);
  assert.match(service, /complaint_created/);
  const migration = read("prisma/migrations/20260726160000_complaints_workflow/migration.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "Complaint"/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "ComplaintNote"/);
  assert.doesNotMatch(migration, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(migration, /\bTRUNCATE\b/i);
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\b/i);
});

test("Short Learning journey list exposes full status vocabulary without equating generated to published", () => {
  const page = read("src/app/admin/(secure)/short-learning/journeys/page.tsx");
  assert.match(page, /legacy_generated/);
  assert.match(page, /changes_requested/);
  assert.match(page, /Generation success does not equal publication/);
});
