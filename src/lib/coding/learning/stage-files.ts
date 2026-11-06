import type { CodingStage } from "@/lib/coding/types";
import type { ActivityState } from "./types";

/** Additive in-memory upgrade. Never guess a practical stage for legacy files
 * found while a read-only example is open; retain those bytes separately. */
export function initialiseStageFiles(state: ActivityState) {
  if (state.filesByStage) return;
  state.filesByStage = {};
  if (!Object.keys(state.files).length) return;
  if (["discover", "predict"].includes(state.stage)) state.retainedFiles ??= structuredClone(state.files);
  else {
    const stage = state.stage === "review" ? "create" : state.stage;
    state.filesByStage[stage] = structuredClone(state.files);
    if (stage === "create") state.createFilesVariant = state.independentVariant;
  }
}
export function stageProjectFiles(state: ActivityState, stage: CodingStage): Record<string, string> {
  const scope = stage === "review" ? "create" : stage;
  if (!state.filesByStage) return scope === state.stage || scope === "create" && state.stage === "review" ? state.files : {};
  if (scope === "create" && state.createFilesVariant !== state.independentVariant) return {};
  return state.filesByStage[scope] ?? {};
}
export function setStageProjectFiles(state: ActivityState, stage: CodingStage, files: Record<string, string>) {
  initialiseStageFiles(state);
  const scope = stage === "review" ? "create" : stage;
  state.filesByStage![scope] = structuredClone(files);
  if (scope === "create") state.createFilesVariant = state.independentVariant;
  state.files = structuredClone(files);
}
