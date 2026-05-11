import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSchoolAccess } from "@/lib/schools/guards";
import { sendEmail } from "@/lib/email-provider";
import { evaluateCommunicationEligibility } from "@/lib/schools/governance_rules";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("sendMessage"),
    schoolId: z.string().min(1),
    payload: z.object({
      linkId: z.string().min(1),
      subject: z.string().min(2).max(180),
      message: z.string().min(1).max(8000),
      channel: z.enum(["email"]).default("email"),
      safeguardingOverride: z.boolean().optional(),
    }),
  }),
  z.object({
    action: z.literal("updateOptOut"),
    schoolId: z.string().min(1),
    payload: z.object({
      linkId: z.string().min(1),
      optOut: z.boolean(),
      reason: z.string().max(500).optional(),
    }),
  }),
]);

async function syncSafeguardingLock(input: {
  schoolId: string;
  linkId: string;
  preferenceId?: string;
  currentReason?: string | null;
  currentLockedAt?: Date | null;
  openIncident: { id: string; severity: string; status: string } | null;
  updatedByUserId: string;
}) {
  if (input.openIncident) {
    return prisma.schoolCommunicationPreference.upsert({
      where: { parentSchoolLinkId: input.linkId },
      create: {
        schoolId: input.schoolId,
        parentSchoolLinkId: input.linkId,
        safeguardingLockedAt: new Date(),
        safeguardingLockReason: `incident:${input.openIncident.id}`,
        updatedByUserId: input.updatedByUserId,
      },
      update: {
        safeguardingLockedAt: input.currentLockedAt ?? new Date(),
        safeguardingLockReason: `incident:${input.openIncident.id}`,
        updatedByUserId: input.updatedByUserId,
      },
    });
  }

  if (!input.preferenceId || !input.currentReason?.startsWith("incident:")) {
    return null;
  }

  return prisma.schoolCommunicationPreference.update({
    where: { id: input.preferenceId },
    data: {
      safeguardingLockedAt: null,
      safeguardingLockReason: null,
      updatedByUserId: input.updatedByUserId,
    },
  });
}

