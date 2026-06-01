import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReleaseReadinessReport,
  getReleaseReadinessItems,
} from "../src/lib/release/release-readiness";

test("release readiness manifest keeps blocking items actionable", () => {
  const items = getReleaseReadinessItems();
  const blocking = items.filter((item) => item.blocking);

  assert.ok(blocking.length >= 4);
  for (const item of blocking) {
    assert.ok(item.command.length > 0);
    assert.ok(item.docPath.startsWith("docs/"));
  }
});

test("release readiness report includes the critical gates", () => {
  const report = buildReleaseReadinessReport();

  assert.match(report, /Phase 6 - Opt-in release QA journeys/);
  assert.match(report, /Phase 9 - Opt-in final smoke/);
  assert.match(report, /Phase 10 - Launch environment audit/);
  assert.match(report, /npm run audit:launch-env/);
});