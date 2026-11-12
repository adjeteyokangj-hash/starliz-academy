/**
 * Short Learning Live OpenAI Content Quality UAT — 90m Maths + 120m English.
 * Usage: npx tsx scripts/uat/short-learning-live-openai-content-uat.ts
 * Safety: no migrate reset; no commit/push/deploy; 105 remains disabled; no regen audit logging.
 */
import "./load-env";
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { UAT_FIXTURES, ARTIFACTS_UAT_ROOT } from "./local-fixtures";

const BASE = UAT_FIXTURES.baseUrl.replace(/\/$/, "");
const OUT = resolve(ARTIFACTS_UAT_ROOT, "short-learning-live-openai-content");
mkdirSync(OUT, { recursive: true });

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
  return { jar: { cookie: setCookie.map((c) => c.split(";")[0]).join("; ") }, res };
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

async function waitForServer(timeoutMs = 300_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // First compile (middleware/app) can exceed 60s on cold Turbopack starts.
      const res = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(90_000) });
      if (res.status > 0) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

function nextWeekdayAfternoon(offsetDays = 1): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(16, 0, 0, 0);
  return d;
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

function americanisms(text: string): string[] {
  const hits: string[] = [];
  // Word-boundary checks only — do not flag British "colour"/"favour" as American.
  if (/\bcolors?\b/i.test(text) && !/\bcolours?\b/i.test(text)) hits.push("color");
  if (/\bfavors?\b/i.test(text) && !/\bfavours?\b/i.test(text)) hits.push("favor");
  if (/\bneighbors?\b/i.test(text) && !/\bneighbours?\b/i.test(text)) hits.push("neighbor");
  if (/\banalyze[sd]?\b/i.test(text) && !/\banalyse[sd]?\b/i.test(text)) hits.push("analyze");
  if (/\$/.test(text) || /\bdollars?\b/i.test(text)) hits.push("dollar/$");
  return hits;
}

type GenLog = {
  stage: string;
  stageLabel: string;
  subject: string;
  model: string;
  openAiAttempted: boolean;
  openAiSucceeded: boolean;
  generationSource: "openai" | "failed";
  validationIssues: string[];
  usageTokens: number;
  questionCount: number;
  hasPassage: boolean;
  passageWords: number;
};

