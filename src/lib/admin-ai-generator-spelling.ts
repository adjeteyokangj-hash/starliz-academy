export type AdminAiGeneratorErrorCode =
  | "missing_openai_key"
  | "invalid_payload"
  | "model_error"
  | "invalid_generated_content"
  | "generation_error";

export type AdminAiGeneratorFailure = {
  errorCode: AdminAiGeneratorErrorCode;
  message: string;
  details: Record<string, unknown>;
  status: number;
};

type GeneratorFailureContext = {
  subject?: string;
  yearGroup?: string;
  skillFocus?: string;
  generationType?: string;
};

type DeterministicSpellingFallbackInput = {
  yearGroup: string;
  skillFocus: string;
  topic: string;
  count: number;
  difficulty: number;
};

type FallbackSeedRow = {
  word: string;
  hint: string;
  sentenceContext: string;
  categoryHint: string;
  syllables: string;
  emoji: string;
};

const PREFIX_FALLBACK_ROWS: FallbackSeedRow[] = [
  {
    word: "unhappy",
    hint: "Use the prefix 'un-' to show the opposite feeling.",
    sentenceContext: "The rainy picnic left everyone feeling unhappy.",
    categoryHint: "prefixes: un-",
    syllables: "3",
    emoji: "Aa",
  },
  {
    word: "rewrite",
    hint: "Use the prefix 're-' when something is done again.",
    sentenceContext: "Please rewrite the sentence neatly in your book.",
    categoryHint: "prefixes: re-",
    syllables: "2",
    emoji: "Aa",
  },
  {
    word: "preview",
    hint: "Use the prefix 'pre-' when something happens before the main event.",
    sentenceContext: "We watched a preview of the class play before the final rehearsal.",
    categoryHint: "prefixes: pre-",
    syllables: "2",
    emoji: "Aa",
  },
  {
    word: "misplace",
    hint: "Use the prefix 'mis-' when something goes wrong or ends up in the wrong place.",
    sentenceContext: "I always misplace my ruler when my desk is messy.",
    categoryHint: "prefixes: mis-",
    syllables: "2",
    emoji: "Aa",
  },
  {
    word: "disappear",
    hint: "Use the prefix 'dis-' when something is no longer there.",
    sentenceContext: "The rainbow seemed to disappear behind the clouds.",
    categoryHint: "prefixes: dis-",
    syllables: "3",
    emoji: "Aa",
  },
  {
    word: "submarine",
    hint: "Use the prefix 'sub-' when something goes under.",
    sentenceContext: "The submarine travelled quietly under the sea.",
    categoryHint: "prefixes: sub-",
    syllables: "3",
    emoji: "Aa",
  },
  {
    word: "interact",
    hint: "Use the prefix 'inter-' when people or things work between one another.",
    sentenceContext: "Our teams interact well when we solve problems together.",
    categoryHint: "prefixes: inter-",
    syllables: "3",
    emoji: "Aa",
  },
  {
    word: "superhero",
    hint: "Use the prefix 'super-' when something is above or beyond ordinary.",
    sentenceContext: "My little brother dressed up as a superhero for the school fair.",
    categoryHint: "prefixes: super-",
    syllables: "4",
    emoji: "Aa",
  },
];

const GENERAL_SPELLING_ROWS: FallbackSeedRow[] = [
  {
    word: "careful",
    hint: "Say the word slowly and listen for each sound.",
    sentenceContext: "Be careful when you carry the paint across the classroom.",
    categoryHint: "general spelling",
    syllables: "2",
    emoji: "Aa",
  },
  {
    word: "teacher",
    hint: "Think about the vowel team in the middle of the word.",
    sentenceContext: "Our teacher read the instructions before the lesson began.",
    categoryHint: "general spelling",
    syllables: "2",
    emoji: "Aa",
  },
  {
    word: "brightest",
    hint: "Break the word into chunks before spelling it.",
    sentenceContext: "The brightest star was easy to spot in the clear sky.",
    categoryHint: "general spelling",
    syllables: "2",
    emoji: "Aa",
  },
  {
    word: "understand",
    hint: "Look for the small word hidden inside the larger word.",
    sentenceContext: "I understand the pattern better after extra practice.",
    categoryHint: "general spelling",
    syllables: "3",
    emoji: "Aa",
  },
  {
    word: "adventure",
    hint: "Listen for the softer ending sound at the end of the word.",
    sentenceContext: "The class wrote an adventure story about a hidden map.",
    categoryHint: "general spelling",
    syllables: "3",
    emoji: "Aa",
  },
];

