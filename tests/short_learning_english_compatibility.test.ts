import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("short learning english content compatibility contracts", () => {
  it("stores playable metadataSubject separately from schoolSubject", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/schools/short-learning-session-content.ts"),
      "utf8",
    );
    assert.match(src, /subject: playable\.metadataSubject/);
    assert.match(src, /schoolSubject: playable\.schoolSubject/);
    assert.match(src, /playability\.ok/);
    assert.match(src, /status: sessionStatus/);
    assert.match(src, /generatedOk \? "awaiting_review" : "failed"/);
    assert.match(src, /source: "published_journey"/);
    assert.match(src, /repairShortLearningContentCompatibility/);
  });

  it("excludes non-generative blocks from content generation", () => {
    const plan = readFileSync(
      resolve(process.cwd(), "src/lib/schools/short-learning-session-plan.ts"),
      "utf8",
    );
    assert.match(plan, /blueprint\(4, "break".*null/s);
    assert.match(plan, /tutor_support".*null/s);
    assert.match(plan, /progress_report".*null/s);
  });

  it("assignment safety uses shared playable compatibility helper", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/assignments.ts"), "utf8");
    assert.match(src, /isPlayableSubjectContentTypeCompatible/);
  });

  it("keeps generating concurrency guard", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/schools/short-learning-session-content.ts"),
      "utf8",
    );
    assert.match(src, /status === "generating"/);
  });
});
