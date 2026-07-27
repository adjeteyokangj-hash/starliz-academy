import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { serializeComplaint } from "@/lib/complaints/service";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), assignedToUserId: z.string().trim().min(1).nullable() }),
  z.object({ action: z.literal("acknowledge") }),
  z.object({
    action: z.literal("set_status"),
    status: z.enum(["investigating", "awaiting_information", "received", "acknowledged"]),
  }),
  z.object({ action: z.literal("add_note"), body: z.string().trim().min(1).max(4000), kind: z.enum(["investigation", "internal"]).default("investigation") }),
  z.object({ action: z.literal("record_response"), body: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal("resolve"), resolution: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal("close"), resolution: z.string().trim().max(4000).optional() }),
]);

async function loadComplaintDetail(complaintId: string) {
  const complaint = await prisma.complaint.findUnique({ where: { id: complaintId } });
  if (!complaint) return null;
  const notes = await prisma.complaintNote.findMany({
    where: { complaintId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return { complaint, notes };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ complaintId: string }> }) {
  const { session, response } = await requireAdminPermission("MANAGE_SUPPORT");
  if (!session) return response;

  const { complaintId } = await params;
  const detail = await loadComplaintDetail(complaintId);
  if (!detail) return NextResponse.json({ error: "Complaint not found." }, { status: 404 });

  return NextResponse.json({
    complaint: serializeComplaint(detail.complaint),
    notes: detail.notes.map((note) => ({
      id: note.id,
      actorUserId: note.actorUserId,
      kind: note.kind,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ complaintId: string }> }) {
  const { session, response } = await requireAdminPermission("MANAGE_SUPPORT");
  if (!session) return response;

  const { complaintId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid complaint action payload." }, { status: 400 });
  }

  const existing = await prisma.complaint.findUnique({ where: { id: complaintId } });
  if (!existing) return NextResponse.json({ error: "Complaint not found." }, { status: 404 });

  const now = new Date();
  const data: Prisma.ComplaintUpdateInput = {};
  let auditAction = "complaint_status_changed";
  const auditMeta: Record<string, unknown> = { reference: existing.reference };

  switch (parsed.data.action) {
    case "assign": {
      data.assignedToUserId = parsed.data.assignedToUserId;
      auditAction = "complaint_assigned";
      auditMeta.assignedToUserId = parsed.data.assignedToUserId;
      break;
    }
    case "acknowledge": {
      // Opening/acknowledging never clears overdue — we only stamp the milestone.
      if (!existing.acknowledgedAt) data.acknowledgedAt = now;
      if (existing.status === "received") data.status = "acknowledged";
      auditAction = "complaint_acknowledged";
      break;
    }
    case "set_status": {
      data.status = parsed.data.status;
      auditMeta.status = parsed.data.status;
      break;
    }
    case "add_note": {
      await prisma.complaintNote.create({
        data: { complaintId, actorUserId: session.userId, kind: parsed.data.kind, body: parsed.data.body },
      });
      auditAction = "complaint_status_changed";
      auditMeta.note = "added";
      // Move to investigating when a note is added on a fresh case.
      if (existing.status === "received" || existing.status === "acknowledged") {
        data.status = "investigating";
      }
      break;
    }
    case "record_response": {
      data.substantiveRespondedAt = now;
      await prisma.complaintNote.create({
        data: { complaintId, actorUserId: session.userId, kind: "response", body: parsed.data.body },
      });
      auditAction = "complaint_response_recorded";
      break;
    }
    case "resolve": {
      data.status = "resolved";
      data.resolution = parsed.data.resolution;
      data.resolvedAt = now;
      if (!existing.substantiveRespondedAt) data.substantiveRespondedAt = now;
      auditAction = "complaint_resolved";
      break;
    }
    case "close": {
      data.status = "closed";
      data.closedAt = now;
      if (parsed.data.resolution) data.resolution = parsed.data.resolution;
      if (!existing.resolvedAt) data.resolvedAt = now;
      auditAction = "complaint_closed";
      break;
    }
  }

  const updated = await prisma.complaint.update({ where: { id: complaintId }, data });

  await writeAuditLog({
    actorUserId: session.userId,
    action: auditAction,
    entityType: "complaint",
    entityId: complaintId,
    metadata: auditMeta,
  });

  const notes = await prisma.complaintNote.findMany({
    where: { complaintId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    complaint: serializeComplaint(updated),
    notes: notes.map((note) => ({
      id: note.id,
      actorUserId: note.actorUserId,
      kind: note.kind,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
    })),
  });
}