function compactText(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function formatSpellingContext(context: GeneratorFailureContext) {
  const yearGroup = compactText(context.yearGroup);
  const skillFocus = compactText(context.skillFocus);
  if (yearGroup && skillFocus) return `${yearGroup} ${skillFocus.toLowerCase()} items`;
  if (skillFocus) return `${skillFocus.toLowerCase()} items`;
  if (yearGroup) return `${yearGroup} spelling items`;
  return "spelling items";
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pickFallbackRows(skillFocus: string, topic: string) {
  const combined = `${skillFocus} ${topic}`.toLowerCase();
  if (combined.includes("prefix")) return PREFIX_FALLBACK_ROWS;
  return GENERAL_SPELLING_ROWS;
}

export function buildDeterministicSpellingFallback(input: DeterministicSpellingFallbackInput) {
  const rows = pickFallbackRows(input.skillFocus, input.topic);
  const safeCount = Math.max(1, Math.min(10, input.count));
  return Array.from({ length: safeCount }, (_, index) => {
    const row = rows[index % rows.length];
    return {
      id: `fallback-spelling-${index + 1}-${row.word}`,
      word: row.word,
      hint: row.hint,
      sentenceContext: row.sentenceContext,
      categoryHint: row.categoryHint,
      syllables: row.syllables,
      emoji: row.emoji,
      yearGroup: input.yearGroup,
      skillFocus: input.skillFocus,
      difficulty: input.difficulty,
    };
  });
}

export function shouldUseDeterministicSpellingFallback(errorCode: AdminAiGeneratorErrorCode) {
  return errorCode === "missing_openai_key" || errorCode === "model_error" || errorCode === "invalid_generated_content";
}

export function normalizeAdminAiGeneratorFailure(
  error: unknown,
  context: GeneratorFailureContext = {},
): AdminAiGeneratorFailure {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const message = error instanceof Error ? error.message : String(error ?? "AI generation failed.");
  const lowered = message.toLowerCase();
  const providerStatus = toNumber(record.providerStatus ?? record.status);
  const providerCode = compactText(typeof record.providerCode === "string" ? record.providerCode : null).toLowerCase();
  const contextLabel = formatSpellingContext(context);

  if (providerStatus === 401 || providerCode === "invalid_api_key" || lowered.includes("invalid_api_key") || lowered.includes("incorrect api key")) {
    return {
      errorCode: "model_error",
      message: "AI generation failed because the configured OpenAI API key was rejected.",
      details: {
        reason: "invalid_openai_key",
        providerStatus,
        providerCode: providerCode || "invalid_api_key",
      },
      status: 502,
    };
  }

  if (lowered.includes("not configured") || lowered.includes("missing openai api key")) {
    return {
      errorCode: "missing_openai_key",
      message: "AI generation failed because the OpenAI API key is missing.",
      details: {
        reason: "missing_openai_key",
        providerStatus,
        providerCode: providerCode || null,
      },
      status: 503,
    };
  }

  if (
    lowered.includes("malformed ai output")
    || lowered.includes("non-json")
    || lowered.includes("empty content payload")
    || lowered.includes("failed to parse")
  ) {
    return {
      errorCode: "invalid_generated_content",
      message: "AI returned content in an invalid format. Please try again.",
      details: {
        reason: "invalid_provider_payload",
        providerStatus,
        providerCode: providerCode || null,
      },
      status: 502,
    };
  }

  if (
    lowered.includes("unable to generate")
    || lowered.includes("no valid")
    || lowered.includes("validation")
    || lowered.includes("invalid ")
  ) {
    return {
      errorCode: "invalid_generated_content",
      message: `The spelling generator could not create valid ${contextLabel}.`,
      details: {
        reason: "validation_failed",
        providerStatus,
        providerCode: providerCode || null,
      },
      status: 422,
    };
  }

  if (
    lowered.includes("openai request failed")
    || lowered.includes("openai returned")
    || (providerStatus !== null && providerStatus >= 500)
    || providerStatus === 429
  ) {
    return {
      errorCode: "model_error",
      message: "AI generation failed because the external AI service rejected the request.",
      details: {
        reason: "provider_request_failed",
        providerStatus,
        providerCode: providerCode || null,
      },
      status: 502,
    };
  }

  return {
    errorCode: "generation_error",
    message: "AI generation failed. Please try again.",
    details: {
      reason: "generation_error",
      providerStatus,
      providerCode: providerCode || null,
    },
    status: 500,
  };
}