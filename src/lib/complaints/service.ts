import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import {
  computeComplaintSlaDueDates,
  evaluateComplaintSla,
  type ComplaintSlaState,
} from "@/lib/complaints/working-days";

export const COMPLAINT_STATUSES = [
  "received",
  "acknowledged",
  "investigating",
  "awaiting_information",
  "resolved",
  "closed",
] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const COMPLAINT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type ComplaintPriority = (typeof COMPLAINT_PRIORITIES)[number];

export const COMPLAINT_SLA_COPY = {
  headline: "Published service targets, not guarantees.",
  acknowledgement: "Acknowledge ordinary complaints within 2 working days (1 working day when urgent).",
  substantive: "Substantive response within 10 working days of receipt.",
  workingDays: "Working days are Monday–Friday, excluding England & Wales bank holidays.",
  safeguarding:
    "Child welfare and safeguarding concerns are outside ordinary complaint SLAs and must not be handled as complaints.",
} as const;

export function generateComplaintReference(now = new Date()): string {
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(
    now.getUTCDate(),
  ).padStart(2, "0")}`;
  const suffix = randomBytes(3).toString("hex").toUpperCase();
  return `CMP-${stamp}-${suffix}`;
}

type ComplaintRow = {
  id: string;
  reference: string;
  subject: string;
  summary: string | null;
  channel: string;
  priority: string;
  status: string;
  schoolId: string | null;
  parentUserId: string | null;
  assignedToUserId: string | null;
  createdByUserId: string | null;
  receivedAt: Date;
  acknowledgedAt: Date | null;
  substantiveRespondedAt: Date | null;
  acknowledgementDueAt: Date | null;
  substantiveResponseDueAt: Date | null;
  resolution: string | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  metadataJson: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeComplaint(row: ComplaintRow, now = new Date()) {
  const sla: ComplaintSlaState = evaluateComplaintSla({
    now,
    status: row.status,
    acknowledgementDueAt: row.acknowledgementDueAt,
    substantiveResponseDueAt: row.substantiveResponseDueAt,
    acknowledgedAt: row.acknowledgedAt,
    substantiveRespondedAt: row.substantiveRespondedAt,
  });

  return {
    id: row.id,
    reference: row.reference,
    subject: row.subject,
    summary: row.summary,
    channel: row.channel,
    priority: row.priority,
    status: row.status,
    schoolId: row.schoolId,
    parentUserId: row.parentUserId,
    assignedToUserId: row.assignedToUserId,
    receivedAt: row.receivedAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    substantiveRespondedAt: row.substantiveRespondedAt?.toISOString() ?? null,
    acknowledgementDueAt: row.acknowledgementDueAt?.toISOString() ?? null,
    substantiveResponseDueAt: row.substantiveResponseDueAt?.toISOString() ?? null,
    resolution: row.resolution,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sla,
  };
}

export async function createComplaint(input: {
  actorUserId: string;
  subject: string;
  summary?: string | null;
  priority?: ComplaintPriority;
  channel?: string;
  schoolId?: string | null;
  parentUserId?: string | null;
  assignedToUserId?: string | null;
}) {
  const now = new Date();
  const priority = input.priority ?? "normal";
  const due = computeComplaintSlaDueDates({ receivedAt: now, priority });

  const complaint = await prisma.complaint.create({
    data: {
      reference: generateComplaintReference(now),
      subject: input.subject,
      summary: input.summary ?? null,
      channel: input.channel ?? "admin",
      priority,
      status: "received",
      schoolId: input.schoolId ?? null,
      parentUserId: input.parentUserId ?? null,
      assignedToUserId: input.assignedToUserId ?? null,
      createdByUserId: input.actorUserId,
      receivedAt: now,
      acknowledgementDueAt: due.acknowledgementDueAt,
      substantiveResponseDueAt: due.substantiveResponseDueAt,
    },
  });

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "complaint_created",
    entityType: "complaint",
    entityId: complaint.id,
    metadata: { reference: complaint.reference, priority, schoolId: complaint.schoolId },
  });

  return complaint;
}
