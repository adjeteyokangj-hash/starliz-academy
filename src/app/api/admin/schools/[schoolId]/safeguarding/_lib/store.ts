import type { AuditEvent, EscalationRecord, SafeguardingIncident, TimelineEvent } from "./contracts";
import { prisma } from "@/lib/db";

type IncidentMetadata = Partial<{
  student: string;
  reportedBy: string;
  reportedAt: string;
  assignedOwner: string | null;
  nextReviewDate: string | null;
  parentContacted: boolean;
  externalAgencyInvolved: boolean;
  chronologyNotes: string;
  closureSummary: string;
  parentContactNotes: string;
  agencyReferralStatus: string;
  triagedAt: string | null;
  escalatedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
}>;

type AuditMetadata = {
  actionType?: string;
  previousStatus?: string | null;
  newStatus?: string | null;
};

type TimelineMetadata = {
  action?: string;
};

type EscalationMetadata = {
  escalationLevel?: string;
  actionPlan?: string;
  agencyReferralStatus?: string;
  escalatedBy?: string;
  nextReviewDate?: string | null;
};

function parseJson<T>(value: string | null): T {
  if (!value) return {} as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return {} as T;
  }
}

function incidentFromRow(row: {
  id: string;
  schoolId: string;
  category: string;
  severity: string;
  status: string;
  description: string;
  actionTaken: string | null;
  metadataJson: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}): SafeguardingIncident {
  const metadata = parseJson<IncidentMetadata>(row.metadataJson);
  return {
    id: row.id,
    schoolId: row.schoolId,
    student: metadata.student ?? "Unknown",
    concernType: row.category,
    riskLevel: row.severity as SafeguardingIncident["riskLevel"],
    reportedBy: metadata.reportedBy ?? "system",
    reportedAt: metadata.reportedAt ?? row.createdAt.toISOString(),
    concernSummary: row.description,
    immediateActionTaken: row.actionTaken ?? "",
    assignedOwner: metadata.assignedOwner ?? null,
    status: row.status as SafeguardingIncident["status"],
    nextReviewDate: metadata.nextReviewDate ?? null,
    parentContacted: Boolean(metadata.parentContacted),
    externalAgencyInvolved: Boolean(metadata.externalAgencyInvolved),
    chronologyNotes: metadata.chronologyNotes ?? "",
    closureSummary: metadata.closureSummary ?? "",
    parentContactNotes: metadata.parentContactNotes ?? "",
    agencyReferralStatus: (metadata.agencyReferralStatus ?? "Not Referred") as SafeguardingIncident["agencyReferralStatus"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    triagedAt: metadata.triagedAt ?? null,
    escalatedAt: metadata.escalatedAt ?? null,
    resolvedAt: metadata.resolvedAt ?? row.resolvedAt?.toISOString() ?? null,
    closedAt: metadata.closedAt ?? null,
  };
}

export async function createIncident(
  schoolId: string,
  incident: Omit<SafeguardingIncident, "id" | "schoolId">,
): Promise<SafeguardingIncident> {
  const created = await prisma.safeguardingIncident.create({
    data: {
      schoolId,
      category: incident.concernType,
      severity: incident.riskLevel,
      status: incident.status,
      description: incident.concernSummary,
      actionTaken: incident.immediateActionTaken,
      metadataJson: JSON.stringify({
        student: incident.student,
        reportedBy: incident.reportedBy,
        reportedAt: incident.reportedAt,
        assignedOwner: incident.assignedOwner,
        nextReviewDate: incident.nextReviewDate,
        parentContacted: incident.parentContacted,
        externalAgencyInvolved: incident.externalAgencyInvolved,
        chronologyNotes: incident.chronologyNotes,
        closureSummary: incident.closureSummary,
        parentContactNotes: incident.parentContactNotes,
        agencyReferralStatus: incident.agencyReferralStatus,
        triagedAt: incident.triagedAt,
        escalatedAt: incident.escalatedAt,
        resolvedAt: incident.resolvedAt,
        closedAt: incident.closedAt,
      }),
    },
  });

  return incidentFromRow(created);
}

export async function listIncidents(schoolId: string): Promise<SafeguardingIncident[]> {
  const rows = await prisma.safeguardingIncident.findMany({
    where: { schoolId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => incidentFromRow(row));
}

export async function getIncident(schoolId: string, incidentId: string): Promise<SafeguardingIncident | null> {
  const row = await prisma.safeguardingIncident.findFirst({
    where: {
      id: incidentId,
      schoolId,
    },
  });
  return row ? incidentFromRow(row) : null;
}

export async function updateIncident(
  schoolId: string,
  incidentId: string,
  patch: Partial<SafeguardingIncident>,
): Promise<SafeguardingIncident | null> {
  const existing = await prisma.safeguardingIncident.findFirst({
    where: {
      id: incidentId,
      schoolId,
    },
  });
  if (!existing) return null;

  const existingMetadata = parseJson<IncidentMetadata>(existing.metadataJson);
  const mergedMetadata: IncidentMetadata = {
    ...existingMetadata,
    ...(patch.student !== undefined ? { student: patch.student } : {}),
    ...(patch.reportedBy !== undefined ? { reportedBy: patch.reportedBy } : {}),
    ...(patch.reportedAt !== undefined ? { reportedAt: patch.reportedAt } : {}),
    ...(patch.assignedOwner !== undefined ? { assignedOwner: patch.assignedOwner } : {}),
    ...(patch.nextReviewDate !== undefined ? { nextReviewDate: patch.nextReviewDate } : {}),
    ...(patch.parentContacted !== undefined ? { parentContacted: patch.parentContacted } : {}),
    ...(patch.externalAgencyInvolved !== undefined ? { externalAgencyInvolved: patch.externalAgencyInvolved } : {}),
    ...(patch.chronologyNotes !== undefined ? { chronologyNotes: patch.chronologyNotes } : {}),
    ...(patch.closureSummary !== undefined ? { closureSummary: patch.closureSummary } : {}),
    ...(patch.parentContactNotes !== undefined ? { parentContactNotes: patch.parentContactNotes } : {}),
    ...(patch.agencyReferralStatus !== undefined ? { agencyReferralStatus: patch.agencyReferralStatus } : {}),
    ...(patch.triagedAt !== undefined ? { triagedAt: patch.triagedAt } : {}),
    ...(patch.escalatedAt !== undefined ? { escalatedAt: patch.escalatedAt } : {}),
    ...(patch.resolvedAt !== undefined ? { resolvedAt: patch.resolvedAt } : {}),
    ...(patch.closedAt !== undefined ? { closedAt: patch.closedAt } : {}),
  };

  const updated = await prisma.safeguardingIncident.update({
    where: { id: incidentId },
    data: {
      category: patch.concernType ?? existing.category,
      severity: patch.riskLevel ?? existing.severity,
      status: patch.status ?? existing.status,
      description: patch.concernSummary ?? existing.description,
      actionTaken: patch.immediateActionTaken ?? existing.actionTaken,
      resolvedAt: patch.resolvedAt !== undefined
        ? (patch.resolvedAt ? new Date(patch.resolvedAt) : null)
        : existing.resolvedAt,
      metadataJson: JSON.stringify(mergedMetadata),
    },
  });

  return incidentFromRow(updated);
}

export async function appendTimelineEvent(
  schoolId: string,
  incidentId: string,
  event: TimelineEvent,
): Promise<TimelineEvent> {
  await prisma.safeguardingWorkflowEvent.create({
    data: {
      schoolId,
      incidentId,
      actorUserId: null,
      eventType: "timeline.added",
      note: event.note,
      metadataJson: JSON.stringify({
        action: event.action,
        timestamp: event.timestamp,
      }),
    },
  });
  return event;
}

export async function listTimelineEvents(schoolId: string, incidentId: string): Promise<TimelineEvent[]> {
  const rows = await prisma.safeguardingWorkflowEvent.findMany({
    where: {
      schoolId,
      incidentId,
      eventType: "timeline.added",
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => {
    const metadata = parseJson<TimelineMetadata & { timestamp?: string }>(row.metadataJson);
    return {
      id: row.id,
      schoolId,
      incidentId,
      actor: row.actorUserId ?? "system",
      action: metadata.action ?? "updated",
      note: row.note ?? "",
      timestamp: metadata.timestamp ?? row.createdAt.toISOString(),
    };
  });
}

export async function appendEscalationRecord(
  schoolId: string,
  incidentId: string,
  escalation: EscalationRecord,
): Promise<EscalationRecord> {
  await prisma.safeguardingWorkflowEvent.create({
    data: {
      schoolId,
      incidentId,
      actorUserId: null,
      eventType: "escalation.updated",
      note: escalation.rationale,
      metadataJson: JSON.stringify({
        escalationLevel: escalation.escalationLevel,
        actionPlan: escalation.actionPlan,
        agencyReferralStatus: escalation.agencyReferralStatus,
        escalatedBy: escalation.escalatedBy,
        nextReviewDate: escalation.nextReviewDate,
      }),
    },
  });
  return escalation;
}

export async function listEscalations(schoolId: string, incidentId: string): Promise<EscalationRecord[]> {
  const rows = await prisma.safeguardingWorkflowEvent.findMany({
    where: {
      schoolId,
      incidentId,
      eventType: "escalation.updated",
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => {
    const metadata = parseJson<EscalationMetadata>(row.metadataJson);
    return {
      id: row.id,
      schoolId,
      incidentId,
      escalationLevel: metadata.escalationLevel ?? "internal",
      rationale: row.note ?? "",
      actionPlan: metadata.actionPlan ?? "",
      agencyReferralStatus: (metadata.agencyReferralStatus ?? "Not Referred") as EscalationRecord["agencyReferralStatus"],
      escalatedBy: metadata.escalatedBy ?? (row.actorUserId ?? "system"),
      nextReviewDate: metadata.nextReviewDate ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function appendAuditEvent(schoolId: string, incidentId: string, event: AuditEvent): Promise<AuditEvent> {
  await prisma.safeguardingWorkflowEvent.create({
    data: {
      schoolId,
      incidentId,
      actorUserId: null,
      eventType: event.actionType,
      note: event.notes,
      metadataJson: JSON.stringify({
        actionType: event.actionType,
        previousStatus: event.previousStatus,
        newStatus: event.newStatus,
      }),
    },
  });
  return event;
}

export async function listAuditEvents(schoolId: string, incidentId: string): Promise<AuditEvent[]> {
  const rows = await prisma.safeguardingWorkflowEvent.findMany({
    where: {
      schoolId,
      incidentId,
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => {
    const metadata = parseJson<AuditMetadata>(row.metadataJson);
    return {
      id: row.id,
      schoolId,
      incidentId,
      actionType: (metadata.actionType ?? row.eventType) as AuditEvent["actionType"],
      actor: row.actorUserId ?? "system",
      timestamp: row.createdAt.toISOString(),
      previousStatus: (metadata.previousStatus ?? null) as AuditEvent["previousStatus"],
      newStatus: (metadata.newStatus ?? null) as AuditEvent["newStatus"],
      notes: row.note ?? "",
    };
  });
}
