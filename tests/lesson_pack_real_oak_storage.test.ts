import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildPrivateObjectKey,
  writeLocalObjectFromBuffer,
  headStoredObject,
  downloadStoredObject,
  deleteStoredObject,
  getLessonPackStorageProvider,
} from "../src/lib/lesson-pack-import/object-storage";
import { analyseLessonPackUpload } from "../src/lib/lesson-pack-import/pipeline";
import { validatePreDraft, buildQaPairingReport, isGarbledText } from "../src/lib/lesson-pack-import/content-extraction";
import { sha256Hex } from "../src/lib/lesson-pack-import/security";

const zipPath = join("tmp", "uat-real-oak", "decimals-pack.zip");

test("real Oak decimals ZIP via private local storage produces clean first lesson", async (t) => {
  if (!existsSync(zipPath)) {
    t.skip("decimals ZIP fixture not present");
    return;
  }

  // Force local private storage for offline UAT so we do not depend on live R2 credentials.
  const previous = {
    account: process.env.CLOUDFLARE_R2_ACCOUNT_ID,
    bucket: process.env.CLOUDFLARE_R2_BUCKET,
    bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME,
    endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  };
  delete process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_R2_BUCKET;
  delete process.env.CLOUDFLARE_R2_BUCKET_NAME;
  delete process.env.CLOUDFLARE_R2_ENDPOINT;

  try {
  const bytes = readFileSync(zipPath);
  assert.ok(bytes.length > 30 * 1024 * 1024, "fixture should be the real ~36MB Oak ZIP");

  const objectKey = buildPrivateObjectKey({
    userId: "uat-admin",
    sessionId: "uat-decimals-session",
    fileId: "uat-decimals-file",
    fileName: "compose-and-calculate-with-decimals-including-column-addition-and-subtraction-389.zip",
  });

  assert.equal(getLessonPackStorageProvider(), "local");
  await writeLocalObjectFromBuffer(objectKey, bytes);
  const head = await headStoredObject(objectKey);
  assert.equal(head?.sizeBytes, bytes.length);

  const downloaded = await downloadStoredObject(objectKey);
  const analysis = analyseLessonPackUpload({
    files: [{
      fileName: "compose-and-calculate-with-decimals-including-column-addition-and-subtraction-389.zip",
      mimeType: "application/zip",
      bytes: downloaded.bytes,
    }],
    sessionType: "school_day",
    sourceName: "Oak National Academy",
    licenceType: "Open Government Licence v3.0",
    attribution: "Adapted from Oak National Academy content licensed under the Open Government Licence v3.0.",
  });

  assert.equal(analysis.lessonCount, 5);
  assert.ok(analysis.files.length >= 40);

  const first = analysis.lessons[0];
  assert.ok(first);
  assert.equal(first.subject, "maths");
  assert.equal(first.yearGroup, "Year 5");
  assert.equal(first.keyStage, "KS2");
  assert.equal(/LESS-/i.test(first.title), false);
  assert.equal(/worksheet answers/i.test(first.title), false);
  assert.ok(first.learningObjective);
  assert.equal(isGarbledText(first.learningObjective!), false);

  const qa = buildQaPairingReport(first.structured);
  const validation = validatePreDraft({
    structured: first.structured,
    sourceName: "Oak National Academy",
    licenceType: "Open Government Licence v3.0",
    attribution: "Adapted from Oak National Academy content licensed under the Open Government Licence v3.0.",
    thirdPartyCount: first.thirdPartyFindings.length,
    providerHints: first.structured.sourceMetadata.providerHints,
  });
  assert.equal(validation.licenceResult, "pass");
  assert.equal(qa.questionsWithoutAnswers, 0);
  assert.equal(qa.orphanCorrectAnswers, 0);
  assert.ok(qa.questionsFound >= 8);
  const firstPrompt = first.structured.starterQuestions[0]?.prompt
    ?? first.structured.worksheetTasks[0]?.prompt
    ?? "";
  assert.ok(firstPrompt.length > 8 && firstPrompt.length <= 180);
  assert.equal(/worksheet answers/i.test(firstPrompt), false);
  assert.equal(isGarbledText(firstPrompt), false);
  assert.equal(validation.playableFirstActivity, "pass");
  assert.equal(validation.questionAnswerPairing, "pass");
  assert.equal(validation.overallReady, true);
  // Pack-level: lessons remain independently draftable; zero-question lessons are blocked.
  assert.equal(analysis.lessons.length, 5);
  const readyCount = analysis.lessons.filter((l) => l.preDraftValidation?.overallReady).length;
  assert.ok(readyCount >= 1, "at least Lesson 1 should be ready");
  const empty = analysis.lessons.filter((l) => l.questionCount === 0);
  for (const lesson of empty) {
    assert.equal(lesson.preDraftValidation?.overallReady, false);
    assert.ok(
      (lesson.preDraftValidation?.issues ?? []).some((i) => /No playable student activities/i.test(i)),
      `zero-question lesson should carry explicit block reason: ${lesson.title}`,
    );
  }
  // Lessons with usable worksheet PPTX text should no longer be silently empty.
  const nonEmpty = analysis.lessons.filter((l) => l.questionCount > 0);
  assert.ok(nonEmpty.length >= 2, `expected multiple lessons with playable questions, got ${nonEmpty.length}`);

  const extractionMeta = first.structured.sourceMetadata.extractionMeta ?? {
    primarySources: [],
    guidanceGroups: 0,
    excludedFragments: 0,
    orphanCorrectAnswers: 0,
    questionsMissingAnswers: 0,
    autoMarked: 0,
    guidedReview: 0,
  };
  const equivalentExcluded = (first.fileClassifications ?? [])
    .filter((f) => f.equivalentGroupId && f.isPrimaryExtractionSource === false)
    .map((f) => ({
      fileName: f.originalName,
      classification: f.classification,
      equivalentGroupId: f.equivalentGroupId,
    }));
  const report = {
    provider: getLessonPackStorageProvider(),
    storedBytes: head?.sizeBytes,
    fingerprint: sha256Hex(downloaded.bytes),
    lessonCount: analysis.lessonCount,
    filesExtracted: analysis.files.length,
    title: first.title,
    objective: first.learningObjective,
    subject: first.subject,
    yearGroup: first.yearGroup,
    keyStage: first.keyStage,
    difficulty: first.difficulty,
    duration: first.estimatedDurationMinutes,
    questionCount: first.questionCount,
    answerKeyCount: first.answerKeyCount,
    qa,
    primaryWorksheetSource: extractionMeta.primarySources.find((p) => p.component === "worksheet") ?? null,
    primaryAnswerSource: extractionMeta.primarySources.find((p) => p.component === "worksheet_answers") ?? null,
    allPrimarySources: extractionMeta.primarySources,
    equivalentFilesExcludedFromDuplicateExtraction: equivalentExcluded,
    autoMarkedQuestionCount: qa.autoMarkedQuestions,
    guidedReviewActivityCount: qa.guidedReviewActivities,
    pairedAnswerCount: qa.answersPaired,
    questionsMissingAnswers: qa.questionsWithoutAnswers,
    orphanCorrectAnswers: qa.orphanCorrectAnswers,
    guidanceGroupCount: qa.guidanceGroups,
    excludedFragmentCount: qa.excludedFragments,
    firstPrompt: first.structured.starterQuestions[0]?.prompt
      ?? first.structured.worksheetTasks[0]?.prompt
      ?? null,
    thirdPartyCount: first.thirdPartyFindings.length,
    validation,
    preDraftReadiness: validation.overallReady,
    lessons: analysis.lessons.map((l) => ({
      title: l.title,
      q: l.questionCount,
      a: l.answerKeyCount,
      draftReady: l.preDraftValidation?.overallReady ?? false,
    })),
  };

  mkdirSync(join("tmp", "uat-real-oak"), { recursive: true });
  writeFileSync(join("tmp", "uat-real-oak", "direct-storage-uat-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await deleteStoredObject(objectKey);
  } finally {
    if (previous.account) process.env.CLOUDFLARE_R2_ACCOUNT_ID = previous.account;
    if (previous.bucket) process.env.CLOUDFLARE_R2_BUCKET = previous.bucket;
    if (previous.bucketName) process.env.CLOUDFLARE_R2_BUCKET_NAME = previous.bucketName;
    if (previous.endpoint) process.env.CLOUDFLARE_R2_ENDPOINT = previous.endpoint;
  }
});
