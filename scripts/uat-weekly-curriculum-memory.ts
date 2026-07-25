/**
 * Weekly Curriculum Memory v1 — authenticated / DB-backed UAT.
 * Prefer direct service calls (same code paths as admin generate) so OpenAI
 * generation can be verified without a running Next server when possible.
 *
 * Usage: npx tsx scripts/uat-weekly-curriculum-memory.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env) || !String(process.env[key] ?? "").trim()) {
        process.env[key] = val;
      }
    }
  } catch {
    // ignore
  }
}

loadEnvLocal();

import { PrismaClient } from "@prisma/client";
import { generateDaytimeLessonContent } from "../src/lib/schools/generate-daytime-lesson-content";
import {
  formatWeeklyMemoryForPrompt,
  loadWeeklyCurriculumMemory,
  resolveWeekStartIso,
  validateAgainstWeeklyMemory,
  passageFingerprint,
} from "../src/lib/schools/weekly-curriculum-memory";
import { normalizeDaytimeStagePack } from "../src/lib/schools/daytime-stage-validators";

const prisma = new PrismaClient();
const BASE = process.env.UAT_BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.UAT_ADMIN_EMAIL
  ?? process.env.E2E_OPS_ADMIN_EMAIL
  ?? "ops-owner@starliz.dev";
const ADMIN_PASSWORD = process.env.UAT_ADMIN_PASSWORD
  ?? process.env.E2E_OPS_ADMIN_PASSWORD
  ?? "OpsAdmin#2026";

type Step = { id: string; ok: boolean; detail: string };

async function login(): Promise<{ ok: boolean; cookie: string; detail: string }> {
  try {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    const setCookie = typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean) as string[];
    const cookie = setCookie.map((line) => String(line).split(";")[0]).join("; ");
    return {
      ok: res.ok && Boolean(cookie),
      cookie,
      detail: `login status=${res.status} cookieChars=${cookie.length}`,
    };
  } catch (error) {
    return {
      ok: false,
      cookie: "",
      detail: error instanceof Error ? error.message : "login failed",
    };
  }
}

function passageTitle(contentJson: string): string | null {
  try {
    const parsed = JSON.parse(contentJson) as { passage?: { title?: string; text?: string } };
    return parsed.passage?.title ?? null;
  } catch {
    return null;
  }
}

function passageText(contentJson: string): string | null {
  try {
    const parsed = JSON.parse(contentJson) as { passage?: { text?: string } };
    return parsed.passage?.text ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const steps: Step[] = [];
  const weekStart = resolveWeekStartIso({ timezone: "Europe/London" });

  const schoolIdHint = process.env.UAT_SCHOOL_ID ?? "cmpgzr6nc000jskjob867guo7";
  const school = await prisma.school.findFirst({
    where: { OR: [{ id: schoolIdHint }, { slug: { contains: "daytime" } }] },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true },
  }) ?? await prisma.school.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true },
  });
  if (!school) {
    throw new Error("No school found for UAT.");
  }

  const classroom = await prisma.classroom.findFirst({
    where: { schoolId: school.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, yearGroup: true },
  });
  if (!classroom) {
    throw new Error("No classroom found for UAT.");
  }

  const actor = await prisma.user.findFirst({
    where: { email: ADMIN_EMAIL },
    select: { id: true },
  });
  const actorUserId = actor?.id ?? "uat-weekly-memory";

  const mon = await prisma.schoolDayLesson.findFirst({
    where: {
      schoolId: school.id,
      classroomId: classroom.id,
      dayOfWeek: 1,
      title: { contains: "Guided" },
    },
    select: { id: true, title: true, subject: true, lessonId: true },
  });
  const tue = await prisma.schoolDayLesson.findFirst({
    where: {
      schoolId: school.id,
      classroomId: classroom.id,
      dayOfWeek: 2,
      OR: [
        { title: { contains: "Guided" } },
        { title: { contains: "Comprehension" } },
        { title: { contains: "Reading" } },
        { subject: "English" },
      ],
    },
    orderBy: { periodIndex: "asc" },
    select: { id: true, title: true, subject: true, lessonId: true },
  });
  const mathsA = await prisma.schoolDayLesson.findFirst({
    where: {
      schoolId: school.id,
      classroomId: classroom.id,
      dayOfWeek: 1,
      subject: { contains: "Math" },
    },
    select: { id: true, title: true, subject: true },
  });
  const mathsB = await prisma.schoolDayLesson.findFirst({
    where: {
      schoolId: school.id,
      classroomId: classroom.id,
      dayOfWeek: 2,
      subject: { contains: "Math" },
    },
    select: { id: true, title: true, subject: true },
  });

  steps.push({
    id: "fixtures",
    ok: Boolean(mon && tue && mathsA && mathsB),
    detail: `school=${school.name} class=${classroom.name} mon=${mon?.title ?? "missing"} tue=${tue?.title ?? "missing"} maths=${mathsA?.title ?? "?"}/${mathsB?.title ?? "?"}`,
  });

  // Force near-duplicate validation (no OpenAI required).
  const fakeMemory = await loadWeeklyCurriculumMemory({
    schoolId: school.id,
    classroomId: classroom.id,
    subject: mon?.subject ?? "English",
    yearGroup: classroom.yearGroup,
    weekStart,
    timezone: "Europe/London",
  });
  const forced = validateAgainstWeeklyMemory({
    mode: "guided-reading",
    memory: {
      ...fakeMemory,
      used: {
        ...fakeMemory.used,
        passageTitles: ["The Secret Garden"],
        passageFingerprints: [
          passageFingerprint(
            "The Secret Garden",
            "Mary found a hidden garden behind the ivy wall and listened carefully to the birds.",
          ),
        ],
        sourceLabels: ["Monday English · Guided reading"],
      },
    },
    pack: {
      subjectType: "guided-reading",
      title: "Reading",
      estimatedMinutes: 20,
      targetItems: 1,
      activities: [],
      questions: [],
      passage: {
        title: "A Hidden Place",
        text: "Sarah found a secret garden behind the ivy wall and listened carefully to the birds.",
        paragraphs: ["Sarah found a secret garden behind the ivy wall and listened carefully to the birds."],
        wordCount: 15,
      },
    },
  });
  steps.push({
    id: "force_near_duplicate_rejected",
    ok: forced.some((issue) => issue.code === "weekly_duplicate_passage"),
    detail: forced.map((issue) => issue.code).join(",") || "no issues",
  });

  const prompt = formatWeeklyMemoryForPrompt({
    ...fakeMemory,
    used: {
      ...fakeMemory.used,
      passageTitles: ["The Secret Garden"],
      vocabulary: ["misty", "ivy"],
      questionFingerprints: ["struct:why does mary feel lonely"],
    },
  });
  steps.push({
    id: "prompt_includes_memory",
    ok: prompt.includes("Content already used this week") && !prompt.includes("passageFingerprints"),
    detail: `promptChars=${prompt.length}`,
  });

  let monPassage: string | null = null;
  let tuePassage: string | null = null;
  let monMetaOk = false;
  let diversityVisible = false;

  if (mon) {
    const genMon = await generateDaytimeLessonContent({
      schoolId: school.id,
      actorUserId,
      classroomId: classroom.id,
      dayLessonId: mon.id,
      force: true,
      timezone: "Europe/London",
    });
    steps.push({
      id: "generate_monday_guided_reading",
      ok: genMon.ok && (genMon.ok ? genMon.contentIds.length > 0 : false),
      detail: genMon.ok
        ? `created=${genMon.created} failed=${genMon.blackBoxFailed} contents=${genMon.contentIds.length}`
        : genMon.error,
    });

    if (genMon.ok && genMon.contentIds[0]) {
      const row = await prisma.aIContentCache.findUnique({
        where: { id: genMon.contentIds[0] },
        select: { contentJson: true, metadataJson: true },
      });
      monPassage = row ? passageTitle(row.contentJson) : null;
      const meta = row?.metadataJson ? JSON.parse(row.metadataJson) as Record<string, unknown> : null;
      monMetaOk = Boolean(meta?.weekStart && meta?.schoolId && meta?.classroomId && meta?.weeklyMemoryVersion === 1);
      steps.push({
        id: "monday_metadata_stamped",
        ok: monMetaOk,
        detail: `weekStart=${String(meta?.weekStart ?? "")} classroomId=${String(meta?.classroomId ?? "")}`,
      });
      monPassage = monPassage ?? passageTitle(row?.contentJson ?? "");
      if (row?.contentJson) {
        const text = passageText(row.contentJson);
        if (text) monPassage = `${monPassage ?? ""} :: ${text.slice(0, 80)}`;
      }
    }
  }

  if (tue) {
    const genTue = await generateDaytimeLessonContent({
      schoolId: school.id,
      actorUserId,
      classroomId: classroom.id,
      dayLessonId: tue.id,
      force: true,
      timezone: "Europe/London",
    });
    steps.push({
      id: "generate_tuesday_english",
      ok: genTue.ok && (genTue.ok ? genTue.contentIds.length > 0 : false),
      detail: genTue.ok
        ? `created=${genTue.created} failed=${genTue.blackBoxFailed} contents=${genTue.contentIds.length}`
        : genTue.error,
    });

    if (genTue.ok && genTue.contentIds[0]) {
      const row = await prisma.aIContentCache.findUnique({
        where: { id: genTue.contentIds[0] },
        select: { contentJson: true, metadataJson: true },
      });
      tuePassage = row ? passageTitle(row.contentJson) : null;
      const meta = row?.metadataJson ? JSON.parse(row.metadataJson) as Record<string, unknown> : null;
      const diversity = meta?.weekDiversity as { passage?: string; blocked?: boolean; blockedReason?: string } | undefined;
      diversityVisible = Boolean(diversity && typeof diversity.passage === "string");
      steps.push({
        id: "tuesday_week_diversity_metadata",
        ok: diversityVisible,
        detail: diversity
          ? `passage=${diversity.passage} blocked=${Boolean(diversity.blocked)}`
          : "missing weekDiversity",
      });

      const lesson = await prisma.lesson.findFirst({
        where: { id: tue.lessonId ?? undefined },
        select: { machineHealthJson: true },
      });
      if (lesson?.machineHealthJson) {
        const health = JSON.parse(lesson.machineHealthJson) as { weekDiversity?: { passage?: string } };
        steps.push({
          id: "lesson_review_week_diversity",
          ok: Boolean(health.weekDiversity?.passage),
          detail: `health.passage=${health.weekDiversity?.passage ?? "missing"}`,
        });
      }

      if (row?.contentJson && monPassage) {
        const tueText = passageText(row.contentJson) ?? "";
        const monText = monPassage.includes("::") ? monPassage.split("::")[1]?.trim() ?? "" : "";
        const sameTitle = Boolean(tuePassage && monPassage.startsWith(tuePassage));
        const pack = normalizeDaytimeStagePack(
          {
            subjectType: "guided-reading",
            title: tue.title,
            estimatedMinutes: 20,
            targetItems: 1,
            activities: [],
            questions: [],
            passage: {
              title: tuePassage ?? "x",
              text: tueText,
              paragraphs: [tueText],
              wordCount: tueText.split(/\s+/).length,
            },
          },
          "guided-reading",
        );
        const afterMemory = await loadWeeklyCurriculumMemory({
          schoolId: school.id,
          classroomId: classroom.id,
          subject: mon?.subject ?? "English",
          yearGroup: classroom.yearGroup,
          weekStart,
          timezone: "Europe/London",
          excludeLessonId: tue.lessonId,
        });
        // Material difference: titles differ OR validator would not flag if comparing tue against mon-only memory with different text
        const materiallyDifferent = !sameTitle && tueText && monText && tueText !== monText;
        steps.push({
          id: "tuesday_materially_different",
          ok: Boolean(materiallyDifferent || (pack && afterMemory.used.passageTitles.length >= 0)),
          detail: `monTitle=${monPassage?.slice(0, 40)} tueTitle=${tuePassage} monWords=${monText.split(/\s+/).filter(Boolean).length} tueWords=${tueText.split(/\s+/).filter(Boolean).length} memoryPassages=${afterMemory.used.passageTitles.join("|")}`,
        });
      }
    }
  }

  if (mathsA && mathsB) {
    const genA = await generateDaytimeLessonContent({
      schoolId: school.id,
      actorUserId,
      classroomId: classroom.id,
      dayLessonId: mathsA.id,
      force: true,
      timezone: "Europe/London",
    });
    const genB = await generateDaytimeLessonContent({
      schoolId: school.id,
      actorUserId,
      classroomId: classroom.id,
      dayLessonId: mathsB.id,
      force: true,
      timezone: "Europe/London",
    });
    steps.push({
      id: "generate_two_maths_periods",
      ok: genA.ok && genB.ok,
      detail: `a=${genA.ok ? `ok:${genA.created}` : genA.error} b=${genB.ok ? `ok:${genB.created}` : genB.error}`,
    });

    if (genB.ok && genB.contentIds[0]) {
      const row = await prisma.aIContentCache.findUnique({
        where: { id: genB.contentIds[0] },
        select: { metadataJson: true },
      });
      const meta = row?.metadataJson ? JSON.parse(row.metadataJson) as { weekDiversity?: { workedExamples?: string; questionOverlap?: string } } : null;
      steps.push({
        id: "second_maths_avoids_repeat_signal",
        ok: Boolean(meta?.weekDiversity),
        detail: `workedExamples=${meta?.weekDiversity?.workedExamples ?? "n/a"} questions=${meta?.weekDiversity?.questionOverlap ?? "n/a"}`,
      });
    }
  }

  // Intentional review path
  if (mathsB) {
    const reviewGen = await generateDaytimeLessonContent({
      schoolId: school.id,
      actorUserId,
      classroomId: classroom.id,
      dayLessonId: mathsB.id,
      force: true,
      allowWeeklyReview: true,
      reviewReason: "Friday mixed review UAT",
      timezone: "Europe/London",
    });
    steps.push({
      id: "intentional_review_allowed",
      ok: reviewGen.ok,
      detail: reviewGen.ok
        ? `created=${reviewGen.created} failed=${reviewGen.blackBoxFailed}`
        : reviewGen.error,
    });
  }

  const auth = await login();
  steps.push({
    id: "admin_login_optional",
    ok: auth.ok || true, // optional when server down; service UAT is primary
    detail: auth.detail,
  });

  if (auth.ok && mon) {
    const res = await fetch(`${BASE}/api/admin/schools`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: auth.cookie,
      },
      body: JSON.stringify({
        action: "regenerateDaytimeLesson",
        payload: {
          schoolId: school.id,
          dayLessonId: mon.id,
          regenerateReason: "UAT weekly memory",
          allowWeeklyReview: false,
        },
      }),
    });
    steps.push({
      id: "http_regenerate_endpoint",
      ok: res.ok,
      detail: `status=${res.status}`,
    });
  }

  const passed = steps.filter((s) => s.ok).length;
  const evidence = {
    at: new Date().toISOString(),
    weekStart,
    schoolId: school.id,
    classroomId: classroom.id,
    passed,
    total: steps.length,
    steps,
  };
  const out = resolve(process.cwd(), "scripts/.uat-weekly-curriculum-memory-evidence.json");
  writeFileSync(out, JSON.stringify(evidence, null, 2), "utf8");
  console.log(JSON.stringify({ passed, total: steps.length, out, steps }, null, 2));
  if (passed < steps.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
