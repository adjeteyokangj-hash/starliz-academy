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
  | "classroom_created"
  | "student_enrolled"
  | "student_transferred"
  | "student_archived"
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
  | "compliance_delete_requested";

export type SchoolEntityType =
  | "school"
  | "teacher"
  | "student"
  | "classroom"
  | "licence"
  | "assignment"
  | "provisioning_job"
  | "compliance"
  | "system";

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

export async function writeSchoolAuditLog(input: SchoolAuditInput): Promise<void> {
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
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : undefined,
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
