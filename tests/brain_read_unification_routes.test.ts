import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("parent insights reads aggregate activity from StudentLearningBrain", () => {
  const route = read("src/app/api/parent/insights/route.ts");

  assert.match(route, /getStudentLearningBrain/);
  assert.match(route, /toParentLearningBrainView/);
  assert.doesNotMatch(route, /prisma\.attempt\.findMany/);
  assert.doesNotMatch(route, /prisma\.progressRecord\.findMany/);
});

test("admin student detail exposes Brain-backed status fields", () => {
  const route = read("src/app/api/admin/students/[id]/route.ts");

  assert.match(route, /getStudentLearningBrain/);
  assert.match(route, /learningDataState = brain\?\.dataState/);
  assert.match(route, /heartbeatSummary: brain\?\.heartbeatSummary/);
  assert.match(route, /quickLevelFinderBaseline: brain\?\.quickLevelFinderBaseline/);
  assert.doesNotMatch(route, /classifyStudentDataState/);
  assert.doesNotMatch(route, /extractLearningDnaFromProfileJson/);
});

test("student learning-state derives evidence counts from Brain", () => {
  const route = read("src/app/api/student/learning-state/route.ts");
  const brain = read("src/lib/student-learning-brain/index.ts");

  assert.match(route, /getStudentLearningBrain/);
  assert.match(route, /toBrainBackedStudentLearningState/);
  assert.doesNotMatch(route, /prisma\.assignment\.count/);
  assert.doesNotMatch(route, /prisma\.studentSkill\.findMany/);
  assert.match(brain, /export function toBrainBackedStudentLearningState/);
});
