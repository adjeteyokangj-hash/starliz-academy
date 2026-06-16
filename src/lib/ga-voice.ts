export const GA_AUDIO_SOURCE_TYPES = [
  "AI_GENERATED",
  "AI_GENERATED_SONG",
  "ADMIN_UPLOADED",
  "PRONUNCIATION_REFERENCE",
  "STUDENT_RECORDING",
  "FUTURE_NATIVE_SPEAKER",
  "NATIVE_VERIFIED",
] as const;

export const GA_AUDIO_REVIEW_STATUSES = [
  "DRAFT",
  "AI_GENERATED",
  "APPROVED_FOR_EARLY_LEARNING",
  "NEEDS_NATIVE_REVIEW",
  "NATIVE_VERIFIED",
  "REJECTED",
  "REPLACED",
] as const;

export const GA_AUDIO_APPROVAL_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "REPLACED",
] as const;

export const GA_AUDIO_QUALITY_STATUSES = [
  "UNCHECKED",
  "GOOD",
  "TOO_QUIET",
  "TOO_LOUD",
  "NEEDS_CLEANUP",
] as const;

export const GA_AUDIO_ENHANCEMENT_STATUSES = [
  "NOT_APPLIED",
  "QUEUED",
  "APPLIED",
  "FAILED",
  "BYPASSED",
] as const;

export const GA_VOICE_ACTIVITY_TYPES = [
  "LISTEN_REPEAT",
  "SOUND_DRILL",
  "WORD_AUDIO_FLASHCARD",
  "PHRASE_REPEAT",
  "SONG_LISTEN",
  "SONG_REPEAT",
  "RECORD_AND_REVIEW",
  "CALL_AND_RESPONSE",
] as const;

export const GA_STUDENT_AUDIO_ALLOWED_REVIEW_STATUSES = [
  "APPROVED_FOR_EARLY_LEARNING",
  "NEEDS_NATIVE_REVIEW",
  "NATIVE_VERIFIED",
] as const;

export const GA_SUPPORTIVE_FEEDBACK_LEVELS = [
  "Good attempt",
  "Try again",
  "Listen carefully",
  "Needs review",
  "Improving",
] as const;

export function canServeGaAudioToStudent(reviewStatus: string): boolean {
  return GA_STUDENT_AUDIO_ALLOWED_REVIEW_STATUSES.includes(
    reviewStatus as (typeof GA_STUDENT_AUDIO_ALLOWED_REVIEW_STATUSES)[number],
  );
}

export function isReferenceOnlySourceType(sourceType: string): boolean {
  return sourceType === "PRONUNCIATION_REFERENCE";
}

export function isVoiceCloneBlockedForReference(sourceType: string): boolean {
  return sourceType === "PRONUNCIATION_REFERENCE";
}
