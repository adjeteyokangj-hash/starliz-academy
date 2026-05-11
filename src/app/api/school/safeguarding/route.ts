/**
 * School safeguarding alerts API.
 *
 * GET  /api/school/safeguarding?schoolId=...&status=open
 * POST /api/school/safeguarding        — raise or update an alert
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSchoolAccess } from "@/lib/schools/guards";
import { withSchoolId } from "@/lib/schools/tenant";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import { canResolveIncident } from "@/lib/schools/governance_rules";

const raiseAlertSchema = z.object({
  action: z.literal("raiseAlert"),
  schoolId: z.string().min(1),
  payload: z.object({
    studentId: z.string().min(1).optional(),
    triggeredBy: z.enum(["ai_moderation", "teacher_flag", "system_rule", "parent_report"]),
    category: z.enum(["inappropriate_content", "distress_signal", "unusual_activity", "access_anomaly"]),
    severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    description: z.string().min(1).max(2000),
    contentRef: z.string().max(200).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
});

const updateAlertSchema = z.object({
  action: z.literal("updateAlert"),
  schoolId: z.string().min(1),
  payload: z.object({
    alertId: z.string().min(1),
    status: z.enum(["open", "under_review", "resolved", "escalated", "dismissed"]),
  }),
});

const escalateIncidentSchema = z.object({
  action: z.literal("escalateIncident"),
  schoolId: z.string().min(1),
  payload: z.object({
    incidentId: z.string().min(1),
    escalationOwnerUserId: z.string().min(1),
    note: z.string().min(1).max(2000),
    escalationLevel: z.enum(["internal", "dsl", "external_agency"]).default("internal"),
  }),
});

const acknowledgeIncidentSchema = z.object({
  action: z.literal("acknowledgeIncident"),
  schoolId: z.string().min(1),
  payload: z.object({
    incidentId: z.string().min(1),
    note: z.string().min(1).max(1000),
  }),
});

const attachEvidenceSchema = z.object({
  action: z.literal("attachEvidence"),
  schoolId: z.string().min(1),
  payload: z.object({
    incidentId: z.string().min(1),
    label: z.string().min(1).max(120),
    attachmentId: z.string().min(1).optional(),
    url: z.string().url().optional(),
    fileType: z.string().min(1).max(80).optional(),
    note: z.string().max(1000).optional(),
  }).refine((value) => Boolean(value.attachmentId || value.url), {
    message: "attachmentId or url is required",
  }),
});

const resolveIncidentSchema = z.object({
  action: z.literal("resolveIncident"),
  schoolId: z.string().min(1),
  payload: z.object({
    incidentId: z.string().min(1),
    resolutionSummary: z.string().min(1).max(3000),
    actionTaken: z.string().min(1).max(1200),
  }),
});

const bodySchema = z.discriminatedUnion("action", [
  raiseAlertSchema,
  updateAlertSchema,
  escalateIncidentSchema,
  acknowledgeIncidentSchema,
  attachEvidenceSchema,
  resolveIncidentSchema,
]);

function parseIncidentMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { context, response } = await requireSchoolAccess({
    schoolId: body.schoolId,
    minRole: "support",
    method: "POST",
    route: "/api/school/safeguarding",
    resourceType: "safeguarding",
  });
  if (response) return response;

  if (body.action === "raiseAlert") {
    const { alert, incident } = await prisma.$transaction(async (tx) => {
      const createdAlert = await tx.schoolSafeguardingAlert.create({
        data: {
          schoolId: body.schoolId,
          studentId: body.payload.studentId ?? null,
          triggeredBy: body.payload.triggeredBy,
          category: body.payload.category,
          severity: body.payload.severity,
          description: body.payload.description,
          contentRef: body.payload.contentRef ?? null,
          metadataJson: body.payload.metadata ? JSON.stringify(body.payload.metadata) : null,
          status: "open",
        },
      });

      const createdIncident = await tx.safeguardingIncident.create({
        data: {
          schoolId: body.schoolId,
          studentId: body.payload.studentId ?? null,
          reportedByUserId: context.userId,
          category: body.payload.category,
          severity: body.payload.severity,
          status: "open",
          description: body.payload.description,
          metadataJson: JSON.stringify({
            source: "school_alert",
            alertId: createdAlert.id,
            triggeredBy: body.payload.triggeredBy,
            contentRef: body.payload.contentRef ?? null,
            ...(body.payload.metadata ?? {}),
          }),
        },
      });

      await tx.safeguardingWorkflowEvent.create({
        data: {
          schoolId: body.schoolId,
          incidentId: createdIncident.id,
          actorUserId: context.userId,
          eventType: "incident_reported",
          note: body.payload.description,
          metadataJson: JSON.stringify({
            alertId: createdAlert.id,
            triggeredBy: body.payload.triggeredBy,
          }),
        },
      });

      return { alert: createdAlert, incident: createdIncident };
    });

    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: context.userId,
      action: "safeguarding_alert",
      entityType: "student",
      entityId: body.payload.studentId,
      metadata: {
        alertId: alert.id,
        category: body.payload.category,
        severity: body.payload.severity,
        triggeredBy: body.payload.triggeredBy,
      },
      severity: body.payload.severity === "critical" || body.payload.severity === "high"
        ? "critical"
        : "warning",
    });

    return NextResponse.json({ ok: true, alert, incident });
  }

  // updateAlert
  if (body.action === "updateAlert") {
  const alert = await prisma.schoolSafeguardingAlert.findUnique({
    where: { id: body.payload.alertId },
    select: { id: true, schoolId: true },
  });
  if (!alert || alert.schoolId !== body.schoolId) {
    return NextResponse.json({ error: "Alert not found." }, { status: 404 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedAlert = await tx.schoolSafeguardingAlert.update({
      where: { id: body.payload.alertId },
      data: {
        status: body.payload.status,
        reviewedBy: context.userId,
        reviewedAt: new Date(),
        ...(body.payload.status === "resolved" ? { resolvedAt: new Date() } : {}),
      },
    });

    const incidents = await tx.safeguardingIncident.findMany({
      where: {
        schoolId: body.schoolId,
        metadataJson: { contains: body.payload.alertId },
        status: { not: "resolved" },
      },
      select: { id: true },
    });

    for (const row of incidents) {
      await tx.safeguardingIncident.update({
        where: { id: row.id },
        data: {
          status: body.payload.status,
          actionTaken: `alert_status:${body.payload.status}`,
          ...(body.payload.status === "resolved" ? { resolvedAt: new Date() } : {}),
        },
      });
      await tx.safeguardingWorkflowEvent.create({
        data: {
          schoolId: body.schoolId,
          incidentId: row.id,
          actorUserId: context.userId,
          eventType: "alert_status_updated",
          note: body.payload.status,
          metadataJson: JSON.stringify({ alertId: body.payload.alertId, status: body.payload.status }),
        },
      });
    }

    return updatedAlert;
  });

  return NextResponse.json({ ok: true, alert: updated });
  }

  // Incident workflow actions
  const incidentId = body.payload.incidentId;
  const incident = await prisma.safeguardingIncident.findUnique({
    where: { id: incidentId },
  });
  if (!incident || incident.schoolId !== body.schoolId) {
    return NextResponse.json({ error: "Incident not found." }, { status: 404 });
  }

  const currentMeta = parseIncidentMetadata(incident.metadataJson);

  if (body.action === "escalateIncident") {
    const updated = await prisma.$transaction(async (tx) => {
      const nextIncident = await tx.safeguardingIncident.update({
        where: { id: incident.id },
        data: {
          status: "escalated",
          escalationOwnerUserId: body.payload.escalationOwnerUserId,
          escalationLevel: body.payload.escalationLevel,
          metadataJson: JSON.stringify(currentMeta),
        },
      });

      await tx.safeguardingWorkflowEvent.create({
        data: {
          schoolId: body.schoolId,
          incidentId: incident.id,
          actorUserId: context.userId,
          eventType: "incident_escalated",
          note: body.payload.note,
          metadataJson: JSON.stringify({
            escalationOwnerUserId: body.payload.escalationOwnerUserId,
            escalationLevel: body.payload.escalationLevel,
          }),
        },
      });

      return nextIncident;
    });

    return NextResponse.json({ ok: true, incident: updated });
  }

  if (body.action === "acknowledgeIncident") {
    const updated = await prisma.$transaction(async (tx) => {
      const nextIncident = await tx.safeguardingIncident.update({
        where: { id: incident.id },
        data: {
          status: incident.status === "open" ? "under_review" : incident.status,
          metadataJson: JSON.stringify(currentMeta),
        },
      });

      await tx.safeguardingWorkflowEvent.create({
        data: {
          schoolId: body.schoolId,
          incidentId: incident.id,
          actorUserId: context.userId,
          eventType: "incident_acknowledged",
          note: body.payload.note,
        },
      });

      return nextIncident;
    });

    return NextResponse.json({ ok: true, incident: updated });
  }

  if (body.action === "attachEvidence") {
    const attachment = await prisma.$transaction(async (tx) => {
      const existingAttachment = body.payload.attachmentId
        ? await tx.safeguardingEvidenceAttachment.findUnique({ where: { id: body.payload.attachmentId } })
        : null;

      if (existingAttachment && (existingAttachment.schoolId !== body.schoolId || existingAttachment.incidentId !== incident.id)) {
        throw new Error("attachment_mismatch");
      }

      const saved = existingAttachment
        ? await tx.safeguardingEvidenceAttachment.update({
          where: { id: existingAttachment.id },
          data: {
            label: body.payload.label,
            note: body.payload.note ?? existingAttachment.note,
          },
        })
        : await tx.safeguardingEvidenceAttachment.create({
          data: {
            schoolId: body.schoolId,
            incidentId: incident.id,
            uploadedByUserId: context.userId,
            label: body.payload.label,
            originalName: body.payload.label,
            storedFilename: body.payload.url ? new URL(body.payload.url).pathname.split("/").pop() || body.payload.label : body.payload.label,
            publicUrl: body.payload.url!,
            mimeType: body.payload.fileType,
            note: body.payload.note,
          },
        });

      await tx.safeguardingWorkflowEvent.create({
        data: {
          schoolId: body.schoolId,
          incidentId: incident.id,
          actorUserId: context.userId,
          eventType: "evidence_attached",
          note: body.payload.label,
          metadataJson: JSON.stringify({ attachmentId: saved.id }),
        },
      });

      return saved;
    }).catch((error) => {
      if (error instanceof Error && error.message === "attachment_mismatch") {
        return null;
      }
      throw error;
    });

    if (!attachment) {
      return NextResponse.json({ error: "Attachment does not belong to this incident." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, attachment });
  }

  // resolveIncident
  const acknowledgements = await prisma.safeguardingWorkflowEvent.findMany({
    where: {
      incidentId: incident.id,
      eventType: "incident_acknowledged",
    },
    select: { actorUserId: true },
  });

  if (!canResolveIncident({
    acknowledgements: acknowledgements.flatMap((entry) => entry.actorUserId ? [{ userId: entry.actorUserId }] : []),
    actorUserId: context.userId,
  })) {
    return NextResponse.json(
      { error: "Resolver must acknowledge incident before resolution." },
      { status: 422 }
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const nextIncident = await tx.safeguardingIncident.update({
      where: { id: incident.id },
      data: {
        status: "resolved",
        actionTaken: body.payload.actionTaken,
        resolvedAt: new Date(),
        metadataJson: JSON.stringify({
          ...currentMeta,
          resolutionSummary: body.payload.resolutionSummary,
          resolvedBy: context.userId,
        }),
      },
    });

    await tx.safeguardingWorkflowEvent.create({
      data: {
        schoolId: body.schoolId,
        incidentId: incident.id,
        actorUserId: context.userId,
        eventType: "incident_resolved",
        note: body.payload.resolutionSummary,
        metadataJson: JSON.stringify({ actionTaken: body.payload.actionTaken }),
      },
    });

    return nextIncident;
  });

  return NextResponse.json({ ok: true, incident: updated });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const schoolId = url.searchParams.get("schoolId");
  if (!schoolId) {
    return NextResponse.json({ error: "schoolId is required" }, { status: 400 });
  }

  const { response } = await requireSchoolAccess({
    schoolId,
    minRole: "support",
    method: "GET",
    route: "/api/school/safeguarding",
    resourceType: "safeguarding",
  });
  if (response) return response;

  const status = url.searchParams.get("status") ?? "open";
  const severity = url.searchParams.get("severity") ?? undefined;

  const [alerts, incidents] = await Promise.all([
    prisma.schoolSafeguardingAlert.findMany({
      where: withSchoolId(schoolId, {
        status,
        ...(severity ? { severity } : {}),
      }),
      include: {
        student: { select: { id: true, name: true } },
      },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.safeguardingIncident.findMany({
      where: withSchoolId(schoolId, {
        status,
        ...(severity ? { severity } : {}),
      }),
      include: {
        student: { select: { id: true, name: true } },
        reportedBy: { select: { id: true, name: true, email: true } },
        escalationOwner: { select: { id: true, name: true, email: true } },
        workflowEvents: {
          include: {
            actor: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        evidenceAttachments: {
          include: {
            uploadedBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
  ]);

  return NextResponse.json({
    alerts,
    incidents: incidents.map((incident) => ({
      id: incident.id,
      category: incident.category,
      severity: incident.severity,
      status: incident.status,
      description: incident.description,
      actionTaken: incident.actionTaken,
      escalationLevel: incident.escalationLevel,
      createdAt: incident.createdAt.toISOString(),
      updatedAt: incident.updatedAt.toISOString(),
      resolvedAt: incident.resolvedAt?.toISOString() ?? null,
      student: incident.student,
      reportedBy: incident.reportedBy,
      escalationOwner: incident.escalationOwner,
      workflowEvents: incident.workflowEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        note: event.note,
        metadataJson: event.metadataJson,
        createdAt: event.createdAt.toISOString(),
        actor: event.actor,
      })),
      evidenceAttachments: incident.evidenceAttachments.map((attachment) => ({
        id: attachment.id,
        label: attachment.label,
        originalName: attachment.originalName,
        publicUrl: attachment.publicUrl,
        mimeType: attachment.mimeType,
        fileSizeBytes: attachment.fileSizeBytes,
        note: attachment.note,
        createdAt: attachment.createdAt.toISOString(),
        uploadedBy: attachment.uploadedBy,
      })),
    })),
  });
}
