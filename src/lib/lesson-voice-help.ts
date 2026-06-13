export type LessonVoiceStage = "ASSESS_SPEECH" | "TEACH_RETRY" | "TAP_SELECT" | "COMPLETE";

export function readVoiceHelpPreference(raw: string | null | undefined): boolean {
  return raw === "true";
}

export function resolveVoiceHelpPreference(
  localOverrideRaw: string | null | undefined,
  savedVoiceEnabled?: boolean,
): boolean {
  if (localOverrideRaw === "true") return true;
  if (localOverrideRaw === "false") return false;
  return savedVoiceEnabled === true;
}

export function canBeginLesson(opts: {
  voiceEnabled: boolean;
  warmupReady: boolean;
}): boolean {
  if (!opts.voiceEnabled) return true;
  return opts.warmupReady;
}

export function shouldShowVoiceWarmupPanel(voiceEnabled: boolean): boolean {
  return voiceEnabled;
}

export function shouldShowStartTalkingButton(opts: {
  voiceEnabled: boolean;
  welcomeVoiceStarted: boolean;
}): boolean {
  return opts.voiceEnabled && !opts.welcomeVoiceStarted;
}

export function shouldShowWarmupMicButton(opts: {
  voiceEnabled: boolean;
  welcomeSpeechFinished: boolean;
}): boolean {
  return opts.voiceEnabled && opts.welcomeSpeechFinished;
}

export function shouldShowQuestionMicrophone(opts: {
  voiceEnabled: boolean;
  started: boolean;
  currentSection: "spelling" | "math" | "reading";
  hasFeedback: boolean;
  lessonStage: LessonVoiceStage;
}): boolean {
  if (!opts.voiceEnabled) return false;
  if (!opts.started || opts.hasFeedback || opts.currentSection !== "spelling") return false;
  return opts.lessonStage === "ASSESS_SPEECH" || opts.lessonStage === "TEACH_RETRY";
}

export function normalizeSpellingStageForVoice(opts: {
  voiceEnabled: boolean;
  currentSection: "spelling" | "math" | "reading";
  lessonStage: LessonVoiceStage;
}): LessonVoiceStage {
  if (
    !opts.voiceEnabled
    && opts.currentSection === "spelling"
    && (opts.lessonStage === "ASSESS_SPEECH" || opts.lessonStage === "TEACH_RETRY")
  ) {
    return "TAP_SELECT";
  }
  return opts.lessonStage;
}
