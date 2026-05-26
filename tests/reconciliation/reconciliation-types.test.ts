import test from "node:test";
import assert from "node:assert/strict";

import { reconciliationSummarySchema } from "../../src/types/financial";

test("reconciliation summary schema validates payload", () => {
  const parsed = reconciliationSummarySchema.parse({
    pending: 2,
    failed: 1,
    synced: 10,
    lastSyncAt: null,
    status: "ok",
  });

  assert.equal(parsed.pending, 2);
  assert.equal(parsed.failed, 1);
});
