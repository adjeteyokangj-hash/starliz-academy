import test from "node:test";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { analyseLessonPackUpload } from "../src/lib/lesson-pack-import/pipeline";
import { buildQaPairingReport } from "../src/lib/lesson-pack-import/content-extraction";

test("five-lesson playable validation report", () => {
  const zipPath = join("tmp", "uat-real-oak", "decimals-pack.zip");
  if (!existsSync(zipPath)) return;

  const analysis = analyseLessonPackUpload({
    files: [{
      fileName: "compose-and-calculate-with-decimals-including-column-addition-and-subtraction-389.zip",
      mimeType: "application/zip",
      bytes: readFileSync(zipPath),
    }],
    sessionType: "school_day",
    sourceName: "Oak National Academy",
    licenceType: "Open Government Licence v3.0",
    attribution: "Adapted from Oak National Academy.",
  });

  const rows = analysis.lessons.map((lesson, idx) => {
    const qa = buildQaPairingReport(lesson.structured);
    const meta = (lesson.structured.sourceMetadata.extractionMeta ?? {}) as {
      missingVisuals?: number;
      incompleteMathExpressions?: number;
      needsAdminReconstruction?: number;
      excludedFromQuestionCount?: number;
      blockedActivitiesDetail?: Array<{ prompt?: string; reasons?: string[]; status?: string }>;
    };
    const first = lesson.structured.starterQuestions[0] ?? lesson.structured.worksheetTasks[0] ?? lesson.structured.exitQuestions[0];
    return {
      L: idx + 1,
      title: lesson.title,
      playable: qa.questionsFound,
      auto: qa.autoMarkedQuestions,
      guided: qa.guidedReviewActivities,
      paired: qa.answersPaired,
      missingAnswers: qa.questionsWithoutAnswers,
      orphan: qa.orphanCorrectAnswers,
      missingVisual: meta.missingVisuals ?? 0,
      invalidMaths: meta.incompleteMathExpressions ?? 0,
      needsReconstruction: meta.needsAdminReconstruction ?? 0,
      excluded: meta.excludedFromQuestionCount ?? 0,
      readiness: lesson.preDraftValidation?.overallReady ? "Ready" : "Blocked",
      first: first?.prompt ?? null,
      math: first?.mathExpression ?? null,
      visualType: first?.visualType ?? null,
      visualStatus: first?.visualReconstructionStatus ?? null,
      answerOrCriteria: first?.answer ?? first?.explanation ?? null,
      blocked: meta.blockedActivitiesDetail ?? [],
      issues: lesson.preDraftValidation?.issues?.slice(0, 10) ?? [],
    };
  });

  writeFileSync(join("tmp", "uat-real-oak", "playable-validation-report.json"), JSON.stringify({ rows }, null, 2));
  console.log(JSON.stringify(rows.map((r) => ({
    L: r.L,
    title: r.title.slice(0, 55),
    playable: r.playable,
    auto: r.auto,
    guided: r.guided,
    missingVisual: r.missingVisual,
    invalidMaths: r.invalidMaths,
    needsReconstruction: r.needsReconstruction,
    excluded: r.excluded,
    readiness: r.readiness,
    first: r.first,
    blocked: (r.blocked as Array<{ prompt?: string; reasons?: string[]; status?: string }>).slice(0, 5).map((b) => ({
      prompt: String(b.prompt ?? "").slice(0, 90),
      reasons: b.reasons,
      status: b.status,
    })),
  })), null, 2));
});
