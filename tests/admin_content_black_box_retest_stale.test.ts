import assert from "node:assert/strict";
import test from "node:test";

import { handleAdminContentBlackBoxPost } from "../src/app/api/admin/content/[id]/black-box/route-helpers";

type BlackBoxDeps = NonNullable<Parameters<typeof handleAdminContentBlackBoxPost>[2]>;

const context = { params: Promise.resolve({ id: "content-1" }) };
const request = new Request("http://localhost/api/admin/content/content-1/black-box", { method: "POST" });

function deps(overrides: Partial<BlackBoxDeps> = {}): BlackBoxDeps {
  return {
    requireAdmin: async () => ({
      session: { userId: "admin-1", email: "admin@starliz.test", role: "admin" },
      response: null,
    }),
    findContent: async () => ({
      id: "content-1",
      contentType: "math",
      level: 4,
      topic: "Multiplication",
      skillFocus: "Times tables",
      contentJson: JSON.stringify([{ prompt: "What is 6 x 7?", answer: "42" }]),
      metadataJson: JSON.stringify({
        subject: "math",
        blackBoxNeedsRerun: true,
        blackBoxStaleReason: "content_updated",
        blackBoxLiveTest: { status: "needs_review" },
        blackBoxAdminVerification: { status: "pending" },
      }),
      status: "generated",
    }),
    updateContentMetadata: async (_id, metadataJson) => ({
      id: "content-1",
      status: "generated",
      metadataJson,
    }),
    runContentBlackBoxTest: () => ({
      decision: "APPROVE",
      passRate: 0.9,
      score: 90,
      maxScore: 100,
      reasons: ["Good alignment"],
      itemResults: [
        {
          index: 0,
          score: 9,
          maxScore: 10,
          decision: "APPROVE",
          declaredLevel: 4,
          estimatedLevel: 4,
          recommendedLevel: 4,
          levelDelta: 0,
          levelRecommendation: { action: "keep", amount: 0, reason: "Level is appropriate." },
          inferredSubject: "maths",
          inferredStrand: "number",
          reasons: ["Clear prompt"],
          dimensions: [
            {
              dimension: "subject",
              score: 3,
              maxScore: 3,
              passed: true,
              reasons: [],
            },
          ],
        },
      ],
    }),
    writeAuditLog: async () => undefined,
    now: () => new Date("2026-06-18T08:30:00.000Z"),
    ...overrides,
  };
}

test("black box re-run clears stale flags and refreshes latest status", async () => {
  let storedMetadataJson = "";

  const response = await handleAdminContentBlackBoxPost(request, context, deps({
    updateContentMetadata: async (_id, metadataJson) => {
      storedMetadataJson = metadataJson;
      return {
        id: "content-1",
        status: "generated",
        metadataJson,
      };
    },
  }));

  const payload = await response.json() as { item?: { id?: string } };
  const metadata = JSON.parse(storedMetadataJson) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(payload.item?.id, "content-1");
  assert.equal(metadata.blackBoxNeedsRerun, false);
  assert.equal(metadata.blackBoxStaleReason, null);
  assert.equal((metadata.blackBoxLiveTest as { status?: string }).status, "passed");
  assert.equal((metadata.blackBoxAdminVerification as { status?: string }).status, "pending");
});
