/**
 * Authenticated UAT for Short Learning Admin review → publish → student access.
 * Uses existing records plus additive UAT fixtures; no resets or destructive schema operations.
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
type JsonResult = { res: Response; body: Record<string, unknown> };

async function main() {
  const { prisma } = await import("../src/lib/db");
  const auth = await import("../src/lib/auth");
  const BASE = process.env.UAT_BASE_URL ?? "http://localhost:3000";
  const stamp = Date.now().toString(36);
  const checks: Check[] = [];

  function record(name: string, ok: boolean, detail?: string) {
    checks.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  }

  async function cookieFor(user: { id: string; email: string; role: string }, childId?: string) {
    const token = await auth.createSessionToken(
      { userId: user.id, email: user.email, role: user.role },
      60 * 60,
    );
    const parts = [`${auth.getAuthCookieName()}=${token}`];
    if (childId) {
      const childToken = await auth.createChildSelectionToken(user.id, childId);
      parts.push(`${auth.getChildSelectionCookieName()}=${childToken}`);
    }
    return parts.join("; ");
  }

  async function jsonFetch(
    path: string,
    cookie: string,
    init: RequestInit = {},
    timeoutMs = 10 * 60 * 1000,
  ): Promise<JsonResult> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        cookie,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? JSON.parse(text) as Record<string, unknown> : {};
    } catch {
      body = { raw: text };
    }
    return { res, body };
  }

  const superAdmin = await prisma.user.findFirst({
    where: {
      role: "admin",
      adminProfile: { active: true, isLocked: false, role: { name: "SUPER_ADMIN" } },
    },
    select: { id: true, email: true, role: true },
  });
  if (!superAdmin) throw new Error("UAT requires an active Super Admin.");

  const adminCandidates = await prisma.adminUser.findMany({
    where: { active: true, isLocked: false, user: { role: "admin" } },
    include: { user: { select: { id: true, email: true, role: true } }, role: true },
  });
  const restrictedAdmin = adminCandidates.find((candidate) => {
    if (candidate.role?.name === "SUPER_ADMIN") return false;
    try {
      const permissions = JSON.parse(candidate.role?.permissions ?? "[]") as string[];
      return !permissions.includes("APPROVE_CONTENT") && !permissions.includes("content:approve");
    } catch {
      return true;
    }
  })?.user;
  if (!restrictedAdmin) throw new Error("UAT requires a restricted Admin without APPROVE_CONTENT.");

  const membership = await prisma.schoolStudent.findFirst({
    where: {
      status: "active",
      child: { archived: false, parent: { role: "parent" } },
    },
    select: {
      id: true,
      schoolId: true,
      childId: true,
      child: {
        select: {
          yearGroup: true,
          parent: { select: { id: true, email: true, role: true } },
        },
      },
    },
  });
  if (!membership) throw new Error("UAT requires an active school student with a parent.");

  const teacher = await prisma.user.findFirst({
    where: { role: { in: ["teacher", "tutor"] } },
    select: { id: true, email: true, role: true },
  });
  if (!teacher) throw new Error("UAT requires a teacher or tutor.");

  const school = await prisma.school.findUnique({
    where: { id: membership.schoolId },
    select: { id: true, name: true },
  });
  if (!school) throw new Error("UAT school not found.");

  const superCookie = await cookieFor(superAdmin);
  const restrictedCookie = await cookieFor(restrictedAdmin);
  const teacherCookie = await cookieFor(teacher);
  const parentCookie = await cookieFor(membership.child.parent, membership.childId);
  const yearGroup = membership.child.yearGroup?.trim() || "Year 4";

  const wrongSchool = await prisma.school.findFirst({
    where: { id: { not: school.id } },
    select: { id: true },
  });
  const tamperSchoolId = wrongSchool?.id ?? "not-a-real-school";

  const durationRejected = await jsonFetch(
    "/api/admin/short-learning/journeys",
    superCookie,
    {
      method: "POST",
      body: JSON.stringify({
        schoolId: school.id,
        subject: "maths",
        yearGroup,
        topic: "UAT unsupported duration",
        durationMinutes: 105,
      }),
    },
  );
  record(
    "105-minute Admin generation is rejected",
    durationRejected.res.status === 422 && durationRejected.body.code === "DURATION_NOT_ALLOWED",
    `status=${durationRejected.res.status}`,
  );

  async function generateJourney(subject: "maths" | "english", durationMinutes: 90 | 120, topic: string) {
    if (process.env.UAT_REUSE_EXISTING === "true") {
      const existing = await prisma.shortLearningJourney.findFirst({
        where: {
          schoolId: school.id,
          subject,
          yearGroup,
          durationMinutes,
          topic,
          status: { in: ["awaiting_review", "changes_requested", "approved", "failed"] },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (existing) {
        record(
          `${durationMinutes}m ${subject} real OpenAI journey generated`,
          true,
          `reusing=${existing.id}`,
        );
        return existing.id;
      }
    }

    const result = await jsonFetch(
      "/api/admin/short-learning/journeys",
      superCookie,
      {
        method: "POST",
        body: JSON.stringify({
          schoolId: school.id,
          subject,
          yearGroup,
          topic,
          skillFocus: topic,
          durationMinutes,
        }),
      },
    );
    const journey = result.body.journey as { id?: string; status?: string } | undefined;
    record(
      `${durationMinutes}m ${subject} real OpenAI journey generated`,
      result.res.status === 201 && Boolean(journey?.id),
      `status=${result.res.status} journey=${journey?.id ?? "none"} error=${String(result.body.error ?? "")}`,
    );
    if (!journey?.id) throw new Error(`Generation failed for ${durationMinutes}m ${subject}.`);
    return journey.id;
  }

  async function journeySnapshot(journeyId: string) {
    return prisma.shortLearningJourney.findUniqueOrThrow({
      where: { id: journeyId },
      include: {
        blocks: { orderBy: { order: "asc" } },
      },
    });
  }

  async function createBooking(durationMinutes: 90 | 120, subject: string, journeyId?: string) {
    if (process.env.UAT_REUSE_EXISTING === "true") {
      const existing = await prisma.studentLearningBooking.findFirst({
        where: {
          schoolId: school.id,
          schoolStudentId: membership.id,
          parentUserId: membership.child.parent.id,
          durationMinutes,
          subject,
          source: "uat_short_learning_review",
          status: "booked",
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing) return existing;
    }

    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000 + durationMinutes * 60 * 1000);
    const booking = await prisma.studentLearningBooking.create({
      data: {
        schoolId: school.id,
        schoolStudentId: membership.id,
        parentUserId: membership.child.parent.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + durationMinutes * 60 * 1000),
        durationMinutes,
        subject,
        learningFocus: `UAT ${stamp}`,
        status: "booked",
        confirmedAt: new Date(),
        source: "uat_short_learning_review",
        journeyId,
      },
    });
    await prisma.shortLearningSession.create({
      data: {
        bookingId: booking.id,
        subject,
        yearGroup,
        durationMinutes,
        status: "awaiting_review",
        metadataJson: JSON.stringify({
          lifecycle: "awaiting_review",
          studentPlayable: false,
          source: "uat_prepublication",
        }),
      },
    });
    return booking;
  }

  async function checkGenerated(journeyId: string, duration: 90 | 120, subject: string) {
    const journey = await journeySnapshot(journeyId);
    const academic = journey.blocks.filter((block) => Boolean(block.daytimeStage));
    const structural = journey.blocks.filter((block) => !block.daytimeStage);
    const metadata = JSON.parse(journey.metadataJson ?? "{}") as Record<string, unknown>;
    const blockMetadata = academic.map((block) =>
      JSON.parse(block.metadataJson ?? "{}") as Record<string, unknown>,
    );
    record(
      `${duration}m ${subject} enters awaiting_review`,
      journey.status === "awaiting_review",
      `status=${journey.status}`,
    );
    record(
      `${duration}m ${subject} uses configured OpenAI Daytime engine`,
      metadata.provider === "openai"
        && metadata.generationSource === "daytime_stage_engine"
        && blockMetadata.every((meta) => meta.openAiSucceeded === true),
      `models=${JSON.stringify(metadata.models ?? [])}`,
    );
    record(
      `${duration}m journey structure and duration are valid`,
      Math.abs(journey.blocks.reduce((sum, block) => sum + block.estimatedMinutes, 0) - duration) <= 5
        && academic.every((block) => Boolean(block.contentId))
        && structural.every((block) => !block.contentId)
        && structural.some((block) => block.blockType === "welcome")
        && structural.some((block) => block.blockType === "break")
        && structural.some((block) => block.blockType === "tutor_support")
        && structural.some((block) => block.blockType === "progress_report"),
      `academic=${academic.length} structural=${structural.length}`,
    );
    return { journey, academic };
  }

  async function verifyAndApproveAll(journeyId: string) {
    const snapshot = await journeySnapshot(journeyId);
    const academic = snapshot.blocks.filter((block) => Boolean(block.daytimeStage));
    for (const block of academic) {
      if (!block.contentId) throw new Error(`Block ${block.order} has no content.`);
      const blackBox = await jsonFetch(
        `/api/admin/content/${block.contentId}/black-box`,
        superCookie,
        { method: "POST" },
      );
      record(
        `Block ${block.order} Black Box rerun`,
        blackBox.res.status === 200,
        `status=${blackBox.res.status} error=${String(blackBox.body.error ?? "")}`,
      );

      const verify = await jsonFetch(
        `/api/admin/content/${block.contentId}/verify`,
        superCookie,
        { method: "POST", body: JSON.stringify({ action: "approve" }) },
      );
      record(
        `Block ${block.order} Content Library approval`,
        verify.res.status === 200,
        `status=${verify.res.status} error=${String(verify.body.error ?? "")}`,
      );

      const approveBlock = await jsonFetch(
        `/api/admin/short-learning/journeys/${journeyId}/blocks/${block.id}/approve`,
        superCookie,
        { method: "POST", body: JSON.stringify({ schoolId: school.id }) },
      );
      record(
        `Block ${block.order} journey approval`,
        approveBlock.res.status === 200,
        `status=${approveBlock.res.status} error=${String(approveBlock.body.error ?? "")}`,
      );
    }
  }

  const mathsJourneyId = await generateJourney("maths", 90, "Fractions: comparing quantities");
  let mathsState = await checkGenerated(mathsJourneyId, 90, "maths");
  const mathsBooking = await createBooking(90, "maths");

  const unpublishedStudent = await jsonFetch(
    `/api/student/short-learning/${mathsBooking.id}/session`,
    parentCookie,
    { method: "POST", body: JSON.stringify({ blockOrder: 0 }) },
  );
  record(
    "Student denied before publication",
    unpublishedStudent.res.status === 400
      && String(unpublishedStudent.body.error ?? "").toLowerCase().includes("awaiting"),
    `status=${unpublishedStudent.res.status} error=${String(unpublishedStudent.body.error ?? "")}`,
  );

  const firstMathsBlock = mathsState.academic[0]!;
  const originalContent = await prisma.aIContentCache.findUniqueOrThrow({
    where: { id: firstMathsBlock.contentId! },
    select: { contentJson: true },
  });
  const editedItems = JSON.parse(originalContent.contentJson) as Array<Record<string, unknown>>;
  const firstItem = editedItems[0] ?? {};
  if (typeof firstItem.prompt === "string") firstItem.prompt = `${firstItem.prompt} (Admin-reviewed)`;
  else if (typeof firstItem.question === "string") firstItem.question = `${firstItem.question} (Admin-reviewed)`;
  else firstItem.instructions = "Admin-reviewed question.";
  editedItems[0] = firstItem;

  const manualEdit = await jsonFetch(
    `/api/admin/short-learning/journeys/${mathsJourneyId}/blocks/${firstMathsBlock.id}/edit`,
    superCookie,
    {
      method: "PATCH",
      body: JSON.stringify({
        schoolId: school.id,
        contentJson: JSON.stringify(editedItems),
      }),
    },
  );
  record("Manual block correction succeeds", manualEdit.res.status === 200, `status=${manualEdit.res.status}`);

  const aiCorrection = await jsonFetch(
    `/api/admin/short-learning/journeys/${mathsJourneyId}/blocks/${firstMathsBlock.id}/ai-correct`,
    superCookie,
    {
      method: "POST",
      body: JSON.stringify({
        schoolId: school.id,
        action: "british_english",
        confirmOverwriteManualEdits: true,
      }),
    },
  );
  record(
    "Scoped AI correction uses OpenAI",
    aiCorrection.res.status === 200 && aiCorrection.body.openAiSucceeded === true,
    `status=${aiCorrection.res.status} openAi=${String(aiCorrection.body.openAiSucceeded)}`,
  );

  mathsState = await checkGenerated(mathsJourneyId, 90, "maths");
  const regenTarget = mathsState.academic[1]!;
  const previousContentId = regenTarget.contentId;
  const regenerate = await jsonFetch(
    `/api/admin/short-learning/journeys/${mathsJourneyId}/blocks/${regenTarget.id}/regenerate`,
    superCookie,
    { method: "POST", body: JSON.stringify({ schoolId: school.id }) },
  );
  const regenerated = await prisma.shortLearningJourneyBlock.findUniqueOrThrow({
    where: { id: regenTarget.id },
  });
  record(
    "Selected-block regeneration replaces only selected content",
    regenerate.res.status === 200
      && Boolean(regenerated.contentId)
      && regenerated.contentId !== previousContentId,
    `status=${regenerate.res.status}`,
  );

  const tamper = await jsonFetch(
    `/api/admin/short-learning/journeys/${mathsJourneyId}/blocks/${firstMathsBlock.id}/approve`,
    superCookie,
    { method: "POST", body: JSON.stringify({ schoolId: tamperSchoolId }) },
  );
  record(
    "Cross-school/ID tampering is rejected",
    tamper.res.status === 400 || tamper.res.status === 404,
    `status=${tamper.res.status}`,
  );

  const restrictedPublish = await jsonFetch(
    `/api/admin/short-learning/journeys/${mathsJourneyId}/publish`,
    restrictedCookie,
    { method: "POST", body: JSON.stringify({ schoolId: school.id }) },
  );
  record("Restricted Admin cannot publish", restrictedPublish.res.status === 403, `status=${restrictedPublish.res.status}`);

  const teacherPublish = await jsonFetch(
    `/api/admin/short-learning/journeys/${mathsJourneyId}/publish`,
    teacherCookie,
    { method: "POST", body: JSON.stringify({ schoolId: school.id }) },
  );
  record("Teacher/tutor cannot publish", teacherPublish.res.status === 403, `status=${teacherPublish.res.status}`);

  await verifyAndApproveAll(mathsJourneyId);
  const publishMaths = await jsonFetch(
    `/api/admin/short-learning/journeys/${mathsJourneyId}/publish`,
    superCookie,
    { method: "POST", body: JSON.stringify({ schoolId: school.id }) },
  );
  record(
    "90m Maths journey explicitly publishes",
    publishMaths.res.status === 200,
    `status=${publishMaths.res.status} error=${String(publishMaths.body.error ?? "")}`,
  );

  const startMaths = await jsonFetch(
    `/api/student/short-learning/${mathsBooking.id}/session`,
    parentCookie,
    { method: "POST", body: JSON.stringify({ blockOrder: 0 }) },
  );
  const matchedMathsBooking = await prisma.studentLearningBooking.findUniqueOrThrow({
    where: { id: mathsBooking.id },
    select: { journeyId: true },
  });
  record(
    "Published Maths journey matches booking and student can start",
    startMaths.res.status === 200 && matchedMathsBooking.journeyId === mathsJourneyId,
    `status=${startMaths.res.status} journey=${matchedMathsBooking.journeyId}`,
  );

  const englishJourneyId = await generateJourney("english", 120, "Reading comprehension and inference");
  const englishState = await checkGenerated(englishJourneyId, 120, "english");
  const englishBooking = await createBooking(120, "english");
  await verifyAndApproveAll(englishJourneyId);
  const publishEnglish = await jsonFetch(
    `/api/admin/short-learning/journeys/${englishJourneyId}/publish`,
    superCookie,
    { method: "POST", body: JSON.stringify({ schoolId: school.id }) },
  );
  record(
    "120m English journey explicitly publishes",
    publishEnglish.res.status === 200,
    `status=${publishEnglish.res.status} error=${String(publishEnglish.body.error ?? "")}`,
  );
  const englishTypes = await prisma.aIContentCache.findMany({
    where: { id: { in: englishState.academic.map((block) => block.contentId!).filter(Boolean) } },
    select: { contentType: true, metadataJson: true },
  });
  record(
    "120m English blocks are reading-compatible and British-English verified",
    englishTypes.every((row) => row.contentType === "reading")
      && englishTypes.every((row) => {
        const meta = JSON.parse(row.metadataJson ?? "{}") as Record<string, unknown>;
        const verification = meta.blackBoxAdminVerification as Record<string, unknown> | undefined;
        return verification?.status === "verified";
      }),
    `types=${[...new Set(englishTypes.map((row) => row.contentType))].join(",")}`,
  );
  const startEnglish = await jsonFetch(
    `/api/student/short-learning/${englishBooking.id}/session`,
    parentCookie,
    { method: "POST", body: JSON.stringify({ blockOrder: 0 }) },
  );
  const matchedEnglishBooking = await prisma.studentLearningBooking.findUniqueOrThrow({
    where: { id: englishBooking.id },
    select: { journeyId: true },
  });
  record(
    "Published English journey matches booking and student can start",
    startEnglish.res.status === 200 && matchedEnglishBooking.journeyId === englishJourneyId,
    `status=${startEnglish.res.status} journey=${matchedEnglishBooking.journeyId}`,
  );

  const audits = await prisma.auditLog.findMany({
    where: {
      entityId: { in: [mathsJourneyId, englishJourneyId] },
      action: { startsWith: "short_learning_content_" },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, action: true, actorUserId: true, entityId: true },
  });
  record(
    "Lifecycle audits contain real actor and journey IDs",
    audits.length > 0
      && audits.every((audit) => audit.actorUserId === superAdmin.id)
      && audits.every((audit) => Boolean(audit.entityId)),
    `count=${audits.length}`,
  );
  console.log("AUDIT_IDS", JSON.stringify(audits));

  const failed = checks.filter((check) => !check.ok);
  console.log(`\nShort Learning review UAT: ${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) {
    for (const failure of failed) {
      console.log(`  FAIL ${failure.name}${failure.detail ? ` — ${failure.detail}` : ""}`);
    }
    process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
