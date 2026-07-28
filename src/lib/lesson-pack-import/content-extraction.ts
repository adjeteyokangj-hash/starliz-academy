import { createHash } from "node:crypto";
import type {
  LessonPackComponentType,
  LessonPackStructuredModel,
  LessonPackUploadedFile,
  LinkedQaItem,
} from "@/lib/lesson-pack-import/types";
import {
  activitiesToLinkedQa,
  extractSlidePracticeActivities,
  extractWorksheetActivities,
  isOversizedPrompt,
  isUsableExtractedText,
  pairActivitiesWithAnswers,
  parseAnswerSheet,
  textReadabilityScore,
  type ExtractedActivity,
} from "@/lib/lesson-pack-import/qa-extraction";
import { evaluateLessonActivities, validatePlayableActivity } from "@/lib/lesson-pack-import/playable-validation";

function stableId(prefix: string, seed: string): string {
  return `${prefix}_${createHash("sha1").update(seed).digest("hex").slice(0, 12)}`;
}

function filesOfType(files: LessonPackUploadedFile[], type: LessonPackComponentType): LessonPackUploadedFile[] {
  const matched = files.filter((f) => (f.manualClassification ?? f.classification) === type);
  const primaries = matched.filter((f) => f.isPrimaryExtractionSource !== false);
  // When equivalent PDF/PPTX pairs exist, only extract activities from primary sources.
  const hasEquivalents = matched.some((f) => f.equivalentGroupId);
  if (hasEquivalents) {
    return primaries.length ? primaries : matched.slice(0, 1);
  }
  return matched;
}

function combinedText(files: LessonPackUploadedFile[]): string {
  return files.map((f) => f.textContent || "").filter(Boolean).join("\n\n");
}

/** Split text into numbered question/answer-like items. */
export function extractNumberedItems(text: string): Array<{ index: number; body: string }> {
  const normalised = text.replace(/\r\n/g, "\n");
  const parts = normalised.split(/(?:^|\n)\s*(?:Q(?:uestion)?\s*)?(\d{1,2})[\).:\-]\s+/i);
  const items: Array<{ index: number; body: string }> = [];
  // split with capture: [preamble, num, body, num, body, ...]
  for (let i = 1; i < parts.length - 1; i += 2) {
    const index = Number(parts[i]);
    const body = String(parts[i + 1] ?? "").trim();
    if (Number.isFinite(index) && body) {
      items.push({ index, body: body.split(/\n{2,}/)[0].trim() });
    }
  }
  if (!items.length) {
    // Bullet / line fallback
    const lines = normalised
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 8 && /[?]|complete|calculate|explain|write|find|match/i.test(l));
    lines.slice(0, 20).forEach((body, idx) => items.push({ index: idx + 1, body }));
  }
  return items;
}

/** Link answers to questions by index within the same component family. */
export function linkQuestionsAndAnswers(
  questions: LinkedQaItem[],
  answers: LinkedQaItem[],
): LinkedQaItem[] {
  if (!questions.length) return [];
  if (!answers.length) return questions.map((q) => ({ ...q }));

  return questions.map((question, index) => {
    const answer = answers[index];
    const linkedId = question.id;
    return {
      ...question,
      id: linkedId,
      answer: answer?.answer ?? answer?.prompt ?? question.answer,
      explanation: answer?.explanation,
    };
  });
}

function extractObjective(text: string): string | null {
  // Prefer explicit "I can ..." success criteria common in Oak packs.
  const iCan = text.match(/\bI can\s+[^.\n]{8,180}\.?/i);
  if (iCan?.[0] && !isGarbledText(iCan[0])) {
    return iCan[0].trim().replace(/\s+/g, " ").slice(0, 300);
  }

  const match = text.match(/(?:learning\s+objective|objective|we\s+are\s+learning\s+to|wali|li)\s*[:\-–]?\s*(.+)/i);
  const raw = match?.[1]?.split(/\n/)[0]?.trim().slice(0, 300) || null;
  if (!raw) return null;
  if (isGarbledText(raw)) return null;
  // Reject long glossary/definition dumps mistaken for objectives
  if (raw.length > 160 && !/^I can\b/i.test(raw)) return null;
  return raw.replace(/\s+/g, " ");
}

