import { writeSchoolAuditLog, type SchoolAuditAction, type SchoolEntityType } from "@/lib/schools/audit";

export const BOOKING_ENTITY_TYPE = "learning_booking" as SchoolEntityType;

export type BookingChangeActorKind = "parent" | "school_admin" | "school_owner" | "system";

export type BookingSnapshot = {
  startsAt: string;
  endsAt?: string | null;
  durationMinutes: number;
  subject: string;
  status: string;
  learningFocus?: string | null;
  cancellationCategory?: string | null;
};

export type BookingChangeEvent = {
  id: string;
  action: string;
  actorUserId: string | null;
  actorKind: BookingChangeActorKind;
  actorLabel: string;
  createdAt: string;
  before: BookingSnapshot | null;
  after: BookingSnapshot | null;
  diff: Record<string, unknown> | null;
  requiresReview: boolean;
  summary: string;
};

export const BOOKING_AUDIT_ACTIONS = [
  "short_learning_booking_created",
  "short_learning_booking_cancelled",
  "short_learning_booking_changed",
  "short_learning_booking_rebooked",
] as const;

export type BookingAuditAction = (typeof BOOKING_AUDIT_ACTIONS)[number];

export function formatBookingRef(bookingId: string): string {
  const tail = bookingId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase();
  return `SL-${tail || bookingId.slice(0, 8).toUpperCase()}`;
}

export function resolveBookingActorKind(input: {
  source?: string | null;
  schoolRole?: string | null;
  actorUserId?: string | null;
  parentUserId?: string | null;
}): BookingChangeActorKind {
  if (input.source === "system" || input.source === "worker") return "system";
  if (input.schoolRole === "owner") return "school_owner";
  if (input.schoolRole === "admin") return "school_admin";
  if (input.actorUserId && input.parentUserId && input.actorUserId === input.parentUserId) return "parent";
  if (input.source === "parent_portal" || !input.schoolRole) return "parent";
  return "system";
}

export function bookingChangeSourceLabel(kind: BookingChangeActorKind): string {
  switch (kind) {
    case "parent":
      return "Changed by parent";
    case "school_admin":
      return "Changed by School Admin";
    case "school_owner":
      return "Changed by School Owner";
    default:
      return "Changed by system";
  }
}

