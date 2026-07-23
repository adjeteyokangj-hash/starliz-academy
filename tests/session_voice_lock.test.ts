import test from "node:test";
import assert from "node:assert/strict";

import type { ChildProfile } from "../src/lib/store";
import {
  composeTutorSpeakInstructions,
  getOrPinTutorIdentity,
  peekSessionTutorVoicePinForTests,
  resetSessionTutorVoicePinForTests,
  resolveTutorOpenAiVoice,
  resolveTutorStyleInstructions,
  TUTOR_SPEAK_CONTEXTS,
  type TutorSpeakContext,
} from "../src/lib/voice";

function profileWithStyle(voiceStyle: ChildProfile["settings"]["voiceStyle"]): ChildProfile {
  return {
    id: "test-child",
    settings: {
      voiceStyle,
      voiceEnabled: true,
      volume: 1,
    },
  } as ChildProfile;
}

test("OpenAI voice id is stable for a voiceStyle", () => {
  assert.equal(resolveTutorOpenAiVoice("friendly_coach"), "nova");
  assert.equal(resolveTutorOpenAiVoice("accent_british"), "fable");
  assert.equal(resolveTutorOpenAiVoice("cheerful_kid"), "shimmer");
});

test("composed instructions keep the same persona across maths contexts", () => {
  const styleInstructions = resolveTutorStyleInstructions("friendly_coach");
  const mathsContexts: TutorSpeakContext[] = ["math_problem", "math_hint", "encouragement"];

  const composed = mathsContexts.map((context) => composeTutorSpeakInstructions(styleInstructions, context));

  for (const text of composed) {
    assert.ok(text.startsWith(styleInstructions), "style persona must lead every instruction");
    assert.match(text, /same single teacher/i);
    assert.doesNotMatch(text, /You are an? (enthusiastic|patient|warm|kind|curious|friendly)/i);
  }

  const personas = composed.map((text) => text.slice(0, styleInstructions.length));
  assert.deepEqual(personas, [styleInstructions, styleInstructions, styleInstructions]);
});

test("delivery cues never redefine the speaker persona", () => {
  const styleInstructions = resolveTutorStyleInstructions("accent_british");
  for (const context of TUTOR_SPEAK_CONTEXTS) {
    const text = composeTutorSpeakInstructions(styleInstructions, context);
    assert.doesNotMatch(text, /You are a /i);
    assert.doesNotMatch(text, /You are an /i);
    assert.ok(text.includes(styleInstructions));
  }
});

test("session pin reuses identity until voiceStyle changes", () => {
  resetSessionTutorVoicePinForTests();
  assert.equal(peekSessionTutorVoicePinForTests(), null);

  const first = getOrPinTutorIdentity(profileWithStyle("friendly_coach"));
  const second = getOrPinTutorIdentity(profileWithStyle("friendly_coach"));
  assert.equal(first.openaiVoice, "nova");
  assert.equal(second.openaiVoice, first.openaiVoice);
  assert.equal(second.styleInstructions, first.styleInstructions);
  assert.equal(peekSessionTutorVoicePinForTests()?.voiceStyle, "friendly_coach");

  const switched = getOrPinTutorIdentity(profileWithStyle("accent_irish"));
  assert.equal(switched.voiceStyle, "accent_irish");
  assert.equal(switched.openaiVoice, resolveTutorOpenAiVoice("accent_irish"));
  assert.notEqual(switched.openaiVoice, first.openaiVoice);
  assert.equal(peekSessionTutorVoicePinForTests()?.voiceStyle, "accent_irish");

  resetSessionTutorVoicePinForTests();
  assert.equal(peekSessionTutorVoicePinForTests(), null);
});

test("context changes alone do not change pinned OpenAI voice id", () => {
  resetSessionTutorVoicePinForTests();
  const identity = getOrPinTutorIdentity(profileWithStyle("storyteller"));
  const voice = identity.openaiVoice;

  for (const context of TUTOR_SPEAK_CONTEXTS) {
    const instructions = composeTutorSpeakInstructions(identity.styleInstructions, context);
    assert.equal(resolveTutorOpenAiVoice(identity.voiceStyle), voice);
    assert.ok(instructions.startsWith(identity.styleInstructions));
  }
});