function sanitiseTitle(value: string | null | undefined): string | null {
  if (!value) return null;
  let cleaned = value.replace(/\u0000/g, "").replace(/^þÿ/g, "").replace(/þÿ/g, "").trim();

  // Strip internal lesson codes (e.g. LESS-NMMRT-O3873)
  cleaned = cleaned.replace(/\bLESS-[A-Z0-9-]+\s*[-–—]?\s*/gi, "");

  // Strip answer/worksheet/quiz suffixes that should never be in a student title
  cleaned = cleaned
    .replace(/\s*[-–—]\s*(Worksheet\s+answers?|Worksheet|Answers?|Starter\s+quiz|Exit\s+quiz|Questions?|Mark\s+scheme)\s*$/i, "")
    .replace(/\.(pdf|pptx|docx|txt)$/i, "")
    .replace(/[-_]{2,}/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 3) return null;

  const letters = cleaned.match(/[A-Za-z]/g) ?? [];
  if (letters.length < 3) return null;

  // Reject mojibake / high symbol-to-letter ratio
  if (isGarbledText(cleaned)) return null;

  return cleaned.slice(0, 180);
}

/**
 * Detect corrupted / mojibake text that should never appear in student-facing fields.
 * Returns true if the text is likely garbled.
 */
export function isGarbledText(text: string): boolean {
  if (!text || text.length < 3) return true;
  const letters = text.match(/[A-Za-z0-9\s]/g) ?? [];
  const ratio = letters.length / text.length;
  // If less than 40% of characters are readable alphanumerics/spaces, it's garbled
  if (ratio < 0.4) return true;
  // Detect specific mojibake patterns
  if (/[ÔÞæýü¼ä¡fl]{3,}/.test(text)) return true;
  if (/[\x80-\x9f]{3,}/.test(text)) return true;
  // Replacement character clusters
  if (/\ufffd{2,}/.test(text)) return true;
  return false;
}

/** Answer files must never supply the lesson title. */
const ANSWER_FILE_TYPES = new Set<LessonPackComponentType>([
  "starter_answers", "worksheet_answers", "exit_answers",
]);

