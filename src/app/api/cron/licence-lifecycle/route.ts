/**
 * Licence lifecycle automation cron
 *
 * POST /api/cron/licence-lifecycle
 *
 * Runs periodically (daily recommended) to:
 *  1. Expire trialing licences whose trialEndsAt has passed → set status = past_due
 *  2. Expire active/paid licences whose currentPeriodEnd has passed → set status = past_due
 *  3. Hard-suspend licences that have been past_due for > 7 days (grace period)
 *
 * Each status change is written to LicenceEvent.
 * Protected by CRON_SECRET (same pattern as /api/cron/daily).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const GRACE_PERIOD_DAYS = 7;

function hasCronAccess(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return (
    request.headers.get("authorization") === `Bearer ${secret}` ||
    request.headers.get("x-cron-secret") === secret
  );
}

export async function POST(request: Request) {
  if (!hasCronAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const graceCutoff = new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  let expiredTrials = 0;
  let expiredPeriods = 0;
  let suspended = 0;

  // ── 1. Expire trialing licences ──────────────────────────────────────────
  const trialExpired = await prisma.schoolLicence.findMany({
    where: {
      status: "trialing",
      trialEndsAt: { lt: now },
    },
    select: { id: true, schoolId: true, status: true },
  });

  for (const licence of trialExpired) {
    await prisma.$transaction([
      prisma.schoolLicence.update({
        where: { id: licence.id },
        data: { status: "past_due" },
      }),
      prisma.licenceEvent.create({
        data: {
          schoolId: licence.schoolId,
          schoolLicenceId: licence.id,
          eventType: "trial_expired",
          previousStatus: licence.status,
          nextStatus: "past_due",
          metadataJson: JSON.stringify({ triggeredBy: "cron", timestamp: now.toISOString() }),
        },
      }),
    ]);
    expiredTrials++;
  }

  // ── 2. Expire active/paid licences whose billing period ended ────────────
  const periodExpired = await prisma.schoolLicence.findMany({
    where: {
      status: { in: ["active", "pilot"] },
      currentPeriodEnd: { lt: now },
      // Pilot with no currentPeriodEnd should not be auto-expired
      NOT: { currentPeriodEnd: null },
    },
    select: { id: true, schoolId: true, status: true },
  });

  for (const licence of periodExpired) {
    await prisma.$transaction([
      prisma.schoolLicence.update({
        where: { id: licence.id },
        data: { status: "past_due" },
      }),
      prisma.licenceEvent.create({
        data: {
          schoolId: licence.schoolId,
          schoolLicenceId: licence.id,
          eventType: "period_ended",
          previousStatus: licence.status,
          nextStatus: "past_due",
          metadataJson: JSON.stringify({ triggeredBy: "cron", timestamp: now.toISOString() }),
        },
      }),
    ]);
    expiredPeriods++;
  }

  // ── 3. Suspend licences past_due beyond grace period ─────────────────────
  // Find licences that entered past_due state more than GRACE_PERIOD_DAYS ago.
  // We identify these by finding their most recent licence event with nextStatus = past_due
  // created before the grace cutoff.
  const pastDueLicences = await prisma.schoolLicence.findMany({
    where: { status: "past_due" },
    select: { id: true, schoolId: true, status: true },
  });

  for (const licence of pastDueLicences) {
    const lastPastDueEvent = await prisma.licenceEvent.findFirst({
      where: {
        schoolLicenceId: licence.id,
        nextStatus: "past_due",
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    if (lastPastDueEvent && lastPastDueEvent.createdAt < graceCutoff) {
      await prisma.$transaction([
        prisma.schoolLicence.update({
          where: { id: licence.id },
          data: { status: "suspended" },
        }),
        prisma.licenceEvent.create({
          data: {
            schoolId: licence.schoolId,
            schoolLicenceId: licence.id,
            eventType: "grace_period_expired",
            previousStatus: "past_due",
            nextStatus: "suspended",
            metadataJson: JSON.stringify({
              triggeredBy: "cron",
              timestamp: now.toISOString(),
              gracePeriodDays: GRACE_PERIOD_DAYS,
            }),
          },
        }),
      ]);
      suspended++;
    }
  }

  // ── 4. Seat limit enforcement: mark schools at or over seat limit ─────────
  // This doesn't change licence status, but emits a warning event if a school
  // has exceeded its seat limit (seatLimit > 0) so admins can see it in the UI.
  const overSeatLicences = await prisma.schoolLicence.findMany({
    where: {
      status: { in: ["active", "trialing", "pilot"] },
      seatLimit: { gt: 0 },
    },
    select: { id: true, schoolId: true, seatLimit: true },
  });

  let seatWarnings = 0;
  for (const licence of overSeatLicences) {
    const used = await prisma.schoolStudent.count({
      where: { schoolId: licence.schoolId, status: "active" },
    });
    if (used > licence.seatLimit) {
      // Check if we already emitted a warning today
      const alreadyWarned = await prisma.licenceEvent.findFirst({
        where: {
          schoolLicenceId: licence.id,
          eventType: "seat_limit_exceeded",
          createdAt: { gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      });
      if (!alreadyWarned) {
        await prisma.licenceEvent.create({
          data: {
            schoolId: licence.schoolId,
            schoolLicenceId: licence.id,
            eventType: "seat_limit_exceeded",
            metadataJson: JSON.stringify({
              triggeredBy: "cron",
              timestamp: now.toISOString(),
              seatsUsed: used,
              seatLimit: licence.seatLimit,
            }),
          },
        });
        seatWarnings++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp: now.toISOString(),
    expiredTrials,
    expiredPeriods,
    suspended,
    seatWarnings,
  });
}