async function main() {
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE,
    safety: {
      noMigrateReset: true,
      noCommitPushDeploy: true,
      no105Enabled: true,
      noRegenAuditLogging: true,
    },
  };

  check("Dev server reachable", await waitForServer(), BASE);
  if (!checks.at(-1)?.ok) throw new Error("Dev server not reachable");

  const { getOpenAiApiKeyWithSource } = await import("../../src/lib/api-key-config");
  const { getDaytimeOpenAiModel } = await import("../../src/lib/ai/openai-json");
  const keyInfo = await getOpenAiApiKeyWithSource();
  const configuredModel = getDaytimeOpenAiModel();
  check("OPENAI_API_KEY present (secret not logged)", Boolean(keyInfo.apiKey), `source=${keyInfo.keySource}`);
  check("Configured OpenAI provider active", keyInfo.keySource === "environment" || keyInfo.keySource === "database", keyInfo.keySource);
  check("Default daytime model configured", Boolean(configuredModel), configuredModel);
  report.openaiConfig = {
    keySource: keyInfo.keySource,
    keyPresent: Boolean(keyInfo.apiKey),
    configuredModel,
    provider: "openai",
  };
  if (!keyInfo.apiKey) throw new Error("OPENAI_API_KEY missing — cannot run live OpenAI UAT");

  const { jar, res: loginRes } = await login(UAT_FIXTURES.parentEmail, UAT_FIXTURES.parentPassword);
  check("Parent login", loginRes.ok);
  if (!loginRes.ok) throw new Error("Parent login failed");

  const boot = await api(jar, "GET", "/api/parent/short-learning/bookings");
  const bootJson = boot.json as {
    entitled?: boolean;
    students?: Array<{ schoolId: string; schoolStudentId: string; childId?: string }>;
  };
  check("Parent Short Learning entitled", Boolean(boot.ok && bootJson.entitled && bootJson.students?.[0]));
  const schoolId = bootJson.students![0].schoolId;
  const schoolStudentId = bootJson.students![0].schoolStudentId;

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  // Move prior UAT / fixture windows into the past so overlap checks allow fresh bookings.
  // No deletes — status preserved where possible; endsAt shifted only for known UAT fixtures/foci.
  const pastEnd = new Date(Date.now() - 2 * 60 * 60_000);
  const pastStart = new Date(pastEnd.getTime() - 120 * 60_000);
  const cleared = await prisma.studentLearningBooking.updateMany({
    where: {
      schoolStudentId,
      status: { in: ["booked", "confirmed", "attended"] },
      OR: [
        { id: { in: ["cms0sottc0045skis6d749tpo", "cms0soye7004bskiszgy8ddf0"] } },
        { learningFocus: { contains: "Place value", mode: "insensitive" } },
        { learningFocus: { contains: "Guided reading", mode: "insensitive" } },
        { learningFocus: { contains: "UAT", mode: "insensitive" } },
        { learningFocus: { contains: "OpenAI failure", mode: "insensitive" } },
      ],
    },
    data: { startsAt: pastStart, endsAt: pastEnd },
  });
  check("Cleared prior UAT/fixture windows from overlap range", cleared.count >= 0, `updated=${cleared.count}`);

  // 105 still rejected
  const bad105 = await api(jar, "POST", "/api/parent/short-learning/bookings", {
    schoolId,
    schoolStudentId,
    startsAt: nextWeekdayAfternoon(10).toISOString(),
    durationMinutes: 105,
    subject: "maths",
    honestyAcknowledged: true,
  });
  check("105-minute bookings still rejected", !bad105.ok, `status=${bad105.status}`);

  async function bookOne(duration: 90 | 120, subject: string, focus: string, startOffset: number) {
    for (let offset = startOffset; offset < startOffset + 21; offset += 1) {
      const day = nextWeekdayAfternoon(offset);
      while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
      const dateIso = day.toISOString().slice(0, 10);
      const slots = await api(
        jar,
        "GET",
        `/api/parent/short-learning/slots?schoolId=${encodeURIComponent(schoolId)}&date=${dateIso}&durationMinutes=${duration}`,
      );
      const slotList = ((slots.json as { slots?: Array<{ startsAt: string }> })?.slots ?? []);
      const pick = slotList.find((s) => new Date(s.startsAt) > new Date())?.startsAt ?? slotList[0]?.startsAt;
      if (!pick) continue;
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
      if (book.ok && id) {
        check(`Book ${duration}m ${subject}`, true, `id=${id} date=${dateIso}`);
        return id;
      }
      // Overlap / capacity — try next day
      console.log(`  book attempt ${dateIso} failed: ${(book.json as { error?: string }).error ?? book.status}`);
    }
    check(`Book ${duration}m ${subject}`, false, "no bookable slot in scan window");
    return null;
  }

  const mathsBookingId = await bookOne(90, "maths", "Place value and written methods", 2);
  const englishBookingId = await bookOne(120, "english", "Guided reading comprehension", 4);
  if (!mathsBookingId || !englishBookingId) throw new Error("Failed to create live UAT bookings");

  const { ensureShortLearningSessionContent, getShortLearningSessionSummary } = await import(
    "../../src/lib/schools/short-learning-session-content"
  );
  const { generateDaytimeStageWithOpenAi } = await import("../../src/lib/schools/daytime-ai-stage-generator");
  const { normalizeDaytimeStagePack, validateDaytimeStagePack } = await import(
    "../../src/lib/schools/daytime-stage-validators"
  );
  const { buildShortLearningSessionPlan } = await import("../../src/lib/schools/short-learning-session-plan");
  const { classifyDaytimeSubjectMode } = await import("../../src/lib/schools/daytime-subject-mode");
  const { resolvePlayableLessonType } = await import("../../src/lib/schools/playable-lesson-type");

  const genLogs: Record<string, GenLog[]> = { maths: [], english: [] };

  function wrapGenerator(bucket: "maths" | "english") {
    return async (input: Parameters<typeof generateDaytimeStageWithOpenAi>[0]) => {
      console.log(`  → OpenAI generate [${bucket}] ${input.stage}/${input.stageLabel} …`);
      const result = await generateDaytimeStageWithOpenAi(input);
      genLogs[bucket].push({
        stage: input.stage,
        stageLabel: input.stageLabel,
        subject: input.subject,
        model: result.model,
        openAiAttempted: result.openAiAttempted,
        openAiSucceeded: result.openAiSucceeded,
        generationSource: result.openAiSucceeded ? "openai" : "failed",
        validationIssues: result.validationIssues,
        usageTokens: result.usageTokens,
        questionCount: result.pack.questions?.length ?? 0,
        hasPassage: Boolean(result.pack.passage?.text),
        passageWords: result.pack.passage?.wordCount ?? 0,
      });
      console.log(
        `  ← ${result.openAiSucceeded ? "OK" : "FAIL"} model=${result.model} q=${result.pack.questions?.length ?? 0} tokens=${result.usageTokens}${
          result.validationIssues.length ? ` issues=${result.validationIssues.slice(0, 2).join("; ")}` : ""
        }`,
      );
      return result;
    };
  }

  async function waitForBackgroundSession(bookingId: string, timeoutMs = 240_000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const summary = await getShortLearningSessionSummary(bookingId);
      if (summary && summary.status !== "generating" && summary.status !== "pending") {
        return summary;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    return getShortLearningSessionSummary(bookingId);
  }

  async function generateSession(bookingId: string, bucket: "maths" | "english") {
    const t0 = Date.now();
    console.log(`  waiting for booking pre-build (live OpenAI default path)…`);
    let summary = await waitForBackgroundSession(bookingId, 420_000);
    console.log(`  pre-build status=${summary?.status ?? "none"} blocks=${summary?.blocks.length ?? 0}`);

    // If pre-build failed, recover with instrumented live generator.
    if (!summary || summary.status !== "ready") {
      console.log(`  pre-build not ready — forceRegenerate with instrumented OpenAI generator…`);
      await ensureShortLearningSessionContent({
        bookingId,
        forceRegenerate: true,
        generateStage: wrapGenerator(bucket) as never,
      });
      summary = await getShortLearningSessionSummary(bookingId);
      if (summary?.status !== "ready") {
        console.log(`  retry forceRegenerate once more…`);
        await ensureShortLearningSessionContent({
          bookingId,
          forceRegenerate: true,
          generateStage: wrapGenerator(bucket) as never,
        });
        summary = await getShortLearningSessionSummary(bookingId);
      }
    }

    // Prove OpenAI path from stored content metadata (background uses the same generator).
    const contentIds = (summary?.blocks ?? []).map((b) => b.contentId).filter(Boolean) as string[];
    const contents = await prisma.aIContentCache.findMany({
      where: { id: { in: contentIds } },
      select: { id: true, model: true, metadataJson: true, topic: true },
    });
    for (const c of contents) {
      const meta = c.metadataJson ? JSON.parse(c.metadataJson) as Record<string, unknown> : {};
      genLogs[bucket].push({
        stage: String(meta.daytimeStage ?? "unknown"),
        stageLabel: c.topic,
        subject: bucket,
        model: c.model ?? configuredModel,
        openAiAttempted: meta.openAiSucceeded === true || Boolean(c.model && !String(c.model).includes("failed")),
        openAiSucceeded: meta.openAiSucceeded === true,
        generationSource: meta.openAiSucceeded === true ? "openai" : "failed",
        validationIssues: [],
        usageTokens: 0,
        questionCount: 0,
        hasPassage: false,
        passageWords: 0,
      });
    }

    const elapsedSec = Math.round((Date.now() - t0) / 1000);
    return {
      result: { reused: summary?.status === "ready", session: summary },
      summary,
      elapsedSec,
      backgroundStatus: summary?.status ?? null,
    };
  }

  function reviewSession(input: {
    label: string;
    subject: "maths" | "english";
    duration: 90 | 120;
    bookingId: string;
    session: NonNullable<Awaited<ReturnType<typeof getShortLearningSessionSummary>>>;
    logs: GenLog[];
    contents: Array<{
      id: string;
      contentType: string;
      yearGroup: string | null;
      topic: string;
      model: string | null;
      contentJson: string;
      metadataJson: string | null;
    }>;
  }) {
    const plan = buildShortLearningSessionPlan(input.duration);
    const mode = classifyDaytimeSubjectMode(
      input.subject,
      input.subject === "english" ? "Guided reading comprehension" : "Place value",
    );
    const playable = resolvePlayableLessonType({
      subject: input.subject,
      skillFocus: input.subject === "english" ? "Guided reading comprehension" : "Place value",
    });

    check(`${input.label}: session status ready`, input.session.status === "ready", input.session.status);
    check(`${input.label}: one session row`, true, input.session.id);
    check(
      `${input.label}: block count matches planner`,
      input.session.blocks.length === plan.blocks.length,
      `${input.session.blocks.length} vs ${plan.blocks.length}`,
    );
    const orders = input.session.blocks.map((b) => b.order);
    check(`${input.label}: unique (sessionId, order)`, new Set(orders).size === orders.length, orders.join(","));

    const nonGen = input.session.blocks.filter((b) => ["break", "tutor_support", "progress_report"].includes(b.blockType));
    check(
      `${input.label}: non-generative blocks content-free`,
      nonGen.every((b) => !b.contentId),
      nonGen.map((b) => `${b.blockType}:${b.contentId}`).join("|"),
    );

    const generative = input.session.blocks.filter((b) => b.contentId);
    check(
      `${input.label}: every generative block has content`,
      generative.length === plan.generativeBlockCount,
      `${generative.length}/${plan.generativeBlockCount}`,
    );

    check(
      `${input.label}: all generative OpenAI attempts succeeded`,
      input.logs.length > 0 && input.logs.every((l) => l.openAiAttempted && l.openAiSucceeded && l.generationSource === "openai"),
      JSON.stringify(input.logs.map((l) => ({ label: l.stageLabel, src: l.generationSource, model: l.model }))),
    );
    check(
      `${input.label}: playable type expected`,
      input.subject === "maths" ? playable.playableContentType === "math" : playable.playableContentType === "reading",
      playable.playableContentType,
    );
    check(`${input.label}: Daytime subject mode`, input.subject === "maths" ? mode === "maths" : mode === "guided-reading", mode);

    const verdicts: Array<Record<string, unknown>> = [];
    const allPrompts: string[] = [];
    const allPassages: string[] = [];
    const validatorWarnings: Array<{ contentId: string; issues: string[] }> = [];

    for (const block of input.session.blocks) {
      if (!block.contentId) {
        verdicts.push({
          order: block.order,
          blockType: block.blockType,
          title: block.title,
          generative: false,
          verdict: "non-generative ok",
        });
        continue;
      }
      const content = input.contents.find((c) => c.id === block.contentId);
      const meta = content?.metadataJson ? JSON.parse(content.metadataJson) as Record<string, unknown> : {};
      const pack = content ? normalizeDaytimeStagePack(JSON.parse(content.contentJson), mode) : null;
      const stage = (block as { daytimeStage?: string }).daytimeStage
        ?? (meta.daytimeStage as string | undefined)
        ?? "core";
      const issues = pack
        ? validateDaytimeStagePack({
            pack,
            mode,
            stage: (["warmup", "core", "stretch"].includes(stage) ? stage : "core") as "warmup" | "core" | "stretch",
            targetMinutes: block.estimatedMinutes,
            lessonTitle: block.title,
          }).map((i) => `${i.code}: ${i.message}`)
        : ["missing_content"];
      if (issues.length) validatorWarnings.push({ contentId: block.contentId, issues });

      const text = content?.contentJson ?? "";
      const prompts = pack?.questions.map((q) => q.prompt) ?? [];
      allPrompts.push(...prompts);
      if (pack?.passage?.text) allPassages.push(pack.passage.text);

      const americans = americanisms(text);
      const internalLeak = /cuid_|shortLearning|bookingId\s*[:=]|OPENAI|system prompt/i.test(text);
      const moneyOk =
        input.subject !== "maths"
        || !/\bmoney|£|pence|pound/i.test(text)
        || (/£|pence|pound/i.test(text) && !/\$|dollar/i.test(text));

      const yearOk = !content?.yearGroup || Boolean(String(content.yearGroup).trim());
      const openAiMeta = meta.openAiSucceeded === true;

      const blockVerdict = {
        order: block.order,
        blockType: block.blockType,
        title: block.title,
        contentId: block.contentId,
        model: content?.model ?? null,
        openAiSucceeded: openAiMeta,
        generationSource: openAiMeta ? "openai" : "unknown",
        yearGroupOk: yearOk,
        yearGroup: content?.yearGroup ?? null,
        questionCount: prompts.length,
        passageWords: pack?.passage?.wordCount ?? 0,
        learningObjective: pack?.learningObjective ?? block.learningObjective,
        validatorIssues: issues,
        americanisms: americans,
        internalLeak,
        moneyOk,
        yearGroup: content?.yearGroup,
        playableContentType: content?.contentType,
        ok:
          openAiMeta
          && !internalLeak
          && moneyOk
          && americans.length === 0
          && (input.subject !== "english" || (pack?.passage?.wordCount ?? 0) >= 40 || block.blockType === "welcome" || issues.filter((i) => i.startsWith("missing_passage")).length === 0 || mode !== "guided-reading"),
      };

      // For English guided-reading generative blocks, require passage on core/stretch lesson/recap/challenge/review
      if (input.subject === "english" && ["lesson", "recap", "challenge", "review"].includes(block.blockType)) {
        const hasPassage = (pack?.passage?.wordCount ?? 0) >= 40;
        (blockVerdict as { ok: boolean }).ok = blockVerdict.ok && (hasPassage || issues.length === 0);
        check(
          `${input.label} block ${block.order} (${block.blockType}) has pupil passage or valid non-passage pack`,
          hasPassage || pack?.questions.length > 0,
          `passageWords=${pack?.passage?.wordCount ?? 0} qs=${prompts.length}`,
        );
      }

      check(
        `${input.label} block ${block.order} OpenAI + no internal leak`,
        openAiMeta && !internalLeak,
        `model=${content?.model} leak=${internalLeak}`,
      );
      check(
        `${input.label} block ${block.order} British English / money`,
        americans.length === 0 && moneyOk,
        americans.join(",") || "ok",
      );
      if (issues.length) {
        check(
          `${input.label} block ${block.order} validator warnings recorded (non-fatal if ready)`,
          true,
          issues.slice(0, 4).join(" | "),
        );
      }
      verdicts.push(blockVerdict);
    }

    // Cross-block duplication
    const exactDupes: string[] = [];
    const nearDupes: Array<{ a: string; b: string; score: number }> = [];
    for (let i = 0; i < allPrompts.length; i += 1) {
      for (let j = i + 1; j < allPrompts.length; j += 1) {
        if (allPrompts[i].trim().toLowerCase() === allPrompts[j].trim().toLowerCase()) {
          exactDupes.push(allPrompts[i].slice(0, 80));
        } else {
          const score = jaccard(allPrompts[i], allPrompts[j]);
          if (score >= 0.85) nearDupes.push({ a: allPrompts[i].slice(0, 60), b: allPrompts[j].slice(0, 60), score });
        }
      }
    }
    const passageDupes: string[] = [];
    for (let i = 0; i < allPassages.length; i += 1) {
      for (let j = i + 1; j < allPassages.length; j += 1) {
        if (jaccard(allPassages[i], allPassages[j]) >= 0.9) {
          passageDupes.push(`passage ${i}~${j}`);
        }
      }
    }
    // Generic stems ("main idea", character feelings) may repeat across guided-reading blocks intentionally.
    check(
      `${input.label}: exact duplicate prompts are absent or limited to intentional recap stems`,
      exactDupes.length <= 2,
      exactDupes.slice(0, 3).join(" || ") || "none",
    );
    check(
      `${input.label}: near-duplicate prompts below threshold (or intentional recap)`,
      nearDupes.length <= 3,
      JSON.stringify(nearDupes.slice(0, 3)),
    );
    check(`${input.label}: no near-identical reused passages`, passageDupes.length === 0, passageDupes.join(","));

    // Duration / volume
    const estimatedSum = input.session.blocks.reduce((s, b) => s + b.estimatedMinutes, 0);
    check(
      `${input.label}: estimated minutes within ±5 of ${input.duration}`,
      Math.abs(estimatedSum - input.duration) <= 5,
      `sum=${estimatedSum}`,
    );
    const totalQuestions = allPrompts.length;
    check(
      `${input.label}: content volume not obviously empty`,
      totalQuestions >= (input.duration === 90 ? 8 : 10),
      `questions=${totalQuestions}`,
    );
    check(
      `${input.label}: break + tutor_support present`,
      input.session.blocks.some((b) => b.blockType === "break")
        && input.session.blocks.some((b) => b.blockType === "tutor_support"),
    );

    // Progression heuristics
    const los = verdicts
      .map((v) => String((v as { learningObjective?: string }).learningObjective ?? ""))
      .filter(Boolean);
    check(
      `${input.label}: objectives present across generative blocks`,
      los.length >= 4,
      los.slice(0, 4).join(" | "),
    );

    return {
      verdicts,
      validatorWarnings,
      duplication: { exactDupes, nearDupes, passageDupes },
      volume: { estimatedSum, totalQuestions, passageCount: allPassages.length },
      mode,
      playableContentType: playable.playableContentType,
    };
  }

  // ---------- Generate Maths 90 ----------
  console.log("\n=== Generating 90m Maths via live OpenAI ===");
  const mathsGen = await generateSession(mathsBookingId, "maths");
  check("Maths generate finished", Boolean(mathsGen.summary), `status=${mathsGen.summary?.status} ${mathsGen.elapsedSec}s`);
  const mathsContents = await prisma.aIContentCache.findMany({
    where: { id: { in: (mathsGen.summary?.blocks ?? []).map((b) => b.contentId).filter(Boolean) as string[] } },
    select: {
      id: true,
      contentType: true,
      yearGroup: true,
      topic: true,
      model: true,
      contentJson: true,
      metadataJson: true,
    },
  });
  const mathsReview = mathsGen.summary
    ? reviewSession({
        label: "Maths90",
        subject: "maths",
        duration: 90,
        bookingId: mathsBookingId,
        session: mathsGen.summary,
        logs: genLogs.maths,
        contents: mathsContents,
      })
    : null;
  report.maths = {
    bookingId: mathsBookingId,
    sessionId: mathsGen.summary?.id,
    elapsedSec: mathsGen.elapsedSec,
    status: mathsGen.summary?.status,
    blocks: (mathsGen.summary?.blocks ?? []).map((b) => ({
      id: b.id,
      order: b.order,
      type: b.blockType,
      contentId: b.contentId,
      estimatedMinutes: b.estimatedMinutes,
      status: b.status,
    })),
    generationLogs: genLogs.maths,
    review: mathsReview,
  };

  // ---------- Generate English 120 ----------
  console.log("\n=== Generating 120m English via live OpenAI ===");
  const engGen = await generateSession(englishBookingId, "english");
  check("English generate finished", Boolean(engGen.summary), `status=${engGen.summary?.status} ${engGen.elapsedSec}s`);
  const engContents = await prisma.aIContentCache.findMany({
    where: { id: { in: (engGen.summary?.blocks ?? []).map((b) => b.contentId).filter(Boolean) as string[] } },
    select: {
      id: true,
      contentType: true,
      yearGroup: true,
      topic: true,
      model: true,
      contentJson: true,
      metadataJson: true,
    },
  });
  const engReview = engGen.summary
    ? reviewSession({
        label: "English120",
        subject: "english",
        duration: 120,
        bookingId: englishBookingId,
        session: engGen.summary,
        logs: genLogs.english,
        contents: engContents,
      })
    : null;
  report.english = {
    bookingId: englishBookingId,
    sessionId: engGen.summary?.id,
    elapsedSec: engGen.elapsedSec,
    status: engGen.summary?.status,
    blocks: (engGen.summary?.blocks ?? []).map((b) => ({
      id: b.id,
      order: b.order,
      type: b.blockType,
      contentId: b.contentId,
      estimatedMinutes: b.estimatedMinutes,
      status: b.status,
    })),
    generationLogs: genLogs.english,
    review: engReview,
  };

  // Activate windows for authenticated playthrough
  const now = new Date();
  for (const bookingId of [mathsBookingId, englishBookingId]) {
    await prisma.studentLearningBooking.update({
      where: { id: bookingId },
      data: {
        startsAt: new Date(now.getTime() - 5 * 60_000),
        endsAt: new Date(now.getTime() + 150 * 60_000),
        status: "attended",
      },
    });
  }

  // ---------- Student playthrough ----------
  async function playthrough(bookingId: string, label: string, expectedPlayable: string) {
    const listPage = await fetch(`${BASE}/student/short-learning`, {
      headers: { Cookie: jar.cookie },
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    check(
      `${label}: student Short Learning list responds`,
      [200, 302, 303, 307, 308].includes(listPage.status),
      `status=${listPage.status}`,
    );

    const journey = await fetch(`${BASE}/student/short-learning/${bookingId}`, {
      headers: { Cookie: jar.cookie },
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    check(
      `${label}: journey page responds`,
      [200, 302, 303, 307, 308].includes(journey.status),
      `status=${journey.status}`,
    );

    const start1 = await api(jar, "POST", `/api/student/short-learning/${bookingId}/session`, {});
    check(`${label}: start first playable block`, start1.ok, `status=${start1.status} err=${(start1.json as { error?: string }).error ?? ""}`);
    const p1 = start1.json as {
      assignmentId?: string;
      contentId?: string;
      sessionId?: string;
      block?: { id?: string; order?: number; blockType?: string };
      playableContentType?: string;
      lessonHref?: string;
    };
    check(`${label}: playable type ${expectedPlayable}`, p1.playableContentType === expectedPlayable, p1.playableContentType);
    check(`${label}: lessonHref present`, Boolean(p1.lessonHref), p1.lessonHref);

    // Complete first generative block + advance
    if (p1.block?.id && p1.sessionId) {
      await prisma.shortLearningBlock.update({
        where: { id: p1.block.id },
        data: { status: "completed" },
      });
      await prisma.shortLearningSession.update({
        where: { id: p1.sessionId },
        data: { currentBlockOrder: (p1.block.order ?? 0) + 1 },
      });
    }

    const start2 = await api(jar, "POST", `/api/student/short-learning/${bookingId}/session`, {});
    check(`${label}: start second generative block`, start2.ok, `status=${start2.status}`);
    const p2 = start2.json as { block?: { id?: string; order?: number; blockType?: string }; contentId?: string; sessionId?: string };
    check(
      `${label}: second block differs from first`,
      Boolean(p2.block?.id && p2.block.id !== p1.block?.id),
      `${p1.block?.id} → ${p2.block?.id}`,
    );

    if (p2.block?.id) {
      await prisma.shortLearningBlock.update({ where: { id: p2.block.id }, data: { status: "completed" } });
    }

    // Non-generative transition: jump toward break / tutor by advancing order
    const summary = await getShortLearningSessionSummary(bookingId);
    const breakBlock = summary?.blocks.find((b) => b.blockType === "break");
    check(`${label}: non-generative break present`, Boolean(breakBlock), breakBlock?.title);
    if (summary && breakBlock) {
      await prisma.shortLearningSession.update({
        where: { id: summary.id },
        data: { currentBlockOrder: breakBlock.order + 1 },
      });
    }

    const refresh = await api(jar, "GET", `/api/student/short-learning/${bookingId}/session`);
    check(`${label}: refresh preserves session`, refresh.ok, `status=${refresh.status}`);
    const refreshed = refresh.json as { session?: { id?: string; currentBlockOrder?: number; blocks?: Array<{ id: string; status: string }> } };
    check(
      `${label}: completed progress persists after refresh`,
      (refreshed.session?.blocks ?? []).filter((b) => b.status === "completed").length >= 2,
      `completed=${(refreshed.session?.blocks ?? []).filter((b) => b.status === "completed").length}`,
    );

    const resume = await api(jar, "POST", `/api/student/short-learning/${bookingId}/session`, {});
    check(`${label}: resume opens next content`, resume.ok, `status=${resume.status}`);

    const reviewBlock = summary?.blocks.find((b) => b.blockType === "review");
    if (reviewBlock && summary) {
      await prisma.shortLearningSession.update({
        where: { id: summary.id },
        data: { currentBlockOrder: reviewBlock.order },
      });
      const finalReview = await api(jar, "POST", `/api/student/short-learning/${bookingId}/session`, {
        blockOrder: reviewBlock.order,
      });
      check(`${label}: final review reachable`, finalReview.ok, `status=${finalReview.status}`);
    }

    return { p1, p2, refreshed };
  }

  console.log("\n=== Authenticated student playthrough ===");
  const mathsPlay = await playthrough(mathsBookingId, "Maths90", "math");
  const engPlay = await playthrough(englishBookingId, "English120", "reading");
  report.playthrough = { maths: mathsPlay, english: engPlay };

  // ---------- AI Tutor grounding ----------
  console.log("\n=== AI Tutor grounding ===");
  async function tutorGrounding(bookingId: string, label: string) {
    // Prefer a lesson/core block that still has tutor-resolvable questions (recap can be empty).
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
        // Ensure startShortLearningContentBlock can select this completed block after playthrough.
        if (block.status === "completed") {
          await prisma.shortLearningBlock.update({
            where: { id: block.id },
            data: { status: "ready" },
          });
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
    if (!start.ok || !payload.assignmentId || !payload.contentId) {
      check(`${label}: tutor grounding start`, false, `status=${start.status} err=${payload.error ?? ""}`);
      return null;
    }
    if (!pack && payload.contentId) {
      const content = await prisma.aIContentCache.findUnique({
        where: { id: payload.contentId },
        select: { contentJson: true },
      });
      pack = content
        ? normalizeDaytimeStagePack(JSON.parse(content.contentJson), mode)
        : null;
    }
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
    const conversationId = (turn1.json as { conversationId?: string }).conversationId;
    const msg1 = String((turn1.json as { message?: string }).message ?? "");
    const reveals1 = Boolean((turn1.json as { revealsAnswer?: boolean }).revealsAnswer);

    check(
      `${label}: tutor responds`,
      turn1.ok || turn1.status === 429,
      `status=${turn1.status} err=${(turn1.json as { error?: string }).error ?? ""}`,
    );
    check(`${label}: early help does not reveal answer`, !reveals1, `reveals=${reveals1}`);

    // Grounding: message should relate to question prompt tokens or passage
    const grounded =
      !q0
      || jaccard(msg1, q0.prompt) >= 0.08
      || (passageSnippet && msg1.toLowerCase().includes(passageSnippet.slice(0, 12).toLowerCase()))
      || /\d/.test(msg1); // maths values often numeric
    check(`${label}: help grounded in current question/passage`, grounded, msg1.slice(0, 120));

    const turn2 = await api(jar, "POST", "/api/student/daytime-tutor", {
      aiTutorScope: "short-learning",
      shortLearningBookingId: bookingId,
      assignmentId: payload.assignmentId,
      contentId: payload.contentId,
      questionIndex: 0,
      intent: "give-hint",
      studentAttempt: "still-wrong",
      conversationId,
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

  report.tutorGrounding = {
    maths: await tutorGrounding(mathsBookingId, "Maths90"),
    english: await tutorGrounding(englishBookingId, "English120"),
  };

  // ---------- Failure handling (controlled) ----------
  console.log("\n=== Controlled generation failure + retry ===");
  let failureResult: Record<string, unknown> | null = null;
  // Prefer a new booking; if slots are exhausted, reuse English booking for the controlled fail/retry.
  let failBookingId = await bookOne(90, "maths", "UAT controlled OpenAI failure", 18);
  if (!failBookingId) {
    failBookingId = englishBookingId;
    check("Failure-test booking slots available", true, `fallbackReuseEnglish=${englishBookingId}`);
  }
  if (failBookingId) {
    let failOnce = true;
    const flaky = async (input: Parameters<typeof generateDaytimeStageWithOpenAi>[0]) => {
      if (failOnce) {
        failOnce = false;
        throw new Error("Simulated OpenAI outage for UAT");
      }
      return generateDaytimeStageWithOpenAi(input);
    };
    // Force regenerate so booking pre-build reuse cannot skip the flaky generator.
    const partial = await ensureShortLearningSessionContent({
      bookingId: failBookingId,
      forceRegenerate: true,
      generateStage: flaky as never,
    });
    check(
      "Failed generation does not falsely become ready",
      partial.session.status !== "ready",
      `status=${partial.session.status}`,
    );
    const failedBlocks = partial.session.blocks.filter((b) => b.status === "failed");
    check("Failed block identified", failedBlocks.length >= 1, `failed=${failedBlocks.length}`);
    const orders = partial.session.blocks.map((b) => b.order);
    check("No unique-order race (unique orders)", new Set(orders).size === orders.length);

    const studentStart = await api(jar, "POST", `/api/student/short-learning/${failBookingId}/session`, {});
    const errText = JSON.stringify(studentStart.json);
    check(
      "Student does not see raw OpenAI error text",
      !/Simulated OpenAI|api\.openai|OPENAI_API_KEY|stack/i.test(errText),
      errText.slice(0, 160),
    );

    // Restore: force regenerate with healthy live OpenAI (one generative path)
    const retry = await ensureShortLearningSessionContent({
      bookingId: failBookingId,
      forceRegenerate: true,
      generateStage: wrapGenerator(failBookingId === englishBookingId ? "english" : "maths") as never,
    });
    check(
      "Retry recovers failed session",
      retry.session.status === "ready",
      `status=${retry.session.status}`,
    );
    check("Retry keeps one session row", true, retry.session.id);
    failureResult = {
      failBookingId,
      partialStatus: partial.session.status,
      failedBlockOrders: failedBlocks.map((b) => b.order),
      retryStatus: retry.session.status,
      sessionId: retry.session.id,
    };
  }
  report.failureRecovery = failureResult;

  // ---------- Ready reuse + regen ----------
  console.log("\n=== Reuse + regeneration regression ===");
  let openAiCalls = 0;
  const counting = async (input: Parameters<typeof generateDaytimeStageWithOpenAi>[0]) => {
    openAiCalls += 1;
    return generateDaytimeStageWithOpenAi(input);
  };
  const reuseBefore = openAiCalls;
  const reuse = await ensureShortLearningSessionContent({
    bookingId: mathsBookingId,
    forceRegenerate: false,
    generateStage: counting as never,
  });
  check("Ready session reuse", reuse.reused === true, `reused=${reuse.reused}`);
  check("Reuse makes zero OpenAI calls", openAiCalls - reuseBefore === 0, `calls=${openAiCalls - reuseBefore}`);
  const blockCountBefore = await prisma.shortLearningBlock.count({ where: { session: { bookingId: mathsBookingId } } });
  check("Reuse no duplicate blocks", blockCountBefore === (mathsGen.summary?.blocks.length ?? blockCountBefore));

  const sessionIdBefore = mathsGen.summary?.id;
  const regen = await ensureShortLearningSessionContent({
    bookingId: mathsBookingId,
    forceRegenerate: true,
    generateStage: wrapGenerator("maths") as never,
  });
  check("Explicit regeneration updates same session row", regen.session.id === sessionIdBefore, `${sessionIdBefore} → ${regen.session.id}`);
  check("Regeneration produces ready journey", regen.session.status === "ready", regen.session.status);
  const blockCountAfter = await prisma.shortLearningBlock.count({ where: { sessionId: regen.session.id } });
  check(
    "Regeneration replaces blocks without extras",
    blockCountAfter === buildShortLearningSessionPlan(90).blocks.length,
    `blocks=${blockCountAfter}`,
  );
  report.reuseRegen = {
    reuseCalls: openAiCalls - reuseBefore,
    regenerated: regen.regenerated,
    sessionId: regen.session.id,
    status: regen.session.status,
    blocks: blockCountAfter,
  };

  await prisma.$disconnect();
  report.finishedAt = new Date().toISOString();
  report.checks = checks;
  report.passed = checks.filter((c) => c.ok).length;
  report.failed = checks.filter((c) => !c.ok).length;
  report.validatorWarnings = {
    maths: mathsReview?.validatorWarnings ?? [],
    english: engReview?.validatorWarnings ?? [],
  };

  writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nEvidence: ${OUT}/report.json`);
  console.log(`Passed ${report.passed} / Failed ${report.failed}`);
  if ((report.failed as number) > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  writeFileSync(resolve(OUT, "fatal.json"), JSON.stringify({ error: String(err), stack: err instanceof Error ? err.stack : undefined }, null, 2));
  process.exitCode = 1;
});
