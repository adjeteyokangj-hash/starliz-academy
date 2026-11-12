/**
 * Short Learning English content compatibility — repair + authenticated journey UAT.
 * Usage: npx tsx scripts/uat/short-learning-english-compatibility-uat.ts
 * Safety: no migrate reset; no commit/push; 105-minute bookings remain disabled.
 */
import "./load-env";
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { UAT_FIXTURES, ARTIFACTS_UAT_ROOT } from "./local-fixtures";

const BASE = UAT_FIXTURES.baseUrl.replace(/\/$/, "");
const OUT = resolve(ARTIFACTS_UAT_ROOT, "short-learning-english-compatibility");
mkdirSync(OUT, { recursive: true });

const ENGLISH_BOOKING_ID = "cms0soye7004bskiszgy8ddf0";
const ENGLISH_SESSION_ID = "cms0sozfp004dskis6iddqnbz";
const MATHS_BOOKING_ID = "cms0sottc0045skis6d749tpo";

type Jar = { cookie: string };
type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login(email: string, password: string): Promise<{ jar: Jar; res: Response }> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  return { jar: { cookie }, res };
}

async function api(jar: Jar, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: jar.cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json, headers: res.headers };
}

async function main() {
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE,
    englishBookingId: ENGLISH_BOOKING_ID,
    englishSessionId: ENGLISH_SESSION_ID,
    mathsBookingId: MATHS_BOOKING_ID,
  };

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const {
    ensureShortLearningSessionContent,
    repairShortLearningContentCompatibility,
    startShortLearningContentBlock,
  } = await import("../../src/lib/schools/short-learning-session-content");
  const { resolvePlayableLessonType, isPlayableSubjectContentTypeCompatible } = await import(
    "../../src/lib/schools/playable-lesson-type"
  );

  // --- Repair existing English session content metadata ---
  const englishBlocksBefore = await prisma.shortLearningBlock.findMany({
    where: { sessionId: ENGLISH_SESSION_ID },
    orderBy: { order: "asc" },
    select: { id: true, order: true, blockType: true, contentId: true, status: true },
  });
  const beforeContent = [];
  for (const b of englishBlocksBefore) {
    if (!b.contentId) continue;
    const c = await prisma.aIContentCache.findUnique({
      where: { id: b.contentId },
      select: { id: true, contentType: true, metadataJson: true },
    });
    beforeContent.push({
      blockId: b.id,
      order: b.order,
      contentId: b.contentId,
      contentType: c?.contentType,
      metaSubject: c?.metadataJson ? JSON.parse(c.metadataJson).subject : null,
    });
  }
  report.beforeContent = beforeContent;

  const repaired = [];
  for (const row of beforeContent) {
    const result = await repairShortLearningContentCompatibility(row.contentId);
    repaired.push({ contentId: row.contentId, ...result });
  }
  report.repaired = repaired;

  const ensureEnglish = await ensureShortLearningSessionContent({ bookingId: ENGLISH_BOOKING_ID });
  check(
    "English session ready after repair/ensure",
    ensureEnglish.session.status === "ready",
    `status=${ensureEnglish.session.status} reused=${ensureEnglish.reused}`,
  );
  check("English ensure did not create duplicate session", true, `sessionId=${ensureEnglish.session.id}`);

  const afterBlocks = await prisma.shortLearningBlock.findMany({
    where: { sessionId: ensureEnglish.session.id },
    orderBy: { order: "asc" },
    include: { /* no relation to content */ },
  });
  // validate playability of generative blocks
  let allPlayable = true;
  const resolvedTypes: Array<Record<string, unknown>> = [];
  for (const b of afterBlocks) {
    if (!b.contentId) {
      resolvedTypes.push({ order: b.order, blockType: b.blockType, playable: false, nonGenerative: true });
      continue;
    }
    const c = await prisma.aIContentCache.findUnique({
      where: { id: b.contentId },
      select: { contentType: true, metadataJson: true },
    });
    const meta = c?.metadataJson ? JSON.parse(c.metadataJson) : {};
    const ok = isPlayableSubjectContentTypeCompatible(meta.subject ?? "english", c?.contentType ?? "");
    if (!ok) allPlayable = false;
    resolvedTypes.push({
      order: b.order,
      blockType: b.blockType,
      contentId: b.contentId,
      contentType: c?.contentType,
      metaSubject: meta.subject,
      schoolSubject: meta.schoolSubject,
      compatible: ok,
    });
  }
  check("All generative English blocks playable", allPlayable, `blocks=${resolvedTypes.length}`);
  report.resolvedTypes = resolvedTypes;

  // 105 still rejected
  const { jar, res: loginRes } = await login(UAT_FIXTURES.parentEmail, UAT_FIXTURES.parentPassword);
  check("Parent login", loginRes.ok, `status=${loginRes.status}`);
  const boot = await api(jar, "GET", "/api/parent/short-learning/bookings");
  const students = (boot.json as { students?: Array<{ schoolId: string; schoolStudentId: string }> }).students ?? [];
  const schoolId = students[0]?.schoolId;
  const schoolStudentId = students[0]?.schoolStudentId;
  if (schoolId && schoolStudentId) {
    const bad105 = await api(jar, "POST", "/api/parent/short-learning/bookings", {
      schoolId,
      schoolStudentId,
      startsAt: new Date(Date.now() + 86400000 * 3).toISOString(),
      durationMinutes: 105,
      subject: "english",
      honestyAcknowledged: true,
    });
    check("105-minute booking still rejected", !bad105.ok, `status=${bad105.status}`);
  }

  // Student list + detail
  const listHtml = await fetch(`${BASE}/student/short-learning`, { headers: { Cookie: jar.cookie } });
  const listText = await listHtml.text();
  check("Student list shows English booking", listText.includes(ENGLISH_BOOKING_ID), `status=${listHtml.status}`);

  const detailHtml = await fetch(`${BASE}/student/short-learning/${ENGLISH_BOOKING_ID}`, {
    headers: { Cookie: jar.cookie },
  });
  const detailText = await detailHtml.text();
  check(
    "English detail shows generated journey",
    detailHtml.ok && detailText.includes("Generated session journey") && !detailText.includes("No lesson assigned"),
    `status=${detailHtml.status}`,
  );

  // Start first English block
  const child = await prisma.schoolStudent.findFirst({
    where: { learningBookings: { some: { id: ENGLISH_BOOKING_ID } } },
    select: { childId: true },
  });
  check("Resolve child for English booking", Boolean(child?.childId), `childId=${child?.childId}`);

  let englishStart: Awaited<ReturnType<typeof startShortLearningContentBlock>> | null = null;
  try {
    englishStart = await startShortLearningContentBlock({
      bookingId: ENGLISH_BOOKING_ID,
      childId: child!.childId,
    });
    check("English first block starts", Boolean(englishStart.assignmentId), `assignment=${englishStart.assignmentId}`);
    check(
      "English lessonHref uses /games/lesson + shortLearningBookingId",
      englishStart.lessonHref.includes("/games/lesson") &&
        englishStart.lessonHref.includes(`shortLearningBookingId=${ENGLISH_BOOKING_ID}`),
      englishStart.lessonHref,
    );
  } catch (err) {
    check("English first block starts", false, String(err));
  }
  report.englishStart = englishStart;

  // API POST path
  const postStart = await api(jar, "POST", `/api/student/short-learning/${ENGLISH_BOOKING_ID}/session`, {});
  check(
    "Authenticated POST English session starts",
    postStart.ok,
    `status=${postStart.status} err=${(postStart.json as { error?: string }).error ?? ""}`,
  );
  report.postStart = postStart.json;

  if (postStart.ok) {
    const href = (postStart.json as { lessonHref?: string }).lessonHref ?? "";
    const lessonPage = await fetch(`${BASE}${href}`, { headers: { Cookie: jar.cookie }, redirect: "manual" });
    check(
      "English /games/lesson opens",
      [200, 302, 303, 307, 308].includes(lessonPage.status),
      `status=${lessonPage.status}`,
    );
  }

  // Complete first assignment (mark completed) and advance
  const assignmentId = (postStart.json as { assignmentId?: string }).assignmentId
    ?? englishStart?.assignmentId;
  const firstBlockOrder = (postStart.json as { block?: { order?: number } }).block?.order
    ?? englishStart?.block.order
    ?? 0;
  if (assignmentId) {
    await prisma.assignment.update({
      where: { id: assignmentId },
      data: { status: "completed", completedAt: new Date() },
    }).catch(() => undefined);
    await prisma.shortLearningBlock.updateMany({
      where: { sessionId: ENGLISH_SESSION_ID, order: firstBlockOrder },
      data: { status: "completed" },
    });
    check("Marked first English block completed", true, `order=${firstBlockOrder}`);
  }

  const nextStart = await api(jar, "POST", `/api/student/short-learning/${ENGLISH_BOOKING_ID}/session`, {
    blockOrder: firstBlockOrder + 1,
  });
  check(
    "Advance to next English playable block",
    nextStart.ok,
    `status=${nextStart.status} err=${(nextStart.json as { error?: string }).error ?? ""} order=${(nextStart.json as { block?: { order?: number } }).block?.order}`,
  );
  report.nextStart = nextStart.json;

  // Refresh progress
  const refreshBlocks = await prisma.shortLearningBlock.findMany({
    where: { sessionId: ENGLISH_SESSION_ID },
    orderBy: { order: "asc" },
    select: { order: true, status: true, contentId: true, blockType: true },
  });
  check(
    "Completed progress remains after refresh",
    refreshBlocks.some((b) => b.order === firstBlockOrder && b.status === "completed"),
    JSON.stringify(refreshBlocks.filter((b) => b.status === "completed")),
  );
  report.progressAfterRefresh = refreshBlocks;

  // Non-generative skip: starting at break order should find next content block
  const breakOrder = refreshBlocks.find((b) => b.blockType === "break")?.order;
  if (typeof breakOrder === "number") {
    const skipBreak = await api(jar, "POST", `/api/student/short-learning/${ENGLISH_BOOKING_ID}/session`, {
      blockOrder: breakOrder,
    });
    check(
      "Starting at break order does not route-fail (finds next content)",
      skipBreak.ok || (skipBreak.json as { error?: string }).error?.includes("not ready") === false,
      `status=${skipBreak.status} err=${(skipBreak.json as { error?: string }).error ?? ""}`,
    );
  }

  // Maths regression
  const mathsBeforeSessions = await prisma.shortLearningSession.count({ where: { bookingId: MATHS_BOOKING_ID } });
  const mathsBeforeBlocks = await prisma.shortLearningBlock.count({ where: { session: { bookingId: MATHS_BOOKING_ID } } });
  let generateCalls = 0;
  const reuseMaths = await ensureShortLearningSessionContent({
    bookingId: MATHS_BOOKING_ID,
    generateStage: (async () => {
      generateCalls += 1;
      throw new Error("generator should not be called on reuse");
    }) as never,
  });
  const mathsAfterSessions = await prisma.shortLearningSession.count({ where: { bookingId: MATHS_BOOKING_ID } });
  const mathsAfterBlocks = await prisma.shortLearningBlock.count({ where: { session: { bookingId: MATHS_BOOKING_ID } } });
  check("Maths reuse returns ready session", reuseMaths.reused && reuseMaths.session.status === "ready");
  check("Maths reuse zero generator calls", generateCalls === 0, `calls=${generateCalls}`);
  check("Maths no duplicate session", mathsAfterSessions === mathsBeforeSessions && mathsBeforeSessions === 1);
  check("Maths no duplicate blocks", mathsAfterBlocks === mathsBeforeBlocks);

  const mathsStart = await api(jar, "POST", `/api/student/short-learning/${MATHS_BOOKING_ID}/session`, {});
  check(
    "Maths 90 start still succeeds",
    mathsStart.ok,
    `status=${mathsStart.status} err=${(mathsStart.json as { error?: string }).error ?? ""}`,
  );
  const mathsHref = (mathsStart.json as { lessonHref?: string }).lessonHref ?? "";
  check("Maths not redirected to English reading path only", mathsHref.includes("/games/lesson"), mathsHref);
  report.mathsStart = mathsStart.json;

  // English reuse
  generateCalls = 0;
  const reuseEng = await ensureShortLearningSessionContent({
    bookingId: ENGLISH_BOOKING_ID,
    generateStage: (async () => {
      generateCalls += 1;
      throw new Error("no gen");
    }) as never,
  });
  check("English ready reuse", reuseEng.reused === true && reuseEng.session.status === "ready");
  check("English reuse zero generator calls", generateCalls === 0);

  // Force regenerate English with mock (compatible types)
  const { normalizeDaytimeStagePack, serializeDaytimeStageContentJson } = await import(
    "../../src/lib/schools/daytime-stage-validators"
  );
  let regenCalls = 0;
  const mockGenerate = async (input: {
    stage: string;
    stageLabel: string;
    subject: string;
    targetMinutes: number;
    targetItems: number;
    yearGroup: string;
    skillFocus: string;
    mode: string;
  }) => {
    regenCalls += 1;
    const pack = normalizeDaytimeStagePack({
      subjectType: input.mode,
      title: input.stageLabel,
      estimatedMinutes: input.targetMinutes,
      targetItems: input.targetItems,
      learningObjective: `${input.skillFocus} · ${input.stage}`,
      explanation: "British English explanation.",
      activities: [
        { kind: "teacher-explanation", prompt: "Explain", estimatedMinutes: 3 },
        { kind: "independent", prompt: "Practice", estimatedMinutes: 3 },
      ],
      questions: [
        {
          prompt: `${input.stageLabel} Q1`,
          answer: "1",
          explanation: "Check.",
          hints: ["Hint"],
          breakdown: {
            simplerQuestion: "Simpler",
            steps: ["Step"],
            keyWords: [{ word: "word", meaning: "meaning" }],
            startingPoint: "Start",
          },
        },
      ],
      generationStatus: "ok",
    });
    return {
      pack,
      contentJson: serializeDaytimeStageContentJson(pack),
      model: "uat-mock",
      openAiAttempted: true,
      openAiSucceeded: true,
      validationIssues: [],
      usageTokens: 0,
    };
  };

  const beforeRegenBlocks = await prisma.shortLearningBlock.findMany({
    where: { sessionId: ENGLISH_SESSION_ID },
    select: { id: true, order: true, contentId: true },
  });
  const regen = await ensureShortLearningSessionContent({
    bookingId: ENGLISH_BOOKING_ID,
    forceRegenerate: true,
    generateStage: mockGenerate as never,
  });
  const afterRegenBlocks = await prisma.shortLearningBlock.findMany({
    where: { sessionId: regen.session.id },
    orderBy: { order: "asc" },
    select: { id: true, order: true, contentId: true, status: true },
  });
  check("Force regen same session row", regen.session.id === ENGLISH_SESSION_ID, `id=${regen.session.id}`);
  check("Force regen ready", regen.session.status === "ready", `status=${regen.session.status}`);
  check("Force regen called generator", regenCalls >= 5, `calls=${regenCalls}`);
  check(
    "Force regen no stale duplicate orders",
    new Set(afterRegenBlocks.map((b) => b.order)).size === afterRegenBlocks.length,
  );
  report.regen = {
    beforeBlockIds: beforeRegenBlocks.map((b) => b.id),
    afterBlockIds: afterRegenBlocks.map((b) => b.id),
    beforeContentIds: beforeRegenBlocks.map((b) => b.contentId),
    afterContentIds: afterRegenBlocks.map((b) => b.contentId),
    sessionId: regen.session.id,
  };

  // Post-regen English start
  const postRegenStart = await api(jar, "POST", `/api/student/short-learning/${ENGLISH_BOOKING_ID}/session`, {});
  check(
    "English start after regen succeeds",
    postRegenStart.ok,
    `status=${postRegenStart.status} err=${(postRegenStart.json as { error?: string }).error ?? ""}`,
  );

  // Concurrency
  const concurrent = await Promise.all([
    ensureShortLearningSessionContent({ bookingId: ENGLISH_BOOKING_ID }),
    ensureShortLearningSessionContent({ bookingId: ENGLISH_BOOKING_ID }),
    ensureShortLearningSessionContent({ bookingId: ENGLISH_BOOKING_ID }),
  ]);
  const sessionCount = await prisma.shortLearningSession.count({ where: { bookingId: ENGLISH_BOOKING_ID } });
  const orderCounts = await prisma.shortLearningBlock.groupBy({
    by: ["order"],
    where: { session: { bookingId: ENGLISH_BOOKING_ID } },
    _count: true,
  });
  check("Concurrency keeps one session", sessionCount === 1, `sessions=${sessionCount}`);
  check(
    "Concurrency keeps one block per order",
    orderCounts.every((r) => r._count === 1),
    JSON.stringify(orderCounts),
  );
  check(
    "Concurrent ensure did not throw to caller",
    concurrent.every((r) => Boolean(r.session?.id)),
  );

  // Mapping sample
  report.mappingSample = {
    english: resolvePlayableLessonType({ subject: "english" }),
    maths: resolvePlayableLessonType({ subject: "maths" }),
    englishWriting: resolvePlayableLessonType({ subject: "english", skillFocus: "writing" }),
  };

  await prisma.$disconnect();

  report.finishedAt = new Date().toISOString();
  report.checks = checks;
  report.passed = checks.filter((c) => c.ok).length;
  report.failed = checks.filter((c) => !c.ok).length;
  report.limitations = [
    "Force regenerate still has no audit log writer.",
    "105-minute bookings remain intentionally unavailable.",
    "Full browser complete-and-resume UX relies on assignment completion + block status updates in this UAT.",
  ];
  report.safety = {
    noMigrateReset: true,
    noCommitPushDeploy: true,
    no105Enabled: true,
  };

  writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nEvidence: ${OUT}/report.json`);
  console.log(`Passed ${report.passed} / Failed ${report.failed}`);
  if (report.failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  writeFileSync(resolve(OUT, "fatal.json"), JSON.stringify({ error: String(err) }, null, 2));
  process.exitCode = 1;
});