export async function POST(request: Request) {
  let body: z.infer<typeof actionSchema>;
  try {
    body = actionSchema.parse(await request.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const access = await requireSchoolAccess({
    schoolId: body.schoolId,
    minRole: "support",
    method: "POST",
    route: "/api/school/communications",
    resourceType: "parent_communication",
  });
  if (access.response) return access.response;

  if (body.action === "updateOptOut") {
    const link = await prisma.parentSchoolLink.findUnique({
      where: { id: body.payload.linkId },
      select: { id: true, schoolId: true },
    });

    if (!link || link.schoolId !== body.schoolId) {
      return NextResponse.json({ error: "Link not found." }, { status: 404 });
    }

    const nextPreference = await prisma.schoolCommunicationPreference.upsert({
      where: { parentSchoolLinkId: link.id },
      create: {
        schoolId: body.schoolId,
        parentSchoolLinkId: link.id,
        optedOutAt: body.payload.optOut ? new Date() : null,
        optOutReason: body.payload.optOut ? body.payload.reason ?? null : null,
        updatedByUserId: access.context.userId,
      },
      update: {
        optedOutAt: body.payload.optOut ? new Date() : null,
        optOutReason: body.payload.optOut ? body.payload.reason ?? null : null,
        updatedByUserId: access.context.userId,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: access.context.userId,
        action: "school_parent_opt_out_updated",
        entityType: "parent_communication",
        entityId: link.id,
        metadataJson: JSON.stringify({
          schoolId: body.schoolId,
          optOut: body.payload.optOut,
          reason: body.payload.reason ?? null,
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      linkId: link.id,
      optOut: body.payload.optOut,
      preference: {
        id: nextPreference.id,
        optedOutAt: nextPreference.optedOutAt?.toISOString() ?? null,
        optOutReason: nextPreference.optOutReason,
      },
    });
  }

  // sendMessage
  const link = await prisma.parentSchoolLink.findUnique({
    where: { id: body.payload.linkId },
    include: {
      parent: { select: { id: true, email: true, name: true } },
      schoolStudent: {
        include: {
          child: { select: { id: true, name: true } },
        },
      },
      school: { select: { id: true, name: true } },
      communicationPreference: true,
    },
  });

  if (!link || link.schoolId !== body.schoolId) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }

  // Safeguarding communication lock: block generic comms while critical/high incident remains open.
  const openIncident = await prisma.safeguardingIncident.findFirst({
    where: {
      schoolId: body.schoolId,
      studentId: link.schoolStudent.childId,
      status: { in: ["open", "under_review", "escalated"] },
      severity: { in: ["high", "critical"] },
    },
    select: { id: true, severity: true, status: true },
  });

  const syncedPreference = await syncSafeguardingLock({
    schoolId: body.schoolId,
    linkId: link.id,
    preferenceId: link.communicationPreference?.id,
    currentReason: link.communicationPreference?.safeguardingLockReason,
    currentLockedAt: link.communicationPreference?.safeguardingLockedAt,
    openIncident,
    updatedByUserId: access.context.userId,
  });

  const preference = syncedPreference ?? link.communicationPreference;

  const gate = evaluateCommunicationEligibility({
    linkStatus: link.status,
    canMessageTeachers: link.canMessageTeachers,
    consentGivenAt: link.consentGivenAt?.toISOString() ?? null,
    consentWithdrawnAt: link.consentWithdrawnAt?.toISOString() ?? null,
    optedOutAt: preference?.optedOutAt?.toISOString() ?? null,
    safeguardingLockedAt: preference?.safeguardingLockedAt?.toISOString() ?? null,
    hasOpenSafeguardingLock: Boolean(openIncident),
    safeguardingOverride: body.payload.safeguardingOverride ?? false,
  });

  if (!gate.allowed) {
    if (gate.reason === "safeguarding_lock") {
      return NextResponse.json(
        {
          error: "Communication lock is active for safeguarding reasons.",
          lock: openIncident
            ? {
              incidentId: openIncident.id,
              severity: openIncident.severity,
              status: openIncident.status,
            }
            : null,
        },
        { status: 423 }
      );
    }

    const messages: Record<string, string> = {
      inactive_link: "Parent link is not active.",
      school_policy_disabled: "Messaging has been disabled by school policy.",
      missing_consent: "Parent consent is required before messaging.",
      parent_opted_out: "Parent has opted out of school communications.",
    };

    return NextResponse.json({ error: messages[gate.reason ?? ""] ?? "Communication cannot be sent." }, { status: 403 });
  }

  const title = `[${link.school.name}] ${body.payload.subject}`;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif"><p>${body.payload.message.replace(/\n/g, "<br/>")}</p><hr/><p style="color:#64748b;font-size:12px">Sent by ${link.school.name} regarding ${link.schoolStudent.child.name}.</p></div>`;

  const delivery = await sendEmail({
    to: link.parent.email,
    subject: title,
    html,
    text: `${body.payload.message}\n\nSent by ${link.school.name} regarding ${link.schoolStudent.child.name}.`,
  });

  const trailMeta = {
    schoolId: body.schoolId,
    linkId: link.id,
    parentUserId: link.parentUserId,
    schoolStudentId: link.schoolStudentId,
    childId: link.schoolStudent.childId,
    channel: body.payload.channel,
    subject: body.payload.subject,
    delivery: delivery.ok ? "sent" : "failed",
    deliveryReason: delivery.ok ? null : delivery.reason,
    safeguardingOverride: body.payload.safeguardingOverride ?? false,
  };

  const communicationLog = await prisma.schoolCommunicationLog.create({
    data: {
      schoolId: body.schoolId,
      parentSchoolLinkId: link.id,
      actorUserId: access.context.userId,
      channel: body.payload.channel,
      subject: body.payload.subject,
      messageBody: body.payload.message,
      deliveryStatus: delivery.ok ? "sent" : "failed",
      deliveryReason: delivery.ok ? null : delivery.reason,
      safeguardingOverride: body.payload.safeguardingOverride ?? false,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: access.context.userId,
      action: "school_parent_message_sent",
      entityType: "parent_communication",
      entityId: link.id,
      metadataJson: JSON.stringify(trailMeta),
    },
  });

  return NextResponse.json({
    ok: true,
    delivery,
    log: {
      id: communicationLog.id,
      deliveryStatus: communicationLog.deliveryStatus,
      createdAt: communicationLog.createdAt.toISOString(),
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const schoolId = url.searchParams.get("schoolId");

  if (!schoolId) {
    return NextResponse.json({ error: "schoolId is required" }, { status: 400 });
  }

  const access = await requireSchoolAccess({
    schoolId,
    minRole: "support",
    method: "GET",
    route: "/api/school/communications",
    resourceType: "parent_communication",
  });
  if (access.response) return access.response;

  const [logs, links] = await Promise.all([
    prisma.schoolCommunicationLog.findMany({
      where: { schoolId },
      include: {
        actor: { select: { id: true, name: true, email: true } },
        parentSchoolLink: {
          include: {
            parent: { select: { id: true, name: true, email: true } },
            schoolStudent: {
              include: {
                child: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.parentSchoolLink.findMany({
      where: { schoolId },
      include: {
        parent: { select: { id: true, name: true, email: true } },
        schoolStudent: {
          include: {
            child: { select: { id: true, name: true } },
          },
        },
        communicationPreference: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  ]);

  return NextResponse.json({
    logs: logs.map((log) => ({
      id: log.id,
      channel: log.channel,
      subject: log.subject,
      messageBody: log.messageBody,
      deliveryStatus: log.deliveryStatus,
      deliveryReason: log.deliveryReason,
      safeguardingOverride: log.safeguardingOverride,
      createdAt: log.createdAt.toISOString(),
      actor: log.actor,
      parent: log.parentSchoolLink.parent,
      student: {
        id: log.parentSchoolLink.schoolStudent.child.id,
        name: log.parentSchoolLink.schoolStudent.child.name,
      },
      linkId: log.parentSchoolLinkId,
    })),
    preferences: links.map((link) => ({
      linkId: link.id,
      parent: link.parent,
      student: {
        id: link.schoolStudent.child.id,
        name: link.schoolStudent.child.name,
      },
      status: link.status,
      canMessageTeachers: link.canMessageTeachers,
      consentGivenAt: link.consentGivenAt?.toISOString() ?? null,
      consentWithdrawnAt: link.consentWithdrawnAt?.toISOString() ?? null,
      optedOutAt: link.communicationPreference?.optedOutAt?.toISOString() ?? null,
      optOutReason: link.communicationPreference?.optOutReason ?? null,
      safeguardingLockedAt: link.communicationPreference?.safeguardingLockedAt?.toISOString() ?? null,
      safeguardingLockReason: link.communicationPreference?.safeguardingLockReason ?? null,
      updatedAt: link.updatedAt.toISOString(),
    })),
  });
}
