/**
 * Admin reconstruction workflow for incomplete / visual-dependent imported activities.
 * Validates Admin-entered maths structures before accepting them into a lesson draft.
 */
import type { LinkedQaItem } from "@/lib/lesson-pack-import/types";
import {
  hasFlattenedLayoutNoise,
  hasIncompleteMathExpression,
  validatePlayableActivity,
  type VisualType,
} from "@/lib/lesson-pack-import/playable-validation";

export type AdminReconstructionInput = {
  activityId: string;
  prompt: string;
  instructions?: string | null;
  mathExpression?: string | null;
  visualType?: VisualType | null;
  visualModel?: Record<string, unknown> | null;
  acceptedAnswers?: string[];
  successCriteria?: string | null;
  markingMode: "auto" | "guided_review";
  action: "save" | "exclude";
  sourceSlideOrPage?: number | null;
  sourceFile?: string | null;
};

export type AdminReconstructionResult =
  | { ok: true; activity: LinkedQaItem; audit: Record<string, unknown> }
  | { ok: false; errors: string[] };

export function validateAdminReconstruction(input: AdminReconstructionInput): AdminReconstructionResult {
  const errors: string[] = [];
  if (input.action === "exclude") {
    return {
      ok: true,
      activity: {
        id: input.activityId,
        prompt: input.prompt,
        sourceComponent: "worksheet",
        playableStatus: "blocked",
        visualReconstructionStatus: "excluded",
      },
      audit: {
        action: "exclude",
        activityId: input.activityId,
        at: new Date().toISOString(),
      },
    };
  }

  if (!input.prompt?.trim() || input.prompt.trim().length < 8) {
    errors.push("Clean prompt is required");
  }
  if (hasFlattenedLayoutNoise(input.prompt) || hasIncompleteMathExpression(input.prompt)) {
    errors.push("Prompt still contains incomplete or noisy maths; use structured blanks (□) or a mathExpression");
  }
  if (input.markingMode === "auto" && !(input.acceptedAnswers?.length)) {
    errors.push("Auto-marked activities require accepted answers");
  }
  if (input.markingMode === "guided_review" && !input.successCriteria?.trim()) {
    errors.push("Guided-review activities require success criteria");
  }
  if (input.visualType && !input.visualModel) {
    errors.push("Visual type selected but no visual model values were provided");
  }

  const candidate: LinkedQaItem = {
    id: input.activityId,
    prompt: input.prompt.trim(),
    instructions: input.instructions ?? null,
    mathExpression: input.mathExpression ?? null,
    visualType: input.visualType ?? null,
    visualModel: input.visualModel ?? null,
    requiresVisual: Boolean(input.visualType),
    visualReconstructionStatus: input.visualModel ? "reconstructed" : "not_required",
    visualSourceFile: input.sourceFile ?? null,
    visualSourceSlideOrPage: input.sourceSlideOrPage ?? null,
    visualExtractionConfidence: "high",
    answer: input.acceptedAnswers?.[0],
    acceptedAnswers: input.acceptedAnswers,
    explanation: input.successCriteria ?? undefined,
    successCriteria: input.successCriteria ?? null,
    markingMode: input.markingMode,
    responseType: input.visualType === "matching_images" ? "matching" : input.mathExpression ? "fill_blank" : "short_answer",
    sourceComponent: "worksheet",
  };

  const playable = validatePlayableActivity(candidate);
  if (!playable.playable) {
    errors.push(`Reconstructed activity is still not playable: ${playable.reasons.join(", ")}`);
  }
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    activity: {
      ...candidate,
      prompt: playable.cleanedPrompt,
      mathExpression: playable.mathExpression ?? candidate.mathExpression,
      playableStatus: "playable",
      playableBlockReasons: [],
      visualReconstructionStatus: "reconstructed",
    },
    audit: {
      action: "save",
      activityId: input.activityId,
      visualType: input.visualType ?? null,
      mathExpression: playable.mathExpression,
      at: new Date().toISOString(),
    },
  };
}
