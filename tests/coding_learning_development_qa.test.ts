import test from "node:test";
import assert from "node:assert/strict";
import { qaChildConfigured } from "../src/lib/coding/learning/development-qa";

test("private curriculum QA cannot activate in production, for unspecified children or through an unbounded allowlist", () => {
  const names = ["NODE_ENV", "CODING_CURRICULUM_QA_ENABLED", "CODING_CURRICULUM_QA_CHILD_IDS"], previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    Object.assign(process.env, { NODE_ENV: "production", CODING_CURRICULUM_QA_ENABLED: "true", CODING_CURRICULUM_QA_CHILD_IDS: "synthetic-child-one" });
    assert.equal(qaChildConfigured("synthetic-child-one"), false);
    Object.assign(process.env, { NODE_ENV: "development" }); assert.equal(qaChildConfigured("synthetic-child-one"), true); assert.equal(qaChildConfigured("an-original-child"), false);
    process.env.CODING_CURRICULUM_QA_CHILD_IDS = "synthetic-one,synthetic-two,synthetic-three,synthetic-four,synthetic-five"; assert.equal(qaChildConfigured("synthetic-one"), false);
    process.env.CODING_CURRICULUM_QA_CHILD_IDS = "synthetic-child-one,*"; assert.equal(qaChildConfigured("synthetic-child-one"), false);
    delete process.env.CODING_CURRICULUM_QA_ENABLED; assert.equal(qaChildConfigured("synthetic-child-one"), false);
  } finally { for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
});
