import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("Gate 3 aliases and nav distinguish placeholders", () => {
  assert.match(read("src/app/admin/(secure)/ai/page.tsx"), /redirect\("\/admin\/ai-generator"\)/);
  assert.match(read("src/app/admin/(secure)/content/page.tsx"), /redirect\("\/admin\/content-library"\)/);
  assert.match(read("src/app/admin/(secure)/system-health/page.tsx"), /redirect\("\/admin\/settings\/system-health"\)/);
  const nav = read("src/lib/admin-nav.ts");
  assert.match(nav, /href: "\/admin\/complaints"/);
  assert.match(nav, /title: "Policy library"[\s\S]*launchTag: "beta"/);
  assert.doesNotMatch(nav, /href: "\/admin\/ai"/);
  assert.doesNotMatch(nav, /href: "\/admin\/content"/);
  const me = read("src/app/api/admin/me/route.ts");
  assert.match(me, /"\/admin\/complaints": can\.manageInbox/);
});

test("Dashboard hardening retains truthful failure signalling", () => {
  const page = read("src/app/admin/(secure)/page.tsx");
  assert.doesNotMatch(page, /\["Database",\s*"Online"\]/);
  assert.match(page, /partialData/);
  assert.match(page, /role="status"/);
  assert.match(page, /Unavailable values are shown explicitly/);
  assert.match(page, /\/api\/admin\/ops\/health/);
  const health = read("src/app/api/admin/ops/health/route.ts");
  assert.match(health, /value:\s*null,\s*error:\s*true/);
  assert.match(health, /never_run/);
});

test("Complaints lifecycle actions and SLA service-target copy", () => {
  const route = read("src/app/api/admin/complaints/[complaintId]/route.ts");
  for (const action of ["assign", "acknowledge", "add_note", "record_response", "resolve", "close"]) {
    assert.match(route, new RegExp(`action:\\s*z\\.literal\\("${action}"\\)`));
  }
  const service = read("src/lib/complaints/service.ts");
  assert.match(service, /not guarantees/);
  assert.match(service, /safeguarding/);
  const ui = read("src/app/admin/(secure)/complaints/page.tsx");
  assert.match(ui, /role="alert"/);
});

test("Support retention and audit filter accessibility labels", () => {
  const resources = read("src/app/api/admin/resources/[resource]/[id]/route.ts");
  assert.match(resources, /support_ticket_delete_rejected/);
  assert.match(resources, /support_ticket_archived/);
  const auditUi = read("src/app/admin/(secure)/audit-logs/page.tsx");
  assert.match(auditUi, /aria-label="Admin user ID"/);
  assert.match(auditUi, /aria-label="Action type"/);
  assert.match(auditUi, /role="alert"/);
});

test("Short Learning 105 remains unavailable for Admin authoring", () => {
  const plan = read("src/lib/schools/short-learning-session-plan.ts");
  assert.match(plan, /SHORT_LEARNING_ADMIN_DURATIONS = \[90, 120\]/);
  assert.match(plan, /105 is legacy-only/);
  const journey = read("src/lib/schools/short-learning-journey.ts");
  assert.match(journey, /105 is not available/);
});

test("Admin sidebar exposes keyboard-friendly controls", () => {
  const sidebar = read("src/components/admin/AdminSidebar.tsx");
  assert.match(sidebar, /aria-label="Show admin sidebar"/);
  assert.match(sidebar, /aria-label="Hide admin sidebar"/);
  assert.match(sidebar, /aria-expanded/);
  assert.match(sidebar, /aria-label="Admin navigation"/);
});

test("Financial integrity contracts remain fail-closed", () => {
  const subs = read("src/app/api/admin/subscriptions/route.ts");
  assert.match(subs, /createPricingPlanResolver/);
  assert.match(subs, /cannot activate paid access|Payment status is payment-provider truth/);
});
