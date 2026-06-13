import test from "node:test";
import assert from "node:assert/strict";

import {
  canBeginLesson,
  normalizeSpellingStageForVoice,
  readVoiceHelpPreference,
  resolveVoiceHelpPreference,
  shouldShowQuestionMicrophone,
  shouldShowStartTalkingButton,
  shouldShowVoiceWarmupPanel,
  shouldShowWarmupMicButton,
} from "@/lib/lesson-voice-help";

test("voice help defaults to OFF", () => {
  assert.equal(readVoiceHelpPreference(null), false);
  assert.equal(readVoiceHelpPreference(undefined), false);
  assert.equal(readVoiceHelpPreference("false"), false);
  assert.equal(readVoiceHelpPreference("true"), true);
});

test("saved preference resolver keeps OFF by default", () => {
  assert.equal(resolveVoiceHelpPreference(null, undefined), false);
  assert.equal(resolveVoiceHelpPreference("false", true), false);
  assert.equal(resolveVoiceHelpPreference("true", false), true);
  assert.equal(resolveVoiceHelpPreference(null, true), true);
});

test("warm-up and start-talking UI stay hidden when voice help is OFF", () => {
  assert.equal(shouldShowVoiceWarmupPanel(false), false);
  assert.equal(shouldShowStartTalkingButton({ voiceEnabled: false, welcomeVoiceStarted: false }), false);
  assert.equal(shouldShowWarmupMicButton({ voiceEnabled: false, welcomeSpeechFinished: true }), false);
});

test("normal lesson begin action is available when voice help is OFF", () => {
  assert.equal(canBeginLesson({ voiceEnabled: false, warmupReady: false }), true);
  assert.equal(canBeginLesson({ voiceEnabled: true, warmupReady: false }), false);
  assert.equal(canBeginLesson({ voiceEnabled: true, warmupReady: true }), true);
});

test("question mic prompts and speech stage are disabled when voice help is OFF", () => {
  assert.equal(
    shouldShowQuestionMicrophone({
      voiceEnabled: false,
      started: true,
      currentSection: "spelling",
      hasFeedback: false,
      lessonStage: "ASSESS_SPEECH",
    }),
    false,
  );

  assert.equal(
    normalizeSpellingStageForVoice({
      voiceEnabled: false,
      currentSection: "spelling",
      lessonStage: "ASSESS_SPEECH",
    }),
    "TAP_SELECT",
  );

  assert.equal(
    normalizeSpellingStageForVoice({
      voiceEnabled: true,
      currentSection: "spelling",
      lessonStage: "ASSESS_SPEECH",
    }),
    "ASSESS_SPEECH",
  );
});
