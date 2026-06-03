export type DigestedSignalType =
  | "mastery_signal"
  | "confidence_signal"
  | "weak_area_signal"
  | "intervention_signal"
  | "support_signal"
  | "readiness_signal"
  | "acceleration_signal"
  | "engagement_signal";

export type DigestedSignal = {
  type: DigestedSignalType;
  confidence: number;
  reason: string;
  metadata?: Record<string, unknown>;
};
