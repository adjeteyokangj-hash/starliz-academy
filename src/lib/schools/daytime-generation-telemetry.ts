/**
 * Internal generation telemetry for Short Learning / Daytime OpenAI paths.
 * No personal data (no names, emails, free-text pupil answers).
 */

export type DaytimeStageTelemetry = {
  event: "daytime_stage_generation";
  mode: string;
  stage: string;
  stageLabel: string;
  subject: string;
  yearGroup: string;
  model: string;
  openAiSucceeded: boolean;
  retryCount: number;
  generationDurationMs: number;
  openAiLatencyMs: number;
  validatorDurationMs: number;
  usageTokens: number;
};

export type ShortLearningSessionTelemetry = {
  event: "short_learning_session_content";
  durationMinutes: number;
  subject: string;
  yearGroup: string;
  reused: boolean;
  regenerated: boolean;
  success: boolean;
  plannerDurationMs: number;
  generationDurationMs: number;
  totalDurationMs: number;
  generativeBlockCount: number;
  retryHint?: string;
};

export function logDaytimeGenerationTelemetry(
  payload: DaytimeStageTelemetry | ShortLearningSessionTelemetry,
): void {
  // Structured single-line log for ops dashboards / log drains.
  console.info(JSON.stringify({ ...payload, at: new Date().toISOString() }));
}
