/**
 * Gate 1D — Tutor presence cron + Short Learning lifecycle writers UAT.
 * Additive fixtures only. No migration reset / destructive schema ops.
 * Does not alter Short Learning generation/review/publication workflow.
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const s = line.trim();
  if (!s || s.startsWith("#")) continue;
  const i = s.indexOf("=");
  if (i < 1) continue;
  let v = s.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  const key = s.slice(0, i).trim();
  if (process.env[key] === undefined) process.env[key] = v;
}

type Check = { name: string; ok: boolean; detail?: string };

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { sweepStaleTutorPresence } = await import("../src/lib/schools/human-support-presence");
  const { sweepShortLearningBookingLifecycle } = await import(
    "../src/lib/schools/short-learning-booking-lifecycle"
  );
  const { handleTutorPresenceSweepCron } = await import(
    "../src/app/api/cron/tutor-presence-sweep/route"
  );
  const { handleShortLearningLifecycleCron } = await import(
    "../src/app/api/cron/short-learning-lifecycle/route"
  );

  const checks: Check[] = [];
  const stamp = Date.now().toString(36);
  const cleanupBookingIds: string[] = [];
  const cleanupPresenceIds: string[] = [];
  const cleanupTeacherIds: string[] = [];

  function record(name: string, ok: boolean, detail?: string) {
    checks.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  }

  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
    crons?: Array<{ path?: string; schedule?: string }>;
  };
  record(
    "tutor-presence-sweep registered in vercel.json",
    Boolean(vercel.crons?.some((c) => c.path === "/api/cron/tutor-presence-sweep" && c.schedule === "* * * * *")),
  );
  record(
    "short-learning-lifecycle registered in vercel.json",
    Boolean(vercel.crons?.some((c) => c.path === "/api/cron/short-learning-lifecycle" && c.schedule === "*/5 * * * *")),
  );

  const prevSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "gate1d-uat-secret";
  try {
    const denied = await handleTutorPresenceSweepCron(
      new Request("http://localhost/api/cron/tutor-presence-sweep", { method: "GET" }),
    );
    record("presence cron rejects missing secret", denied.status === 401, `status=${denied.status}`);

    const allowed = await handleTutorPresenceSweepCron(
      new Request("http://localhost/api/cron/tutor-presence-sweep", {
        method: "GET",
        headers: { authorization: "Bearer gate1d-uat-secret" },
      }),
    );
    // May 200 once DB reachable; auth must not 401.
    record(
      "presence cron accepts configured production secret pattern",
      allowed.status !== 401,
      `status=${allowed.status}`,
    );

    const lifeDenied = await handleShortLearningLifecycleCron(
      new Request("http://localhost/api/cron/short-learning-lifecycle", { method: "POST" }),
    );
    record("lifecycle cron rejects missing secret", lifeDenied.status === 401, `status=${lifeDenied.status}`);
  } finally {
    if (prevSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevSecret;
  }

  const membership = await prisma.schoolStudent.findFirst({
    where: { status: "active", child: { archived: false } },
    select: {
      id: true,
      schoolId: true,
      childId: true,
      child: { select: { parentId: true, yearGroup: true } },
    },
  });
  if (!membership?.child.parentId) throw new Error("Need an active school student with a parent");

  const school = await prisma.school.findUnique({
    where: { id: membership.schoolId },
    select: { id: true, name: true },
  });
  if (!school) throw new Error("Need a school");

  const teacherUser = await prisma.user.create({
    data: {
      email: `gate1d-tutor-${stamp}@example.com`,
      passwordHash: "x",
      role: "teacher",
      name: "Gate1D Tutor",
    },
    select: { id: true },
  });
  cleanupTeacherIds.push(teacherUser.id);

  const schoolTeacher = await prisma.schoolTeacher.create({
    data: {
      schoolId: school.id,
      userId: teacherUser.id,
      status: "active",
      role: "teacher",
    },
    select: { id: true },
  });

  const staleAt = new Date(Date.now() - 5 * 60_000);

  const availablePresence = await prisma.tutorPresence.upsert({
    where: { schoolTeacherId: schoolTeacher.id },
    create: {
      schoolId: school.id,
      schoolTeacherId: schoolTeacher.id,
      status: "available",
      lastHeartbeatAt: staleAt,
      availableSince: staleAt,
    },
    update: {
      status: "available",
      lastHeartbeatAt: staleAt,
      availableSince: staleAt,
      busySince: null,
      pausedAt: null,
      activeSessionId: null,
    },
    select: { id: true, status: true },
  });
  cleanupPresenceIds.push(availablePresence.id);

  const availableSweep = await sweepStaleTutorPresence({ now: new Date() });
  const availableAfter = await prisma.tutorPresence.findUnique({
    where: { id: availablePresence.id },
    select: { status: true },
  });
  record(
    "stale AVAILABLE tutor moved offline",
    availableAfter?.status === "offline" && availableSweep.markedOffline >= 1,
    `status=${availableAfter?.status} markedOffline=${availableSweep.markedOffline}`,
  );

  // Re-seed busy tutor for second proof.
  await prisma.tutorPresence.update({
    where: { id: availablePresence.id },
    data: {
      status: "busy",
      lastHeartbeatAt: staleAt,
      busySince: staleAt,
      availableSince: null,
    },
  });
  const busySweep = await sweepStaleTutorPresence({ now: new Date() });
  const busyAfter = await prisma.tutorPresence.findUnique({
    where: { id: availablePresence.id },
    select: { status: true },
  });
  record(
    "stale BUSY tutor moved offline",
    busyAfter?.status === "offline" && busySweep.markedOffline >= 1,
    `status=${busyAfter?.status} markedOffline=${busySweep.markedOffline}`,
  );

  const offlineAudit = await prisma.schoolAuditLog.findFirst({
    where: {
      schoolId: school.id,
      action: "tutor_offline_stale",
      entityId: schoolTeacher.id,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, action: true },
  });
  record("stale offline audit recorded", Boolean(offlineAudit?.id), `id=${offlineAudit?.id ?? "none"}`);

  async function makeBooking(input: {
    status: "booked" | "confirmed" | "attended";
    startsAt: Date;
    endsAt: Date;
    joinedAt?: Date | null;
    withPublishedJourney?: boolean;
  }) {
    let journeyId: string | undefined;
    if (input.withPublishedJourney) {
      const journey = await prisma.shortLearningJourney.create({
        data: {
          schoolId: school.id,
          subject: "maths",
          yearGroup: membership.child.yearGroup ?? "Year 4",
          durationMinutes: 90,
          topic: `Gate1D ${stamp}`,
          status: "published",
          publishedAt: new Date(),
          publishedBy: "gate1d-uat",
        },
        select: { id: true },
      });
      journeyId = journey.id;
    }
    const booking = await prisma.studentLearningBooking.create({
      data: {
        schoolId: school.id,
        schoolStudentId: membership.id,
        parentUserId: membership.child.parentId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        durationMinutes: 90,
        subject: "maths",
        learningFocus: `Gate1D ${stamp}`,
        status: input.status,
        joinedAt: input.joinedAt ?? null,
        confirmedAt: input.status === "confirmed" || input.status === "attended" ? new Date() : null,
        source: "uat_gate1d_lifecycle",
        journeyId,
        honestyPolicyVersion: "uat",
        honestyAcknowledgedAt: new Date(),
      },
      select: { id: true, status: true, journeyId: true },
    });
    cleanupBookingIds.push(booking.id);
    if (input.withPublishedJourney) {
      await prisma.shortLearningSession.create({
        data: {
          bookingId: booking.id,
          subject: "maths",
          yearGroup: membership.child.yearGroup ?? "Year 4",
          durationMinutes: 90,
          status: "ready",
          metadataJson: JSON.stringify({ source: "published_journey", studentPlayable: true }),
        },
      });
    }
    return booking;
  }

  const now = new Date();
  const activeBooking = await makeBooking({
    status: "booked",
    startsAt: new Date(now.getTime() + 5 * 60_000),
    endsAt: new Date(now.getTime() + 95 * 60_000),
  });
  const attendedSeed = await makeBooking({
    status: "confirmed",
    startsAt: new Date(now.getTime() - 20 * 60_000),
    endsAt: new Date(now.getTime() + 70 * 60_000),
    joinedAt: new Date(now.getTime() - 15 * 60_000),
  });
  const completedSeed = await makeBooking({
    status: "attended",
    startsAt: new Date(now.getTime() - 120 * 60_000),
    endsAt: new Date(now.getTime() - 30 * 60_000),
    joinedAt: new Date(now.getTime() - 110 * 60_000),
    withPublishedJourney: true,
  });
  const noShowSeed = await makeBooking({
    status: "confirmed",
    startsAt: new Date(now.getTime() - 120 * 60_000),
    endsAt: new Date(now.getTime() - 30 * 60_000),
    joinedAt: null,
    withPublishedJourney: true,
  });
  const expiredSeed = await makeBooking({
    status: "booked",
    startsAt: new Date(now.getTime() - 120 * 60_000),
    endsAt: new Date(now.getTime() - 30 * 60_000),
    joinedAt: null,
    withPublishedJourney: false,
  });

  const firstSweep = await sweepShortLearningBookingLifecycle({ now });
  const secondSweep = await sweepShortLearningBookingLifecycle({ now });

  const [activeAfter, attendedAfter, completedAfter, noShowAfter, expiredAfter] = await Promise.all([
    prisma.studentLearningBooking.findUnique({ where: { id: activeBooking.id } }),
    prisma.studentLearningBooking.findUnique({ where: { id: attendedSeed.id } }),
    prisma.studentLearningBooking.findUnique({ where: { id: completedSeed.id } }),
    prisma.studentLearningBooking.findUnique({ where: { id: noShowSeed.id } }),
    prisma.studentLearningBooking.findUnique({ where: { id: expiredSeed.id } }),
  ]);

  record("active window promotes booked → confirmed", activeAfter?.status === "confirmed", `status=${activeAfter?.status}`);
  record("joined booking syncs to attended", attendedAfter?.status === "attended", `status=${attendedAfter?.status}`);
  record(
    "ended joined booking completes",
    completedAfter?.status === "completed" && Boolean(completedAfter.completedAt),
    `status=${completedAfter?.status}`,
  );
  record(
    "ended playable no-join becomes no_show",
    noShowAfter?.status === "no_show" && Boolean(noShowAfter.noShowAt),
    `status=${noShowAfter?.status}`,
  );
  record("ended unplayable no-join becomes expired", expiredAfter?.status === "expired", `status=${expiredAfter?.status}`);
  record(
    "lifecycle sweep is idempotent",
    secondSweep.activated === 0
      && secondSweep.attended === 0
      && secondSweep.completed === 0
      && secondSweep.noShow === 0
      && secondSweep.expired === 0,
    JSON.stringify(secondSweep),
  );
  record(
    "no_show writes no fee fields",
    noShowAfter?.cancellationCategory == null
      && !String(noShowAfter?.metadataJson ?? "").toLowerCase().includes("fee"),
    `cancellationCategory=${noShowAfter?.cancellationCategory ?? "null"}`,
  );

  const journeyStillPublished = completedSeed.journeyId
    ? await prisma.shortLearningJourney.findUnique({
        where: { id: completedSeed.journeyId },
        select: { status: true },
      })
    : null;
  record(
    "booking completion leaves published journey unchanged",
    journeyStillPublished?.status === "published",
    `journeyStatus=${journeyStillPublished?.status ?? "none"}`,
  );

  const audits = await prisma.schoolAuditLog.findMany({
    where: {
      schoolId: school.id,
      action: {
        in: [
          "short_learning_booking_active",
          "short_learning_booking_attended",
          "short_learning_booking_completed",
          "short_learning_booking_no_show",
          "short_learning_booking_expired",
        ],
      },
      entityId: { in: cleanupBookingIds },
    },
    select: { id: true, action: true, entityId: true },
    orderBy: { createdAt: "asc" },
  });
  record(
    "automatic lifecycle audits recorded",
    audits.length >= 5
      && audits.some((a) => a.action === "short_learning_booking_active")
      && audits.some((a) => a.action === "short_learning_booking_completed")
      && audits.some((a) => a.action === "short_learning_booking_no_show")
      && audits.some((a) => a.action === "short_learning_booking_expired"),
    `count=${audits.length}`,
  );
  console.log("AUDIT_IDS", JSON.stringify(audits));
  console.log("FIRST_SWEEP", JSON.stringify(firstSweep));

  // Cleanup additive fixtures (bookings/presence/teacher only — no schema resets).
  await prisma.shortLearningSession.deleteMany({ where: { bookingId: { in: cleanupBookingIds } } });
  await prisma.studentLearningBooking.deleteMany({ where: { id: { in: cleanupBookingIds } } });
  await prisma.shortLearningJourney.deleteMany({
    where: { schoolId: school.id, topic: `Gate1D ${stamp}` },
  });
  await prisma.tutorPresence.deleteMany({ where: { id: { in: cleanupPresenceIds } } });
  await prisma.schoolTeacher.deleteMany({ where: { id: schoolTeacher.id } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupTeacherIds } } });

  const failed = checks.filter((c) => !c.ok);
  console.log(`\nGate 1D UAT: ${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
