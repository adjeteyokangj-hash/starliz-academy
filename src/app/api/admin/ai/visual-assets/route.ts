import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api_guard";
import { getOpenAiApiKeyWithSource } from "@/lib/api-key-config";
import { executeVisualGeneration, isSafeEducationalVisualPrompt, type VisualAsset } from "@/lib/ai/visual-generation";

const visualAssetSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["diagram", "illustration", "chart", "worksheet_image", "experiment_diagram"]),
  title: z.string().min(1),
  prompt: z.string().min(1),
  altText: z.string().min(1),
  subject: z.string().min(1),
  yearGroup: z.string().min(1),
  keyStage: z.string().min(1),
  skillFocus: z.string().min(1),
  status: z.enum(["planned", "pending", "generated", "approved", "rejected", "removed", "failed"]),
  imageUrl: z.string().nullable(),
  r2Key: z.string().nullable(),
  provider: z.enum(["openai", "local"]).nullable(),
  error: z.string().nullable(),
});

const requestSchema = z.object({
  action: z.enum(["generate", "regenerate", "remove"]),
  asset: visualAssetSchema,
  imageModel: z.string().optional(),
  maxVisuals: z.number().int().min(1).max(6).optional(),
});

export async function POST(req: Request) {
  const { session, response } = await requireAdminPermission("ai:run");
  if (!session) return response;

  let payload: z.infer<typeof requestSchema>;
  try {
    payload = requestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid visual asset action payload." }, { status: 400 });
  }

  if (payload.action === "remove") {
    const removed: VisualAsset = {
      ...payload.asset,
      status: "removed",
      imageUrl: null,
      r2Key: null,
      provider: payload.asset.provider,
      error: payload.asset.error ?? "Removed by admin.",
    };
    return NextResponse.json({ success: true, asset: removed, diagnostics: null });
  }

  if (!isSafeEducationalVisualPrompt(payload.asset.prompt)) {
    return NextResponse.json({
      success: true,
      asset: {
        ...payload.asset,
        status: "failed",
        provider: "openai",
        error: "Prompt failed safety checks.",
      } satisfies VisualAsset,
      diagnostics: {
        visualsRequested: 1,
        visualsGenerated: 0,
        visualsUploaded: 0,
        visualsFailed: 1,
        visualGenerationEnabled: true,
        imageModelUsed: (payload.imageModel ?? process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1").trim() || "gpt-image-1",
      },
    });
  }

  const openAiConfig = await getOpenAiApiKeyWithSource();
  const imageModel = (payload.imageModel ?? process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1").trim() || "gpt-image-1";
  const sourceAsset: VisualAsset = {
    ...payload.asset,
    status: "pending",
    error: null,
  };

  const executed = await executeVisualGeneration({
    assets: [sourceAsset],
    enabled: true,
    mode: "generate_now",
    apiKey: openAiConfig.apiKey,
    imageModel,
    maxVisuals: payload.maxVisuals ?? 1,
  });

  return NextResponse.json({
    success: true,
    asset: executed.assets[0],
    diagnostics: executed.diagnostics,
    keySource: openAiConfig.keySource,
  });
}
