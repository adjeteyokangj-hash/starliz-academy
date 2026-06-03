import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = path.resolve(__dirname, "..");

const READ_ROUTES = [
  "src/app/api/student/dashboard-summary/route.ts",
  "src/app/api/student/academic-intelligence/route.ts",
  "src/app/api/parent/academic-intelligence/route.ts",
  "src/app/api/admin/academic-intelligence/route.ts",
  "src/app/api/children/[id]/learning-dna/route.ts",
  "src/app/api/student/daily-journey/route.ts",
  "src/app/api/admin/students/[id]/progression-recommendations/route.ts",
];

const BRAIN_IMPORT_ALLOWLIST = [
  "@/lib/student-learning-brain",
  "../src/lib/student-learning-brain",
];

const FORBIDDEN_ROUTE_LEVEL_READ_PATTERNS = [
  "buildAcademicSourceForStudent(",
  "buildAcademicIntelligence(",
  "extractLearningDnaFromProfileJson(",
  "parseQuickLevelFinderSession(",
  "selectPlacementLessons(",
  "buildSubjectLevelProgression(",
  "getCoachHeartbeatSignals(",
  "listCatchUpTasks(",
  "listHomeworkTasks(",
];

function readRoute(routePath: string): string {
  const fullPath = path.join(PROJECT_ROOT, routePath);
  return fs.readFileSync(fullPath, "utf8");
}

test("display/read learning routes consume Student Learning Brain and avoid duplicated intelligence reads", () => {
  const violations: string[] = [];

  for (const routePath of READ_ROUTES) {
    const source = readRoute(routePath);

    const hasBrainImport = BRAIN_IMPORT_ALLOWLIST.some((pattern) => source.includes(pattern));
    if (!hasBrainImport) {
      violations.push(`${routePath}: missing Student Learning Brain import`);
    }

    const duplicatedReads = FORBIDDEN_ROUTE_LEVEL_READ_PATTERNS.filter((pattern) => source.includes(pattern));
    if (duplicatedReads.length) {
      violations.push(`${routePath}: duplicated intelligence read patterns -> ${duplicatedReads.join(", ")}`);
    }
  }

  assert.equal(
    violations.length,
    0,
    `Use Student Learning Brain for display/read learning intelligence instead of duplicating route-level reads.\n${violations.join("\n")}`,
  );
});