function extractTitle(files: LessonPackUploadedFile[], text: string): string {
  // Priority 1: teaching slide deck document title
  const slides = files.filter((f) => (f.manualClassification ?? f.classification) === "teaching_slides");
  for (const file of slides) {
    const title = sanitiseTitle(file.documentTitle);
    if (title) return title;
  }

  // Priority 2: worksheet (not answer) document title
  const worksheets = files.filter((f) => {
    const cls = f.manualClassification ?? f.classification;
    return cls === "worksheet";
  });
  for (const file of worksheets) {
    const title = sanitiseTitle(file.documentTitle);
    if (title) return title;
  }

  // Priority 3: non-answer file headings from slides/worksheets
  const nonAnswerFiles = files.filter((f) => !ANSWER_FILE_TYPES.has(f.manualClassification ?? f.classification));
  for (const file of [...slides, ...worksheets, ...nonAnswerFiles]) {
    const heading = file.headings.map((h) => sanitiseTitle(h)).find((h) =>
      h && h.length > 5 && !/^(year|starter|exit|worksheet|answer)/i.test(h),
    );
    if (heading) return heading;
  }

  // Priority 4: clean folder name
  const folderHint = files
    .map((f) => f.originalName.split("/")[0] ?? "")
    .find((part) => part && !/\.(pdf|pptx|docx|txt)$/i.test(part));
  if (folderHint) {
    const fromFolder = folderHint
      .replace(/^\d+-/, "")
      .replace(/[-_]+/g, " ")
      .trim();
    const nice = sanitiseTitle(fromFolder);
    if (nice) return nice.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Priority 5: any non-answer document title
  for (const file of nonAnswerFiles) {
    const title = sanitiseTitle(file.documentTitle);
    if (title) return title;
  }

  // Priority 6: first readable text line from non-answer files
  const nonAnswerText = nonAnswerFiles.map((f) => f.textContent || "").filter(Boolean).join("\n");
  const line = (nonAnswerText || text).split(/\n/).map((l) => l.trim()).find((l) =>
    l.length > 8 && l.length < 100 && !l.includes("\u0000") && !isGarbledText(l),
  );
  return line || "Imported lesson pack";
}

function extractKeywords(text: string): string[] {
  const match = text.match(/(?:key\s+vocabulary|keywords?|vocabulary)\s*[:\-–]?\s*([\s\S]{0,300})/i);
  if (!match) return [];
  return match[1]
    .split(/[,;\n•]/)
    .map((k) => k.trim())
    .filter((k) => k.length > 1 && k.length < 40)
    .slice(0, 12);
}

function extractListAfterHeading(text: string, heading: RegExp): string[] {
  const match = text.match(heading);
  if (!match || match.index == null) return [];
  const slice = text.slice(match.index, match.index + 800);
  return slice
    .split(/\n/)
    .slice(1)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter((l) => l.length > 8)
    .slice(0, 8);
}

function providerHints(text: string): string[] {
  const hints: string[] = [];
  if (/\boak\s+national\s+academy\b/i.test(text) || /\boak\.org\b/i.test(text)) hints.push("Oak National Academy");
  if (/\bBBC\s+Bitesize\b/i.test(text)) hints.push("BBC Bitesize");
  if (/\bTwinkl\b/i.test(text)) hints.push("Twinkl");
  if (/\bWhite\s+Rose\b/i.test(text)) hints.push("White Rose");
  return hints;
}

export function buildStructuredImportModel(input: {
  files: LessonPackUploadedFile[];
  sourceName?: string | null;
  sourceUrl?: string | null;
  licenceType?: string | null;
  attribution?: string | null;
}): LessonPackStructuredModel {
  const files = input.files;
  // Exclude answer files from the "all text" pool used for title/objective extraction
  const nonAnswerFiles = files.filter((f) => !ANSWER_FILE_TYPES.has(f.manualClassification ?? f.classification));
  const allText = combinedText(nonAnswerFiles.length ? nonAnswerFiles : files);

  const starterQFiles = filesOfType(files, "starter_questions");
  const starterAFiles = filesOfType(files, "starter_answers");
  const exitQFiles = filesOfType(files, "exit_questions");
  const exitAFiles = filesOfType(files, "exit_answers");
  const worksheetFiles = filesOfType(files, "worksheet");
  const worksheetAFiles = filesOfType(files, "worksheet_answers");
  const slideFiles = filesOfType(files, "teaching_slides");
  const notesFiles = filesOfType(files, "teacher_notes");

  const extractionMeta: {
    primarySources: Array<{ component: string; fileName: string; reason: string }>;
    guidanceGroups: number;
    excludedFragments: number;
    orphanCorrectAnswers: number;
    questionsMissingAnswers: number;
    autoMarked: number;
    guidedReview: number;
    playableActivities?: number;
    blockedActivities?: number;
    needsAdminReconstruction?: number;
    incompleteMathExpressions?: number;
    missingVisuals?: number;
    lowConfidenceActivities?: number;
    excludedFromQuestionCount?: number;
    blockedActivitiesDetail?: Array<{
      id: string;
      prompt: string;
      status: string;
      reasons: string[];
      mathExpression?: string | null;
      visualType?: string | null;
    }>;
    adminReconstructionQueue?: Array<{
      activityId: string;
      prompt: string;
      visualType?: string | null;
      sourceFile?: string | null;
      sourceSlideOrPage?: number | null;
      reasons: string[];
    }>;
  } = {
    primarySources: [],
    guidanceGroups: 0,
    excludedFragments: 0,
    orphanCorrectAnswers: 0,
    questionsMissingAnswers: 0,
    autoMarked: 0,
    guidedReview: 0,
  };

  function usablePrimaryText(fileList: LessonPackUploadedFile[]): { text: string; file?: LessonPackUploadedFile } {
    for (const file of fileList) {
      if (isUsableExtractedText(file.textContent || "")) {
        return { text: file.textContent || "", file };
      }
    }
    return { text: "" };
  }

  // Worksheets — layout-aware extraction from readable primary (prefer PPTX)
  const worksheetSource = usablePrimaryText(worksheetFiles);
  if (worksheetSource.file) {
    extractionMeta.primarySources.push({
      component: "worksheet",
      fileName: worksheetSource.file.originalName,
      reason: `readability ${textReadabilityScore(worksheetSource.text).toFixed(2)}; kind ${worksheetSource.file.kind}`,
    });
  }
  let worksheetActivities = extractWorksheetActivities(
    worksheetSource.text,
    "worksheet",
    worksheetSource.file?.id,
  );
  if (!worksheetActivities.length) {
    const slideSource = usablePrimaryText(slideFiles);
    const slidePractice = extractSlidePracticeActivities(slideSource.text, slideSource.file?.id);
    if (slidePractice.length) {
      worksheetActivities = slidePractice.map((a) => ({ ...a, sourceComponent: "worksheet" as const }));
      if (slideSource.file) {
        extractionMeta.primarySources.push({
          component: "worksheet_fallback_slides",
          fileName: slideSource.file.originalName,
          reason: "worksheet thin/unusable; using slide practice prompts",
        });
      }
    } else if (/part-part-whole|number line|column|place value|bar model|decimal counter|missing.?number/i.test(worksheetSource.text + " " + slideSource.text)) {
      extractionMeta.excludedFragments += 1;
      extractionMeta.primarySources.push({
        component: "needs_admin_reconstruction",
        fileName: worksheetSource.file?.originalName ?? slideSource.file?.originalName ?? "unknown",
        reason: "Image-led maths activity detected but values/operators could not be recovered reliably",
      });
    }
  }

  const worksheetAnswerSource = usablePrimaryText(worksheetAFiles);
  if (worksheetAnswerSource.file) {
    extractionMeta.primarySources.push({
      component: "worksheet_answers",
      fileName: worksheetAnswerSource.file.originalName,
      reason: `readability ${textReadabilityScore(worksheetAnswerSource.text).toFixed(2)}; kind ${worksheetAnswerSource.file.kind}`,
    });
  }
  const worksheetParsed = parseAnswerSheet(
    worksheetAnswerSource.text,
    "worksheet_answers",
    worksheetAnswerSource.file?.id,
  );
  extractionMeta.guidanceGroups += worksheetParsed.guidanceGroups;
  extractionMeta.excludedFragments += worksheetParsed.excludedFragments;

  const worksheetPaired = pairActivitiesWithAnswers(worksheetActivities, worksheetParsed.answers);
  worksheetActivities = worksheetPaired.paired.filter((a) => a.extractionConfidence !== "low" || Boolean(a.answer) || a.markingMode === "guided_review");
  extractionMeta.orphanCorrectAnswers += worksheetPaired.orphanCorrectAnswers.length;
  extractionMeta.questionsMissingAnswers += worksheetPaired.questionsMissingAnswers.filter((q) => q.markingMode === "auto").length;

  // Starter / exit — only from usable text; otherwise fall back to slide practice
  function extractQuizSide(
    qFiles: LessonPackUploadedFile[],
    aFiles: LessonPackUploadedFile[],
    qType: LessonPackComponentType,
    aType: LessonPackComponentType,
  ): ExtractedActivity[] {
    const qSource = usablePrimaryText(qFiles);
    let activities = qSource.text
      ? extractWorksheetActivities(qSource.text, qType, qSource.file?.id)
      : [];
    if (!activities.length && (qType === "starter_questions" || qType === "exit_questions")) {
      const slideSource = usablePrimaryText(slideFiles);
      activities = extractSlidePracticeActivities(slideSource.text, slideSource.file?.id)
        .slice(0, 6)
        .map((a) => ({ ...a, sourceComponent: qType }));
    }
    const aSource = usablePrimaryText(aFiles);
    const parsed = parseAnswerSheet(aSource.text, aType, aSource.file?.id);
    extractionMeta.guidanceGroups += parsed.guidanceGroups;
    extractionMeta.excludedFragments += parsed.excludedFragments;
    if (qSource.file) {
      extractionMeta.primarySources.push({
        component: qType,
        fileName: qSource.file.originalName,
        reason: `readability ${textReadabilityScore(qSource.text).toFixed(2)}`,
      });
    }
    const paired = pairActivitiesWithAnswers(activities, parsed.answers);
    extractionMeta.orphanCorrectAnswers += paired.orphanCorrectAnswers.length;
    extractionMeta.questionsMissingAnswers += paired.questionsMissingAnswers.filter((q) => q.markingMode === "auto").length;
    return paired.paired;
  }

  const starterActivities = extractQuizSide(starterQFiles, starterAFiles, "starter_questions", "starter_answers");
  const exitActivities = extractQuizSide(exitQFiles, exitAFiles, "exit_questions", "exit_answers");

  // If starter empty, use a few slide practice items
  const finalStarter = starterActivities.length
    ? starterActivities
    : extractSlidePracticeActivities(usablePrimaryText(slideFiles).text, slideFiles[0]?.id).slice(0, 5);

  const safeStarterRaw = activitiesToLinkedQa(finalStarter);
  const safeExitRaw = activitiesToLinkedQa(exitActivities);
  const safeWorksheetRaw = activitiesToLinkedQa(worksheetActivities);

  const playableEval = evaluateLessonActivities([
    ...safeStarterRaw,
    ...safeWorksheetRaw,
    ...safeExitRaw,
  ]);
  const playableIds = new Set(playableEval.playableItems.map((i) => i.id));
  const enrich = (items: LinkedQaItem[]) =>
    items
      .map((item) => playableEval.playableItems.find((p) => p.id === item.id) ?? playableEval.excludedItems.find((p) => p.id === item.id) ?? item)
      .filter((item) => playableIds.has(item.id));

  const safeStarter = enrich(safeStarterRaw);
  const safeExit = enrich(safeExitRaw);
  const safeWorksheet = enrich(safeWorksheetRaw);

  extractionMeta.playableActivities = playableEval.report.playableActivities;
  extractionMeta.blockedActivities = playableEval.report.blockedActivities;
  extractionMeta.needsAdminReconstruction = playableEval.report.needsReconstruction;
  extractionMeta.incompleteMathExpressions = playableEval.report.incompleteMathExpressions;
  extractionMeta.missingVisuals = playableEval.report.missingVisuals;
  extractionMeta.lowConfidenceActivities = playableEval.report.lowConfidenceActivities;
  extractionMeta.excludedFromQuestionCount = playableEval.report.excludedFromQuestionCount;
  extractionMeta.excludedFragments += playableEval.report.excludedFromQuestionCount;
  extractionMeta.blockedActivitiesDetail = playableEval.report.activityResults.filter((r) => r.status !== "playable");
  extractionMeta.adminReconstructionQueue = playableEval.excludedItems
    .filter((i) => i.playableStatus === "needs_admin_reconstruction")
    .map((i) => ({
      activityId: i.id,
      prompt: i.prompt,
      visualType: i.visualType ?? null,
      sourceFile: i.visualSourceFile ?? i.sourceFileId ?? null,
      sourceSlideOrPage: i.visualSourceSlideOrPage ?? null,
      reasons: i.playableBlockReasons ?? [],
    }));

  extractionMeta.autoMarked = [...safeStarter, ...safeWorksheet, ...safeExit]
    .filter((a) => a.markingMode === "auto").length;
  extractionMeta.guidedReview = [...safeStarter, ...safeWorksheet, ...safeExit]
    .filter((a) => a.markingMode === "guided_review").length;

  // Answer keys live on paired question items. Keep empty arrays so orphan
  // counting cannot be inflated by unpaired answer-sheet fragments.
  const starterAnswersRaw: LinkedQaItem[] = [];
  const exitAnswersRaw: LinkedQaItem[] = [];
  const worksheetAnswersRaw: LinkedQaItem[] = safeWorksheet
    .filter((q) => q.answer?.trim())
    .map((q) => ({
      id: stableId("a", `${q.id}:${q.answer}`),
      prompt: "",
      answer: q.answer,
      sourceComponent: "worksheet_answers" as const,
      sourceFileId: q.sourceFileId,
      questionNumber: q.questionNumber,
      subQuestionNumber: q.subQuestionNumber,
    }));

  const slideText = combinedText(slideFiles.filter((f) => isUsableExtractedText(f.textContent || "")));
  const notesText = combinedText(notesFiles);
  const teachingSource = slideText || notesText || allText;

  const teachingExplanations = extractListAfterHeading(
    teachingSource,
    /(?:teaching\s+explanation|explanation|input|teacher\s+input)/i,
  );
  if (!teachingExplanations.length && teachingSource) {
    const paras = teachingSource.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 40 && !isGarbledText(p) && isUsableExtractedText(p));
    teachingExplanations.push(...paras.slice(0, 3));
  }

  const workedExamples = extractListAfterHeading(teachingSource, /worked\s+examples?/i);
  const misconceptions = extractListAfterHeading(allText, /misconceptions?/i);
  const priorKnowledge = extractListAfterHeading(allText, /prior\s+(knowledge|learning)/i);
  const reflectionTasks = extractListAfterHeading(allText, /reflection|plenary\s+discussion/i);

  // Pedagogical block split for school-day worksheets
  const guidedPractice = safeWorksheet.slice(0, Math.min(8, Math.ceil(safeWorksheet.length / 2) || safeWorksheet.length));
  const independentPractice = safeWorksheet.slice(guidedPractice.length);

  const title = extractTitle(files, allText);

  let learningObjective = extractObjective(allText) || extractObjective(slideText);
  if (!learningObjective || isGarbledText(learningObjective)) {
    learningObjective = title !== "Imported lesson pack"
      ? `I can ${title.charAt(0).toLowerCase()}${title.slice(1).replace(/\.$/, "")}.`
      : null;
  }

  const model: LessonPackStructuredModel = {
    title,
    subject: null,
    yearGroup: null,
    keyStage: null,
    curriculumArea: null,
    learningObjective,
    lessonOutcome: extractObjective(allText.replace(/learning\s+objective/i, "lesson outcome")),
    keywords: extractKeywords(allText),
    priorKnowledge,
    teachingExplanations,
    workedExamples,
    guidedPractice,
    independentPractice,
    reflectionTasks,
    starterQuestions: safeStarter,
    starterAnswers: starterAnswersRaw,
    worksheetTasks: safeWorksheet,
    worksheetAnswers: worksheetAnswersRaw,
    exitQuestions: safeExit,
    exitAnswers: exitAnswersRaw,
    misconceptions,
    teacherNotes: notesText ? [notesText.slice(0, 2000)] : [],
    sourceMetadata: {
      sourceName: input.sourceName ?? null,
      sourceUrl: input.sourceUrl ?? null,
      providerHints: providerHints(allText),
      extractionMeta,
    },
    licenceMetadata: {
      licenceType: input.licenceType ?? null,
      attribution: input.attribution ?? null,
    },
  };

  return model;
}

