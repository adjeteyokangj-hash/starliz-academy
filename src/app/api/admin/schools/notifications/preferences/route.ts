import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";

const upsertSchema = z.object({
  schoolId: z.string().optional(),
  trustId: z.string().optional(),
  eventType: z.string().optional(),
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  minSeverity: z.enum(["info", "warning", "critical"]).optional(),
  quietHoursStart: z.string().optional(),
  quietHoursEnd: z.string().optional(),
  timezone: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const schoolId = request.nextUrl.searchParams.get("schoolId")?.trim() ?? "";
  const trustId = request.nextUrl.searchParams.get("trustId")?.trim() ?? "";

  const prefs = await prisma.notificationPreference.findMany({
    where: {
      userId: session.userId,
      ...(schoolId ? { schoolId } : {}),
      ...(trustId ? { trustId } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json({ preferences: prefs });
}

export async function PUT(request: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const body = await request.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const input = parsed.data;

  const existing = await prisma.notificationPreference.findFirst({
    where: {
      userId: session.userId,
      schoolId: input.schoolId ?? null,
      trustId: input.trustId ?? null,
      eventType: input.eventType ?? null,
    },
  });

  const preference = existing
    ? await prisma.notificationPreference.update({
        where: { id: existing.id },
        data: {
          ...(input.emailEnabled !== undefined ? { emailEnabled: input.emailEnabled } : {}),
          ...(input.smsEnabled !== undefined ? { smsEnabled: input.smsEnabled } : {}),
          ...(input.whatsappEnabled !== undefined ? { whatsappEnabled: input.whatsappEnabled } : {}),
          ...(input.minSeverity !== undefined ? { minSeverity: input.minSeverity } : {}),
          ...(input.quietHoursStart !== undefined ? { quietHoursStart: input.quietHoursStart || null } : {}),
          ...(input.quietHoursEnd !== undefined ? { quietHoursEnd: input.quietHoursEnd || null } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone || null } : {}),
        },
      })
    : await prisma.notificationPreference.create({
        data: {
          userId: session.userId,
          schoolId: input.schoolId,
          trustId: input.trustId,
          eventType: input.eventType,
          emailEnabled: input.emailEnabled ?? true,
          smsEnabled: input.smsEnabled ?? false,
          whatsappEnabled: input.whatsappEnabled ?? false,
          minSeverity: input.minSeverity ?? "info",
          quietHoursStart: input.quietHoursStart,
          quietHoursEnd: input.quietHoursEnd,
          timezone: input.timezone,
        },
      });

  return NextResponse.json({ preference });
}
