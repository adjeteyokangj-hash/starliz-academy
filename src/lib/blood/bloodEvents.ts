import type { BloodEventEnvelope, BloodEventType } from "@/lib/blood/bloodContract";

export const BLOOD_EVENT_TYPES: ReadonlyArray<BloodEventType> = [
  "lesson_completed",
  "question_answered",
  "quick_level_finder_completed",
  "weak_area_detected",
  "mastery_updated",
  "coach_help_used",
  "homework_assigned",
  "homework_submitted",
  "catch_up_generated",
  "certificate_issued",
  "heartbeat_alert",
  "level_recommendation_created",
  "safeguarding_learning_signal",
];

export function isBloodEventType(value: string): value is BloodEventType {
  return BLOOD_EVENT_TYPES.includes(value as BloodEventType);
}

export function buildBloodEvent(input: {
  type: BloodEventType;
  studentId: string;
  occurredAt?: string;
  actorId?: string | null;
  payload?: Record<string, unknown>;
}): BloodEventEnvelope {
  return {
    type: input.type,
    studentId: input.studentId,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    actorId: input.actorId ?? null,
    payload: input.payload,
  };
}