export function validateQuestionAnswerSeparation(model: LessonPackStructuredModel): string[] {
  const issues: string[] = [];
  const answerLike = (prompt: string) => /\b(answer|mark scheme|correct response)\s*[:\-]/i.test(prompt);

  for (const q of [...model.starterQuestions, ...model.exitQuestions, ...model.worksheetTasks]) {
    if (answerLike(q.prompt)) {
      issues.push(`Question ${q.id} looks like an answer sheet and was flagged`);
    }
  }
  if (model.starterAnswers.length && !model.starterQuestions.length) {
    issues.push("Starter answers present without starter questions");
  }
  if (model.exitAnswers.length && !model.exitQuestions.length) {
    issues.push("Exit answers present without exit questions");
  }
  if (model.worksheetAnswers.length && !model.worksheetTasks.length) {
    issues.push("Worksheet answers present without worksheet questions");
  }
  return issues;
}

export type QaPairingReport = {
  questionsFound: number;
  answersPaired: number;
  questionsWithoutAnswers: number;
  answersWithoutQuestions: number;
  teacherGuidanceOnly: number;
  autoMarkedQuestions: number;
  guidedReviewActivities: number;
  guidanceGroups: number;
  lowConfidencePairings: number;
  excludedFragments: number;
  orphanCorrectAnswers: number;
};

