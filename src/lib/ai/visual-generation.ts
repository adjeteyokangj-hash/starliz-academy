import { normalizeSubject, type Subject } from "@/lib/curriculum";
import { generateR2ObjectKey, uploadFileToR2 } from "@/lib/r2-upload";

export type VisualAssetType =
  | "diagram"
  | "illustration"
  | "chart"
  | "worksheet_image"
  | "experiment_diagram";

export type VisualAssetStatus =
  | "planned"
  | "pending"
  | "generated"
  | "approved"
  | "rejected"
  | "removed"
  | "failed";

export type VisualProvider = "openai" | "local" | null;

export type VisualAsset = {
  id: string;
  type: VisualAssetType;
  title: string;
  prompt: string;
  altText: string;
  subject: string;
  yearGroup: string;
  keyStage: string;
  skillFocus: string;
  status: VisualAssetStatus;
  imageUrl: string | null;
  r2Key: string | null;
  provider: VisualProvider;
  error: string | null;
};

export type PlannedVisualAsset = VisualAsset & {
  status: "planned";
  imageUrl: null;
  r2Key: null;
  provider: null;
  error: null;
};

export type VisualGenerationMode = "none" | "planned_only" | "generate_now";

export type VisualGenerationDiagnostics = {
  visualsRequested: number;
  visualsGenerated: number;
  visualsUploaded: number;
  visualsFailed: number;
  visualGenerationEnabled: boolean;
  imageModelUsed: string;
};

type ImageGenerationResult = {
  bytes: Buffer;
  mimeType: "image/png";
};

type VisualPromptTemplate = {
  type: VisualAssetType;
  title: string;
  brief: string;
};

const UNSAFE_PATTERN = /\b(nudity|sexual|gore|blood|weapon|violence|kill|self-harm|suicide|hate|racis\w*|extremis\w*|terror\w*|politic\w*|propaganda|drug|alcohol|gambling|adult-only)\b/i;

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function itemSignal(items: unknown[]): string {
  const first = items[0];
  if (!first || typeof first !== "object") return "";
  const row = first as Record<string, unknown>;
  return normalizeText(String(row.question ?? row.prompt ?? row.title ?? ""));
}

export function isSafeEducationalVisualPrompt(prompt: string): boolean {
  const clean = normalizeText(prompt);
  if (!clean) return false;
  return !UNSAFE_PATTERN.test(clean);
}

export function buildVisualAltText(input: {
  title: string;
  subject: string;
  yearGroup: string;
  topic: string;
  skillFocus: string;
}): string {
  const title = normalizeText(input.title) || "Lesson visual";
  const subject = normalizeText(input.subject) || "subject";
  const yearGroup = normalizeText(input.yearGroup) || "selected year group";
  const topic = normalizeText(input.topic);
  const skillFocus = normalizeText(input.skillFocus);
  const detail = topic || skillFocus;
  return detail
    ? `${title} for ${subject} ${yearGroup} lesson on ${detail}.`
    : `${title} for ${subject} ${yearGroup} lesson.`;
}

