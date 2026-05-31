import type { SessionGateResult } from "@/lib/homework-phase1a/types";

export type HomeworkSurface =
  | "new_learning_session"
  | "homework"
  | "coach_homework_help"
  | "previous_lesson_review"
  | "dictionary_glossary"
  | "reports"
  | "parent_admin_messages";

export type HomeworkFeatureGateResponse = {
  featureEnabled: boolean;
  allowed: boolean;
  statusCode: 200 | 409;
  code: "OK" | "FEATURE_DISABLED" | "HOMEWORK_GATE_BLOCKED";
  reason: string;
  gate: SessionGateResult;
};

const OPEN_GATE: SessionGateResult = {
  blockNewLearningSession: false,
  allowRecapCatchUpOnly: false,
  allowedSurfaces: [
    "homework",
    "coach_homework_help",
    "previous_lesson_review",
    "dictionary_glossary",
    "reports",
    "parent_admin_messages",
  ],
  reason: "Weekly homework gate is disabled.",
};

export function buildOpenHomeworkGate(reason = "No active homework gate."): SessionGateResult {
  return {
    ...OPEN_GATE,
    reason,
  };
}

export function resolveHomeworkSurfaceAccess(input: {
  featureEnabled: boolean;
  surface: HomeworkSurface;
  gate: SessionGateResult | null;
}): HomeworkFeatureGateResponse {
  if (!input.featureEnabled) {
    return {
      featureEnabled: false,
      allowed: true,
      statusCode: 200,
      code: "FEATURE_DISABLED",
      reason: "Weekly homework Phase 1B is disabled.",
      gate: buildOpenHomeworkGate("Weekly homework gate is disabled."),
    };
  }

  const gate = input.gate ?? buildOpenHomeworkGate();
  if (input.surface !== "new_learning_session") {
    return {
      featureEnabled: true,
      allowed: true,
      statusCode: 200,
      code: "OK",
      reason: gate.reason,
      gate,
    };
  }

  if (gate.blockNewLearningSession) {
    return {
      featureEnabled: true,
      allowed: false,
      statusCode: 409,
      code: "HOMEWORK_GATE_BLOCKED",
      reason: gate.reason,
      gate,
    };
  }

  return {
    featureEnabled: true,
    allowed: true,
    statusCode: 200,
    code: "OK",
    reason: gate.reason,
    gate,
  };
}