export function buildQaPairingReport(model: LessonPackStructuredModel): QaPairingReport {
  const allQuestions = [...model.starterQuestions, ...model.worksheetTasks, ...model.exitQuestions];
  const meta = model.sourceMetadata.extractionMeta;

  const questionsFound = allQuestions.length;
  const autoMarkedQuestions = allQuestions.filter((q) => (q.markingMode ?? "auto") === "auto").length;
  const guidedReviewActivities = allQuestions.filter((q) => q.markingMode === "guided_review").length;
  const answersPaired = allQuestions.filter((q) =>
    (q.markingMode === "guided_review" && (q.explanation?.trim() || q.supportingContext?.trim()))
    || Boolean(q.answer?.trim()),
  ).length;
  const questionsWithoutAnswers = allQuestions.filter((q) =>
    (q.markingMode ?? "auto") === "auto" && !q.answer?.trim(),
  ).length;
  const orphanCorrectAnswers = meta?.orphanCorrectAnswers ?? 0;
  const answersWithoutQuestions = orphanCorrectAnswers;
  const guidanceGroups = meta?.guidanceGroups ?? 0;
  // Guidance is grouped under activities — do not count as separate teacher-guidance entities
  const teacherGuidanceOnly = guidanceGroups;
  const lowConfidencePairings = allQuestions.filter((q) =>
    typeof q.pairingConfidence === "number" && q.pairingConfidence < 0.7,
  ).length;
  const excludedFragments = meta?.excludedFragments ?? 0;

  return {
    questionsFound,
    answersPaired,
    questionsWithoutAnswers,
    answersWithoutQuestions,
    teacherGuidanceOnly,
    autoMarkedQuestions,
    guidedReviewActivities,
    guidanceGroups,
    lowConfidencePairings,
    excludedFragments,
    orphanCorrectAnswers,
  };
}