function subjectTemplates(subject: Subject | null, skillFocus: string): VisualPromptTemplate[] {
  const focus = normalizeText(skillFocus).toLowerCase();

  if (subject === "science" || subject === "gcse-science" || subject === "gcse-biology" || subject === "gcse-chemistry" || subject === "gcse-physics" || subject === "gcse-combined-science") {
    return [
      { type: "experiment_diagram", title: "Labelled experiment setup", brief: "Clear labelled school science setup with safe equipment" },
      { type: "diagram", title: "Scientific process diagram", brief: "Step-by-step process diagram with arrows and short labels" },
      { type: "diagram", title: "Labelled science concept", brief: "Clean labelled science concept diagram aligned to lesson focus" },
    ];
  }

  if (subject === "maths" || subject === "gcse-maths" || subject === "times-tables" || subject === "11-plus-practice" || subject === "sats-practice") {
    return [
      { type: "chart", title: "Maths chart or graph", brief: "Simple child-friendly graph or bar chart for the target maths concept" },
      { type: "diagram", title: "Number line visual", brief: "Clear number line visual supporting the selected skill" },
      { type: "diagram", title: "Geometry diagram", brief: "Shape or angle diagram with clear labels and spacing" },
    ];
  }

  if (subject === "spelling") {
    if (focus.includes("homophone") || focus.includes("vocabulary") || focus.includes("phonics")) {
      return [{ type: "worksheet_image", title: "Word picture card", brief: "Simple picture card to anchor spelling meaning" }];
    }
    return [];
  }

  if (subject === "gcse-french" || subject === "gcse-german" || subject === "gcse-spanish" || subject === "gcse-italian" || subject === "gcse-mandarin" || subject === "gcse-arabic" || subject === "gcse-urdu" || subject === "gcse-polish") {
    return [
      { type: "worksheet_image", title: "Vocabulary card visual", brief: "Labelled vocabulary card with target words in context" },
      { type: "illustration", title: "Labelled scene visual", brief: "Everyday scene with labelled objects for language learning" },
    ];
  }

  if (
    subject === "reading"
    || subject === "english-language"
    || subject === "english-literature"
    || subject === "gcse-english"
    || subject === "gcse-english-language"
    || subject === "gcse-english-literature"
    || subject === "writing"
    || subject === "vocabulary"
  ) {
    return [
      { type: "illustration", title: "Story scene illustration", brief: "Age-appropriate scene illustration matching the passage tone" },
      { type: "illustration", title: "Character and setting visual", brief: "Friendly visual showing character and setting details" },
    ];
  }

  return [
    { type: "illustration", title: "Lesson support visual", brief: "Simple school-safe illustration that supports understanding" },
  ];
}

export function buildPlannedVisualAssets(input: {
  subject: string;
  yearGroup: string;
  keyStage: string;
  skillFocus: string;
  topic: string;
  items?: unknown[];
  maxVisuals?: number;
  allowedSubjects?: string[];
}): PlannedVisualAsset[] {
  const normalizedSubject = normalizeSubject(input.subject);
  const cleanSubject = normalizeText(input.subject);
  const cleanYearGroup = normalizeText(input.yearGroup);
  const cleanKeyStage = normalizeText(input.keyStage);
  const cleanSkillFocus = normalizeText(input.skillFocus);
  const cleanTopic = normalizeText(input.topic);
  const maxVisuals = Math.max(0, Math.min(6, Number(input.maxVisuals ?? 3)));

  if (!normalizedSubject || maxVisuals === 0) return [];

  const allowedSubjects = (input.allowedSubjects ?? [])
    .map((entry) => normalizeSubject(entry))
    .filter((entry): entry is Subject => Boolean(entry));

  if (allowedSubjects.length > 0 && !allowedSubjects.includes(normalizedSubject)) {
    return [];
  }

  const templates = subjectTemplates(normalizedSubject, cleanSkillFocus).slice(0, maxVisuals);
  const signal = itemSignal(input.items ?? []);

  return templates
    .map((template, index): PlannedVisualAsset | null => {
      const prompt = normalizeText(
        [
          "Create a school-safe educational lesson visual.",
          `Style: child-friendly, high contrast, clear labels, no branding.`,
          `Subject: ${cleanSubject}.`,
          `Key stage: ${cleanKeyStage}. Year group: ${cleanYearGroup}.`,
          cleanSkillFocus ? `Skill focus: ${cleanSkillFocus}.` : "",
          cleanTopic ? `Topic: ${cleanTopic}.` : "",
          signal ? `Reference learning item: ${signal}.` : "",
          template.brief,
        ].filter(Boolean).join(" "),
      );

      if (!isSafeEducationalVisualPrompt(prompt)) return null;

      const title = `${template.title} (${index + 1})`;
      return {
        id: `visual-${index + 1}`,
        type: template.type,
        title,
        prompt,
        altText: buildVisualAltText({
          title,
          subject: cleanSubject,
          yearGroup: cleanYearGroup,
          topic: cleanTopic,
          skillFocus: cleanSkillFocus,
        }),
        subject: cleanSubject,
        yearGroup: cleanYearGroup,
        keyStage: cleanKeyStage,
        skillFocus: cleanSkillFocus,
        status: "planned",
        imageUrl: null,
        r2Key: null,
        provider: null,
        error: null,
      };
    })
    .filter((asset): asset is PlannedVisualAsset => Boolean(asset));
}

