/**
 * Focused Year 6 English Short Learning generation UAT.
 * Safety: no migrate reset; no commit/push; does not modify classroom-flow code.
 *
 * Usage: npx tsx scripts/uat/short-learning-english-generation-uat.ts
 */
import "./load-env";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ARTIFACTS_UAT_ROOT, UAT_FIXTURES } from "./local-fixtures";
import { PrismaClient } from "@prisma/client";
import { resolveShortLearningSkillFocus } from "../../src/lib/schools/short-learning-curriculum";
import { ensureShortLearningSessionContent } from "../../src/lib/schools/short-learning-session-content";
import { extractStagePackExtras } from "../../src/lib/schools/daytime-lesson-ui";
import { buildShortLearningTeachingMoment } from "../../src/lib/schools/short-learning-classroom";
import { validateDaytimeStagePack, normalizeDaytimeStagePack } from "../../src/lib/schools/daytime-stage-validators";
import { validateShortLearningInstructionalDepth, isSkillAlignedEnglishPrompt } from "../../src/lib/schools/short-learning-instructional-depth";
import { classifyDaytimeSubjectMode } from "../../src/lib/schools/daytime-subject-mode";

const OUT = resolve(ARTIFACTS_UAT_ROOT, "short-learning-english-generation");
mkdirSync(OUT, { recursive: true });

const PARENT_NOTE = "UAT weekend";
const GENERIC_TEACHING = /we're going to practise english together/i;

type PackRow = Record<string, unknown>;

function parseJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function passageFingerprint(pack: Record<string, unknown>): { title: string; text: string; wordCount: number } | null {
  const extras = extractStagePackExtras(pack);
  if (!extras?.passage?.text) return null;
  const text = extras.passage.text.trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return { title: extras.passage.title || "", text, wordCount };
}

