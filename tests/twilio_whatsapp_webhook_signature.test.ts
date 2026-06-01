import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { handleTwilioWhatsappWebhook } from "../src/app/api/webhooks/twilio/whatsapp/route";

type MockDb = {
  parentMessageThread: {
    upsert: (args: unknown) => Promise<{ id: string }>;
    update: (args: unknown) => Promise<void>;
  };
  parentMessage: {
    create: (args: unknown) => Promise<void>;
  };
};

function makeMockDb() {
  const calls = {
    upsert: 0,
    update: 0,
    create: 0,
  };

  const db: MockDb = {
    parentMessageThread: {
      upsert: async () => {
        calls.upsert += 1;
        return { id: "thread-1" };
      },
      update: async () => {
        calls.update += 1;
      },
    },
    parentMessage: {
      create: async () => {
        calls.create += 1;
      },
    },
  };

  return { db, calls };
}

function twilioSignature(url: string, bodyParams: URLSearchParams, authToken: string): string {
  const entries = Array.from(bodyParams.entries()).sort((a, b) => {
    if (a[0] === b[0]) return a[1].localeCompare(b[1]);
    return a[0].localeCompare(b[0]);
  });

  let payload = url;
  for (const [key, value] of entries) {
    payload += `${key}${value}`;
  }

  return createHmac("sha1", authToken).update(payload).digest("base64");
}

test("twilio webhook accepts request with valid signature", async () => {
  const authToken = "test-twilio-auth-token";
  const url = "https://example.com/api/webhooks/twilio/whatsapp";
  const body = new URLSearchParams({
    From: "whatsapp:+15551234567",
    To: "whatsapp:+15557654321",
    Body: "Hello from Twilio",
    MessageSid: "SM123",
    MessageStatus: "received",
  });

  const signature = twilioSignature(url, body, authToken);
  const { db, calls } = makeMockDb();

  const response = await handleTwilioWhatsappWebhook(
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": signature,
      },
      body: body.toString(),
    }),
    {
      db: db as never,
      authToken,
    },
  );

  assert.equal(response.status, 200);
  assert.equal(calls.upsert, 1);
  assert.equal(calls.create, 1);
  assert.equal(calls.update, 1);
});

test("twilio webhook rejects request with invalid signature", async () => {
  const authToken = "test-twilio-auth-token";
  const url = "https://example.com/api/webhooks/twilio/whatsapp";
  const body = new URLSearchParams({
    From: "whatsapp:+15551234567",
    To: "whatsapp:+15557654321",
    Body: "Hello from Twilio",
  });

  const { db, calls } = makeMockDb();

  const response = await handleTwilioWhatsappWebhook(
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": "invalid-signature",
      },
      body: body.toString(),
    }),
    {
      db: db as never,
      authToken,
    },
  );

  const payload = (await response.json()) as { error?: string };
  assert.equal(response.status, 401);
  assert.equal(payload.error, "Invalid Twilio signature.");
  assert.equal(calls.upsert, 0);
  assert.equal(calls.create, 0);
  assert.equal(calls.update, 0);
});

test("twilio webhook rejects request with missing signature", async () => {
  const authToken = "test-twilio-auth-token";
  const url = "https://example.com/api/webhooks/twilio/whatsapp";
  const body = new URLSearchParams({
    From: "whatsapp:+15551234567",
    To: "whatsapp:+15557654321",
    Body: "Hello from Twilio",
  });

  const { db, calls } = makeMockDb();

  const response = await handleTwilioWhatsappWebhook(
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }),
    {
      db: db as never,
      authToken,
    },
  );

  const payload = (await response.json()) as { error?: string };
  assert.equal(response.status, 401);
  assert.equal(payload.error, "Missing Twilio signature.");
  assert.equal(calls.upsert, 0);
  assert.equal(calls.create, 0);
  assert.equal(calls.update, 0);
});