export type PreDraftValidation = {
  titleQuality: "pass" | "warning" | "blocked";
  objectiveQuality: "pass" | "warning" | "blocked";
  encodingQuality: "pass" | "warning" | "blocked";
  questionAnswerPairing: "pass" | "warning" | "needs_input" | "blocked";
  playableFirstActivity: "pass" | "blocked";
  playableAllActivities: "pass" | "blocked";
  visualDependency: "pass" | "needs_input" | "blocked";
  durationQuality: "pass" | "warning";
  licenceResult: "pass" | "needs_input" | "blocked";
  thirdPartyResult: "pass" | "warning";
  overallReady: boolean;
  issues: string[];
};

export function validatePreDraft(input: {
  structured: LessonPackStructuredModel;
  licenceType?: string | null;
  attribution?: string | null;
  sourceName?: string | null;
  thirdPartyCount: number;
  providerHints: string[];
}): PreDraftValidation {
  const issues: string[] = [];
  const { structured } = input;

  // Title
  let titleQuality: PreDraftValidation["titleQuality"] = "pass";
  if (structured.title === "Imported lesson pack") {
    titleQuality = "warning";
    issues.push("No meaningful title could be extracted");
  }
  if (/LESS-/i.test(structured.title) || /worksheet\s+answers?/i.test(structured.title)) {
    titleQuality = "blocked";
    issues.push("Title contains internal code or answer-sheet suffix");
  }
  if (isGarbledText(structured.title)) {
    titleQuality = "blocked";
    issues.push("Title contains corrupted text");
  }

  // Objective
  let objectiveQuality: PreDraftValidation["objectiveQuality"] = "pass";
  if (!structured.learningObjective) {
    objectiveQuality = "warning";
    issues.push("No learning objective extracted");
  } else if (isGarbledText(structured.learningObjective)) {
    objectiveQuality = "blocked";
    issues.push("Learning objective contains corrupted text");
  }

  // Encoding
  const allText = [
    structured.title,
    structured.learningObjective ?? "",
    ...structured.starterQuestions.map((q) => q.prompt),
    ...structured.worksheetTasks.map((q) => q.prompt),
    ...structured.exitQuestions.map((q) => q.prompt),
  ].join(" ");
  const encodingQuality: PreDraftValidation["encodingQuality"] = isGarbledText(allText) ? "blocked" : "pass";
  if (encodingQuality === "blocked") issues.push("Student-facing text contains encoding errors");

  // Q/A pairing — require auto-marked answers; orphan *correct* answers block draft
  const qaPairing = buildQaPairingReport(structured);
  let questionAnswerPairing: PreDraftValidation["questionAnswerPairing"] = "pass";
  if (qaPairing.orphanCorrectAnswers > 0) {
    questionAnswerPairing = "blocked";
    issues.push(`${qaPairing.orphanCorrectAnswers} unexplained orphan correct answer(s)`);
  } else if (qaPairing.questionsWithoutAnswers > 0) {
    questionAnswerPairing = "blocked";
    issues.push(`${qaPairing.questionsWithoutAnswers} auto-marked question(s) missing paired answers`);
  }

  // Zero usable student activities is a distinct block reason (not a generic Q/A mismatch).
  const allStudentActivities = [...structured.starterQuestions, ...structured.worksheetTasks, ...structured.exitQuestions];
  if (allStudentActivities.length === 0) {
    issues.push("No playable student activities could be extracted from this lesson.");
  }

  // Validate every included activity is playable (structured model should already exclude blocked ones)
  let playableFirstActivity: PreDraftValidation["playableFirstActivity"] = "pass";
  let playableAllActivities: PreDraftValidation["playableAllActivities"] = "pass";
  let visualDependency: PreDraftValidation["visualDependency"] = "pass";

  const meta = structured.sourceMetadata.extractionMeta;
  if ((meta?.needsAdminReconstruction ?? 0) > 0) {
    visualDependency = "needs_input";
    issues.push(`${meta?.needsAdminReconstruction} activit(ies) need Admin reconstruction before they can be included`);
  }
  if ((meta?.missingVisuals ?? 0) > 0 && (meta?.playableActivities ?? allStudentActivities.length) === 0) {
    visualDependency = "blocked";
    issues.push("Required visuals are missing and no playable activities remain");
  }

  for (const activity of allStudentActivities) {
    const result = validatePlayableActivity(activity);
    if (!result.playable) {
      playableAllActivities = "blocked";
      issues.push(`Included activity failed playable validation: ${result.reasons.join(", ") || "unknown"}`);
      if (result.reasons.includes("missing_required_visual")) visualDependency = "blocked";
    }
  }

  const firstQuestion = structured.starterQuestions[0] ?? structured.worksheetTasks[0] ?? structured.exitQuestions[0];
  if (allStudentActivities.length === 0) {
    playableFirstActivity = "blocked";
    playableAllActivities = "blocked";
  } else if (!firstQuestion || !firstQuestion.prompt?.trim() || isGarbledText(firstQuestion.prompt)) {
    playableFirstActivity = "blocked";
    issues.push("First student activity is blank or corrupted");
  } else {
    const firstResult = validatePlayableActivity(firstQuestion);
    if (!firstResult.playable) {
      playableFirstActivity = "blocked";
      issues.push(`First student activity is not playable: ${firstResult.reasons.join(", ")}`);
    } else if (isOversizedPrompt(firstQuestion.prompt)) {
      playableFirstActivity = "blocked";
      issues.push("First student activity prompt is oversized or concatenated page content");
    } else if ((firstQuestion.markingMode ?? "auto") === "auto" && !firstQuestion.answer?.trim()) {
      playableFirstActivity = "blocked";
      issues.push("First auto-marked activity has no answer");
    } else if (firstQuestion.markingMode === "guided_review" && !firstQuestion.explanation?.trim()) {
      playableFirstActivity = "blocked";
      issues.push("First guided-review activity has no success criteria");
    }
  }

  // Duration
  const durationQuality: PreDraftValidation["durationQuality"] = "pass";

  // Licence: required for third-party imported content
  const hasProviderHints = input.providerHints.length > 0 || Boolean(input.sourceName);
  let licenceResult: PreDraftValidation["licenceResult"] = "pass";
  if (hasProviderHints && !input.licenceType?.trim()) {
    licenceResult = "needs_input";
    issues.push("Licence type is required for third-party imported content");
  }
  if (hasProviderHints && !input.attribution?.trim()) {
    licenceResult = licenceResult === "pass" ? "needs_input" : licenceResult;
    issues.push("Attribution wording is required for third-party imported content");
  }
  if (hasProviderHints && !input.sourceName?.trim()) {
    licenceResult = licenceResult === "pass" ? "needs_input" : licenceResult;
    issues.push("Source name is required for third-party imported content");
  }

  // Third-party
  const thirdPartyResult: PreDraftValidation["thirdPartyResult"] = input.thirdPartyCount > 0 ? "warning" : "pass";

  if (allStudentActivities.length === 0) {
    questionAnswerPairing = "blocked";
  }
  const blockers = [titleQuality, objectiveQuality, encodingQuality, questionAnswerPairing, playableFirstActivity, playableAllActivities, visualDependency, licenceResult]
    .filter((v) => v === "blocked");
  // Reconstruction queue items are excluded from student totals — needs_input alone does not block Ready
  // when enough playable activities remain.
  const ready = blockers.length === 0
    && licenceResult === "pass"
    && questionAnswerPairing === "pass"
    && allStudentActivities.length > 0
    && playableAllActivities === "pass"
    && playableFirstActivity === "pass"
    && visualDependency !== "blocked";

  return {
    titleQuality,
    objectiveQuality,
    encodingQuality,
    questionAnswerPairing,
    playableFirstActivity,
    playableAllActivities,
    visualDependency,
    durationQuality,
    licenceResult,
    thirdPartyResult,
    overallReady: ready,
    issues: [...new Set(issues)],
  };
}
