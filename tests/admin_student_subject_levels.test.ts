import test from "node:test";
import assert from "node:assert/strict";

import { deriveAdminStudentSnapshotLevels } from "../src/lib/admin-student-levels";

test("keeps canonical year separate from subject levels by deriving maths level from adaptive snapshot", () => {
  const levels = deriveAdminStudentSnapshotLevels(
    JSON.stringify({
      adaptive: {
        spellingDifficulty: 2,
        mathDifficulty: 1,
        readingDifficulty: 3,
      },
    }),
    4,
  );

  assert.equal(levels.spellingLevel, 2);
  assert.equal(levels.mathLevel, 1);
  assert.equal(levels.readingLevel, 3);
});

test("falls back safely when snapshot is missing or malformed", () => {
  const missing = deriveAdminStudentSnapshotLevels(null, 4);
  assert.equal(missing.spellingLevel, 4);
  assert.equal(missing.mathLevel, 4);
  assert.equal(missing.readingLevel, 4);

  const malformed = deriveAdminStudentSnapshotLevels("{not-json", 4);
  assert.equal(malformed.spellingLevel, 4);
  assert.equal(malformed.mathLevel, 4);
  assert.equal(malformed.readingLevel, 4);
});
