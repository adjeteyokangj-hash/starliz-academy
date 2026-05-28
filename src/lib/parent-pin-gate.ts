export type ParentPinGateState = "pin_required" | "setup_required";

export function resolveParentPinGateState(input: {
  hasPin: boolean | null;
  setupRequiredHint?: boolean;
}): ParentPinGateState {
  if (input.setupRequiredHint) return "setup_required";
  if (input.hasPin === false) return "setup_required";
  return "pin_required";
}
