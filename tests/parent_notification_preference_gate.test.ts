import test from "node:test";
import assert from "node:assert/strict";

import {
  PARENT_OPTIONAL_NOTIFICATION_TYPES,
  parentAllowsOptionalNotification,
} from "../src/lib/notifications/parent-preference-gate";

test("essential billing preference event types cannot be disabled", async () => {
  const allowed = await parentAllowsOptionalNotification({
    parentUserId: "parent-1",
    preferenceEventType: "parent_subscription_payment_failed",
    lookup: async () => ({ emailEnabled: false }),
  });
  assert.equal(allowed, true);
});

test("sender respects disabled lesson reminder preference", async () => {
  const allowed = await parentAllowsOptionalNotification({
    parentUserId: "parent-1",
    preferenceEventType: PARENT_OPTIONAL_NOTIFICATION_TYPES.lessonReminders,
    lookup: async () => ({ emailEnabled: false }),
  });
  assert.equal(allowed, false);
});

test("missing optional preference falls back to defaultEnabled", async () => {
  const onByDefault = await parentAllowsOptionalNotification({
    parentUserId: "parent-1",
    preferenceEventType: PARENT_OPTIONAL_NOTIFICATION_TYPES.lessonReminders,
    defaultEnabled: true,
    lookup: async () => null,
  });
  assert.equal(onByDefault, true);

  const offByDefault = await parentAllowsOptionalNotification({
    parentUserId: "parent-1",
    preferenceEventType: PARENT_OPTIONAL_NOTIFICATION_TYPES.productUpdates,
    defaultEnabled: false,
    lookup: async () => null,
  });
  assert.equal(offByDefault, false);
});
