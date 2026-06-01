import assert from "node:assert/strict";
import test from "node:test";

import { auditLaunchEnvironment } from "../src/lib/release/launch-env-audit";

test("launch env audit reports core missing keys", () => {
  const result = auditLaunchEnvironment({
    DATABASE_URL: "postgres://db",
    NEXT_PUBLIC_APP_URL: "https://starlizacademy.com",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missingRequired, ["AUTH_SECRET", "NEXT_PUBLIC_BASE_URL", "CRON_SECRET", "EMAIL_FROM"]);
});

test("launch env audit expands enabled billing providers only", () => {
  const result = auditLaunchEnvironment({
    DATABASE_URL: "postgres://db",
    AUTH_SECRET: "secret",
    NEXT_PUBLIC_APP_URL: "https://starlizacademy.com",
    NEXT_PUBLIC_BASE_URL: "https://starlizacademy.com",
    CRON_SECRET: "cron",
    EMAIL_FROM: "StarLiz Academy <ops@example.com>",
    BILLING_ENABLE_REVOLUT: "true",
    BILLING_ENABLE_PAYSTACK: "0",
    REVOLUT_MERCHANT_API_KEY: "merchant-key",
    REVOLUT_WEBHOOK_SECRET: "webhook-secret",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.missingRequired, []);
  assert.equal(result.categories.some((category) => category.name === "billing:revolut"), true);
  assert.equal(result.categories.some((category) => category.name === "billing:paystack"), false);
});

test("launch env audit fails when an enabled provider is missing secrets", () => {
  const result = auditLaunchEnvironment({
    DATABASE_URL: "postgres://db",
    AUTH_SECRET: "secret",
    NEXT_PUBLIC_APP_URL: "https://starlizacademy.com",
    NEXT_PUBLIC_BASE_URL: "https://starlizacademy.com",
    CRON_SECRET: "cron",
    EMAIL_FROM: "StarLiz Academy <ops@example.com>",
    BILLING_ENABLE_STRIPE: "1",
    STRIPE_SECRET_KEY: "sk_live_x",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missingRequired, ["STRIPE_WEBHOOK_SECRET"]);
});