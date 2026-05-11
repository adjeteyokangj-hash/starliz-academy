import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";

type LiveSnapshot = {
  escalationQueueCount: number;
  unresolvedSafeguarding: number;
  communicationFailures24h: number;
  suspensionEvents24h: number;
  teacherInactivitySchools: number;
  authAnomalySignals: number;
};

type LiveEnvelope = {
  generatedAt: string;
  snapshot: LiveSnapshot;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

function isExpiredDate(iso: Date | null): boolean {
  if (!iso) return false;
  return iso.getTime() < Date.now();
}

function isLicenceExpired(input: { currentPeriodEnd: Date | null; trialEndsAt: Date | null; status: string }): boolean {
  if (["past_due", "suspended", "cancelled", "archived"].includes(input.status)) return true;
  return isExpiredDate(input.currentPeriodEnd) || isExpiredDate(input.trialEndsAt);
}

async function buildLiveEnvelope(): Promise<LiveEnvelope> {
  const now = Date.now();
  const last24h = new Date(now - DAY_MS);
  const last15m = new Date(now - FIFTEEN_MINUTES_MS);

  const schools = await prisma.school.findMany({
    select: {
      status: true,
      licence: {
        select: {
          status: true,
          seatLimit: true,
          currentPeriodEnd: true,
          trialEndsAt: true,
        },
      },
      students: {
        where: { status: "active" },
        select: { id: true },
      },
      teachers: {
        select: { status: true },
      },
      safeguardingAlerts: {
        where: { status: { in: ["open", "under_review", "escalated"] } },
        select: { severity: true },
      },
      safeguardingIncidents: {
        where: { status: { not: "resolved" } },
        select: { id: true },
      },
      communicationLogs: {
        where: {
          createdAt: { gte: last24h },
          deliveryStatus: { not: "sent" },
        },
        select: { id: true },
      },
    },
  });

  const escalationQueueCount = schools.filter((school) => {
    const licenceExpired = school.licence
      ? isLicenceExpired({
        currentPeriodEnd: school.licence.currentPeriodEnd,
        trialEndsAt: school.licence.trialEndsAt,
        status: school.licence.status,
      })
      : true;
    const overCapacity = school.licence ? school.licence.seatLimit > 0 && school.students.length >= school.licence.seatLimit : false;
    const activeTeachers = school.teachers.filter((teacher) => teacher.status === "active").length;
    const criticalSafeguarding = school.safeguardingAlerts.some((alert) => alert.severity === "critical");

    return criticalSafeguarding || licenceExpired || overCapacity || activeTeachers === 0;
  }).length;

  const unresolvedSafeguarding = schools.reduce((sum, school) => sum + school.safeguardingIncidents.length, 0);
  const communicationFailures24h = schools.reduce((sum, school) => sum + school.communicationLogs.length, 0);
  const teacherInactivitySchools = schools.filter((school) => school.teachers.filter((teacher) => teacher.status === "active").length === 0).length;

  const [suspensionEvents24h, authAnomalySignals] = await Promise.all([
    prisma.schoolAuditLog.count({
      where: {
        action: "school_suspended",
        createdAt: { gte: last24h },
      },
    }),
    prisma.schoolLoginHistory.count({
      where: {
        success: false,
        createdAt: { gte: last15m },
      },
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    snapshot: {
      escalationQueueCount,
      unresolvedSafeguarding,
      communicationFailures24h,
      suspensionEvents24h,
      teacherInactivitySchools,
      authAnomalySignals,
    },
  };
}

function sseEncode(envelope: LiveEnvelope): string {
  return `data: ${JSON.stringify(envelope)}\n\n`;
}

export async function GET(request: Request) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const url = new URL(request.url);
  const transport = url.searchParams.get("transport");

  if (transport !== "sse") {
    const payload = await buildLiveEnvelope();
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  let updateInterval: ReturnType<typeof setInterval> | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();

      const push = async () => {
        try {
          const payload = await buildLiveEnvelope();
          controller.enqueue(encoder.encode(sseEncode(payload)));
        } catch {
          controller.enqueue(encoder.encode("event: error\ndata: {\"error\":\"snapshot_failed\"}\n\n"));
        }
      };

      void push();
      updateInterval = setInterval(() => {
        void push();
      }, 15000);

      heartbeatInterval = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 10000);
    },
    cancel() {
      if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}
