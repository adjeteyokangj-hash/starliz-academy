import test from "node:test";
import assert from "node:assert/strict";
import { CODING_STAGES, stageUnlocked } from "../src/lib/coding/types";
import { firstInstructionsPackages } from "../src/lib/coding/curriculum/first-instructions";
import { routeEngineFor, routeEvaluationSchema, evaluateRoute } from "../src/lib/coding/curriculum/route-engine";
import { lessonPackageHash, verifyLessonPublication, type PublicationEvidence } from "../src/lib/coding/curriculum/contracts";
import { approvedCodingInventory, CODING_CURRICULUM_VERSION, curriculumReadiness, pathwayCompletion } from "../src/lib/coding/curriculum/registry";

test("all earlier stages, not just the immediately previous stage, are required", () => {
  assert.equal(stageUnlocked("create", ["debug"]), false);
  assert.equal(stageUnlocked("review", ["create"]), false);
  assert.equal(stageUnlocked("create", CODING_STAGES.slice(0, 5)), true);
});

for (const lesson of firstInstructionsPackages) {
  test(`${lesson.inventoryId}: every stage reference executes; seeded fault fails for its stated reason`, async () => {
    const engine = routeEngineFor(lesson);
    for (const reference of lesson.referenceArtifacts) {
      for (const check of lesson.checks.filter((item) => item.stage === reference.stage)) {
        assert.equal((await engine.evaluate(reference.artifact, check.evaluatorId)).passed, true, `${reference.stage} reference must pass`);
      }
    }
    const check = lesson.checks.find((item) => item.id === lesson.fault.checkId)!;
    const faulty = await engine.evaluate(lesson.fault.artifact, check.evaluatorId);
    assert.equal(faulty.passed, false);
    assert.equal(faulty.failureCode, lesson.fault.expectedFailureCode);
    for (const variant of lesson.independentVariants) {
      for (const caseId of variant.heldOutCaseIds) assert.equal((await engine.evaluateIndependent(variant.referenceArtifact, variant.id, caseId)).passed, true);
    }
    const unpublished = await verifyLessonPublication({ lesson, engine });
    assert.equal(unpublished.ready, false, "Passing code alone cannot manufacture educational/UAT approval");
  });
}

test("route checks reject missing ordered stops even at the right destination", () => {
  const lesson = firstInstructionsPackages[1]!;
  const specification = routeEvaluationSchema.parse(lesson.evaluationSpec);
  assert.equal(evaluateRoute(lesson.fault.artifact, specification.stages.debug!).failureCode, "missing-stop");
});

test("publication checks bind evidence to the exact package and engine and execute hidden cases", async () => {
  const lesson = firstInstructionsPackages[0]!;
  const engine = routeEngineFor(lesson);
  // These are unit-test-only review records, never application release records.
  const evidence: PublicationEvidence = {
    packageHash: lessonPackageHash(lesson), engineVersion: engine.version,
    educationalReview: { approved: true, reviewerId: "test-only", recordId: "test-only" },
    authenticatedUat: { passed: true, runId: "test-only" }, accessibility: { passed: true, runId: "test-only" }, security: { passed: true, runId: "test-only" },
  };
  assert.equal((await verifyLessonPublication({ lesson, engine, evidence })).ready, true);
  assert.equal((await verifyLessonPublication({ lesson: { ...lesson, objective: "A changed objective" }, engine, evidence })).ready, false);
  assert.equal((await verifyLessonPublication({ lesson, engine: { ...engine, evaluateIndependent: async () => ({ passed: false }) }, evidence })).ready, false);
  assert.equal((await verifyLessonPublication({ lesson: { ...lesson, independentVariants: [] }, engine, evidence })).ready, false);
});

test("approved inventory is not confused with completed lessons or projects", () => {
  const readiness = curriculumReadiness();
  assert.equal(readiness.approvedCoreLessons, 264);
  assert.equal(readiness.plannedConsolidationSessions, 132);
  assert.equal(readiness.portfolioProjects, 44);
  assert.equal(readiness.verifiedNewLessonPackages, 0);
  assert.equal(readiness.pathways.some((pathway) => pathway.complete), false);
});

test("a pathway requires every lesson, consolidation and project for the matching release", () => {
  const pathwayId = "foundations";
  const courses = approvedCodingInventory.courses.filter((course) => course.pathwayId === pathwayId);
  const input = {
    pathwayId, curriculumVersion: CODING_CURRICULUM_VERSION,
    masteredLessons: approvedCodingInventory.lessons.filter((lesson) => lesson.pathwayId === pathwayId).map((lesson) => lesson.id),
    completedConsolidations: courses.flatMap((course) => course.moduleIds.flatMap((module) => ["retrieval", "repair", "transfer"].map((kind) => `${module}/consolidation/${kind}`))),
    verifiedProjects: approvedCodingInventory.projects.filter((project) => courses.some((course) => course.id === project.courseId)).map((project) => project.id),
  };
  assert.equal(pathwayCompletion(input).complete, true);
  assert.equal(pathwayCompletion({ ...input, verifiedProjects: [] }).complete, false);
  assert.equal(pathwayCompletion({ ...input, completedConsolidations: [] }).complete, false);
  assert.equal(pathwayCompletion({ ...input, curriculumVersion: "old" }).complete, false);
  assert.equal(pathwayCompletion({ ...input, pathwayId: "unknown" }).complete, false);
});
