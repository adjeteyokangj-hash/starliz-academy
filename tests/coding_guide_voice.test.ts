import assert from "node:assert/strict";
import test from "node:test";
import { resolveGuideVoice } from "../src/components/guidance/guideVoiceProfiles";

const voice = (name: string, lang = "en-GB", localService = true): SpeechSynthesisVoice =>
  ({ name, lang, localService, voiceURI: name, default: false });
const hazel = voice("Microsoft Hazel");
const george = voice("Microsoft George");
const robot = voice("Trinoids", "en-US");
const remote = voice("Zarvox", "en-GB", false);

test("Automatic chooses actual character voices and preserves an available accent", () => {
  const list = [george, hazel, robot, remote];
  assert.equal(resolveGuideVoice(list, "StarLiz Guide").voice, hazel);
  assert.equal(resolveGuideVoice(list, "Astro").voice, george);
  assert.equal(resolveGuideVoice(list, "Byte").voice, robot);
  assert.equal(resolveGuideVoice(list, "Byte", undefined, "en-GB").voice, george);
  assert.match(resolveGuideVoice(list, "Byte", undefined, "en-GB").fallback ?? "", /preferred character voice/);
});

test("manual overrides persist across character and accent changes until cleared", () => {
  const list = [george, hazel, robot];
  assert.equal(resolveGuideVoice(list, "Astro", hazel.voiceURI, "en-US").voice, hazel);
  assert.equal(resolveGuideVoice(list, "Astro", undefined, "en-US").voice, robot);
  assert.match(resolveGuideVoice(list, "Astro", "missing", "en-AU").fallback ?? "", /saved voice.*selected accent/);
});

test("no implicit remote default or fabricated voice switch", () => {
  assert.equal(resolveGuideVoice([remote], "Byte").voice, undefined);
  assert.equal(resolveGuideVoice([hazel], "StarLiz Guide").voice, hazel);
  assert.equal(resolveGuideVoice([hazel], "Byte").voice, hazel);
});
