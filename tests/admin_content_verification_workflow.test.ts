import assert from "node:assert/strict";
import test from "node:test";

import { handleAdminContentVerifyPost } from "../src/app/api/admin/content/[id]/verify/route";
import { runContentRuntimeBlackBoxTest } from "../src/lib/ai/content-runtime-black-box-test";

type VerifyDeps = NonNullable<Parameters<typeof handleAdminContentVerifyPost>[2]>;

const context = { params: Promise.resolve({ id: "content-1" }) };
const passedRuntime = {
  status: "passed" as const,
  score: 94,
  maxScore: 100,
  passRate: 0.94,
  reasons: [],
  simulatedAttempts: 3,
  hintChecks: ["Hints passed."],
  masteryChecks: ["Mastery passed."],
  flowChecks: ["Flow passed."],
  testedAt: "2026-06-11T10:00:00.000Z",
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/content/content-1/verify", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function deps(overrides: Partial<VerifyDeps> = {}): VerifyDeps {
  return {
    requireAdmin: async () => ({
      session: { userId: "admin-1", email: "admin@starliz.test", role: "admin" },
      response: null,
    }),
    findContent: async () => ({
      id: "content-1",
      contentType: "maths",
      level: 3,
      topic: "Fractions",
      contentJson: JSON.stringify([{
        question: "Calculate 3/4 of 240.",
        answer: "180",
        explanation: "Divide by 4 then multiply by 3.",
        choices: ["180", "120", "160"],
        topic: "Fractions",
      }]),
      status: "generated",
      skillFocus: "Fractions",
      metadataJson: JSON.stringify({
        subject: "maths",
        blackBoxContentTest: {
          decision: "APPROVE",
          passRate: 0.94,
          score: 94,
          maxScore: 100,
          reasons: [],
        },
      }),
    }),
    updateContent: async (_id, data) => ({
      id: "content-1",
      status: data.status,
      metadataJson: data.metadataJson,
      reviewedAt: data.reviewedAt ?? null,
      approvedAt: data.approvedAt instanceof Date ? data.approvedAt : null,
    }),
    writeAuditLog: async () => undefined,
    runRuntimeTest: () => passedRuntime,
    now: () => new Date("2026-06-11T10:30:00.000Z"),
    ...overrides,
  };
}

test("admin verification approve writes gate metadata and review history", async () => {
  let auditAction = "";
  const response = await handleAdminContentVerifyPost(makeRequest({ action: "approve", notes: "Looks good." }), context, deps({
    writeAuditLog: async (input) => {
      auditAction = input.action;
    },
  }));
  const payload = await response.json() as { item: { status: string; metadataJson: string } };
  const metadata = JSON.parse(payload.item.metadataJson) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(payload.item.status, "approved");
  assert.equal((metadata.blackBoxLiveTest as { status: string }).status, "passed");
  assert.equal((metadata.blackBoxAdminVerification as { status: string }).status, "verified");
  assert.equal(Array.isArray(metadata.reviewHistory), true);
  assert.equal(auditAction, "ai_content.verification.approve");
});

test("admin verification reject requires notes", async () => {
  const response = await handleAdminContentVerifyPost(makeRequest({ action: "reject" }), context, deps());
  const payload = await response.json() as { error?: string };

  assert.equal(response.status, 422);
  assert.match(payload.error ?? "", /notes are required/i);
});

test("admin verification approve is blocked when runtime black box fails", async () => {
  let updated = false;
  const response = await handleAdminContentVerifyPost(makeRequest({ action: "approve", notes: "Approve." }), context, deps({
    runRuntimeTest: () => ({
      ...passedRuntime,
      status: "failed",
      score: 40,
      passRate: 0.4,
      reasons: ["Missing answer."],
    }),
    updateContent: async (_id, data) => {
      updated = true;
      return {
        id: "content-1",
        status: data.status,
        metadataJson: data.metadataJson,
        reviewedAt: null,
        approvedAt: null,
      };
    },
  }));
  const payload = await response.json() as { error?: string; blackBoxLiveTest?: { status?: string } };

  assert.equal(response.status, 422);
  assert.equal(payload.blackBoxLiveTest?.status, "failed");
  assert.equal(updated, false);
});

test("admin verification reclassify stores override without publishing", async () => {
  const response = await handleAdminContentVerifyPost(makeRequest({
    action: "reclassify",
    notes: "Actually reading comprehension.",
    reclassification: { subject: "reading", strand: "reading" },
  }), context, deps());
  const payload = await response.json() as { item: { status: string; metadataJson: string } };
  const metadata = JSON.parse(payload.item.metadataJson) as {
    subject?: string;
    strand?: string;
    blackBoxAdminVerification?: { reclassification?: { subject?: string; strand?: string } };
  };

  assert.equal(response.status, 200);
  assert.equal(payload.item.status, "reviewed");
  assert.equal(metadata.subject, "reading");
  assert.equal(metadata.strand, "reading");
  assert.equal(metadata.blackBoxAdminVerification?.reclassification?.subject, "reading");
});

test("admin verification approve is blocked while black box is stale", async () => {
  const response = await handleAdminContentVerifyPost(makeRequest({ action: "approve", notes: "Approve." }), context, deps({
    findContent: async () => ({
      id: "content-1",
      contentType: "maths",
      level: 3,
      topic: "Fractions",
      contentJson: JSON.stringify([{ question: "What is 1/2 of 10?", answer: "5" }]),
      status: "generated",
      skillFocus: "Fractions",
      metadataJson: JSON.stringify({
        blackBoxNeedsRerun: true,
        blackBoxLiveTest: { status: "needs_review" },
        blackBoxAdminVerification: { status: "pending" },
      }),
    }),
  }));

  const payload = await response.json() as { code?: string; error?: string };

  assert.equal(response.status, 409);
  assert.equal(payload.code, "black_box_stale_requires_rerun");
  assert.match(payload.error ?? "", /stale/i);
});

test("runtime black box simulation passes well-formed lesson content", () => {
  const result = runContentRuntimeBlackBoxTest({
    contentType: "maths",
    level: 3,
    topic: "Fractions",
    skillFocus: "Fractions",
    contentJson: JSON.stringify([{
      question: "Calculate 3/4 of 240.",
      answer: "180",
      explanation: "Divide by 4 then multiply by 3.",
      choices: ["180", "120", "160"],
      topic: "Fractions",
      skillFocus: "Fractions",
    }]),
  });

  assert.equal(result.status, "passed");
  assert.equal(result.score >= 82, true);
});
