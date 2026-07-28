/**
 * School-scoped audit logging.
 *
 * Wraps SchoolAuditLog writes with structured action/entity typing.
 * Also records SchoolLoginHistory entries for login events.
 */

import { prisma } from "@/lib/db";

export type SchoolAuditAction =
  | "invite_sent"
  | "invite_accepted"
  | "invite_expired"
  | "invite_resent"
  | "teacher_activated"
  | "teacher_suspended"
  | "teacher_archived"
  | "teacher_password_reset"
  | "staff_absence_created"
  | "staff_absence_updated"
  | "staff_absence_cleared"
  | "classroom_created"
  | "classroom_updated"
  | "classroom_archived"
  | "classroom_reactivated"
  | "student_enrolled"
  | "student_transferred"
  | "student_archived"
  | "student_updated"
  | "login"
  | "login_blocked"
  | "seat_upgraded"
  | "licence_suspended"
  | "licence_renewed"
  | "assignment_issued"
  | "content_moderation_flag"
  | "safeguarding_alert"
  | "school_suspended"
  | "school_status_changed"
  | "licence_updated"
  | "student_exported"
  | "school_exported"
  | "compliance_delete_requested"
  | "recovery_orchestration_planned"
  | "recovery_orchestration_teacher_approved"
  | "recovery_orchestration_admin_confirmed"
  | "recovery_orchestration_rejected"
  | "recovery_orchestration_rolled_back"
  | "recovery_orchestration_executed"
  | "recovery_orchestration_policy_updated"
  | "daytime_lesson_content_generated"
  | "daytime_lesson_approved"
  | "daytime_day_approved"
  | "daytime_tutor_help"
  | "live_classroom_intervene"
  | "tutor_online"
  | "tutor_available"
  | "tutor_paused"
  | "tutor_busy"
  | "tutor_offline"
  | "tutor_offline_stale"
  | "short_learning_booking_active"
  | "short_learning_booking_attended"
  | "short_learning_booking_completed"
  | "short_learning_booking_no_show"
  | "short_learning_booking_expired"
  | "short_learning_booking_created"
  | "short_learning_booking_cancelled"
  | "short_learning_booking_changed"
  | "short_learning_booking_rebooked"
  | "school_teacher_update_rejected"
  | "school_classroom_update_rejected"
  | "human_support_eligible"
  | "human_support_enqueued"
  | "human_support_left_queue"
  | "human_support_recovered"
  | "human_support_queue_paused"
  | "human_support_queue_resumed"
  | "human_support_assigned"
  | "human_support_released"
  | "human_support_accepted"
  | "human_support_session_started"
  | "human_support_session_ended"
  | "human_support_guidance_sent"
  | "human_support_unresolved"
  | "human_support_admin_force_offline"
  | "human_support_admin_reassign"
  | "human_support_admin_close_abandoned"
  | "human_support_admin_follow_up"
  | "human_support_admin_view_private_notes"
  | "human_support_admin_export";

export type SchoolEntityType =
  | "school"
  | "teacher"
  | "student"
  | "classroom"
  | "licence"
  | "assignment"
  | "lesson"
  | "provisioning_job"
  | "compliance"
  | "system"
  | "human_support"
  | "learning_booking";

export type SchoolAuditSeverity = "info" | "warning" | "critical";

type SchoolAuditInput = {
  schoolId: string;
  actorUserId?: string;
  action: SchoolAuditAction;
  entityType: SchoolEntityType;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  correlationId?: string;
  source?: "ui" | "api" | "worker" | "webhook" | "system";
  operation?: string;
  actorType?: "admin_user" | "school_staff" | "system" | "webhook";
  actorAdminUserId?: string;
  actorSchoolTeacherId?: string;
  actorEmail?: string;
  impersonatedByUserId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  diff?: Record<string, unknown>;
  tags?: string[];
  metadata?: Record<string, unknown>;
  severity?: SchoolAuditSeverity;
};

export function sanitizeSchoolAuditMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const sensitiveExact = new Set([
    "inviteToken",
    "newToken",
    "token",
    "rawToken",
    "inviteSecret",
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (sensitiveExact.has(key) || /token/i.test(key) && typeof value === "string" && !key.toLowerCase().includes("expires")) {
      out[key] = "[redacted]";
      continue;
    }
    if (typeof value === "string" && /[?&]token=/i.test(value)) {
      out[key] = value.replace(/([?&]token=)[^&]+/gi, "$1[redacted]");
      continue;
    }
    out[key] = value;
  }
  return out;
}

export async function writeSchoolAuditLog(input: SchoolAuditInput): Promise<void> {
  const safeMetadata = sanitizeSchoolAuditMetadata(input.metadata);
  await prisma.schoolAuditLog.create({
    data: {
      schoolId: input.schoolId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      requestId: input.requestId,
      correlationId: input.correlationId,
      source: input.source,
      operation: input.operation,
      actorType: input.actorType,
      actorAdminUserId: input.actorAdminUserId,
      actorSchoolTeacherId: input.actorSchoolTeacherId,
      actorEmail: input.actorEmail,
      impersonatedByUserId: input.impersonatedByUserId,
      metadataJson: safeMetadata ? JSON.stringify(safeMetadata) : undefined,
      beforeJson: input.before ? JSON.stringify(input.before) : undefined,
      afterJson: input.after ? JSON.stringify(input.after) : undefined,
      diffJson: input.diff ? JSON.stringify(input.diff) : undefined,
      tagsJson: input.tags?.length ? JSON.stringify(input.tags) : undefined,
      severity: input.severity ?? "info",
    },
  });
}

type LoginHistoryInput = {
  schoolId: string;
  userId: string;
  role: string;
  success: boolean;
  failReason?: string;
  ipAddress?: string;
  userAgent?: string;
};

export async function writeSchoolLoginHistory(input: LoginHistoryInput): Promise<void> {
  await prisma.schoolLoginHistory.create({
    data: {
      schoolId: input.schoolId,
      userId: input.userId,
      role: input.role,
      success: input.success,
      failReason: input.failReason,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });
}

type SchoolAccessLogInput = {
  schoolId: string;
  userId: string;
  schoolTeacherId?: string;
  method: string;
  route: string;
  resourceType?: string;
  resourceId?: string;
  success: boolean;
  denialReason?: string;
  ipAddress?: string;
  userAgent?: string;
};

export async function writeSchoolAccessLog(input: SchoolAccessLogInput): Promise<void> {
  await prisma.schoolAccessLog.create({
    data: {
      schoolId: input.schoolId,
      userId: input.userId,
      schoolTeacherId: input.schoolTeacherId,
      method: input.method,
      route: input.route,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      success: input.success,
      denialReason: input.denialReason,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });
}

type LicenceEventInput = {
  schoolId: string;
  schoolLicenceId?: string;
  eventType: string;
  previousStatus?: string;
  nextStatus?: string;
  actorUserId?: string;
  metadata?: Record<string, unknown>;
};

export async function writeLicenceEvent(input: LicenceEventInput): Promise<void> {
  await prisma.licenceEvent.create({
    data: {
      schoolId: input.schoolId,
      schoolLicenceId: input.schoolLicenceId,
      eventType: input.eventType,
      previousStatus: input.previousStatus,
      nextStatus: input.nextStatus,
      actorUserId: input.actorUserId,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}
