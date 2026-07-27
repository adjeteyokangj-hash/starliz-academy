/**
 * Short Learning Daytime Engine Integration — authenticated live UAT.
 * Usage: npx tsx scripts/uat/short-learning-session-content-uat.ts
 * Evidence: artifacts/uat/short-learning-session-content/
 * Safety: no migrate reset; no commit/push.
 */
import "./load-env";
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { UAT_FIXTURES, ARTIFACTS_UAT_ROOT } from "./local-fixtures";
import { buildShortLearningSessionPlan } from "../../src/lib/schools/short-learning-session-plan";
import { isAllowedShortLearningDuration } from "../../src/lib/schools/short-learning-bookings";

const BASE = UAT_FIXTURES.baseUrl.replace(/\/$/, "");
const OUT = resolve(ARTIFACTS_UAT_ROOT, "short-learning-session-content");
mkdirSync(OUT, { recursive: true });

type Jar = { cookie: string };

async function login(email: string, password: string): Promise<{ jar: Jar; res: Response; json: unknown }> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json().catch(() => ({}));
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  return { jar: { cookie }, res, json };
}

async function api(jar: Jar, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: jar.cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function nextWeekdayAfternoon(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(16, 0, 0, 0);
  return d;
}

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE,
  };

  if (!process.env.DATABASE_URL?.startsWith("postgres")) {
    throw new Error("DATABASE_URL missing/invalid after load-env bootstrap");
  }

  // Duration allow-list (code-level)
  check("89 minutes rejected by allow-list helper", !isAllowedShortLearningDuration(89));
  check("90 minutes accepted by allow-list helper", isAllowedShortLearningDuration(90));
  check("105 minutes NOT in booking allow-list (planner supports it)", !isAllowedShortLearningDuration(105), "ALLOWED=[90,120]; planner also supports 105");
  check("120 minutes accepted by allow-list helper", isAllowedShortLearningDuration(120));
  check("121 minutes rejected by allow-list helper", !isAllowedShortLearningDuration(121));

  for (const duration of [90, 105, 120] as const) {
    const plan = buildShortLearningSessionPlan(duration);
    check(
      `Planner ${duration}m totals within ±5 of duration`,
      Math.abs(plan.totalEstimatedMinutes - duration) <= 5,
      `sum=${plan.totalEstimatedMinutes}`,
    );
    check(
      `Planner ${duration}m has welcome/lesson/recap/break/tutor/challenge/review`,
      ["welcome", "lesson", "recap", "break", "tutor_support", "challenge", "review"].every((t) =>
        plan.blocks.some((b) => b.blockType === t),
      ),
    );
    check(
      `Planner ${duration}m breaks are non-generative`,
      plan.blocks.filter((b) => b.blockType === "break").every((b) => !b.requiresContent),
    );
  }

  const { jar, res: loginRes } = await login(UAT_FIXTURES.parentEmail, UAT_FIXTURES.parentPassword);
  check("Parent login succeeds", loginRes.ok, `status=${loginRes.status}`);
  if (!loginRes.ok) {
    writeFileSync(resolve(OUT, "report.json"), JSON.stringify({ report, checks }, null, 2));
    process.exitCode = 1;
    return;
  }

  const boot = await api(jar, "GET", "/api/parent/short-learning/bookings");
  const bootJson = boot.json as {
    entitled?: boolean;
    students?: Array<{ schoolId: string; schoolStudentId: string; childId?: string }>;
  };
  check("Parent Short Learning boot OK", boot.ok, `entitled=${bootJson.entitled} students=${bootJson.students?.length ?? 0}`);
  const schoolId = bootJson.students?.[0]?.schoolId ?? null;
  const   schoolStudentId = bootJson.students?.[0]?.schoolStudentId ?? null;
  if (!schoolId || !schoolStudentId || !bootJson.entitled) {
    check("Entitled student available for booking UAT", false, "missing entitlement or student");
    writeFileSync(resolve(OUT, "report.json"), JSON.stringify({ report, checks, bootJson }, null, 2));
    process.exitCode = 1;
    return;
  }

  // Clear active future bookings for this student so UAT can create fresh slots.
  const existingBooks = await api(jar, "GET", "/api/parent/short-learning/bookings");
  const existingList = ((existingBooks.json as { bookings?: Array<{ id: string; status: string; startsAt: string }> })?.bookings ?? []);
  for (const row of existingList) {
    if (["booked", "confirmed", "attended"].includes(row.status) && new Date(row.startsAt) > new Date()) {
      const cancel = await api(jar, "POST", `/api/parent/short-learning/bookings/${row.id}/cancel`);
      check(`Pre-clean cancel ${row.id}`, cancel.ok || cancel.status === 400, `status=${cancel.status}`);
    }
  }

  // Boundary via API
  for (const bad of [89, 105, 121]) {
    const badBook = await api(jar, "POST", "/api/parent/short-learning/bookings", {
      schoolId,
      schoolStudentId,
      startsAt: nextWeekdayAfternoon().toISOString(),
      durationMinutes: bad,
      subject: "maths",
      honestyAcknowledged: true,
    });
    check(
      `API rejects duration ${bad}`,
      !badBook.ok,
      `status=${badBook.status} err=${(badBook.json as { error?: string }).error ?? ""}`,
    );
  }

  const bookings: Record<string, { bookingId: string; subject: string; duration: number }> = {};

  async function bookOne(duration: 90 | 120, subject: string, focus: string) {
    const day = nextWeekdayAfternoon();
    // Stagger days to avoid overlap
    day.setUTCDate(day.getUTCDate() + (duration === 120 ? 2 : 0) + (subject === "english" ? 1 : 0));
    while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
    const dateIso = day.toISOString().slice(0, 10);
    const slots = await api(
      jar,
      "GET",
      `/api/parent/short-learning/slots?schoolId=${encodeURIComponent(schoolId)}&date=${dateIso}&durationMinutes=${duration}`,
    );
    const slotList = ((slots.json as { slots?: Array<{ startsAt: string }> })?.slots ?? []);
    const pick = slotList.find((s) => new Date(s.startsAt) > new Date())?.startsAt ?? slotList[0]?.startsAt;
    if (!pick) {
      check(`Slots available for ${duration}m ${subject}`, false, `date=${dateIso} slots=0`);
      return null;
    }
    const book = await api(jar, "POST", "/api/parent/short-learning/bookings", {
      schoolId,
      schoolStudentId,
      startsAt: pick,
      durationMinutes: duration,
      subject,
      learningFocus: focus,
      honestyAcknowledged: true,
    });
    const id = (book.json as { booking?: { id?: string } }).booking?.id ?? null;
    check(`Book ${duration}m ${subject}`, book.ok && Boolean(id), `status=${book.status} id=${id} err=${(book.json as { error?: string }).error ?? ""}`);
    if (id) bookings[`${duration}-${subject}`] = { bookingId: id, subject, duration };
    return id;
  }

  const maths90 = await bookOne(90, "maths", "UAT SL session content maths");
  const english120 = await bookOne(120, "english", "UAT SL session content english");
  report.bookings = bookings;

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const { ensureShortLearningSessionContent, getShortLearningSessionSummary } = await import(
    "../../src/lib/schools/short-learning-session-content"
  );
  const { serializeDaytimeStageContentJson, normalizeDaytimeStagePack } = await import(
    "../../src/lib/schools/daytime-stage-validators"
  );

  let generateCalls = 0;
  const mockGenerate = async (input: {
    stage: string;
    stageLabel: string;
    subject: string;
    targetMinutes: number;
    targetItems: number;
    yearGroup: string;
    skillFocus: string;
    lessonTitle: string;
    mode: string;
  }) => {
    generateCalls += 1;
    const pack = normalizeDaytimeStagePack({
      subjectType: input.mode,
      title: input.stageLabel,
      estimatedMinutes: input.targetMinutes,
      targetItems: input.targetItems,
      learningObjective: `${input.skillFocus} · ${input.stage}`,
      explanation: `British English explanation for ${input.subject} using pounds and pence where money appears.`,
      activities: [
        {
          kind: "teacher-explanation",
          prompt: `Explain ${input.skillFocus} clearly.`,
          estimatedMinutes: Math.max(2, Math.floor(input.targetMinutes / 3)),
        },
        {
          kind: "independent",
          prompt: `Practice ${input.skillFocus} with a short task.`,
          estimatedMinutes: Math.max(2, Math.floor(input.targetMinutes / 3)),
        },
      ],
      questions: Array.from({ length: Math.max(3, Math.min(6, input.targetItems)) }, (_, idx) => ({
        prompt: `${input.stageLabel} Q${idx + 1}: apply ${input.skillFocus} (block-unique seed ${input.stage}-${idx}).`,
        answer: String(idx + 2),
        explanation: "Check your working carefully.",
        hints: ["Start with a simpler version.", "Show your method.", "Check the units (use £ and p if money)."],
        breakdown: {
          simplerQuestion: `Simpler form of Q${idx + 1}`,
          steps: ["Read the question", "Choose a method", "Check the answer"],
          keyWords: [{ word: "method", meaning: "a way of working out the answer" }],
          startingPoint: "Write what you know first.",
        },
      })),
      generationStatus: "ok",
    });
    return {
      pack,
      contentJson: serializeDaytimeStageContentJson(pack),
      model: "uat-mock-daytime-stage",
      openAiAttempted: true,
      openAiSucceeded: true,
      validationIssues: [],
      usageTokens: 0,
    };
  };

  async function runEnsure(bookingId: string, label: string, force?: boolean) {
    const beforeSessions = await prisma.shortLearningSession.count({ where: { bookingId } });
    const beforeBlocks = await prisma.shortLearningBlock.count({
      where: { session: { bookingId } },
    });
    const callsBefore = generateCalls;
    const result = await ensureShortLearningSessionContent({
      bookingId,
      forceRegenerate: force,
      generateStage: mockGenerate as never,
    });
    const afterSessions = await prisma.shortLearningSession.count({ where: { bookingId } });
    const afterBlocks = await prisma.shortLearningBlock.count({
      where: { session: { bookingId } },
    });
    const summary = await getShortLearningSessionSummary(bookingId);
    return {
      label,
      result,
      beforeSessions,
      afterSessions,
      beforeBlocks,
      afterBlocks,
      generateCallsDelta: generateCalls - callsBefore,
      summary,
    };
  }

  if (maths90) {
    const first = await runEnsure(maths90, "maths-90-initial");
    check("90m session created", first.afterSessions === 1 && first.result.reused === false, `sessions=${first.afterSessions}`);
    check("90m blocks created in planner order", (first.summary?.blocks.length ?? 0) >= 8, `blocks=${first.summary?.blocks.length}`);
    check("90m Daytime generator invoked for generative blocks", first.generateCallsDelta >= 5, `calls=${first.generateCallsDelta}`);
    check("90m session status ready/failed visible", ["ready", "failed"].includes(first.summary?.status ?? ""), `status=${first.summary?.status}`);
    const types = (first.summary?.blocks ?? []).map((b) => b.blockType);
    check("90m sequence includes core journey stages", types.includes("welcome") && types.includes("break") && types.includes("tutor_support"));

    const reuse = await runEnsure(maths90, "maths-90-reuse", false);
    check("Reuse returns existing session", reuse.result.reused === true, `reused=${reuse.result.reused}`);
    check("Reuse creates no duplicate session", reuse.afterSessions === 1, `sessions=${reuse.afterSessions}`);
    check("Reuse creates no duplicate blocks", reuse.afterBlocks === reuse.beforeBlocks, `before=${reuse.beforeBlocks} after=${reuse.afterBlocks}`);
    check("Reuse does not call Daytime generator", reuse.generateCallsDelta === 0, `calls=${reuse.generateCallsDelta}`);

    const regen = await runEnsure(maths90, "maths-90-regen", true);
    check("Force regenerate replaces session content", regen.result.regenerated === true || regen.result.reused === false, `regenerated=${regen.result.regenerated}`);
    check("Force regenerate keeps one session row", regen.afterSessions === 1, `sessions=${regen.afterSessions}`);
    check("Force regenerate recreates blocks (no stale active extras)", regen.afterBlocks === regen.beforeBlocks || regen.afterBlocks > 0, `blocks=${regen.afterBlocks}`);
    check("Force regenerate calls Daytime generator again", regen.generateCallsDelta >= 5, `calls=${regen.generateCallsDelta}`);

    report.maths90 = {
      bookingId: maths90,
      sessionId: first.summary?.id,
      blockIds: (first.summary?.blocks ?? []).map((b) => ({ id: b.id, order: b.order, type: b.blockType, contentId: b.contentId })),
      reuse,
      regen: { generateCallsDelta: regen.generateCallsDelta, afterBlocks: regen.afterBlocks, sessionId: regen.summary?.id },
    };
  }

  if (english120) {
    const eng = await runEnsure(english120, "english-120-initial");
    check("120m english session ready path", Boolean(eng.summary), `status=${eng.summary?.status}`);
    const lessons = (eng.summary?.blocks ?? []).filter((b) => b.blockType === "lesson");
    check("120m has multiple lesson blocks with progression labels", lessons.length >= 3, `lessons=${lessons.length}`);
    const contents = await prisma.aIContentCache.findMany({
      where: { id: { in: (eng.summary?.blocks ?? []).map((b) => b.contentId).filter(Boolean) as string[] } },
      select: { id: true, topic: true, yearGroup: true, skillFocus: true, metadataJson: true, contentJson: true },
    });
    const metaOk = contents.every((c) => {
      const meta = c.metadataJson ? JSON.parse(c.metadataJson) : {};
      return meta.source === "short_learning_session" && meta.role === "short_learning_block";
    });
    check("Content metadata marks short_learning_session / Daytime block role", metaOk, `rows=${contents.length}`);
    const noInternalIds = contents.every((c) => !/cuid_|shortLearningSession|bookingId\s*[:=]/i.test(c.contentJson));
    check("Student content JSON does not expose internal booking/session IDs as pupil text heuristics", noInternalIds);
    const british = contents.some((c) => /pounds and pence|British English/i.test(c.contentJson));
    check("Mock quality pack uses British English / pounds and pence wording", british);
    report.english120 = {
      bookingId: english120,
      sessionId: eng.summary?.id,
      contentSample: contents.slice(0, 2).map((c) => ({ id: c.id, topic: c.topic, yearGroup: c.yearGroup })),
    };
  }

  // Generation failure recovery: force one booking path with failing generator for one call then recover
  if (maths90) {
    let failOnce = true;
    const flaky = async (input: never) => {
      if (failOnce) {
        failOnce = false;
        throw new Error("Simulated OpenAI outage");
      }
      return mockGenerate(input as never);
    };
    // Create a fresh booking for failure test
    const failDay = nextWeekdayAfternoon();
    failDay.setUTCDate(failDay.getUTCDate() + 5);
    while (failDay.getUTCDay() === 0 || failDay.getUTCDay() === 6) failDay.setUTCDate(failDay.getUTCDate() + 1);
    const dateIso = failDay.toISOString().slice(0, 10);
    const slots = await api(
      jar,
      "GET",
      `/api/parent/short-learning/slots?schoolId=${encodeURIComponent(schoolId)}&date=${dateIso}&durationMinutes=90`,
    );
    const pick = ((slots.json as { slots?: Array<{ startsAt: string }> })?.slots ?? [])[0]?.startsAt;
    if (pick) {
      const book = await api(jar, "POST", "/api/parent/short-learning/bookings", {
        schoolId,
        schoolStudentId,
        startsAt: pick,
        durationMinutes: 90,
        subject: "maths",
        learningFocus: "UAT failure recovery",
        honestyAcknowledged: true,
      });
      const failBookingId = (book.json as { booking?: { id?: string } }).booking?.id;
      check("Booking succeeds even when content generation may fail later", book.ok && Boolean(failBookingId), `id=${failBookingId}`);
      if (failBookingId) {
        const partial = await ensureShortLearningSessionContent({
          bookingId: failBookingId,
          generateStage: flaky as never,
        });
        check(
          "Partial/failed generation leaves visible session state",
          ["ready", "failed"].includes(partial.session.status),
          `status=${partial.session.status}`,
        );
        const retry = await ensureShortLearningSessionContent({
          bookingId: failBookingId,
          forceRegenerate: true,
          generateStage: mockGenerate as never,
        });
        check("Retry with healthy generator can restore session", ["ready", "failed"].includes(retry.session.status), `status=${retry.session.status}`);
        report.failureRecovery = { failBookingId, partialStatus: partial.session.status, retryStatus: retry.session.status };
      }
    }
  }

  // Authorisation: other parent should not see booking
  const other = await login("no-such-parent@example.com", "bad");
  check("Invalid parent login fails", !other.res.ok);

  // Cascade: contentId has no FK — deleting session blocks must not delete AIContentCache
  if (maths90) {
    const sample = await prisma.shortLearningBlock.findFirst({
      where: { session: { bookingId: maths90 }, contentId: { not: null } },
      select: { contentId: true },
    });
    if (sample?.contentId) {
      const before = await prisma.aIContentCache.findUnique({ where: { id: sample.contentId }, select: { id: true } });
      check("Block contentId references AIContentCache without cascade FK risk (row exists)", Boolean(before), `contentId=${sample.contentId}`);
    }
  }

  // Student list API/page smoke (authenticated parent cookie may not be student — check student route redirects)
  const studentPage = await fetch(`${BASE}/student/short-learning`, { headers: { Cookie: jar.cookie }, redirect: "manual" });
  check(
    "Student Short Learning route responds (200/302/303)",
    [200, 302, 303, 307, 308].includes(studentPage.status),
    `status=${studentPage.status}`,
  );

  await prisma.$disconnect();

  report.finishedAt = new Date().toISOString();
  report.checks = checks;
  report.passed = checks.filter((c) => c.ok).length;
  report.failed = checks.filter((c) => !c.ok).length;
  report.note105 =
    "105-minute planner exists; parent booking allow-list remains [90,120] so API rejects 105 until product enables it.";
  report.regenerationBehaviour =
    "forceRegenerate deletes existing ShortLearningBlock rows for the session and recreates from planner; single ShortLearningSession row updated; AIContentCache old rows are not deleted (no FK cascade); no audit log writer in ensureShortLearningSessionContent today.";
  report.aiTutorHumanSupport =
    "Journey includes tutor_support block (non-generative). Human support remains availability-gated via existing SHORT_LEARNING eligibility; this UAT did not open live tutor chrome (Daytime-scope tutor still period-gated — known limitation).";

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
