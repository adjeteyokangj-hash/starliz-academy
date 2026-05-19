export type WarmupCompletenessReason =
  | "empty"
  | "filler"
  | "too_short"
  | "incomplete_phrase"
  | "low_confidence"
  | "missing_emotion_context"
  | "valid";

export type WarmupCompletenessResult = {
  complete: boolean;
  reason: WarmupCompletenessReason;
  normalizedTranscript: string;
  tokenCount: number;
  confidence: number | null;
  prompt: string;
};

const FILLER_WORDS = new Set([
  "um",
  "umm",
  "uh",
  "er",
  "erm",
  "hmm",
  "huh",
  "mm",
]);

const SHORT_ACKS = new Set([
  "ok",
  "okay",
  "yes",
  "yeah",
  "fine",
  "good",
]);

const INCOMPLETE_ENDINGS = [
  "i feel",
  "i am",
  "im",
  "i'm",
  "feeling",
  "because",
  "today i feel",
  "today i am",
  "i feel a bit",
];

const EMOTION_KEYWORDS = [
  "happy",
  "excited",
  "nervous",
  "tired",
  "sad",
  "confused",
  "worried",
  "scared",
  "not well",
  "good",
  "great",
  "ready",
  "stressed",
  "calm",
  "angry",
  "upset",
  "sleepy",
  "fine",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasEmotionKeyword(normalizedTranscript: string): boolean {
  return EMOTION_KEYWORDS.some((keyword) => normalizedTranscript.includes(keyword));
}

function hasEmotionSentencePattern(normalizedTranscript: string): boolean {
  if (!normalizedTranscript) return false;
  if (/\bi\s+feel\s+[a-z]/.test(normalizedTranscript)) return true;
  if (/\bi\s+am\s+[a-z]/.test(normalizedTranscript)) return true;
  if (/\bi'm\s+[a-z]/.test(normalizedTranscript)) return true;
  if (/\bfeeling\s+[a-z]/.test(normalizedTranscript)) return true;
  return false;
}

function isSingleFiller(tokens: string[]): boolean {
  if (tokens.length !== 1) return false;
  return FILLER_WORDS.has(tokens[0] ?? "");
}

function isShortAckOnly(normalizedTranscript: string, tokens: string[]): boolean {
  if (tokens.length !== 1) return false;
  return SHORT_ACKS.has(normalizedTranscript);
}

function endsWithIncompletePhrase(normalizedTranscript: string): boolean {
  return INCOMPLETE_ENDINGS.some((fragment) => normalizedTranscript.endsWith(fragment));
}

export function assessWarmupTranscript(input: {
  transcript: string;
  confidence?: number | null;
}): WarmupCompletenessResult {
  const normalizedTranscript = normalize(input.transcript);
  const tokens = normalizedTranscript.split(" ").filter(Boolean);
  const tokenCount = tokens.length;
  const confidence = typeof input.confidence === "number" && Number.isFinite(input.confidence)
    ? input.confidence
    : null;

  if (!normalizedTranscript) {
    return {
      complete: false,
      reason: "empty",
      normalizedTranscript,
      tokenCount,
      confidence,
      prompt: "I could not hear you clearly. Tell me how you feel today.",
    };
  }

  if (isSingleFiller(tokens)) {
    return {
      complete: false,
      reason: "filler",
      normalizedTranscript,
      tokenCount,
      confidence,
      prompt: "Tell me a little more about how you feel today.",
    };
  }

  if (isShortAckOnly(normalizedTranscript, tokens)) {
    return {
      complete: false,
      reason: "too_short",
      normalizedTranscript,
      tokenCount,
      confidence,
      prompt: "Tell me a little more about how you feel today.",
    };
  }

  if (confidence !== null && confidence < 0.6) {
    return {
      complete: false,
      reason: "low_confidence",
      normalizedTranscript,
      tokenCount,
      confidence,
      prompt: "I only heard part of that. Tell me a little more about how you feel today.",
    };
  }

  if (endsWithIncompletePhrase(normalizedTranscript)) {
    return {
      complete: false,
      reason: "incomplete_phrase",
      normalizedTranscript,
      tokenCount,
      confidence,
      prompt: "Tell me a little more about how you feel today.",
    };
  }

  const hasEmotionContext = hasEmotionSentencePattern(normalizedTranscript) || hasEmotionKeyword(normalizedTranscript);
  if (!hasEmotionContext) {
    return {
      complete: false,
      reason: "missing_emotion_context",
      normalizedTranscript,
      tokenCount,
      confidence,
      prompt: "Tell me a little more about how you feel today.",
    };
  }

  if (tokenCount < 2) {
    return {
      complete: false,
      reason: "too_short",
      normalizedTranscript,
      tokenCount,
      confidence,
      prompt: "Tell me a little more about how you feel today.",
    };
  }

  return {
    complete: true,
    reason: "valid",
    normalizedTranscript,
    tokenCount,
    confidence,
    prompt: "Thanks for telling me how you feel today.",
  };
}