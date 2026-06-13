import assert from "node:assert/strict";
import test from "node:test";

import {
  getBrainCentreSelectedMismatchSource,
  isBrainCentreMismatchRowSelected,
  toBrainCentreFilterHref,
} from "../src/lib/brain-centre/action-map";

test("mismatch action route includes source=homework", () => {
  const href = toBrainCentreFilterHref({
    tab: "all",
    sync: "mismatch",
    source: "homework",
  });

  assert.equal(href, "/admin/brain-centre?tab=all&sync=mismatch&source=homework");
});

test("Brain Centre page highlights only the Homework mismatch row", () => {
  const selectedSource = getBrainCentreSelectedMismatchSource({
    sync: "mismatch",
    source: "homework",
  });

  const homeworkSelected = isBrainCentreMismatchRowSelected({
    issueType: "recommendation_mismatch",
    mismatchingEngine: "Homework",
  }, {
    sync: "mismatch",
    source: selectedSource,
  });

  const catchUpSelected = isBrainCentreMismatchRowSelected({
    issueType: "recommendation_mismatch",
    mismatchingEngine: "Catch-Up",
  }, {
    sync: "mismatch",
    source: selectedSource,
  });

  assert.equal(homeworkSelected, true);
  assert.equal(catchUpSelected, false);
});

test("no mismatch highlight appears when source is missing or does not match", () => {
  assert.equal(isBrainCentreMismatchRowSelected({
    issueType: "recommendation_mismatch",
    mismatchingEngine: "Homework",
  }, {
    sync: "mismatch",
    source: null,
  }), false);

  assert.equal(isBrainCentreMismatchRowSelected({
    issueType: "recommendation_mismatch",
    mismatchingEngine: "Homework",
  }, {
    sync: "mismatch",
    source: "spelling",
  }), false);
});