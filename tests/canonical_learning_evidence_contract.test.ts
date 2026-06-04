import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("canonical learning evidence contract documents the rollout boundaries", () => {
  const contract = read("docs/CANONICAL_LEARNING_EVIDENCE_CONTRACT.md");

  assert.match(contract, /Activity -> Attempt -> writeLearningActivity -> WeakAreas -> StudentSkills -> LearningDNA -> Snapshots -> HEART BEAT -> Academic Intelligence -> Assignments -> Catch-Up -> Homework -> Certificates -> Analytics/);
  assert.match(contract, /Session summaries must not fabricate `Attempt` rows/);
  assert.match(contract, /Quick Level Finder remains placement evidence/);
  assert.match(contract, /ChildProfile\.id` as the canonical learner identifier/);
});

test("attempt writes are routed through the canonical writer without direct route-level Attempt creation", () => {
  const route = read("src/app/api/attempts/route.ts");

  assert.match(route, /writeLearningActivity/);
  assert.doesNotMatch(route, /prisma\.attempt\.create/);
  assert.match(route, /resolvedStudentId/);
});

test("student progress keeps legacy ProgressRecord history but routes learning summaries through the writer", () => {
  const route = read("src/app/api/student/progress/route.ts");

  assert.match(route, /progressRecord\.create/);
  assert.match(route, /writeLearningActivity/);
  assert.match(route, /kind:\s*"session_summary"/);
  assert.doesNotMatch(route, /attempt\.create/);
});

test("Quick Level Finder remains placement evidence and does not use the normal activity writer", () => {
  const files = [
    "src/app/api/student/quick-level-finder/answer/route.ts",
    "src/app/api/student/quick-level-finder/complete/route.ts",
    "src/app/api/student/quick-level-finder/levels/route.ts",
    "src/app/api/student/quick-level-finder/session/route.ts",
    "src/app/api/student/quick-level-finder/start/route.ts",
  ];

  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /writeLearningActivity/, `${file} must not route placement through normal activity writes`);
  }
});

test("admin weak-area refresh does not invoke legacy ProgressRecord reconstruction", () => {
  const route = read("src/app/api/admin/weak-areas/route.ts");

  assert.doesNotMatch(route, /detectAndStoreWeakAreas/);
  assert.match(route, /canonical_learning_activity/);
  assert.match(route, /weakAreas/);
});

test("Academic Intelligence reads canonical evidence plus legacy history without changing response shape", () => {
  const dataSource = read("src/lib/academic-intelligence/data.ts");

  assert.match(dataSource, /assignments:/);
  assert.match(dataSource, /attempts:/);
  assert.match(dataSource, /weakAreas:/);
  assert.match(dataSource, /studentSkills:/);
  assert.match(dataSource, /progressRecords:/);
  assert.match(dataSource, /quickLevelFinderBaseline/);
});
