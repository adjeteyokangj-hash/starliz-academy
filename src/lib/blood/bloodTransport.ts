import type {
  BloodDestination,
  BloodDeliveryMode,
  BloodEventEnvelope,
  BloodEventType,
  BloodPullContract,
  BloodPullRequester,
  BloodRouteResult,
} from "@/lib/blood/bloodContract";

const EVENT_ROUTES: Record<BloodEventType, { destinations: BloodDestination[]; deliveryMode: BloodDeliveryMode }> = {
  lesson_completed: {
    deliveryMode: "push_and_pull",
    destinations: [
      "student_learning_brain",
      "heartbeat",
      "knowledge_graph",
      "parent_reports",
      "admin_reports",
      "coach",
      "audit_log",
    ],
  },
  question_answered: {
    deliveryMode: "push_and_pull",
    destinations: ["student_learning_brain", "heartbeat", "knowledge_graph", "coach", "admin_reports", "audit_log"],
  },
  quick_level_finder_completed: {
    deliveryMode: "push_and_pull",
    destinations: [
      "student_learning_brain",
      "heartbeat",
      "placement",
      "assignments",
      "parent_reports",
      "admin_reports",
      "audit_log",
    ],
  },
  weak_area_detected: {
    deliveryMode: "push",
    destinations: ["student_learning_brain", "heartbeat", "knowledge_graph", "coach", "admin_reports", "audit_log"],
  },
  mastery_updated: {
    deliveryMode: "push_and_pull",
    destinations: ["student_learning_brain", "heartbeat", "knowledge_graph", "parent_reports", "admin_reports", "audit_log"],
  },
  coach_help_used: {
    deliveryMode: "push",
    destinations: ["student_learning_brain", "heartbeat", "coach", "admin_reports", "audit_log"],
  },
  homework_assigned: {
    deliveryMode: "push",
    destinations: ["homework", "student_learning_brain", "parent_reports", "admin_reports", "notifications", "audit_log"],
  },
  homework_submitted: {
    deliveryMode: "push_and_pull",
    destinations: ["homework", "student_learning_brain", "heartbeat", "parent_reports", "admin_reports", "audit_log"],
  },
  catch_up_generated: {
    deliveryMode: "push",
    destinations: ["student_learning_brain", "heartbeat", "assignments", "parent_reports", "admin_reports", "audit_log"],
  },
  certificate_issued: {
    deliveryMode: "push",
    destinations: ["certificates", "parent_reports", "admin_reports", "notifications", "audit_log"],
  },
  heartbeat_alert: {
    deliveryMode: "push",
    destinations: ["heartbeat", "coach", "parent_reports", "admin_reports", "notifications", "audit_log"],
  },
  level_recommendation_created: {
    deliveryMode: "push_and_pull",
    destinations: ["student_learning_brain", "heartbeat", "assignments", "parent_reports", "admin_reports", "audit_log"],
  },
  safeguarding_learning_signal: {
    deliveryMode: "push",
    destinations: ["heartbeat", "admin_reports", "notifications", "audit_log"],
  },
};

const PULL_CONTRACTS: Record<BloodPullRequester, BloodPullContract> = {
  student_learning_brain: {
    requester: "student_learning_brain",
    allowedFields: ["heartbeat_summary", "quick_level_finder_baseline", "evidence_summary", "learning_data_state", "audit_trace"],
  },
  heartbeat: {
    requester: "heartbeat",
    allowedFields: ["evidence_summary", "learning_data_state", "quick_level_finder_baseline", "language_readiness", "coach_signals"],
  },
  knowledge_graph: {
    requester: "knowledge_graph",
    allowedFields: ["evidence_summary", "learning_data_state", "progression_summary", "placement_summary", "heartbeat_summary"],
  },
  coach: {
    requester: "coach",
    allowedFields: ["learning_data_state", "language_readiness", "coach_signals", "quick_level_finder_baseline"],
  },
  parent_reports: {
    requester: "parent_reports",
    allowedFields: ["heartbeat_summary", "evidence_summary", "progression_summary", "placement_summary", "language_readiness"],
  },
  admin_reports: {
    requester: "admin_reports",
    allowedFields: [
      "heartbeat_summary",
      "evidence_summary",
      "learning_data_state",
      "progression_summary",
      "placement_summary",
      "catch_up_summary",
      "audit_trace",
    ],
  },
  assignments: {
    requester: "assignments",
    allowedFields: ["placement_summary", "progression_summary", "learning_data_state"],
  },
  homework: {
    requester: "homework",
    allowedFields: ["catch_up_summary", "learning_data_state", "evidence_summary"],
  },
  certificates: {
    requester: "certificates",
    allowedFields: ["evidence_summary", "progression_summary", "audit_trace"],
  },
  notifications: {
    requester: "notifications",
    allowedFields: ["heartbeat_summary", "progression_summary", "placement_summary"],
  },
  audit_log: {
    requester: "audit_log",
    allowedFields: ["audit_trace", "heartbeat_summary", "learning_data_state"],
  },
  placement: {
    requester: "placement",
    allowedFields: ["quick_level_finder_baseline", "placement_summary", "learning_data_state"],
  },
};

export function routeBloodEvent(event: BloodEventEnvelope): BloodRouteResult {
  const route = EVENT_ROUTES[event.type];
  return {
    eventType: event.type,
    deliveryMode: route.deliveryMode,
    destinations: [...route.destinations],
  };
}

export function tryRouteBloodEvent(type: string, studentId: string): BloodRouteResult | null {
  if (!(type in EVENT_ROUTES)) return null;
  return routeBloodEvent({ type: type as BloodEventType, studentId, occurredAt: new Date().toISOString() });
}

export function getBloodPullContract(requester: BloodPullRequester): BloodPullContract {
  return {
    requester,
    allowedFields: [...PULL_CONTRACTS[requester].allowedFields],
  };
}

export function isBloodTransportPure(): true {
  return true;
}