async function main() {
  const prisma = new PrismaClient();
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    parentNote: PARENT_NOTE,
    migrationReset: false,
    classroomFlowModified: false,
  };

  try {
    const parent = await prisma.user.findUnique({ where: { email: UAT_FIXTURES.parentEmail } });
    if (!parent) throw new Error(`Parent fixture not found: ${UAT_FIXTURES.parentEmail}`);
    const link = await prisma.parentSchoolLink.findFirst({
      where: { parentUserId: parent.id, status: "active" },
      include: { schoolStudent: { include: { child: { select: { yearGroup: true, name: true } } } } },
    });
    if (!link) throw new Error("No active parent-school link for UAT parent.");

    const yearGroup = link.schoolStudent.child.yearGroup || "Year 6";
    const resolvedSkill = resolveShortLearningSkillFocus({
      learningFocus: PARENT_NOTE,
      subject: "english",
      yearGroup,
    });
    report.yearGroup = yearGroup;
    report.resolvedSkill = resolvedSkill;
    report.parentNoteRemains = PARENT_NOTE;

    checks.push({
      name: "Parent note is not used as the teaching skill",
      ok: resolvedSkill.trim().toLowerCase() !== PARENT_NOTE.toLowerCase()
        && !/\buat\b/i.test(resolvedSkill)
        && !/weekend/i.test(resolvedSkill),
      detail: `note=${PARENT_NOTE} skill=${resolvedSkill}`,
    });
    checks.push({
      name: "Resolved skill is a genuine Year 6 English curriculum skill",
      ok: /inference|comprehension|relative|formal|summaris|clause/i.test(resolvedSkill),
      detail: resolvedSkill,
    });

    const booking = await prisma.studentLearningBooking.create({
      data: {
        schoolId: link.schoolId,
        schoolStudentId: link.schoolStudentId,
        parentUserId: parent.id,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 90 * 60_000),
        durationMinutes: 90,
        subject: "english",
        learningFocus: PARENT_NOTE,
        parentNote: PARENT_NOTE,
        status: "confirmed",
        confirmedAt: new Date(),
        honestyPolicyVersion: "short-learning-ai-led-v1",
        honestyAcknowledgedAt: new Date(),
        source: "uat_script",
        metadataJson: JSON.stringify({ purpose: "english-generation-uat", parentNote: PARENT_NOTE }),
      },
    });
    report.bookingId = booking.id;
    console.log(`Created booking ${booking.id}`);

    const generated = await ensureShortLearningSessionContent({
      bookingId: booking.id,
      forceRegenerate: true,
    });
    const session = await prisma.shortLearningSession.findUnique({
      where: { bookingId: booking.id },
      include: { blocks: { orderBy: { order: "asc" } } },
    });
    if (!session) throw new Error("Session was not created.");

    report.sessionId = session.id;
    report.sessionStatus = session.status;
    report.fromPublishedJourney = Boolean((generated as { fromPublishedJourney?: boolean }).fromPublishedJourney);

    const blocks: PackRow[] = [];
    const passageTexts: string[] = [];
    let attachedFailedPacks = 0;
    let successfulPlayable = 0;
    let failedUnattached = 0;

    for (const block of session.blocks) {
      const row: PackRow = {
        order: block.order,
        title: block.title,
        blockType: block.blockType,
        status: block.status,
        contentId: block.contentId,
        estimatedMinutes: block.estimatedMinutes,
      };

      if (!block.contentId) {
        row.attached = false;
        if (block.status === "failed") failedUnattached += 1;
        blocks.push(row);
        continue;
      }

      const content = await prisma.aIContentCache.findUnique({
        where: { id: block.contentId },
        select: {
          id: true,
          skillFocus: true,
          contentJson: true,
          metadataJson: true,
          model: true,
          contentType: true,
        },
      });
      const meta = parseJson(content?.metadataJson);
      const pack = parseJson(content?.contentJson);
      const extras = extractStagePackExtras(pack);
      const teaching = buildShortLearningTeachingMoment(extras, {
        skillFocus: resolvedSkill,
        title: block.title,
        subject: "english",
      });
      const passage = passageFingerprint(pack);
      if (passage) passageTexts.push(passage.text);
      const openAiSucceeded = meta.openAiSucceeded === true;
      const validationIssues = Array.isArray(meta.validationIssues)
        ? meta.validationIssues.map(String)
        : [];
      const normalized = normalizeDaytimeStagePack(pack, "guided-reading");
      const daytimeIssues = normalized
        ? validateDaytimeStagePack({
            pack: normalized,
            mode: "guided-reading",
            stage: (block.daytimeStage as "warmup" | "core" | "stretch") || "core",
            targetMinutes: block.estimatedMinutes || 18,
            lessonTitle: block.title,
            instructionalDepthProfile: "short-learning",
            stageLabel: block.title,
            skillFocus: resolvedSkill,
          })
        : [];
      const depthIssues = normalized
        ? validateShortLearningInstructionalDepth({
            pack: normalized,
            mode: classifyDaytimeSubjectMode("english", resolvedSkill),
            stage: (block.daytimeStage as "warmup" | "core" | "stretch") || "core",
            stageLabel: block.title,
            targetMinutes: block.estimatedMinutes || 18,
            skillFocus: resolvedSkill,
          })
        : [];

      const questions = Array.isArray(pack.questions)
        ? (pack.questions as Array<Record<string, unknown>>).map((q) => String(q.prompt ?? ""))
        : [];
      const grounded = passage
        ? questions.filter((prompt) => {
            const hay = `${prompt} ${passage.text}`.toLowerCase();
            return /passage|paragraph|text|evidence|author|character|according/i.test(prompt)
              || tokenizeOverlap(prompt, passage.text);
          }).length
        : 0;
      const skillAligned = questions.filter((prompt) =>
        isSkillAlignedEnglishPrompt(prompt, resolvedSkill),
      ).length;

      Object.assign(row, {
        attached: true,
        skillFocusOnContent: content?.skillFocus ?? null,
        openAiSucceeded,
        validationIssues,
        daytimeIssueCodes: daytimeIssues.map((i) => i.code),
        depthIssueCodes: depthIssues.map((i) => i.code),
        missingPassage: daytimeIssues.some((i) => i.code === "missing_passage")
          || depthIssues.some((i) => i.code === "sl_reading_thin_passage"),
        passage,
        learningObjective: extras?.learningObjective ?? teaching.learningObjective,
        explanation: teaching.explanation,
        explanationChars: (teaching.explanation ?? "").length,
        workedExamples: teaching.workedExamples,
        workedExampleCount: teaching.workedExamples.length,
        questionCount: questions.length,
        questionPrompts: questions.slice(0, 8),
        questionsGroundedInPassage: grounded,
        skillAlignedQuestions: skillAligned,
        genericTeachingCopy: GENERIC_TEACHING.test(teaching.explanation ?? ""),
        teachingRelatedToSkill: new RegExp(
          resolvedSkill.split(/\s+/).filter((w) => w.length > 4).join("|") || "inference",
          "i",
        ).test(`${teaching.learningObjective ?? ""} ${teaching.explanation ?? ""} ${JSON.stringify(teaching.workedExamples)}`),
      });

      if (openAiSucceeded === false || block.status === "failed") attachedFailedPacks += 1;
      if (block.status === "ready" && openAiSucceeded) successfulPlayable += 1;
      blocks.push(row);
    }

    const uniquePassages = [...new Set(passageTexts.map((t) => t.replace(/\s+/g, " ").trim().toLowerCase()))];
    report.blocks = blocks;
    report.sharedPassageCount = uniquePassages.length;
    report.sharedPassagePreview = passageTexts[0]?.slice(0, 400) ?? null;
    report.successfulPlayableBlocks = successfulPlayable;
    report.failedUnattachedBlocks = failedUnattached;
    report.attachedFailedPacks = attachedFailedPacks;

    const academic = blocks.filter((b) => ["lesson", "recap", "challenge", "review"].includes(String(b.blockType)));
    const attachedAcademic = academic.filter((b) => b.attached);
    const firstLesson = attachedAcademic.find((b) => String(b.title).toLowerCase().includes("new concept"))
      ?? attachedAcademic[0];

    checks.push({
      name: "One shared passage reused across reading blocks",
      ok: uniquePassages.length === 1 && passageTexts.length >= 2,
      detail: `unique=${uniquePassages.length} blocksWithPassage=${passageTexts.length}`,
    });
    checks.push({
      name: "No missing_passage or thin-passage failures on attached packs",
      ok: attachedAcademic.every((b) => b.missingPassage !== true),
      detail: attachedAcademic
        .filter((b) => b.missingPassage === true)
        .map((b) => `${b.order}:${b.title}`)
        .join(",") || "none",
    });
    checks.push({
      name: "Teaching explanation is a modelled strategy, not generic English copy",
      ok: Boolean(firstLesson)
        && Number(firstLesson?.explanationChars ?? 0) >= 80
        && firstLesson?.genericTeachingCopy === false,
      detail: String(firstLesson?.explanation ?? "").slice(0, 240),
    });
    checks.push({
      name: "Passage-based think-aloud / worked example present",
      ok: Number(firstLesson?.workedExampleCount ?? 0) >= 1,
      detail: JSON.stringify(firstLesson?.workedExamples ?? []).slice(0, 400),
    });
    checks.push({
      name: "Teaching relates to resolved skill",
      ok: firstLesson?.teachingRelatedToSkill === true
        && String(firstLesson?.skillFocusOnContent ?? "").toLowerCase() !== PARENT_NOTE.toLowerCase(),
      detail: `contentSkill=${firstLesson?.skillFocusOnContent} related=${firstLesson?.teachingRelatedToSkill}`,
    });
    checks.push({
      name: "Practice questions are grounded in the shared passage",
      ok: Number(firstLesson?.questionsGroundedInPassage ?? 0) >= 2
        && Number(firstLesson?.questionCount ?? 0) >= 4,
      detail: `grounded=${firstLesson?.questionsGroundedInPassage}/${firstLesson?.questionCount}`,
    });
    checks.push({
      name: "Practice questions stay on the resolved skill",
      ok: Number(firstLesson?.questionCount ?? 0) >= 4
        && Number(firstLesson?.skillAlignedQuestions ?? 0)
          >= Math.ceil(Number(firstLesson?.questionCount ?? 0) * 0.7),
      detail: `aligned=${firstLesson?.skillAlignedQuestions}/${firstLesson?.questionCount}`,
    });
    checks.push({
      name: "Failed packs are not attached as playable lesson blocks",
      ok: attachedFailedPacks === 0,
      detail: `attachedFailed=${attachedFailedPacks} failedUnattached=${failedUnattached}`,
    });
    checks.push({
      name: "Successful packs remain available if another pack fails",
      ok: successfulPlayable >= 1,
      detail: `successfulPlayable=${successfulPlayable} sessionStatus=${session.status}`,
    });

    writeFileSync(resolve(OUT, "booking.json"), JSON.stringify({
      bookingId: booking.id,
      sessionId: session.id,
      parentNote: PARENT_NOTE,
      resolvedSkill,
      yearGroup,
    }, null, 2));
    writeFileSync(resolve(OUT, "blocks.json"), JSON.stringify(blocks, null, 2));
  } catch (error) {
    checks.push({
      name: "UAT completed without exception",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
    report.error = error instanceof Error ? error.stack : String(error);
  } finally {
    await prisma.$disconnect().catch(() => null);
  }

  const passed = checks.filter((c) => c.ok).length;
  report.endedAt = new Date().toISOString();
  report.checks = checks;
  report.summary = { passed, failed: checks.length - passed, total: checks.length };
  writeFileSync(resolve(OUT, "run-evidence.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ summary: report.summary, resolvedSkill: report.resolvedSkill, bookingId: report.bookingId }, null, 2));
  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
  }
  process.exit(checks.some((c) => !c.ok) ? 1 : 0);
}

function tokenizeOverlap(prompt: string, passage: string): boolean {
  const words = prompt.toLowerCase().match(/[a-z]{5,}/g) ?? [];
  const hay = passage.toLowerCase();
  return words.filter((w) => hay.includes(w)).length >= 2;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
