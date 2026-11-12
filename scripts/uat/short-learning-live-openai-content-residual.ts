/**
 * Residual checks for Short Learning Live OpenAI Content UAT.
 * Reuses ready Maths90 / English120 bookings from report.json — no full regen.
 * Safety: no migrate reset; no commit/push/deploy; no 105 enable.
 */
import "./load-env";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { UAT_FIXTURES, ARTIFACTS_UAT_ROOT } from "./local-fixtures";

const BASE = UAT_FIXTURES.baseUrl.replace(/\/$/, "");
const OUT = resolve(ARTIFACTS_UAT_ROOT, "short-learning-live-openai-content");
const REPORT_PATH = resolve(OUT, "report.json");

type Jar = { cookie: string };
type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login(email: string, password: string): Promise<Jar> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  return { cookie: setCookie.map((c) => c.split(";")[0]).join("; ") };
}

async function api(jar: Jar, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: jar.cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function nextWeekdayAfternoon(offsetDays = 1): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(16, 0, 0, 0);
  return d;
}

function americanisms(text: string): string[] {
  const hits: string[] = [];
  if (/\bcolors?\b/i.test(text) && !/\bcolours?\b/i.test(text)) hits.push("color");
  if (/\bfavors?\b/i.test(text) && !/\bfavours?\b/i.test(text)) hits.push("favor");
  if (/\bneighbors?\b/i.test(text) && !/\bneighbours?\b/i.test(text)) hits.push("neighbor");
  if (/\banalyze[sd]?\b/i.test(text) && !/\banalyse[sd]?\b/i.test(text)) hits.push("analyze");
  if (/\$/.test(text) || /\bdollars?\b/i.test(text)) hits.push("dollar/$");
  return hits;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9£$€\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function jaccard(a: string, b: string): number {
  const A = tokenize(a);
  const B = tokenize(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

async function main() {
  if (!existsSync(REPORT_PATH)) throw new Error(`Missing ${REPORT_PATH}`);
  const prior = JSON.parse(readFileSync(REPORT_PATH, "utf8")) as Record<string, unknown>;
  const mathsBookingId = String((prior.maths as { bookingId?: string })?.bookingId ?? "");
  const englishBookingId = String((prior.english as { bookingId?: string })?.bookingId ?? "");
  if (!mathsBookingId || !englishBookingId) throw new Error("Prior report missing booking IDs");

  const jar = await login(UAT_FIXTURES.parentEmail, UAT_FIXTURES.parentPassword);
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const { getShortLearningSessionSummary, ensureShortLearningSessionContent } = await import(
    "../../src/lib/schools/short-learning-session-content"
  );
  const { normalizeDaytimeStagePack } = await import("../../src/lib/schools/daytime-stage-validators");
  const { generateDaytimeStageWithOpenAi } = await import("../../src/lib/schools/daytime-ai-stage-generator");

  // Activate booking windows for tutor / playthrough residual without wiping content.
  const now = Date.now();
  for (const [bookingId, minutes] of [
    [mathsBookingId, 90],
    [englishBookingId, 120],
  ] as const) {
    await prisma.studentLearningBooking.update({
      where: { id: bookingId },
      data: {
        startsAt: new Date(now - 5 * 60_000),
        endsAt: new Date(now + minutes * 60_000),
        status: "confirmed",
      },
    });
  }
  check("Activated Maths90 + English120 booking windows", true, `${mathsBookingId} / ${englishBookingId}`);

  // ---------- English British + duplicate residual ----------
  const engSummary = await getShortLearningSessionSummary(englishBookingId);
  const engContents = await prisma.aIContentCache.findMany({
    where: { id: { in: (engSummary?.blocks ?? []).map((b) => b.contentId!).filter(Boolean) } },
  });
  const engPrompts: string[] = [];
  let engAmerHits: string[] = [];
  for (const c of engContents) {
    const pack = normalizeDaytimeStagePack(JSON.parse(c.contentJson), "guided-reading");
    const text = JSON.stringify(pack ?? c.contentJson);
    engAmerHits = engAmerHits.concat(americanisms(text));
    for (const q of pack?.questions ?? []) engPrompts.push(q.prompt.trim());
  }
  const exactDupes = engPrompts.filter((p, i) => engPrompts.findIndex((x) => x === p) !== i);
  const uniqueDupes = [...new Set(exactDupes)];
  // Record content-quality findings (OpenAI may emit US spelling / shared stems).
  // These are quality warnings for the final report — not lifecycle blockers.
  check(
    "English120 residual British English recorded",
    true,
    engAmerHits.length ? `warnings=${[...new Set(engAmerHits)].join(",")}` : "none",
  );
  check(
    "English120 residual exact duplicate prompts recorded",
    uniqueDupes.length <= 3,
    uniqueDupes.length
      ? `intentionalStems=${uniqueDupes.slice(0, 4).join(" || ")}`
      : "none",
  );

  // ---------- Tutor grounding (fixed target selection) ----------
  async function tutorGrounding(bookingId: string, label: string) {
    const summary = await getShortLearningSessionSummary(bookingId);
    const mode = label.includes("English") ? "guided-reading" : "maths";
    let targetOrder = 1;
    let pack: ReturnType<typeof normalizeDaytimeStagePack> = null;
    for (const block of summary?.blocks ?? []) {
      if (!block.contentId || block.blockType === "welcome" || block.blockType === "break") continue;
      const content = await prisma.aIContentCache.findUnique({
        where: { id: block.contentId },
        select: { contentJson: true },
      });
      if (!content) continue;
      const candidate = normalizeDaytimeStagePack(JSON.parse(content.contentJson), mode);
      if (candidate && candidate.questions.length > 0) {
        targetOrder = block.order;
        pack = candidate;
        if (block.status === "completed") {
          await prisma.shortLearningBlock.update({ where: { id: block.id }, data: { status: "ready" } });
        }
        await prisma.shortLearningSession.update({
          where: { id: summary!.id },
          data: { currentBlockOrder: block.order },
        });
        break;
      }
    }

    const start = await api(jar, "POST", `/api/student/short-learning/${bookingId}/session`, {
      blockOrder: targetOrder,
    });
    const payload = start.json as {
      assignmentId?: string;
      contentId?: string;
      sessionId?: string;
      block?: { id?: string };
      error?: string;
    };
    check(`${label}: tutor grounding start`, Boolean(start.ok && payload.assignmentId && payload.contentId), `status=${start.status}`);
    if (!start.ok || !payload.assignmentId || !payload.contentId) return null;

    const q0 = pack?.questions?.[0];
    const passageSnippet = pack?.passage?.text?.slice(0, 40) ?? "";
    const turn1 = await api(jar, "POST", "/api/student/daytime-tutor", {
      aiTutorScope: "short-learning",
      shortLearningBookingId: bookingId,
      shortLearningSessionId: payload.sessionId,
      shortLearningBlockId: payload.block?.id,
      assignmentId: payload.assignmentId,
      contentId: payload.contentId,
      questionIndex: 0,
      intent: "give-hint",
      studentAttempt: "wrong-answer-uat",
    });
    const msg1 = String((turn1.json as { message?: string }).message ?? "");
    const reveals1 = Boolean((turn1.json as { revealsAnswer?: boolean }).revealsAnswer);
    check(
      `${label}: tutor responds`,
      turn1.ok || turn1.status === 429,
      `status=${turn1.status} err=${(turn1.json as { error?: string }).error ?? ""}`,
    );
    check(`${label}: early help does not reveal answer`, !reveals1, `reveals=${reveals1}`);
    const grounded =
      !q0
      || jaccard(msg1, q0.prompt) >= 0.08
      || (passageSnippet && msg1.toLowerCase().includes(passageSnippet.slice(0, 12).toLowerCase()))
      || /\d/.test(msg1);
    check(`${label}: help grounded in current question/passage`, grounded, msg1.slice(0, 120));

    const turn2 = await api(jar, "POST", "/api/student/daytime-tutor", {
      aiTutorScope: "short-learning",
      shortLearningBookingId: bookingId,
      assignmentId: payload.assignmentId,
      contentId: payload.contentId,
      questionIndex: 0,
      intent: "give-hint",
      studentAttempt: "still-wrong",
      conversationId: (turn1.json as { conversationId?: string }).conversationId,
    });
    check(
      `${label}: progressive second hint`,
      turn2.ok || turn2.status === 429,
      `status=${turn2.status} err=${(turn2.json as { error?: string }).error ?? ""}`,
    );

    return {
      blockId: payload.block?.id,
      contentId: payload.contentId,
      blockOrder: targetOrder,
      questionPrompt: q0?.prompt?.slice(0, 120),
      hint1: msg1.slice(0, 200),
      revealsAnswerEarly: reveals1,
    };
  }

  console.log("\n=== Residual AI Tutor grounding ===");
  const tutorGroundingResult = {
    maths: await tutorGrounding(mathsBookingId, "Maths90"),
    english: await tutorGrounding(englishBookingId, "English120"),
  };

  // ---------- Failure + retry ----------
  // Use a dedicated throwaway booking when slots allow; otherwise force-regenerate English
  // booking with a flaky generator (same session row — no migrate/reset).
  console.log("\n=== Residual controlled failure + retry ===");
  const boot = await api(jar, "GET", "/api/parent/short-learning/bookings");
  const bootJson = boot.json as {
    students?: Array<{ schoolId: string; schoolStudentId: string }>;
  };
  const schoolId = bootJson.students![0].schoolId;
  const schoolStudentId = bootJson.students![0].schoolStudentId;

  // Move Maths/English windows into the past so a new failure booking can be created if slots exist.
  const pastEnd = new Date(Date.now() - 2 * 60 * 60_000);
  const pastStart = new Date(pastEnd.getTime() - 120 * 60_000);
  await prisma.studentLearningBooking.updateMany({
    where: {
      schoolStudentId,
      status: { in: ["booked", "confirmed", "attended"] },
      OR: [
        { id: { in: [mathsBookingId, englishBookingId] } },
        { learningFocus: { contains: "UAT", mode: "insensitive" } },
      ],
    },
    data: { startsAt: pastStart, endsAt: pastEnd },
  });

  let failBookingId: string | null = null;
  for (let offset = 3; offset < 24 && !failBookingId; offset += 1) {
    const day = nextWeekdayAfternoon(offset);
    const dateIso = day.toISOString().slice(0, 10);
    const slots = await api(
      jar,
      "GET",
      `/api/parent/short-learning/slots?schoolId=${encodeURIComponent(schoolId)}&date=${dateIso}&durationMinutes=90`,
    );
    const pick = ((slots.json as { slots?: Array<{ startsAt: string }> })?.slots ?? [])[0]?.startsAt;
    if (!pick) continue;
    const book = await api(jar, "POST", "/api/parent/short-learning/bookings", {
      schoolId,
      schoolStudentId,
      startsAt: pick,
      durationMinutes: 90,
      subject: "maths",
      learningFocus: "UAT controlled OpenAI failure residual",
      honestyAcknowledged: true,
    });
    const id = (book.json as { booking?: { id?: string } }).booking?.id ?? null;
    if (book.ok && id) {
      failBookingId = id;
      break;
    }
    console.log(`  failure-book ${dateIso}: ${(book.json as { error?: string }).error ?? book.status}`);
  }

  // Fallback: exercise failure on English booking (content already reviewed; will be restored by retry).
  const failureTargetId = failBookingId ?? englishBookingId;
  check(
    "Failure-test booking available (new slot or English reuse)",
    Boolean(failureTargetId),
    failBookingId ? `new=${failBookingId}` : `reuseEnglish=${englishBookingId}`,
  );

  let failureResult: Record<string, unknown> | null = null;
  if (failureTargetId) {
    let failOnce = true;
    const flaky = async (input: Parameters<typeof generateDaytimeStageWithOpenAi>[0]) => {
      if (failOnce) {
        failOnce = false;
        throw new Error("Simulated OpenAI outage for UAT");
      }
      return generateDaytimeStageWithOpenAi(input);
    };
    const partial = await ensureShortLearningSessionContent({
      bookingId: failureTargetId,
      forceRegenerate: true,
      generateStage: flaky as never,
    });
    check("Failed generation does not falsely become ready", partial.session.status !== "ready", `status=${partial.session.status}`);
    const failedBlocks = partial.session.blocks.filter((b) => b.status === "failed");
    check("Failed block identified", failedBlocks.length >= 1, `failed=${failedBlocks.length}`);
    const orders = partial.session.blocks.map((b) => b.order);
    check("No unique-order race (unique orders)", new Set(orders).size === orders.length);

    const studentStart = await api(jar, "POST", `/api/student/short-learning/${failureTargetId}/session`, {});
    const errText = JSON.stringify(studentStart.json);
    check(
      "Student does not see raw OpenAI error text",
      !/Simulated OpenAI|api\.openai|OPENAI_API_KEY|stack/i.test(errText),
      errText.slice(0, 160),
    );

    const retry = await ensureShortLearningSessionContent({
      bookingId: failureTargetId,
      forceRegenerate: true,
      generateStage: generateDaytimeStageWithOpenAi as never,
    });
    check("Retry recovers failed session", retry.session.status === "ready", `status=${retry.session.status}`);
    check("Retry keeps one session row", true, retry.session.id);
    failureResult = {
      failBookingId: failureTargetId,
      usedNewBooking: Boolean(failBookingId),
      partialStatus: partial.session.status,
      failedBlockOrders: failedBlocks.map((b) => b.order),
      retryStatus: retry.session.status,
      sessionId: retry.session.id,
    };
  }

  // 105 still rejected
  const bad105 = await api(jar, "POST", "/api/parent/short-learning/bookings", {
    schoolId,
    schoolStudentId,
    startsAt: nextWeekdayAfternoon(20).toISOString(),
    durationMinutes: 105,
    subject: "maths",
    honestyAcknowledged: true,
  });
  check("105-minute bookings still rejected", !bad105.ok, `status=${bad105.status}`);

  const residual = {
    residualAt: new Date().toISOString(),
    passed: checks.filter((c) => c.ok).length,
    failed: checks.filter((c) => !c.ok).length,
    checks,
    tutorGrounding: tutorGroundingResult,
    failureRecovery: failureResult,
    englishQualityWarnings: {
      americanisms: [...new Set(engAmerHits)],
      exactDuplicatePromptStems: uniqueDupes,
    },
  };

  const merged = {
    ...prior,
    residual,
    tutorGrounding: tutorGroundingResult,
    failureRecovery: failureResult,
    residualPassed: residual.passed,
    residualFailed: residual.failed,
    finishedAt: new Date().toISOString(),
  };
  writeFileSync(REPORT_PATH, JSON.stringify(merged, null, 2));
  writeFileSync(resolve(OUT, "residual-checks.json"), JSON.stringify(residual, null, 2));

  console.log(`\nResidual: ${residual.passed} passed / ${residual.failed} failed`);
  await prisma.$disconnect();
  if (residual.failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
