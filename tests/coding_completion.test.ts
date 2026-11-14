import assert from "node:assert/strict";
import test from "node:test";
import { codingPeriodMatches } from "../src/lib/coding/support-policy";
import { independentChallenge, nextIndependentVariant } from "../src/lib/coding/independent-challenge";
import { UNDERSTANDING_LOOPS, stageBrief } from "../src/lib/coding/catalog";
import { assessCodingStage, codingCertificateCopy, freshEvidence } from "../src/lib/coding/assessment";
import { REFERENCE_PROGRAMS } from "../src/lib/coding/answers";
import { codingTeacherTurn } from "../src/lib/coding/model-tutor";
import { requestCoachJson } from "../src/lib/coach/model-json";
import { codingAssistanceEnabled } from "../src/lib/coding/settings";
import { Prisma } from "@prisma/client";

test("Coding period scope rejects another classroom and another subject", () => {
  assert.equal(codingPeriodMatches({ subject: "Coding", periodClassroomId: "a", learnerClassroomId: "b" }), false);
  assert.equal(codingPeriodMatches({ subject: "Maths", periodClassroomId: "a", learnerClassroomId: "a" }), false);
  assert.equal(codingPeriodMatches({ subject: "Coding", periodClassroomId: "a", learnerClassroomId: "a" }), true);
  assert.equal(codingPeriodMatches({ subject: "Coding", periodClassroomId: "a", learnerClassroomId: null }), false);
});

test("human assistance defaults off and missing migration cannot enable it", async () => {
  assert.equal(await codingAssistanceEnabled(async () => null), false);
  assert.equal(await codingAssistanceEnabled(async () => ({ humanAssistanceEnabled: true })), true);
  assert.equal(await codingAssistanceEnabled(async () => { throw new Prisma.PrismaClientKnownRequestError("missing table", { code: "P2021", clientVersion: "test" }); }), false);
});

test("a disclosed solution cannot pass independent assessment; the replacement target differs", () => {
  const helped = assessCodingStage({ lesson: UNDERSTANDING_LOOPS, stage: "create", program: REFERENCE_PROGRAMS.create, evidence: freshEvidence(), revealingHints: 1 });
  assert.equal(helped.passed, false);
  assert.equal(helped.evidence.independent, false);
  const next = independentChallenge(UNDERSTANDING_LOOPS, 1);
  assert.notDeepEqual(stageBrief(next, "create").goal, stageBrief(UNDERSTANDING_LOOPS, "create").goal);
  const oldAnswer = assessCodingStage({ lesson: next, stage: "create", program: REFERENCE_PROGRAMS.create, evidence: freshEvidence(), revealingHints: 0 });
  assert.equal(oldAnswer.passed, false);
  const goals = Array.from({ length: 16 }, (_, variant) => JSON.stringify(stageBrief(independentChallenge(UNDERSTANDING_LOOPS, variant), "create").goal));
  assert.equal(new Set(goals).size, 16);
  assert.equal(nextIndependentVariant(15), null);
});

test("lesson achievement does not claim pathway completion", () => {
  const copy = codingCertificateCopy({ pathwayTitle: "Block Coding", skills: ["loops"] });
  assert.match(copy.title, /lesson achievement/);
  assert.doesNotMatch(copy.body, /Completed the .* pathway/);
});

test("Coding model receives task and execution context; failures fall back", async () => {
  const previous = process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED;
  process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED = "true";
  try {
  const input = { lesson: UNDERSTANDING_LOOPS, stage: "build" as const, program: REFERENCE_PROGRAMS.build, hintCount: 0, run: null, yearGroup: "Year 4" };
  let calls = 0;
  const turn = await codingTeacherTurn(input, {
    getKey: async () => "test-key",
    request: async (_key, _system, user) => {
      calls++;
      const context = JSON.parse(user);
      assert.equal(context.yearGroup, "Year 4");
      assert.deepEqual(context.program, input.program);
      return { message: "Look at the number in your repeat. How many steps does the star need?" };
    },
  });
  assert.equal(calls, 1);
  assert.equal(turn.source, "model");
  assert.equal(turn.revealsSolution, true);
  const failed = await codingTeacherTurn(input, { getKey: async () => "test-key", request: async () => { throw new Error("timeout"); } });
  assert.equal(failed.source, "fallback");
  const unsafe = await codingTeacherTurn(input, { getKey: async () => "test-key", request: async () => ({ message: "Visit https://example.com" }) });
  assert.equal(unsafe.source, "fallback");
  const independent = await codingTeacherTurn({ ...input, stage: "create" }, { getKey: async () => { throw new Error("must not call model for independent assessment"); }, request: async () => null });
  assert.equal(independent.source, "fallback");
  } finally { if (previous === undefined) delete process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED; else process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED = previous; }
});

test("shared model transport rejects truncated, refused and malformed model output", async () => {
  const original = globalThis.fetch;
  try {
    for (const choice of [
      { finish_reason: "length", message: { content: '{"message":"partial"}' } },
      { finish_reason: "stop", message: { content: "[]" } },
      { finish_reason: "stop", message: { content: "invalid" } },
      { finish_reason: "stop", message: { content: '{"message":"text"}', refusal: "refused" } },
    ]) {
      globalThis.fetch = async () => Response.json({ choices: [choice] });
      assert.equal(await requestCoachJson("test-key", "Return JSON", "Task"), null);
    }
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.store, false);
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"message":"A useful question"}' } }] });
    };
    assert.deepEqual(await requestCoachJson("test-key", "Return JSON", "Task"), { message: "A useful question" });
  } finally { globalThis.fetch = original; }
});
