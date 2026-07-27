import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import {
  COMPLAINT_PRIORITIES,
  COMPLAINT_SLA_COPY,
  COMPLAINT_STATUSES,
  createComplaint,
  serializeComplaint,
} from "@/lib/complaints/service";

const createSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  summary: z.string().trim().max(4000).optional().nullable(),
  priority: z.enum(COMPLAINT_PRIORITIES).default("normal"),
  channel: z.string().trim().max(40).optional(),
  schoolId: z.string().trim().min(1).optional().nullable(),
  parentUserId: z.string().trim().min(1).optional().nullable(),
  assignedToUserId: z.string().trim().min(1).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const { session, response } = await requireAdminPermission("MANAGE_SUPPORT");
  if (!session) return response;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status")?.trim();
  const priority = searchParams.get("priority")?.trim();
  const assignedTo = searchParams.get("assignedTo")?.trim();

  const where: {
    status?: string;
    priority?: string;
    assignedToUserId?: string;
  } = {};
  if (status && (COMPLAINT_STATUSES as readonly string[]).includes(status)) where.status = status;
  if (priority && (COMPLAINT_PRIORITIES as readonly string[]).includes(priority)) where.priority = priority;
  if (assignedTo) where.assignedToUserId = assignedTo;

  try {
    const now = new Date();
    const rows = await prisma.complaint.findMany({
      where,
      orderBy: [{ status: "asc" }, { substantiveResponseDueAt: "asc" }],
      take: 500,
    });
    const complaints = rows.map((row) => serializeComplaint(row, now));

    const openStatuses = ["received", "acknowledged", "investigating", "awaiting_information"];
    const metrics = {
      total: complaints.length,
      open: complaints.filter((c) => openStatuses.includes(c.status)).length,
      overdue: complaints.filter((c) => c.sla.acknowledgementOverdue || c.sla.substantiveOverdue).length,
      atRisk: complaints.filter((c) => c.sla.atRisk).length,
      urgent: complaints.filter((c) => c.priority === "urgent" && openStatuses.includes(c.status)).length,
    };

    return NextResponse.json({ complaints, metrics, sla: COMPLAINT_SLA_COPY, available: true });
  } catch (error) {
    console.error("complaints list failed:", error);
    return NextResponse.json(
      { error: "Complaints are unavailable right now.", available: false },
      { status: 503 },
    );
  }
}

export async function POST(req: NextRequest) {
  const { session, response } = await requireAdminPermission("MANAGE_SUPPORT");
  if (!session) return response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid complaint payload." }, { status: 400 });
  }

  try {
    const complaint = await createComplaint({ actorUserId: session.userId, ...parsed.data });
    return NextResponse.json({ complaint: serializeComplaint(complaint) }, { status: 201 });
  } catch (error) {
    console.error("complaint create failed:", error);
    return NextResponse.json({ error: "Could not create complaint." }, { status: 500 });
  }
}
