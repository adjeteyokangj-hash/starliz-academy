import assert from "node:assert/strict";
import test from "node:test";

import { processPaymentWebhookRequest } from "../src/lib/subscriptions/webhook-entry";
import { POST as stripeWebhookPost } from "../src/app/api/billing/stripe/webhook/route";
import { POST as revolutWebhookPost } from "../src/app/api/webhooks/revolut/route";

async function withEnv<T>(overrides: Record<string, string | undefined>, run: () => Promise<T> | T): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("payment webhook rejects requests without signature headers", async () => {
  const response = await processPaymentWebhookRequest(
    new Request("http://localhost/api/webhooks/payment", {
      method: "POST",
      body: JSON.stringify({ id: "evt-1", type: "invoice.payment_succeeded" }),
    }),
    { allowFallbackSignature: true },
  );

  const payload = (await response.json()) as { error?: string };
  assert.equal(response.status, 401);
  assert.equal(payload.error, "Missing webhook signature.");
});

test("production fallback webhook fails closed when Stripe secret is missing", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      STRIPE_WEBHOOK_SECRET: undefined,
      PAYMENT_WEBHOOK_SECRET: "fallback-secret-present",
    },
    async () => {
      const response = await processPaymentWebhookRequest(
        new Request("http://localhost/api/webhooks/payment", {
          method: "POST",
          headers: {
            "stripe-signature": "t=1,v1=deadbeef",
            "x-signature": "deadbeef",
          },
          body: JSON.stringify({ id: "evt-2", type: "invoice.payment_succeeded" }),
        }),
        { allowFallbackSignature: true },
      );

      const payload = (await response.json()) as { error?: string };
      assert.equal(response.status, 401);
      assert.equal(payload.error, "Stripe webhook secret is not configured.");
    },
  );
});

test("production fallback webhook fails closed when Paystack secret is missing", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      PAYSTACK_WEBHOOK_SECRET: undefined,
    },
    async () => {
      const response = await processPaymentWebhookRequest(
        new Request("http://localhost/api/webhooks/payment", {
          method: "POST",
          headers: {
            "x-paystack-signature": "deadbeef",
          },
          body: JSON.stringify({ id: "evt-3", event: "charge.success", data: {} }),
        }),
        { allowFallbackSignature: true },
      );

      const payload = (await response.json()) as { error?: string };
      assert.equal(response.status, 401);
      assert.equal(payload.error, "Paystack webhook secret is not configured.");
    },
  );
});

test("production fallback webhook fails closed when Revolut secret is missing", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      REVOLUT_WEBHOOK_SECRET: undefined,
    },
    async () => {
      const response = await processPaymentWebhookRequest(
        new Request("http://localhost/api/webhooks/payment", {
          method: "POST",
          headers: {
            "revolut-signature": "v1=deadbeef",
            "revolut-request-timestamp": String(Date.now()),
          },
          body: JSON.stringify({ id: "evt-4", event: "ORDER_COMPLETED" }),
        }),
        { allowFallbackSignature: true },
      );

      const payload = (await response.json()) as { error?: string };
      assert.equal(response.status, 401);
      assert.equal(payload.error, "Revolut webhook secret is not configured.");
    },
  );
});

test("stripe billing webhook endpoint fails closed when secret is missing", async () => {
  await withEnv(
    {
      STRIPE_WEBHOOK_SECRET: undefined,
    },
    async () => {
      const response = await stripeWebhookPost(
        new Request("http://localhost/api/billing/stripe/webhook", {
          method: "POST",
          body: JSON.stringify({ id: "evt-5" }),
        }),
      );

      const payload = (await response.json()) as { error?: string };
      assert.equal(response.status, 503);
      assert.equal(payload.error, "Stripe webhook is not configured");
    },
  );
});

test("revolut webhook endpoint fails closed when secret is missing", async () => {
  await withEnv(
    {
      REVOLUT_WEBHOOK_SECRET: undefined,
    },
    async () => {
      const response = await revolutWebhookPost(
        new Request("http://localhost/api/webhooks/revolut", {
          method: "POST",
          body: JSON.stringify({ id: "evt-6" }),
        }),
      );

      const payload = (await response.json()) as { error?: string };
      assert.equal(response.status, 503);
      assert.equal(payload.error, "Revolut webhook is not configured");
    },
  );
});
