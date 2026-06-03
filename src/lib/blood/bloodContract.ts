export type BloodEventType =
  | "lesson_completed"
  | "question_answered"
  | "quick_level_finder_completed"
  | "weak_area_detected"
  | "mastery_updated"
  | "coach_help_used"
  | "homework_assigned"
  | "homework_submitted"
  | "catch_up_generated"
  | "certificate_issued"
  | "heartbeat_alert"
  | "level_recommendation_created"
  | "safeguarding_learning_signal";

export type BloodDestination =
  | "student_learning_brain"
  | "heartbeat"
  | "knowledge_graph"
  | "coach"
  | "parent_reports"
  | "admin_reports"
  | "assignments"
  | "homework"
  | "certificates"
  | "notifications"
  | "audit_log"
  | "placement";

export type BloodDeliveryMode = "push" | "pull" | "push_and_pull";

export type BloodEventEnvelope = {
  type: BloodEventType;
  studentId: string;
  occurredAt: string;
  actorId?: string | null;
  payload?: Record<string, unknown>;
};

export type BloodRouteResult = {
  eventType: BloodEventType;
  deliveryMode: BloodDeliveryMode;
  destinations: BloodDestination[];
};

export type BloodPullRequester = BloodDestination;

export type BloodPullField =
  | "heartbeat_summary"
  | "quick_level_finder_baseline"
  | "evidence_summary"
  | "learning_data_state"
  | "progression_summary"
  | "placement_summary"
  | "catch_up_summary"
  | "language_readiness"
  | "coach_signals"
  | "audit_trace";

export type BloodPullContract = {
  requester: BloodPullRequester;
  allowedFields: BloodPullField[];
};
