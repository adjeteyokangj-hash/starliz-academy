export type AiGeneratorHandoffParams = {
  studentId?: string | null;
  subject?: string | null;
  skill?: string | null;
  strand?: string | null;
  englishStrand?: string | null;
  topic?: string | null;
  activityType?: string | null;
  masteryOutcome?: string | null;
  source?: string | null;
  weakAreaId?: string | null;
  yearGroup?: string | null;
  keyStage?: string | null;
  difficulty?: number | string | null;
  itemCount?: number | string | null;
};

const AI_GENERATOR_PATH = "/admin/ai-generator";

function cleanText(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function cleanPositiveNumber(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? String(numberValue) : null;
}

export function buildAiGeneratorUrl(params: AiGeneratorHandoffParams): string {
  const query = new URLSearchParams();

  const textFields: Array<keyof AiGeneratorHandoffParams> = [
    "studentId",
    "subject",
    "skill",
    "strand",
    "englishStrand",
    "topic",
    "activityType",
    "masteryOutcome",
    "source",
    "weakAreaId",
    "yearGroup",
    "keyStage",
  ];

  for (const field of textFields) {
    const value = cleanText(params[field] as string | null | undefined);
    if (value) query.set(field, value);
  }

  const difficulty = cleanPositiveNumber(params.difficulty);
  if (difficulty) query.set("difficulty", difficulty);

  const itemCount = cleanPositiveNumber(params.itemCount);
  if (itemCount) query.set("itemCount", itemCount);

  const queryString = query.toString();
  return queryString ? `${AI_GENERATOR_PATH}?${queryString}` : AI_GENERATOR_PATH;
}
