import {
  normalizeQuestionText,
  questionSimilarity,
  summarizeQuestionDuplicatesForContent,
  type QuestionDuplicateSummary,
} from "@/lib/question-duplicate-detection";
import { analyzeSessionSlotDuplicates } from "@/lib/session-slot-duplicates";
import { buildSourceFingerprint } from "@/lib/lesson-pack-import/security";
import type {
  LessonPackDuplicateLevel,
  LessonPackDuplicateMatch,
  LessonPackDuplicateReport,
  LessonPackStructuredModel,
} from "@/lib/lesson-pack-import/types";

export type HistoricalContentRecord = {
  contentId: string;
  contentStatus?: string | null;
  contentSubject?: string | null;
  contentYearGroup?: string | null;
  contentKeyStage?: string | null;
  topic?: string | null;
  contentJson: string;
  sourceFingerprint?: string | null;
  metadataJson?: string | null;
};

function levelLabel(level: LessonPackDuplicateLevel): string {
  switch (level) {
    case "none":
      return "No duplicates found";
    case "possible":
      return "Possible duplicate";
    case "high_confidence":
      return "High-confidence duplicate";
    case "exact":
      return "Exact duplicate";
  }
}

function itemsToContentJson(structured: LessonPackStructuredModel): string {
  const items = [
    ...structured.starterQuestions,
    ...structured.worksheetTasks,
    ...structured.exitQuestions,
    ...structured.guidedPractice,
    ...structured.independentPractice,
  ].map((q) => ({
    id: q.id,
    prompt: q.prompt,
    answer: q.answer ?? "",
    choices: q.choices ?? [],
  }));
  return JSON.stringify(items);
}

function detectIntraPackClones(structured: LessonPackStructuredModel): LessonPackDuplicateMatch[] {
  const matches: LessonPackDuplicateMatch[] = [];
  const starter = structured.starterQuestions;
  const exit = structured.exitQuestions;

  for (const s of starter) {
    for (const e of exit) {
      const sim = questionSimilarity(s.prompt, e.prompt);
      const sameAnswer = normalizeQuestionText(s.answer) && normalizeQuestionText(s.answer) === normalizeQuestionText(e.answer);
      if (sim >= 0.92 || (sim >= 0.75 && sameAnswer)) {
        matches.push({
          level: sim >= 0.98 ? "exact" : "high_confidence",
          reason: "Same question appearing in starter and exit quiz",
          matchedContentId: null,
        });
      } else {
        // Number-changed clone
        const left = normalizeQuestionText(s.prompt).replace(/\d+/g, "#");
        const right = normalizeQuestionText(e.prompt).replace(/\d+/g, "#");
        if (left && left === right) {
          matches.push({
            level: "high_confidence",
            reason: "Question clone with changed numbers across starter and exit",
            matchedContentId: null,
          });
        }
      }
    }
  }

  const slotItems = [
    ...structured.starterQuestions,
    ...structured.worksheetTasks,
    ...structured.exitQuestions,
  ].map((q) => ({
    id: q.id,
    prompt: q.prompt,
    answer: q.answer ?? "",
    choices: q.choices ?? [],
  }));

  const session = analyzeSessionSlotDuplicates({
    contentJson: JSON.stringify(slotItems),
  });
  if (session.exactCount > 0 || session.nearCount > 0 || session.samePatternCount > 0) {
    matches.push({
      level: session.exactCount > 0 ? "exact" : "possible",
      reason: `Within-pack slot duplicates: ${session.duplicateSlotsCount}`,
      matchedContentId: null,
    });
  }

  return matches;
}

