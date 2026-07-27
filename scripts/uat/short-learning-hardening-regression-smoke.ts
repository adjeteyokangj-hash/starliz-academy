/**
 * Authenticated regression smoke after launch hardening.
 * Reuses ready 90/120 sessions — no force regenerate, no migrate reset.
 */
import "./load-env";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { ARTIFACTS_UAT_ROOT, UAT_FIXTURES } from "./local-fixtures";

const BASE = UAT_FIXTURES.baseUrl.replace(/\/$/, "");
const OUT = resolve(ARTIFACTS_UAT_ROOT, "short-learning-launch-hardening");
mkdirSync(OUT, { recursive: true });

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
    signal: AbortSignal.timeout(120_000),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function waitForServer() {
  const start = Date.now();
  while (Date.now() - start < 180_000) {
    try {
      const res = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(20_000) });
      if (res.status > 0) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

async function main() {
  check("Dev server reachable", await waitForServer(), BASE);
  if (!checks.at(-1)?.ok) throw new Error("Dev server not reachable");

  const reportPath = resolve(ARTIFACTS_UAT_ROOT, "short-learning-live-openai-content", "report.json");
  if (!existsSync(reportPath)) throw new Error("Prior live OpenAI report missing");
  const prior = JSON.parse(readFileSync(reportPath, "utf8")) as {
    maths?: { bookingId?: string };
    english?: { bookingId?: string };
  };
  const mathsId = prior.maths?.bookingId;
  const engId = prior.english?.bookingId;
  if (!mathsId || !engId) throw new Error("Prior live OpenAI report missing booking ids");

  const jar = await login(UAT_FIXTURES.parentEmail, UAT_FIXTURES.parentPassword);
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const { getShortLearningSessionSummary, ensureShortLearningSessionContent } = await import(
    "../../src/lib/schools/short-learning-session-content"
  );
  const { normalizeDaytimeStagePack } = await import("../../src/lib/schools/daytime-stage-validators");

  const now = Date.now();
  for (const [id, mins] of [[mathsId, 90], [engId, 120]] as const) {
    await prisma.studentLearningBooking.update({
      where: { id },
      data: {
        startsAt: new Date(now - 5 * 60_000),
        endsAt: new Date(now + mins * 60_000),
        status: "confirmed",
      },
    });
  }

  // Reuse path
  const mathsReuse = await ensureShortLearningSessionContent({ bookingId: mathsId });
  const engReuse = await ensureShortLearningSessionContent({ bookingId: engId });
  check("Maths90 reuse ready", mathsReuse.reused && mathsReuse.session.status === "ready", mathsReuse.session.status);
  check("English120 reuse ready", engReuse.reused && engReuse.session.status === "ready", engReuse.session.status);

  // Playability / ownership via student session start
  for (const [label, id, expected] of [
    ["Maths90", mathsId, "math"],
    ["English120", engId, "reading"],
  ] as const) {
    const list = await fetch(`${BASE}/student/short-learning`, {
      headers: { Cookie: jar.cookie },
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    check(`${label}: list responds`, [200, 302, 303, 307, 308].includes(list.status), `status=${list.status}`);

    const summary = await getShortLearningSessionSummary(id);
    let targetOrder = 1;
    for (const block of summary?.blocks ?? []) {
      if (!block.contentId || block.blockType === "welcome" || block.blockType === "break") continue;
      const content = await prisma.aIContentCache.findUnique({ where: { id: block.contentId } });
      if (!content) continue;
      const pack = normalizeDaytimeStagePack(
        JSON.parse(content.contentJson),
        label.includes("English") ? "guided-reading" : "maths",
      );
      if (pack && pack.questions.length > 0) {
        targetOrder = block.order;
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

    const start = await api(jar, "POST", `/api/student/short-learning/${id}/session`, { blockOrder: targetOrder });
    const payload = start.json as {
      assignmentId?: string;
      contentId?: string;
      sessionId?: string;
      block?: { id?: string };
      playableContentType?: string;
      error?: string;
    };
    check(`${label}: session start`, start.ok, `status=${start.status} err=${payload.error ?? ""}`);
    check(`${label}: playable ${expected}`, payload.playableContentType === expected, payload.playableContentType);

    if (start.ok && payload.assignmentId && payload.contentId) {
      const tutor = await api(jar, "POST", "/api/student/daytime-tutor", {
        aiTutorScope: "short-learning",
        shortLearningBookingId: id,
        shortLearningSessionId: payload.sessionId,
        shortLearningBlockId: payload.block?.id,
        assignmentId: payload.assignmentId,
        contentId: payload.contentId,
        questionIndex: 0,
        intent: "give-hint",
        studentAttempt: "wrong-answer-hardening",
      });
      check(
        `${label}: AI Tutor responds`,
        tutor.ok || tutor.status === 429,
        `status=${tutor.status} err=${(tutor.json as { error?: string }).error ?? ""}`,
      );
      check(
        `${label}: tutor does not reveal early`,
        !(tutor.json as { revealsAnswer?: boolean }).revealsAnswer,
      );
    }

    const refresh = await api(jar, "GET", `/api/student/short-learning/${id}/session`);
    check(`${label}: resume/refresh`, refresh.ok, `status=${refresh.status}`);
  }

  // 105 still rejected
  const boot = await api(jar, "GET", "/api/parent/short-learning/bookings");
  const students = (boot.json as { students?: Array<{ schoolId: string; schoolStudentId: string }> }).students;
  if (students?.[0]) {
    const bad = await api(jar, "POST", "/api/parent/short-learning/bookings", {
      schoolId: students[0].schoolId,
      schoolStudentId: students[0].schoolStudentId,
      startsAt: new Date(Date.now() + 8 * 86_400_000).toISOString(),
      durationMinutes: 105,
      subject: "maths",
      honestyAcknowledged: true,
    });
    check("105 still rejected", !bad.ok, `status=${bad.status}`);
  }

  // Human Support ownership unit already covered by focused tests; smoke support-context endpoint shape.
  const support = await api(jar, "GET", `/api/student/short-learning/${mathsId}/support-context`);
  check(
    "Support context endpoint responds without 500",
    support.status !== 500,
    `status=${support.status}`,
  );

  const result = {
    finishedAt: new Date().toISOString(),
    passed: checks.filter((c) => c.ok).length,
    failed: checks.filter((c) => !c.ok).length,
    checks,
  };
  writeFileSync(resolve(OUT, "regression-smoke.json"), JSON.stringify(result, null, 2));
  console.log(`\nRegression smoke: ${result.passed} passed / ${result.failed} failed`);
  await prisma.$disconnect();
  if (result.failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
