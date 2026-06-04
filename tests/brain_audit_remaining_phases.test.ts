import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("student dashboard scopes deferred Brain reads to the resolved active child", () => {
  const page = read("src/app/student/dashboard/page.tsx");

  assert.match(page, /const deferredStudentId = activeChildId/);
  assert.match(page, /const studentParam = `studentId=\$\{encodeURIComponent\(deferredStudentId\)\}`/);
  assert.match(page, /\/api\/student\/academic-intelligence\?\$\{studentParam\}/);
  assert.match(page, /\/api\/student\/learning-state\?\$\{studentParam\}/);
  assert.match(page, /\/api\/student\/session-summary\?\$\{studentParam\}/);
  assert.match(page, /\/api\/student\/progression\/recommendations\?\$\{studentParam\}/);
  assert.match(page, /\/api\/student\/certificates\/eligibility\?\$\{studentParam\}/);
  assert.match(page, /setDeferredPanelsLoadedFor\(deferredStudentId\)/);
});

test("student read routes accept explicit studentId for active-child consistency", () => {
  const sessionSummary = read("src/app/api/student/session-summary/route.ts");
  const progression = read("src/app/api/student/progression/recommendations/route.ts");
  const certificates = read("src/app/api/student/certificates/eligibility/route.ts");
  const dailyJourney = read("src/app/api/student/daily-journey/route.ts");

  for (const source of [sessionSummary, progression, certificates, dailyJourney]) {
    assert.match(source, /searchParams|get\("studentId"\)/);
    assert.match(source, /resolveParentActiveChildId/);
  }
});

test("certificate eligibility uses the same progression Brain as progression recommendations", () => {
  const certificates = read("src/app/api/student/certificates/eligibility/route.ts");
  const progression = read("src/app/api/student/progression/recommendations/route.ts");

  assert.match(certificates, /getProgressionDecisionBrainView/);
  assert.match(progression, /getProgressionDecisionBrainView/);
  assert.match(certificates, /progressionRecommendations: decisionBrain\.progression\?\.recommendations/);
  assert.doesNotMatch(certificates, /buildSubjectLevelProgression/);
  assert.doesNotMatch(certificates, /prisma\.attempt\.findMany/);
});

test("session-summary is explicitly legacy engagement data, not canonical HEART BEAT", () => {
  const route = read("src/app/api/student/session-summary/route.ts");

  assert.match(route, /legacy_progress_record_session_signals/);
  assert.match(route, /legacy_engagement_summary/);
  assert.match(route, /canonical: false/);
  assert.match(route, /recent_activity_only/);
  assert.doesNotMatch(route, /writeLearningActivity/);
  assert.doesNotMatch(route, /invalidateAcademicIntelligenceSnapshot/);
});
