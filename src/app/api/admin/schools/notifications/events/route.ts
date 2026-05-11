import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { emitNotificationEvent } from "@/lib/notifications/dispatcher";

const createSchema = z.object({
  eventType: z.string().trim().min(1),
  schoolId: z.string().optional(),
  trustId: z.string().optional(),
  severity: z.enum(["info", "warning", "critical"]).optional(),
  dedupeKey: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export async function GET(request: NextRequest) {
  const { session, response } = await requireAdminPermission("MANAGE_INBOX");
  if (!session) return response;

  const schoolId = request.nextUrl.searchParams.get("schoolId")?.trim() ?? "";
  const trustId = request.nextUrl.searchParams.get("trustId")?.trim() ?? "";
  const status = request.nextUrl.searchParams.get("status")?.trim() ?? "";

  const events = await prisma.notificationEvent.findMany({
    where: {
      ...(schoolId ? { schoolId } : {}),
      ...(trustId ? { trustId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      deliveries: {
        orderBy: [{ createdAt: "desc" }],
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });

  return NextResponse.json({
    events: events.map((row) => ({
      ...row,
      payload: row.payloadJson ? JSON.parse(row.payloadJson) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      deliveries: row.deliveries.map((delivery) => ({
        ...delivery,
        createdAt: delivery.createdAt.toISOString(),
        updatedAt: delivery.updatedAt.toISOString(),
        sentAt: delivery.sentAt?.toISOString() ?? null,
        deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
      })),
    })),
  });
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireAdminPermission("MANAGE_INBOX");
  if (!session) return response;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const event = await emitNotificationEvent(parsed.data);
  return NextResponse.json({ eventId: event.id, status: event.status });
}
