export type RewardReason =
  | "accuracy_improved"
  | "streak_improved"
  | "weak_area_practised"
  | "session_completed";

export function calculateRewardPoints(reason: RewardReason) {
  switch (reason) {
    case "accuracy_improved":
      return 20;
    case "streak_improved":
      return 15;
    case "weak_area_practised":
      return 10;
    case "session_completed":
      return 5;
    default:
      return 0;
  }
}