export function analyseLessonPackDuplicates(input: {
  structured: LessonPackStructuredModel;
  fileHashes: string[];
  sourceProvider?: string | null;
  sourceUrl?: string | null;
  yearGroup?: string | null;
  subject?: string | null;
  historicalRecords: HistoricalContentRecord[];
}): LessonPackDuplicateReport {
  const normalisedContent = [
    input.structured.title,
    input.structured.learningObjective ?? "",
    ...input.structured.teachingExplanations,
    ...input.structured.workedExamples,
    ...input.structured.starterQuestions.map((q) => `${q.prompt}|${q.answer ?? ""}`),
    ...input.structured.worksheetTasks.map((q) => `${q.prompt}|${q.answer ?? ""}`),
    ...input.structured.exitQuestions.map((q) => `${q.prompt}|${q.answer ?? ""}`),
  ].join("\n");

  const sourceFingerprint = buildSourceFingerprint({
    fileHashes: input.fileHashes,
    normalisedTitle: input.structured.title,
    sourceProvider: input.sourceProvider,
    sourceUrl: input.sourceUrl,
    yearGroup: input.yearGroup,
    subject: input.subject,
    normalisedContent,
  });

  const matches: LessonPackDuplicateMatch[] = [];
  matches.push(...detectIntraPackClones(input.structured));

  // Exact source fingerprint / same source lesson re-upload
  for (const record of input.historicalRecords) {
    if (record.sourceFingerprint && record.sourceFingerprint === sourceFingerprint) {
      matches.push({
        level: "exact",
        matchedContentId: record.contentId,
        matchedTopic: record.topic,
        reason: "Same source fingerprint (re-upload of the same lesson pack)",
      });
      continue;
    }

    let metaFingerprint: string | null = null;
    if (record.metadataJson) {
      try {
        const meta = JSON.parse(record.metadataJson) as Record<string, unknown>;
        if (typeof meta.sourceFingerprint === "string") metaFingerprint = meta.sourceFingerprint;
      } catch {
        // ignore
      }
    }
    if (metaFingerprint && metaFingerprint === sourceFingerprint) {
      matches.push({
        level: "exact",
        matchedContentId: record.contentId,
        matchedTopic: record.topic,
        reason: "Same source fingerprint stored on existing content metadata",
      });
    }

    // Title + objective near match
    const titleSim = questionSimilarity(input.structured.title, record.topic ?? "");
    if (titleSim >= 0.9 && input.yearGroup && record.contentYearGroup === input.yearGroup) {
      matches.push({
        level: titleSim >= 0.98 ? "high_confidence" : "possible",
        matchedContentId: record.contentId,
        matchedTopic: record.topic,
        reason: "Lesson title/topic closely matches existing content for the same year group",
      });
    }
  }

  const questionSummary: QuestionDuplicateSummary = summarizeQuestionDuplicatesForContent({
    contentId: "import-draft",
    contentStatus: "generated",
    contentSubject: input.subject,
    contentYearGroup: input.yearGroup,
    contentJson: itemsToContentJson(input.structured),
    historicalRecords: input.historicalRecords.map((r) => ({
      contentId: r.contentId,
      contentStatus: r.contentStatus,
      contentSubject: r.contentSubject,
      contentYearGroup: r.contentYearGroup,
      contentKeyStage: r.contentKeyStage,
      contentJson: r.contentJson,
    })),
  });

  if (questionSummary.hasDuplicates) {
    const level: LessonPackDuplicateLevel =
      questionSummary.exactCount > 0
        ? "exact"
        : questionSummary.nearCount > 0 || questionSummary.sameAnswerCount > 0
          ? "high_confidence"
          : "possible";
    matches.push({
      level,
      matchedContentId: questionSummary.matches[0]?.matchedContentId ?? null,
      reason: `Question-level duplicates via existing StarLiz detector (${questionSummary.duplicateCount})`,
      questionSummary,
    });
  }

  let level: LessonPackDuplicateLevel = "none";
  for (const match of matches) {
    if (match.level === "exact") level = "exact";
    else if (match.level === "high_confidence" && level !== "exact") level = "high_confidence";
    else if (match.level === "possible" && level === "none") level = "possible";
  }

  const blocked = level === "exact" || level === "high_confidence";

  return {
    level,
    label: levelLabel(level),
    matches,
    sourceFingerprint,
    blocked,
    overrideAllowed: blocked,
  };
}
