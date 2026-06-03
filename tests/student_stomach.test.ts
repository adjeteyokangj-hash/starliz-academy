import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  classifyEvidenceType,
  digestEvidence,
  isStomachEvidenceType,
  isStomachProcessingOnly,
} from "../src/lib/stomach";

test("quick level finder evidence digests into readiness-centric signals", () => {
  const result = digestEvidence({
    type: "quick_level_finder_completed",
    studentId: "student-1",
    occurredAt: "2025-01-01T00:00:00.000Z",
    payload: { score: 85 },
  });

  assert.equal(result.evidenceType, "quick_level_finder_completed");
  assert.equal(result.studentId, "student-1");
  assert.ok(result.signals.some((signal) => signal.type === "readiness_signal"));
  assert.ok(result.signals.some((signal) => signal.type === "confidence_signal"));
  assert.ok(result.signals.every((signal) => signal.confidence >= 0 && signal.confidence <= 100));
});

test("unknown evidence type is safely rejected by classifier", () => {
  assert.equal(classifyEvidenceType("unknown_event"), null);
});

test("evidence type guard supports runtime narrowing", () => {
  assert.equal(isStomachEvidenceType("lesson_completed"), true);
  assert.equal(isStomachEvidenceType("not_real"), false);
});

test("stomach foundation is explicitly digestion-only", () => {
  assert.equal(isStomachProcessingOnly(), true);
});

test("stomach module does not reference database writes", () => {
  const modulePath = path.resolve(__dirname, "../src/lib/stomach/digestionEngine.ts");
  const source = fs.readFileSync(modulePath, "utf8");

  const forbiddenPatterns = ["prisma", "writeFile", "update(", "create(", "delete(", "INSERT INTO", "UPDATE ", "DELETE FROM"];
  const violations = forbiddenPatterns.filter((pattern) => source.includes(pattern));

  assert.deepEqual(violations, []);
});
