import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayFromQueueMetadata } from "../src/lib/schools/short-learning-support-accept";

describe("Short Learning support accept display", () => {
  it("surfaces Short Learning context from queue metadata without exposing raw dumps", () => {
    const display = displayFromQueueMetadata({
      periodId: "sl:booking1:block1",
      questionKey: "q-3",
      assignmentId: "asg1",
      metadataJson: JSON.stringify({
        supportMode: "SHORT_LEARNING",
        shortLearningBookingId: "booking1",
        shortLearningSessionId: "session1",
        shortLearningBlockId: "block1",
        subject: "maths",
        yearGroup: "Year 6",
        contentId: "content1",
        blockOrder: 2,
        blockType: "guided_practice",
      }),
    });
    assert.equal(display.supportMode, "SHORT_LEARNING");
    assert.equal(display.subject, "maths");
    assert.equal(display.yearGroup, "Year 6");
    assert.equal(display.shortLearningBookingId, "booking1");
    assert.equal(display.shortLearningBlockId, "block1");
    assert.equal(display.questionKey, "q-3");
    assert.equal(display.workspaceHref, null);
    assert.match(display.bookingWindowLabel ?? "", /Short Learning/i);
    assert.match(display.currentBlockLabel ?? "", /Block 2/);
    assert.doesNotMatch(display.currentBlockLabel ?? "", /Period|timetable/i);
  });

  it("keeps Day School liveHref for real period ids", () => {
    const display = displayFromQueueMetadata({
      periodId: "cmdaylesson123",
      questionKey: null,
      assignmentId: null,
      metadataJson: null,
    });
    assert.equal(display.supportMode, "DAY_SCHOOL");
    assert.equal(display.workspaceHref, "/teacher/live/cmdaylesson123");
  });
});
