type SlotValidationInput = {
  contentJson: string;
  contentType?: string | null;
  metadataJson?: string | null;
  subject?: string | null;
};

export type SlotValidationResult = {
  slotValidationExempt: boolean;
  totalSlots: number;
  filledSlots: number;
  missingSlots: number;
  isSessionComplete: boolean;
};

const PROMPT_KEYS = [
  "question",
  "prompt",
  "word",
  "title",
  "passage",
  "text",
  "sentenceContext",
] as const;

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function parseMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed metadata.
  }
  return {};
}

function textHasContent(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isGaSignal(value: string | null | undefined): boolean {
  const normalized = normalize(value);
  if (!normalized) return false;
  return normalized === "ga"
    || normalized.startsWith("ga-")
    || normalized.includes(" ga ")
    || normalized.startsWith("ga ")
    || normalized.endsWith(" ga")
    || normalized.includes("ghanaian language")
    || normalized.includes("ga language");
}

export function isGaLessonContent(input: {
  contentType?: string | null;
  subject?: string | null;
  metadataJson?: string | null;
}): boolean {
  const metadata = parseMetadata(input.metadataJson);
  const metadataSubject = typeof metadata.subject === "string" ? metadata.subject : null;
  const metadataType = typeof metadata.contentType === "string" ? metadata.contentType : null;
  const topic = typeof metadata.topic === "string" ? metadata.topic : null;
  return isGaSignal(input.contentType)
    || isGaSignal(input.subject)
    || isGaSignal(metadataSubject)
    || isGaSignal(metadataType)
    || isGaSignal(topic);
}

function toSlots(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") return [parsed];
  return [];
}

export function isQuestionSlotFilled(slot: unknown): boolean {
  if (slot == null) return false;

  if (typeof slot === "string") return slot.trim().length > 0;
  if (typeof slot === "number" || typeof slot === "boolean") return true;
  if (Array.isArray(slot)) return slot.some((entry) => isQuestionSlotFilled(entry));
  if (typeof slot !== "object") return false;

  const row = slot as Record<string, unknown>;
  for (const key of PROMPT_KEYS) {
    if (textHasContent(row[key])) return true;
  }

  return false;
}

export function getIncompleteSlotsReason(missingSlots: number): string {
  return `${missingSlots} question slots still require content.`;
}

export function analyzeContentSessionSlots(input: SlotValidationInput): SlotValidationResult {
  const exempt = isGaLessonContent({
    contentType: input.contentType,
    subject: input.subject,
    metadataJson: input.metadataJson,
  });

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(input.contentJson);
  } catch {
    return {
      slotValidationExempt: exempt,
      totalSlots: 0,
      filledSlots: 0,
      missingSlots: 0,
      isSessionComplete: exempt,
    };
  }

  const slots = toSlots(parsed);
  const totalSlots = slots.length;
  const filledSlots = slots.filter((slot) => isQuestionSlotFilled(slot)).length;
  const missingSlots = Math.max(0, totalSlots - filledSlots);

  return {
    slotValidationExempt: exempt,
    totalSlots,
    filledSlots,
    missingSlots,
    isSessionComplete: exempt || (totalSlots > 0 && missingSlots === 0),
  };
}