async function generateImageWithOpenAi(input: {
  apiKey: string;
  prompt: string;
  imageModel: string;
}): Promise<ImageGenerationResult> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.imageModel,
      prompt: input.prompt,
      size: "1024x1024",
      response_format: "b64_json",
    }),
  });

  const payload = await response.json().catch(() => null) as {
    data?: Array<{ b64_json?: string }>;
    error?: { message?: string; code?: string };
  } | null;

  if (!response.ok) {
    const detail = payload?.error?.message || payload?.error?.code || `status ${response.status}`;
    throw new Error(`OpenAI image generation failed: ${detail}`);
  }

  const base64 = payload?.data?.[0]?.b64_json;
  if (!base64) {
    throw new Error("OpenAI image generation returned empty image data.");
  }

  return {
    bytes: Buffer.from(base64, "base64"),
    mimeType: "image/png",
  };
}

async function uploadVisualToR2(input: {
  bytes: Buffer;
  mimeType: string;
  title: string;
}): Promise<{ imageUrl: string; r2Key: string }> {
  const objectKey = generateR2ObjectKey({
    folder: "lessons",
    originalFilename: `${input.title}.png`,
    mimeType: input.mimeType,
  });
  const uploaded = await uploadFileToR2({
    objectKey,
    body: input.bytes,
    mimeType: input.mimeType,
  });
  return {
    imageUrl: uploaded.publicUrl,
    r2Key: uploaded.objectKey,
  };
}

export async function executeVisualGeneration(input: {
  assets: VisualAsset[];
  enabled: boolean;
  mode: VisualGenerationMode;
  apiKey: string | null;
  imageModel: string;
  maxVisuals: number;
  generateImage?: (args: { prompt: string; apiKey: string; imageModel: string }) => Promise<ImageGenerationResult>;
  uploadImage?: (args: { bytes: Buffer; mimeType: string; title: string }) => Promise<{ imageUrl: string; r2Key: string }>;
}): Promise<{ assets: VisualAsset[]; diagnostics: VisualGenerationDiagnostics }> {
  const diagnostics: VisualGenerationDiagnostics = {
    visualsRequested: input.assets.length,
    visualsGenerated: 0,
    visualsUploaded: 0,
    visualsFailed: 0,
    visualGenerationEnabled: input.enabled,
    imageModelUsed: input.imageModel,
  };

  if (!input.enabled || input.mode !== "generate_now" || !input.assets.length) {
    return { assets: input.assets, diagnostics };
  }

  const maxVisuals = Math.max(0, Math.min(6, input.maxVisuals));
  const generateImage = input.generateImage ?? generateImageWithOpenAi;
  const uploadImage = input.uploadImage ?? uploadVisualToR2;

  const output: VisualAsset[] = [];
  for (let index = 0; index < input.assets.length; index += 1) {
    const asset = input.assets[index];

    if (index >= maxVisuals) {
      output.push(asset);
      continue;
    }

    if (!isSafeEducationalVisualPrompt(asset.prompt)) {
      diagnostics.visualsFailed += 1;
      output.push({
        ...asset,
        status: "failed",
        provider: "openai",
        error: "Prompt failed safety checks.",
      });
      continue;
    }

    if (!input.apiKey) {
      diagnostics.visualsFailed += 1;
      output.push({
        ...asset,
        status: "failed",
        provider: "openai",
        error: "Missing OPENAI_API_KEY for visual generation.",
      });
      continue;
    }

    try {
      const generated = await generateImage({
        prompt: asset.prompt,
        apiKey: input.apiKey,
        imageModel: input.imageModel,
      });
      diagnostics.visualsGenerated += 1;

      const uploaded = await uploadImage({
        bytes: generated.bytes,
        mimeType: generated.mimeType,
        title: asset.title,
      });
      diagnostics.visualsUploaded += 1;

      output.push({
        ...asset,
        status: "generated",
        imageUrl: uploaded.imageUrl,
        r2Key: uploaded.r2Key,
        provider: "openai",
        error: null,
      });
    } catch (error) {
      diagnostics.visualsFailed += 1;
      output.push({
        ...asset,
        status: "failed",
        provider: "openai",
        error: error instanceof Error ? error.message : "Visual generation failed.",
      });
    }
  }

  return { assets: output, diagnostics };
}
