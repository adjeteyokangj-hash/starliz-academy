import type { ActivityContent, ActivityState } from "./learning/types";
import { variantFingerprint } from "./learning/state-machine";

export function stateAfterTeacherFeedback(activity: ActivityContent, previous: ActivityState): ActivityState {
  const state = structuredClone(previous);
  if (!state.mastered && ["create", "review"].includes(state.stage)) {
    const fingerprint = variantFingerprint(activity, state);
    if (!state.assistedVariantIds.includes(fingerprint)) state.assistedVariantIds.push(fingerprint);
  }
  return state;
}