export function bookingChangeRequiresReview(input: {
  action: string;
  actorKind: BookingChangeActorKind;
  before: BookingSnapshot | null;
  after: BookingSnapshot | null;
  createdAt: Date;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  const ageMs = now.getTime() - input.createdAt.getTime();
  const withinSevenDays = ageMs >= 0 && ageMs <= 7 * 86_400_000;
  if (!withinSevenDays) return false;

  if (input.actorKind !== "parent") return false;

  const afterStatus = input.after?.status ?? "";
  if (afterStatus === "late_cancelled") return true;

  if (input.action === "short_learning_booking_changed" || input.action === "short_learning_booking_rebooked") {
    const sessionStart = input.after?.startsAt ? new Date(input.after.startsAt) : null;
    if (sessionStart && !Number.isNaN(sessionStart.getTime())) {
      const hoursToSession = (sessionStart.getTime() - input.createdAt.getTime()) / 3_600_000;
      if (hoursToSession <= 24) return true;
    }
    return true;
  }

  if (input.action === "short_learning_booking_cancelled" && afterStatus === "cancelled") {
    const sessionStart = input.before?.startsAt ? new Date(input.before.startsAt) : null;
    if (sessionStart && !Number.isNaN(sessionStart.getTime())) {
      const hoursToSession = (sessionStart.getTime() - input.createdAt.getTime()) / 3_600_000;
      if (hoursToSession <= 48) return true;
    }
  }

  return false;
}

function summarizeChange(action: string, before: BookingSnapshot | null, after: BookingSnapshot | null): string {
  if (action === "short_learning_booking_created") {
    return `Booked ${after?.subject ?? "session"} (${after?.durationMinutes ?? "?"} min)`;
  }
  if (action === "short_learning_booking_cancelled") {
    return after?.status === "late_cancelled" ? "Late cancellation" : "Cancelled";
  }
  if (action === "short_learning_booking_rebooked") {
    return "Rebooked after cancellation";
  }
  const parts: string[] = [];
  if (before && after) {
    if (before.startsAt !== after.startsAt) parts.push("date/time");
    if (before.durationMinutes !== after.durationMinutes) parts.push("duration");
    if (before.subject !== after.subject) parts.push("subject");
    if (before.status !== after.status) parts.push("status");
  }
  return parts.length ? `Changed ${parts.join(", ")}` : "Updated booking";
}

export async function writeShortLearningBookingAudit(input: {
  schoolId: string;
  bookingId: string;
  actorUserId?: string | null;
  action: BookingAuditAction;
  actorKind: BookingChangeActorKind;
  parentUserId?: string | null;
  schoolStudentId?: string | null;
  before?: BookingSnapshot | null;
  after?: BookingSnapshot | null;
  metadata?: Record<string, unknown>;
  source?: "ui" | "api" | "worker" | "webhook" | "system";
}): Promise<void> {
  const before = input.before ?? null;
  const after = input.after ?? null;
  const diff: Record<string, unknown> = {};
  if (before && after) {
    for (const key of ["startsAt", "durationMinutes", "subject", "status", "learningFocus", "cancellationCategory"] as const) {
      if (before[key] !== after[key]) {
        diff[key] = { from: before[key] ?? null, to: after[key] ?? null };
      }
    }
  }

  await writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId ?? undefined,
    action: input.action as SchoolAuditAction,
    entityType: BOOKING_ENTITY_TYPE,
    entityId: input.bookingId,
    source: input.source ?? "api",
    actorType: input.actorKind === "parent" ? undefined : input.actorKind === "system" ? "system" : "school_staff",
    before: before ?? undefined,
    after: after ?? undefined,
    diff: Object.keys(diff).length ? diff : undefined,
    tags: ["short_learning", "booking_change", input.actorKind],
    metadata: {
      ...input.metadata,
      actorKind: input.actorKind,
      parentUserId: input.parentUserId ?? null,
      schoolStudentId: input.schoolStudentId ?? null,
      bookingRef: formatBookingRef(input.bookingId),
      summary: summarizeChange(input.action, before, after),
    },
    severity: input.action.includes("cancel") ? "warning" : "info",
  });
}

export function parseBookingChangeEvent(row: {
  id: string;
  action: string;
  actorUserId: string | null;
  createdAt: Date;
  beforeJson: string | null;
  afterJson: string | null;
  diffJson: string | null;
  metadataJson: string | null;
}, now?: Date): BookingChangeEvent {
  let before: BookingSnapshot | null = null;
  let after: BookingSnapshot | null = null;
  let diff: Record<string, unknown> | null = null;
  let metadata: Record<string, unknown> = {};
  try {
    before = row.beforeJson ? (JSON.parse(row.beforeJson) as BookingSnapshot) : null;
  } catch {
    before = null;
  }
  try {
    after = row.afterJson ? (JSON.parse(row.afterJson) as BookingSnapshot) : null;
  } catch {
    after = null;
  }
  try {
    diff = row.diffJson ? (JSON.parse(row.diffJson) as Record<string, unknown>) : null;
  } catch {
    diff = null;
  }
  try {
    metadata = row.metadataJson ? (JSON.parse(row.metadataJson) as Record<string, unknown>) : {};
  } catch {
    metadata = {};
  }

  const actorKind = (typeof metadata.actorKind === "string"
    ? metadata.actorKind
    : "parent") as BookingChangeActorKind;
  const requiresReview = bookingChangeRequiresReview({
    action: row.action,
    actorKind,
    before,
    after,
    createdAt: row.createdAt,
    now,
  });

  return {
    id: row.id,
    action: row.action,
    actorUserId: row.actorUserId,
    actorKind,
    actorLabel: bookingChangeSourceLabel(actorKind),
    createdAt: row.createdAt.toISOString(),
    before,
    after,
    diff,
    requiresReview,
    summary: typeof metadata.summary === "string" ? metadata.summary : summarizeChange(row.action, before, after),
  };
}