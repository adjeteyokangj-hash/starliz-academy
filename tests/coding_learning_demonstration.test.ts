import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { demonstrationMetadataSchema, demonstrationAttachmentSchema } from "../src/lib/coding/learning/demonstration-contract";
import { validateWebmEnvelope, verifyDemonstrationReceipt, saveDemonstration, encryptDemonstration, decryptDemonstration } from "../src/lib/coding/learning/demonstration-storage";
import { activityDefinition } from "../src/lib/coding/learning/catalogue";
import { initialActivityState, transitionActivity } from "../src/lib/coding/learning/state-machine";
import { executePractical } from "../src/lib/coding/learning/runtime";

test("recording receipts bind actual private metadata to its child and activity, and reject a changed explanation or source", () => {
  const previous = process.env.CODING_DEMONSTRATION_SECRET; process.env.CODING_DEMONSTRATION_SECRET = "synthetic-media-receipt-test-secret-32-characters";
  try {
    const metadata = demonstrationMetadataSchema.parse({ id: "6051a601-5681-48c6-b729-7a741d3bb09a", sha256: "a".repeat(64), size: 300, mime: "video/webm", transcript: "Synthetic written alternative for a unit contract test, not an actual runtime recording.", rights: "Original synthetic test metadata only.", limitation: "No actual decoder or authenticated storage claim is made by this unit test.", artifactHash: "b".repeat(64), taskHash: "e".repeat(64), createdAt: "2026-11-03T09:00:00.000Z", decoded: { imageDigest: `sha256:${"c".repeat(64)}`, frames: 10, width: 320, height: 180, durationMs: 1000 } });
    const signed = Buffer.from(JSON.stringify({ childId: "synthetic-child", activityId: "synthetic-activity", metadata })).toString("base64url");
    const attachment = { metadata, receipt: `${signed}.${createHmac("sha256", process.env.CODING_DEMONSTRATION_SECRET).update(signed).digest("base64url")}` };
    assert.deepEqual(verifyDemonstrationReceipt(attachment, "synthetic-child", "synthetic-activity"), attachment);
    assert.throws(() => verifyDemonstrationReceipt(attachment, "other-child", "synthetic-activity"));
    assert.throws(() => verifyDemonstrationReceipt(attachment, "synthetic-child", "other-activity"));
    for (const changed of [{ transcript: "A changed but sufficiently long synthetic alternative cannot inherit the earlier signed receipt." }, { artifactHash: "d".repeat(64) }, { size: 301 }]) assert.throws(() => verifyDemonstrationReceipt({ ...attachment, metadata: { ...metadata, ...changed } }, "synthetic-child", "synthetic-activity"));
    assert.equal(demonstrationAttachmentSchema.safeParse({ metadata, receipt: "invented" }).success, false);
  } finally { if (previous === undefined) delete process.env.CODING_DEMONSTRATION_SECRET; else process.env.CODING_DEMONSTRATION_SECRET = previous; }
});

test("stored recording bytes are encrypted and bound to child/object even in a shared bucket", () => {
  const previous = process.env.CODING_DEMONSTRATION_SECRET; process.env.CODING_DEMONSTRATION_SECRET = "synthetic-media-encryption-test-secret-32-characters";
  try {
    const bytes = Buffer.from("Synthetic private media content; this encryption test makes no recording or decoder claim.");
    const encrypted = encryptDemonstration(bytes, "synthetic-child", "synthetic-object");
    assert.equal(encrypted.includes(bytes), false); assert.deepEqual(decryptDemonstration(encrypted, "synthetic-child", "synthetic-object"), bytes);
    assert.throws(() => decryptDemonstration(encrypted, "other-child", "synthetic-object")); assert.throws(() => decryptDemonstration(encrypted, "synthetic-child", "other-object"));
    encrypted[encrypted.length - 1] = encrypted[encrypted.length - 1]! ^ 1; assert.throws(() => decryptDemonstration(encrypted, "synthetic-child", "synthetic-object"));
  } finally { if (previous === undefined) delete process.env.CODING_DEMONSTRATION_SECRET; else process.env.CODING_DEMONSTRATION_SECRET = previous; }
});

test("a fake WebM header cannot become accepted evidence when no actual isolated decoder is configured", async () => {
  assert.throws(() => validateWebmEnvelope(new Uint8Array(300)));
  const envelope = Buffer.alloc(300); envelope.writeUInt32BE(0x1a45dfa3); envelope.write("webm", 8); envelope.write("V_VP8", 30);
  assert.equal(validateWebmEnvelope(envelope).size, 300, "Envelope screening alone deliberately makes no playback claim");
  const previous = process.env.CODING_MEDIA_RUNNER_URL; delete process.env.CODING_MEDIA_RUNNER_URL;
  try { await assert.rejects(() => saveDemonstration({ childId: "unit-only", activityId: "unit-only", bytes: envelope, artifactHash: "a".repeat(64), taskHash: "e".repeat(64), transcript: "A unit test cannot claim that these invented bytes are a real playable recording.", rights: "Synthetic unit-contract input only.", limitation: "No recording, isolated decode or storage operation is verified here." }), /decoder is not configured/); }
  finally { if (previous !== undefined) process.env.CODING_MEDIA_RUNNER_URL = previous; }
});

test("passing real native practical checks alone cannot satisfy a required original-demonstration workflow", async () => {
  const base = activityDefinition("Y1.01"); assert.ok(base);
  const activity = { ...base, workflow: { originalDemonstration: true } };
  const state = initialActivityState(activity); state.stage = "create"; state.completed = ["discover", "predict", "build", "practise", "debug"];
  const artifact = activity.independent[state.independentVariant]!.reference;
  const result = await transitionActivity(activity, state, { action: "check", stage: "create", revision: "unit-only", artifact }, { run: executePractical, teach: async () => ({ message: "Unused", source: "fallback", revealing: false }), reflect: async () => ({ passed: false, message: "Unused", source: "evidence", confidence: 0 }) });
  const gate = result.state.lastChecks.find(check => check.description.startsWith("Attach your original private video"));
  assert.ok(gate); assert.equal(gate.passed, false); assert.equal(result.state.mastered, false); assert.equal(result.newlyMastered, false);
});
