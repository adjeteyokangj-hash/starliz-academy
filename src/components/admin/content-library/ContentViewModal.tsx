"use client";

import { useCallback, useMemo, useState } from "react";
import StarLizQuestionCard from "@/components/learning/StarLizQuestionCard";
import type { ContentItem } from "./types";
import BlackBoxRepairPanel from "./BlackBoxRepairPanel";
import {
  getBlackBoxBadgeLabel,
  getBlackBoxBadgeTone,
  getContentJsonSummary,
  getContentMeta,
  parseBlackBoxAdminVerification,
  parseBlackBoxContentTest,
  parseBlackBoxStaleState,
  parseBlackBoxRuntimeTest,
  parseContentReviewHistory,
} from "./utils";
import { generationDisplayLabel, type AiGenerationMode } from "@/lib/admin-ai-generation-meta";
import { analyzeContentSessionSlots, getIncompleteSlotsReason, isQuestionSlotFilled } from "@/lib/session-slot-validation";
import { analyzeSessionSlotDuplicates, primaryDuplicateFlag } from "@/lib/session-slot-duplicates";
import {
  buildMissingSlotGenerationRequest,
  buildMissingSlotRecoveryPlan,
  formatMissingSlotRecoveryDiagnostics,
  mergeGeneratedIntoEmptySlots,
  resolveAdminGenerationSubjectContext,
  selectBestMissingSlotCandidates,
  summarizeSessionSlots,
  type MissingSlotRecoveryAttempt,
} from "@/lib/session-slot-recovery";
import { getBlackBoxRepairActionKind, runIssueSpecificRepairsForItem } from "@/lib/ai/content-repair";
import type { ContentReviewHistoryEntry } from "./types";

type Props = {
  open: boolean;
  content: ContentItem | null;
  onClose: () => void;
  onVerified?: (item: ContentItem) => void;
};

type VerificationAction = "approve" | "reject" | "reclassify" | "needs_changes" | "send_back";

type VerificationPayload = {
  item?: {
    id: string;
    status: string;
    metadataJson?: string | null;
  };
  error?: string;
  blackBoxLiveTest?: unknown;
};

type GenerationPayload = {
  success?: boolean;
  error?: string;
  content?: { items?: unknown[] };
  generationMetadata?: {
    generationSource?: "openai" | "fallback" | "repair" | "mock";
    usedFallback?: boolean;
    fallbackReason?: string | null;
  };
  fallback?: {
    used?: boolean;
    reasonCode?: string;
    message?: string;
  };
};

type GeneratedReviewItem = Record<string, unknown>;

function asReviewItems(contentJson: string): GeneratedReviewItem[] {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.filter((item): item is GeneratedReviewItem => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  } catch {
    return [];
  }
}

function textValue(value: unknown): string {
  return String(value ?? "").trim();
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(textValue).filter(Boolean);
}

function firstText(item: GeneratedReviewItem, keys: string[]): string {
  for (const key of keys) {
    const value = textValue(item[key]);
    if (value) return value;
  }
  return "";
}

function answerOptionsFor(item: GeneratedReviewItem): string[] {
  return stringArrayValue(item.choices).length
    ? stringArrayValue(item.choices)
    : stringArrayValue(item.options).length
      ? stringArrayValue(item.options)
      : stringArrayValue(item.answerOptions);
}

function extractGaTwiMarkers(value: unknown): string[] {
  const matches = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return matches
    .flatMap((entry) => String(entry).match(/ga_twi_marker:([^,\]\s]+)/gi) ?? [])
    .map((entry) => entry.replace(/^ga_twi_marker:/i, "").trim())
    .filter(Boolean);
}

function isLevelQualityWarningReason(reason: string): boolean {
  return (
    /Declared level .* does not match expected/i.test(reason)
    || /Item appears too (easy|hard) for the selected level/i.test(reason)
    || /Vocabulary\/readability appears too (simple|advanced)/i.test(reason)
    || /Answer is too thin for the selected level/i.test(reason)
  );
}

function buildLevelQualityWarningSummary(input: {
  itemChecks: Array<{ itemIndex?: number; reasons?: string[] }>;
  itemCount: number;
  scoreCap?: { warningItemCount?: number; totalItemCount?: number; reason: string; capPercent: number };
}): {
  flaggedItemCount: number;
  totalItemCount: number;
  flaggedItemIds: number[];
} | null {
  const flaggedFromChecks = input.itemChecks
    .map((check, fallbackIndex) => {
      const reasons = Array.isArray(check.reasons) ? check.reasons : [];
      if (!reasons.some(isLevelQualityWarningReason)) return null;
      const zeroBasedIndex = typeof check.itemIndex === "number" ? check.itemIndex : fallbackIndex;
      return zeroBasedIndex + 1;
    })
    .filter((id): id is number => typeof id === "number" && Number.isFinite(id));

  const flaggedItemIds = Array.from(new Set(flaggedFromChecks)).sort((left, right) => left - right);
  const inferredTotal = input.itemCount > 0 ? input.itemCount : input.itemChecks.length;
  const totalItemCount = typeof input.scoreCap?.totalItemCount === "number"
    ? input.scoreCap.totalItemCount
    : inferredTotal;
  const flaggedItemCount = typeof input.scoreCap?.warningItemCount === "number"
    ? input.scoreCap.warningItemCount
    : flaggedItemIds.length;

  if (totalItemCount <= 0 || flaggedItemCount <= 0) return null;
  return {
    flaggedItemCount,
    totalItemCount,
    flaggedItemIds,
  };
}

function labelledLines(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${key}: ${textValue(entry)}`)
      .filter((line) => !line.endsWith(":"));
  }
  const text = textValue(value);
  return text ? [text] : [];
}

function difficultyLabel(value: number): string {
  if (value <= 2) return "Foundation";
  if (value <= 4) return "Core";
  if (value <= 6) return "Secure";
  return "Advanced";
}

function numericLevel(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(10, Math.round(parsed))) : fallback;
}

function questionFieldKeyFor(contentType: string, item: GeneratedReviewItem | null): string {
  if (item) {
    for (const key of ["question", "prompt", "word", "title"]) {
      if (typeof item[key] === "string") return key;
    }
  }
  if (contentType === "math") return "prompt";
  if (contentType === "spelling") return "word";
  return "question";
}

function answerFieldKeyFor(contentType: string, item: GeneratedReviewItem | null): string {
  if (item) {
    for (const key of ["answer", "correctAnswer", "expectedAnswer"]) {
      if (typeof item[key] === "string" || typeof item[key] === "number") return key;
    }
  }
  if (contentType === "reading") return "answer";
  return "answer";
}

function explanationFieldKeyFor(item: GeneratedReviewItem | null): string {
  if (item) {
    for (const key of ["explanation", "rationale", "feedback"]) {
      if (typeof item[key] === "string") return key;
    }
  }
  return "explanation";
}

function buildSlotEditorState(item: GeneratedReviewItem | null, contentType: string): {
  prompt: string;
  answer: string;
  choices: string;
  explanation: string;
} {
  if (!item) {
    return { prompt: "", answer: "", choices: "", explanation: "" };
  }

  const questionKey = questionFieldKeyFor(contentType, item);
  const answerKey = answerFieldKeyFor(contentType, item);
  const existingChoices = Array.isArray(item.choices)
    ? (item.choices as unknown[]).map((entry) => String(entry).trim()).filter(Boolean)
    : [];

  return {
    prompt: String(item[questionKey] ?? ""),
    answer: String(item[answerKey] ?? ""),
    choices: existingChoices.join(", "),
    explanation: firstText(item, ["explanation", "rationale", "feedback"]),
  };
}

function withUpdatedItemLevel(item: GeneratedReviewItem, level: number): GeneratedReviewItem {
  return {
    ...item,
    level,
    difficulty: level,
    difficultyLevel: level,
    difficultyLabel: difficultyLabel(level),
  };
}

type DuplicateIssueType = "exact" | "near" | "same_pattern";

type DuplicatePairIssue = {
  pairKey: string;
  slotIndexes: [number, number];
  severity: DuplicateIssueType;
  labels: DuplicateIssueType[];
};

type GlobalDuplicateSlotIssue = {
  pairKey: string;
  currentSlotId: string;
  currentSlotIndex: number;
  matchedQuestionId: string;
  matchedSlotIndex: number;
  matchedContentId: string;
  duplicateType: string;
  sourceStatus: string;
  similarity: number;
};

type BlackBoxBatchFixPreview = {
  updatedItems: GeneratedReviewItem[];
  changedIndexes: number[];
  details: string[];
};

function duplicateSeverityRank(value: DuplicateIssueType): number {
  if (value === "exact") return 3;
  if (value === "near") return 2;
  return 1;
}

function buildDuplicatePairIssues(issues: Array<{ type: DuplicateIssueType; slotIndexes: [number, number] }>): DuplicatePairIssue[] {
  const map = new Map<string, { slotIndexes: [number, number]; labels: Set<DuplicateIssueType> }>();
  for (const issue of issues) {
    const [left, right] = issue.slotIndexes[0] < issue.slotIndexes[1]
      ? issue.slotIndexes
      : [issue.slotIndexes[1], issue.slotIndexes[0]] as [number, number];
    const key = `${left}-${right}`;
    const current = map.get(key);
    if (!current) {
      map.set(key, { slotIndexes: [left, right], labels: new Set([issue.type]) });
      continue;
    }
    current.labels.add(issue.type);
  }

  return Array.from(map.entries())
    .map(([pairKey, value]) => {
      const labels = Array.from(value.labels.values()).sort((a, b) => duplicateSeverityRank(b) - duplicateSeverityRank(a));
      return {
        pairKey,
        slotIndexes: value.slotIndexes,
        severity: labels[0] ?? "same_pattern",
        labels,
      };
    })
    .sort((left, right) => {
      const severity = duplicateSeverityRank(right.severity) - duplicateSeverityRank(left.severity);
      if (severity !== 0) return severity;
      if (left.slotIndexes[0] !== right.slotIndexes[0]) return left.slotIndexes[0] - right.slotIndexes[0];
      return left.slotIndexes[1] - right.slotIndexes[1];
    });
}

function promptLikeText(item: GeneratedReviewItem | null | undefined): string {
  if (!item) return "";
  return firstText(item, ["question", "prompt", "word", "title", "passage", "text"]);
}

function normalizedPrompt(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseReasonItemIndex(reason: string): number | null {
  const match = /item\s+(\d+)\s*:/i.exec(reason);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed - 1;
}

const CONTENT_LIBRARY_AI_MODE_OPTIONS: Array<{
  value: AiGenerationMode;
  label: string;
  helper: string;
}> = [
  {
    value: "live_openai_only",
    label: "Live OpenAI only",
    helper: "Fail clearly if OpenAI fails.",
  },
  {
    value: "openai_with_fallback",
    label: "OpenAI with fallback",
    helper: "Try OpenAI first, then use fallback if needed.",
  },
  {
    value: "fallback_only",
    label: "Fallback only",
    helper: "Do not call OpenAI.",
  },
];

function aiModeLabel(mode: AiGenerationMode): string {
  return CONTENT_LIBRARY_AI_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? mode;
}

function isGeneratedItem(value: unknown): value is GeneratedReviewItem {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasRegenerationContext(metaSubject: string, metaYearGroup: string | null | undefined, contentLevel: number, metaTopic: string | null | undefined, metaSkillFocus: string | null | undefined): boolean {
  return Boolean(metaSubject && metaYearGroup && Number.isFinite(contentLevel) && (metaTopic || metaSkillFocus));
}

function generationSourceLabelFromPayload(payload: GenerationPayload | null | undefined): string | null {
  const source = payload?.generationMetadata?.generationSource;
  const label = source ? generationDisplayLabel({ generationSource: source }) : null;
  if (label) return label;
  if (payload?.generationMetadata?.usedFallback || payload?.fallback?.used) {
    return "Generated using fallback";
  }
  return null;
}

export default function ContentViewModal({ open, content, onClose, onVerified }: Props) {
  if (!open || !content) return null;
  return (
    <ContentViewModalBody
      key={content.id}
      content={content}
      onClose={onClose}
      onVerified={onVerified}
    />
  );
}

function ContentViewModalBody({
  content,
  onClose,
  onVerified,
}: {
  content: ContentItem;
  onClose: () => void;
  onVerified?: (item: ContentItem) => void;
}) {
  const meta = getContentMeta(content);
  const summaryWithContext = getContentJsonSummary(content.contentJson, {
    contentType: content.contentType,
    metadataJson: content.metadataJson,
    subject: meta.subject,
  });
  const blackBox = parseBlackBoxContentTest(content);
  const runtime = parseBlackBoxRuntimeTest(content);
  const verification = parseBlackBoxAdminVerification(content);
  const blackBoxStale = parseBlackBoxStaleState(content);
  const reviewHistory = useMemo(() => parseContentReviewHistory(content), [content]);
  const items = useMemo(() => asReviewItems(content.contentJson), [content.contentJson]);
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [rawExpanded, setRawExpanded] = useState(false);
  const [selectedApprovalSlots, setSelectedApprovalSlots] = useState<number[]>([]);
  const [highlightedSlots, setHighlightedSlots] = useState<number[]>([]);
  /** Per-item review notes — keyed by item index (Part 2) */
  const [itemNotes, setItemNotes] = useState<Record<number, string>>({});
  const [subject, setSubject] = useState(blackBox?.reclassificationRecommendation?.subject ?? meta.subject ?? "");
  const [strand, setStrand] = useState(blackBox?.reclassificationRecommendation?.strand ?? "");
  const [workingAction, setWorkingAction] = useState<VerificationAction | null>(null);
  const [blackBoxRetesting, setBlackBoxRetesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [slotCountInput, setSlotCountInput] = useState("");
  const currentItem = items[selectedItemIndex] ?? null;
  const approvalProgress = useMemo(() => {
    const latestByIndex = new Map<number, ContentReviewHistoryEntry>();
    const sortedHistory = [...reviewHistory].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
    for (const entry of sortedHistory) {
      if (typeof entry.questionIndex !== "number") continue;
      latestByIndex.set(entry.questionIndex, entry);
    }

    const approvedSlotIndexes = Array.from(latestByIndex.entries())
      .filter(([, entry]) => entry.action === "approve")
      .map(([index]) => index)
      .sort((left, right) => left - right);
    const approvedCount = approvedSlotIndexes.length;
    const totalSlots = items.filter((entry) => isQuestionSlotFilled(entry)).length || items.length;

    return {
      approvedSlotIndexes,
      approvedCount,
      totalSlots,
      isFullApproval: totalSlots > 0 && approvedCount >= totalSlots,
      isPartialApproval: approvedCount > 0 && approvedCount < totalSlots,
    };
  }, [items, reviewHistory]);
  const slotSummary = useMemo(() => analyzeContentSessionSlots({
    contentJson: content.contentJson,
    contentType: content.contentType,
    metadataJson: content.metadataJson,
    subject: meta.subject,
  }), [content.contentJson, content.contentType, content.metadataJson, meta.subject]);
  const duplicateSummary = useMemo(() => analyzeSessionSlotDuplicates({
    contentJson: content.contentJson,
    contentType: content.contentType,
    metadataJson: content.metadataJson,
    subject: meta.subject,
  }), [content.contentJson, content.contentType, content.metadataJson, meta.subject]);
  const globalDuplicateSummary = content.globalDuplicateSummary ?? null;
  const duplicatePairs = useMemo(() => buildDuplicatePairIssues(duplicateSummary.issues), [duplicateSummary.issues]);
  const slotIndexById = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item, index) => {
      const explicitId = textValue(item.id);
      if (explicitId) map.set(explicitId, index);
      map.set(`${content.id}:slot-${index}`, index);
    });
    return map;
  }, [content.id, items]);
  const globalDuplicateIssues = useMemo(() => {
    if (!globalDuplicateSummary?.matches?.length) return [] as GlobalDuplicateSlotIssue[];
    const issues: GlobalDuplicateSlotIssue[] = [];
    for (const match of globalDuplicateSummary.matches) {
      const mappedIndex = slotIndexById.get(match.currentSlotId);
      let resolvedIndex = typeof mappedIndex === "number" ? mappedIndex : -1;
      if (resolvedIndex < 0) {
        const fallback = /:slot-(\d+)$/.exec(match.currentSlotId);
        if (fallback) {
          const parsed = Number(fallback[1]);
          if (Number.isFinite(parsed)) resolvedIndex = parsed;
        }
      }
      if (resolvedIndex < 0 || resolvedIndex >= items.length) continue;
      issues.push({
        pairKey: `${match.currentSlotId}-${match.matchedQuestionId}-${match.matchedContentId}`,
        currentSlotId: match.currentSlotId,
        currentSlotIndex: resolvedIndex,
        matchedQuestionId: match.matchedQuestionId,
        matchedSlotIndex: match.matchedSlotIndex,
        matchedContentId: match.matchedContentId,
        duplicateType: match.duplicateType,
        sourceStatus: match.sourceStatus,
        similarity: match.similarity,
      });
    }
    return issues;
  }, [globalDuplicateSummary, items.length, slotIndexById]);
  const hasGlobalDuplicates = Boolean(globalDuplicateSummary?.hasDuplicates);
  const totalDuplicateCount = globalDuplicateSummary?.duplicateCount ?? duplicatePairs.length;
  const [pairKeepChoice, setPairKeepChoice] = useState<Record<string, number>>({});
  const [duplicateWarningIgnored, setDuplicateWarningIgnored] = useState(false);
  const [regeneratingDuplicateSlots, setRegeneratingDuplicateSlots] = useState(false);
  const [generatingMissingSlots, setGeneratingMissingSlots] = useState(false);
  const [repairingItem, setRepairingItem] = useState(false);
  const [regeneratingQuestion, setRegeneratingQuestion] = useState(false);
  const [blackBoxBatchFixPreview, setBlackBoxBatchFixPreview] = useState<BlackBoxBatchFixPreview | null>(null);
  const [applyingBlackBoxBatchFix, setApplyingBlackBoxBatchFix] = useState(false);
  const [questionRegenerationPreview, setQuestionRegenerationPreview] = useState<{
    issueText: string;
    aiMode: AiGenerationMode;
    sourceLabel: string | null;
    before: GeneratedReviewItem;
    after: GeneratedReviewItem;
  } | null>(null);
  const [contentLibraryAiMode, setContentLibraryAiMode] = useState<AiGenerationMode>("openai_with_fallback");
  const effectivePairKeepChoice = useMemo(() => {
    const resolved: Record<string, number> = {};
    for (const pair of duplicatePairs) {
      const configured = pairKeepChoice[pair.pairKey];
      resolved[pair.pairKey] = configured === pair.slotIndexes[0] || configured === pair.slotIndexes[1]
        ? configured
        : pair.slotIndexes[0];
    }
    return resolved;
  }, [duplicatePairs, pairKeepChoice]);
  const duplicateReplacementTargets = useMemo(() => {
    if (globalDuplicateIssues.length > 0) {
      const targets = new Set<number>();
      for (const issue of globalDuplicateIssues) {
        targets.add(issue.currentSlotIndex);
      }
      return Array.from(targets.values()).sort((a, b) => a - b);
    }
    const targets = new Set<number>();
    for (const pair of duplicatePairs) {
      const keepIndex = effectivePairKeepChoice[pair.pairKey] ?? pair.slotIndexes[0];
      const replaceIndex = keepIndex === pair.slotIndexes[0] ? pair.slotIndexes[1] : pair.slotIndexes[0];
      targets.add(replaceIndex);
    }
    return Array.from(targets.values()).sort((a, b) => a - b);
  }, [duplicatePairs, effectivePairKeepChoice, globalDuplicateIssues]);
  const missingSlotIndexes = useMemo(() => summarizeSessionSlots(items).emptySlotIndexes, [items]);
  const initialSlotEditor = buildSlotEditorState(currentItem, content.contentType);
  const [slotPromptInput, setSlotPromptInput] = useState(initialSlotEditor.prompt);
  const [slotAnswerInput, setSlotAnswerInput] = useState(initialSlotEditor.answer);
  const [slotChoicesInput, setSlotChoicesInput] = useState(initialSlotEditor.choices);
  const [explanationInput, setExplanationInput] = useState(initialSlotEditor.explanation);
  const slotCountValue = slotCountInput || String(Math.max(1, items.length || 1));
  const answerOptions = currentItem ? answerOptionsFor(currentItem) : [];
  const questionText = currentItem ? firstText(currentItem, ["question", "prompt", "word", "title"]) : "No question content available.";
  const correctAnswer = currentItem ? firstText(currentItem, ["answer", "correctAnswer", "expectedAnswer"]) : "";
  const explanation = currentItem ? firstText(currentItem, ["explanation", "rationale", "feedback"]) : "";
  const normalizedPersistedExplanation = explanation.trim();
  const normalizedEditedExplanation = explanationInput.trim();
  const explanationHasUnsavedChanges = normalizedEditedExplanation !== normalizedPersistedExplanation;
  const hint = currentItem ? firstText(currentItem, ["hint", "sentenceContext", "support"]) : "";
  const workedSolution = currentItem ? firstText(currentItem, ["workedSolution", "worked_solution", "solution", "method"]) : "";
  const coachSteps = currentItem ? [
    ...labelledLines(currentItem.coachSteps),
    ...labelledLines(currentItem.guidedSteps),
    ...labelledLines(currentItem.steps),
  ] : [];
  const passage = currentItem ? firstText(currentItem, ["passage", "text", "sourceText"]) : "";
  const currentItemCheck = blackBox?.itemChecks?.find((check) => check.itemIndex === selectedItemIndex)
    ?? blackBox?.itemChecks?.[selectedItemIndex]
    ?? null;
  const itemRepairReasons = currentItemCheck?.reasons?.filter(Boolean) ?? [];
  const fallbackRepairReasons = blackBox?.reasons?.filter(Boolean) ?? [];
  const repairReasons = itemRepairReasons.length > 0 ? itemRepairReasons : fallbackRepairReasons;
  const localRepairReasons = repairReasons.filter((reason) => getBlackBoxRepairActionKind(reason) === "local");
  const selectedItemLocalRepairReasons = useMemo(
    () => localRepairReasons.filter((reason) => {
      const parsedIndex = parseReasonItemIndex(reason);
      return parsedIndex === null || parsedIndex === selectedItemIndex;
    }),
    [localRepairReasons, selectedItemIndex],
  );
  const offSlotRepairTargets = useMemo(
    () => Array.from(new Set(
      localRepairReasons
        .map((reason) => parseReasonItemIndex(reason))
        .filter((index): index is number => index !== null && index !== selectedItemIndex),
    )).sort((a, b) => a - b),
    [localRepairReasons, selectedItemIndex],
  );
  const hasBlockingBlackBoxReason = useCallback((reasons: string[]) => {
    const normalizedReasons = reasons.map((reason) => String(reason).toLowerCase());
    return normalizedReasons.some((reason) => (
      reason.includes("curriculum quality block")
      || reason.includes("missing question/prompt text")
      || reason.includes("missing correct answer")
      || reason.includes("correct answer is not present")
      || reason.includes("duplicate options")
      || reason.includes("fewer than two options")
      || reason.includes("expected reading") && reason.includes("detected")
    ));
  }, []);
  const rejectedSlotIndexes = useMemo(
    () => Array.from(new Set(
      (blackBox?.itemChecks ?? [])
        .map((check, fallbackIndex) => {
          const isRejected = hasBlockingBlackBoxReason(check.reasons ?? []);
          if (!isRejected) return -1;
          const itemIndex = typeof check.itemIndex === "number" ? check.itemIndex : fallbackIndex;
          return itemIndex;
        })
        .filter((index) => index >= 0),
    )).sort((a, b) => a - b),
    [blackBox?.itemChecks, hasBlockingBlackBoxReason],
  );
  const rejectedSlotIndexSet = useMemo(() => new Set(rejectedSlotIndexes), [rejectedSlotIndexes]);
  const shouldRenderRepairPanel = Boolean(currentItem && selectedItemLocalRepairReasons.length > 0);
  const gaTwiMarkers = Array.from(new Set([
    ...extractGaTwiMarkers(blackBox?.reasons),
    ...extractGaTwiMarkers(currentItemCheck?.reasons),
  ]));
  const estimatedMinutes = Math.max(2, Math.ceil(items.length * 1.5));
  const currentItemLevel = numericLevel(currentItem?.difficulty ?? currentItem?.level, content.level);
  const recommendedLevel = currentItemCheck?.recommendedLevel ?? currentItemCheck?.estimatedLevel ?? null;
  const levelRecommendation = currentItemCheck?.levelRecommendation ?? null;
  const levelQualityWarningSummary = buildLevelQualityWarningSummary({
    itemChecks: blackBox?.itemChecks ?? [],
    itemCount: items.length,
    scoreCap: blackBox?.scoreCap,
  });
  const qualityRepairReasons = repairReasons.filter((reason) => getBlackBoxRepairActionKind(reason) === "quality");
  const canRunRegeneration = hasRegenerationContext(meta.subject ?? "", meta.yearGroup, content.level, meta.topic, meta.skillFocus);
  const generationSubjectContext = resolveAdminGenerationSubjectContext({
    subject: meta.subject,
    contentType: content.contentType,
    yearGroup: meta.yearGroup,
  });

  function hydrateSlotEditor(index: number, sourceItems: GeneratedReviewItem[] = items) {
    const nextCurrentItem = sourceItems[index] ?? null;
    const nextEditor = buildSlotEditorState(nextCurrentItem, content.contentType);
    setSlotPromptInput(nextEditor.prompt);
    setSlotAnswerInput(nextEditor.answer);
    setSlotChoicesInput(nextEditor.choices);
    setExplanationInput(nextEditor.explanation);
  }

  function selectSlot(index: number) {
    setSelectedItemIndex(index);
    hydrateSlotEditor(index);
  }

  function toggleApprovalSlot(index: number) {
    setSelectedApprovalSlots((current) => {
      if (current.includes(index)) {
        return current.filter((value) => value !== index);
      }
      return [...current, index].sort((left, right) => left - right);
    });
  }

  function clearApprovalSelection() {
    setSelectedApprovalSlots([]);
  }

  function highlightSlotCards(indexes: number[]) {
    const unique = Array.from(new Set(indexes)).filter((index) => index >= 0 && index < items.length);
    if (!unique.length) return;
    setHighlightedSlots(unique);
    window.setTimeout(() => setHighlightedSlots([]), 2200);
  }

  async function submitVerification(action: VerificationAction, questionIndex: number, noteOverride?: string | null) {
    const targetItem = items[questionIndex] ?? null;
    if (!content || !targetItem) return null;

    const notes = (noteOverride ?? itemNotes[questionIndex] ?? "").trim();
    const response = await fetch(`/api/admin/content/${content.id}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        notes,
        questionContext: {
          questionIndex,
          questionPreview: firstText(targetItem, ["question", "prompt", "word", "title"]).slice(0, 200) || undefined,
          itemId: typeof targetItem.id === "string" ? targetItem.id : undefined,
        },
        ...(action === "reclassify"
          ? {
              reclassification: {
                subject: subject.trim() || undefined,
                strand: strand.trim() || undefined,
              },
            }
          : {}),
      }),
    });

    const payload = await response.json() as VerificationPayload;
    if (!response.ok || !payload.item) {
      setMessage(payload.error ?? "Verification could not be saved.");
      return null;
    }

    return payload;
  }

  async function saveSlots(nextItems: GeneratedReviewItem[], successMessage: string) {
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/content/${content.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentJson: JSON.stringify(nextItems) }),
      });
      const payload = await response.json() as VerificationPayload;
      if (!response.ok || !payload.item) {
        setMessage(payload.error ?? "Could not save slot updates.");
        return false;
      }

      onVerified?.({
        ...content,
        status: payload.item.status,
        contentJson: JSON.stringify(nextItems),
        metadataJson: payload.item.metadataJson ?? content.metadataJson,
      });
      const safeIndex = Math.min(selectedItemIndex, Math.max(0, nextItems.length - 1));
      setSelectedItemIndex(safeIndex);
      hydrateSlotEditor(safeIndex, nextItems);
      setSlotCountInput("");
      setMessage(successMessage);
      return true;
    } catch {
      setMessage("Slot update request failed.");
      return false;
    }
  }

  async function applySlotCount() {
    const parsed = Number(slotCountValue);
    const nextCount = Number.isFinite(parsed) ? Math.max(1, Math.min(60, Math.trunc(parsed))) : items.length;
    if (nextCount === items.length) return;
    const nextItems = [...items];
    if (nextCount > nextItems.length) {
      while (nextItems.length < nextCount) {
        nextItems.push({});
      }
    } else {
      nextItems.length = nextCount;
    }
    const saved = await saveSlots(nextItems, `Slot count updated to ${nextCount}.`);
    if (saved && selectedItemIndex >= nextCount) {
      const nextIndex = Math.max(0, nextCount - 1);
      setSelectedItemIndex(nextIndex);
      hydrateSlotEditor(nextIndex, nextItems);
    }
  }

  async function clearSelectedSlot() {
    if (!items.length) return;
    const nextItems = [...items];
    nextItems[selectedItemIndex] = {};
    const saved = await saveSlots(nextItems, `Slot ${selectedItemIndex + 1} cleared.`);
    if (saved) {
      setSlotPromptInput("");
      setSlotAnswerInput("");
      setSlotChoicesInput("");
      setExplanationInput("");
    }
  }

  async function removeSlotAt(index: number) {
    if (items.length <= 1) {
      setMessage("At least 1 slot is required.");
      return;
    }
    if (index < 0 || index >= items.length) {
      setMessage("Could not resolve slot index for removal.");
      return;
    }
    const nextItems = [...items];
    nextItems.splice(index, 1);
    const saved = await saveSlots(nextItems, `Removed Slot ${index + 1}. Slot count is now ${nextItems.length}.`);
    if (saved) {
      const nextSelectedIndex = Math.max(0, Math.min(index, nextItems.length - 1));
      selectSlot(nextSelectedIndex);
    }
  }

  async function saveSelectedSlot() {
    if (!items.length) return;
    const prompt = slotPromptInput.trim();
    if (!prompt) {
      setMessage("Question/prompt is required to fill this slot.");
      return;
    }
    const nextItems = [...items];
    const existing = (nextItems[selectedItemIndex] ?? {}) as GeneratedReviewItem;
    const questionKey = questionFieldKeyFor(content.contentType, existing);
    const answerKey = answerFieldKeyFor(content.contentType, existing);
    const explanationKey = explanationFieldKeyFor(existing);
    const nextItem: GeneratedReviewItem = {
      ...existing,
      [questionKey]: prompt,
    };
    if (slotAnswerInput.trim()) {
      nextItem[answerKey] = slotAnswerInput.trim();
    }
    const parsedChoices = slotChoicesInput
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (parsedChoices.length) {
      nextItem.choices = parsedChoices;
    }
    if (explanationInput.trim()) {
      nextItem[explanationKey] = explanationInput.trim();
    }
    nextItems[selectedItemIndex] = nextItem;
    await saveSlots(nextItems, `Slot ${selectedItemIndex + 1} saved.`);
  }

  async function saveCurrentExplanation() {
    if (!currentItem) return;
    setMessage(null);

    const nextItems = items.map((item, index) => {
      if (index !== selectedItemIndex) return item;
      const explanationKey = explanationFieldKeyFor(item);
      return {
        ...item,
        [explanationKey]: explanationInput.trim(),
      };
    });

    await saveSlots(nextItems, `Explanation updated for item ${selectedItemIndex + 1}.`);
  }

  async function generateMissingSlots() {
    if (!missingSlotIndexes.length) {
      setMessage("No missing slots found.");
      return;
    }
    if (!canRunRegeneration) {
      setMessage("Missing slot generation needs subject, year group, level, and topic context.");
      return;
    }

    setGeneratingMissingSlots(true);
    setMessage(null);

    try {
      const avoidPrompts = items
        .filter((slot) => isQuestionSlotFilled(slot))
        .map((slot) => normalizedPrompt(promptLikeText(slot)))
        .filter(Boolean);
      let latestSourceLabel: string | null = null;

      const plan = buildMissingSlotRecoveryPlan({ missingSlots: missingSlotIndexes.length, contentType: content.contentType });
      const attempts: MissingSlotRecoveryAttempt[] = [];
      const generatedItems: GeneratedReviewItem[] = [];
      const passFailures: string[] = [];
      const passSeedBase = Date.now();
      const generatedPromptPool = new Set<string>();

      for (const pass of plan.passes) {
        if (generatedItems.length >= plan.internalCandidateTarget) break;

        const requestBody = buildMissingSlotGenerationRequest({
          context: {
            subject: meta.subject,
            keyStage: meta.keyStage,
            yearGroup: meta.yearGroup,
            ageGroup: meta.ageGroup,
            examBoard: meta.examBoard,
            level: content.level,
            topic: meta.topic,
            skillFocus: meta.skillFocus,
            curriculumPathway: meta.curriculumPathway,
            module: strand || null,
            contentType: content.contentType,
            avoidPrompts: Array.from(new Set([...avoidPrompts, ...Array.from(generatedPromptPool.values())])).slice(0, 24),
          },
          missingSlots: missingSlotIndexes.length,
          candidatePoolSize: pass.candidateCount,
          questionStyles: pass.questionStyles,
          passId: pass.id,
          passLabel: pass.label,
          aiMode: contentLibraryAiMode,
          regenerationNonce: passSeedBase + attempts.length,
        });

        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 30000);

        let passItems: GeneratedReviewItem[] = [];

        try {
          const response = await fetch("/api/admin/ai/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });

          const raw = await response.text();
          let payload: GenerationPayload | null = null;
          if (raw) {
            try {
              payload = JSON.parse(raw) as GenerationPayload;
            } catch {
              payload = null;
            }
          }

          if (!response.ok || payload?.success === false) {
            const fallbackMessage = raw && !raw.trim().startsWith("<") ? raw : null;
            passFailures.push(payload?.error ?? fallbackMessage ?? `Pass failed (${response.status}).`);
          } else {
            passItems = Array.isArray(payload?.content?.items)
              ? payload.content.items.filter(isGeneratedItem)
              : [];
            for (const candidate of passItems) {
              const prompt = normalizedPrompt(promptLikeText(candidate));
              if (prompt) generatedPromptPool.add(prompt);
            }
            const sourceLabel = generationSourceLabelFromPayload(payload);
            if (sourceLabel) latestSourceLabel = sourceLabel;
            console.info("[content-library] missing slots generation", {
              aiMode: contentLibraryAiMode,
              sourceLabel,
              passId: pass.id,
            });
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            passFailures.push("Generation request timed out for this pass.");
          } else {
            passFailures.push(error instanceof Error ? error.message : "Generation request failed for this pass.");
          }
        } finally {
          window.clearTimeout(timeoutId);
        }

        attempts.push({
          passId: pass.id,
          passLabel: pass.label,
          requestedCandidates: pass.candidateCount,
          generatedCandidates: passItems.length,
        });

        generatedItems.push(...passItems);
      }

      const selection = selectBestMissingSlotCandidates({
        existingItems: items,
        generatedItems,
        missingSlots: missingSlotIndexes.length,
        targetLevel: content.level,
        topic: meta.topic,
        skillFocus: meta.skillFocus,
      });

      let usedRelaxedFallback = false;
      let candidatesForMerge: GeneratedReviewItem[] = selection.selectedItems as GeneratedReviewItem[];
      if (candidatesForMerge.length === 0 && generatedItems.length > 0) {
        const existingPrompts = new Set(
          items
            .filter((entry) => isQuestionSlotFilled(entry))
            .map((entry) => normalizedPrompt(promptLikeText(entry)))
            .filter(Boolean),
        );
        const uniqueRelaxed: GeneratedReviewItem[] = [];
        const seenRelaxedPrompts = new Set<string>();
        for (const candidate of generatedItems) {
          if (!isQuestionSlotFilled(candidate)) continue;
          const prompt = normalizedPrompt(promptLikeText(candidate));
          if (!prompt) continue;
          if (existingPrompts.has(prompt) || seenRelaxedPrompts.has(prompt)) continue;
          seenRelaxedPrompts.add(prompt);
          existingPrompts.add(prompt);
          uniqueRelaxed.push(candidate);
          if (uniqueRelaxed.length >= missingSlotIndexes.length) break;
        }
        candidatesForMerge = uniqueRelaxed;
        usedRelaxedFallback = candidatesForMerge.length > 0;
      }

      const merged = mergeGeneratedIntoEmptySlots({
        existingItems: items,
        generatedItems: candidatesForMerge,
      });

      if (!merged.replacedCount) {
        const diagnosticsMessage = formatMissingSlotRecoveryDiagnostics({
          attempts,
          selection: selection.diagnostics,
          mergedSummary: merged.summary,
        });
        const failureSuffix = passFailures.length
          ? `\nGeneration errors: ${passFailures.slice(0, 2).join(" | ")}`
          : "";
        setMessage(`${diagnosticsMessage}\nNo valid generated items were returned for empty slots. Try again or create manually.${failureSuffix}`);
        return;
      }

      const diagnosticsMessage = formatMissingSlotRecoveryDiagnostics({
        attempts,
        selection: selection.diagnostics,
        mergedSummary: merged.summary,
      });

      const saved = await saveSlots(
        merged.mergedItems,
        `${latestSourceLabel ? `${latestSourceLabel}. ` : ""}${diagnosticsMessage}${usedRelaxedFallback ? "\nUsed relaxed fill fallback after strict matching returned no candidates." : ""}\n${merged.summary.missingSlots === 0
          ? `Generated ${merged.replacedCount} missing slot${merged.replacedCount === 1 ? "" : "s"}. Filled Slots: ${merged.summary.filledSlots}/${merged.summary.totalSlots}. Empty Slots: ${merged.summary.missingSlots}. Black Box must be re-run before review/publish.`
          : `Generated ${merged.replacedCount} missing slot${merged.replacedCount === 1 ? "" : "s"}. ${merged.summary.missingSlots} slot${merged.summary.missingSlots === 1 ? " remains" : "s remain"} empty.`}`,
      );

      if (saved && merged.summary.emptySlotIndexes.length > 0) {
        selectSlot(merged.summary.emptySlotIndexes[0]);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Missing slot generation request failed.");
    } finally {
      setGeneratingMissingSlots(false);
    }
  }

  function fillMissingFromLibrary() {
    if (!missingSlotIndexes.length) {
      setMessage("No missing slots found.");
      return;
    }
    selectSlot(missingSlotIndexes[0]);
    setMessage(`Slot ${missingSlotIndexes[0] + 1} selected. Fill this slot from library content and save.`);
  }

  function createMissingManually() {
    if (!missingSlotIndexes.length) {
      setMessage("No missing slots found.");
      return;
    }
    selectSlot(missingSlotIndexes[0]);
    setMessage(`Slot ${missingSlotIndexes[0] + 1} selected. Create content manually and click Save slot content.`);
  }

  function setKeepSlot(pairKey: string, slotIndex: number) {
    setPairKeepChoice((current) => ({
      ...current,
      [pairKey]: slotIndex,
    }));
  }

  function candidateStillDuplicateForSlot(candidateItems: GeneratedReviewItem[], slotIndex: number): boolean {
    const nextSummary = analyzeSessionSlotDuplicates({
      contentJson: JSON.stringify(candidateItems),
      contentType: content.contentType,
      metadataJson: content.metadataJson,
      subject: meta.subject,
    });
    return nextSummary.issues.some((issue) =>
      issue.slotIndexes[0] === slotIndex || issue.slotIndexes[1] === slotIndex,
    );
  }

  async function regenerateDuplicateSlots(slotIndexes: number[] = duplicateReplacementTargets): Promise<boolean> {
    if (!slotIndexes.length) {
      setMessage("No duplicate slots need replacement.");
      return false;
    }
    if (!canRunRegeneration) {
      setMessage("Duplicate question regeneration needs subject, year group, level, and topic context.");
      return false;
    }

    setRegeneratingDuplicateSlots(true);
    setMessage(null);
    const nextItems = [...items];
    const avoidPrompts = new Set<string>();
    let latestSourceLabel: string | null = null;
    for (let index = 0; index < nextItems.length; index += 1) {
      if (slotIndexes.includes(index)) continue;
      const prompt = normalizedPrompt(promptLikeText(nextItems[index]));
      if (prompt) avoidPrompts.add(prompt);
    }

    const failedSlots: number[] = [];
    let replacedCount = 0;

    for (const slotIndex of slotIndexes) {
      try {
        const response = await fetch("/api/admin/ai/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: generationSubjectContext.subject,
            englishStrand: generationSubjectContext.englishStrand,
            keyStage: meta.keyStage,
            yearGroup: meta.yearGroup,
            curriculumPathway: meta.curriculumPathway,
            examBoard: meta.examBoard,
            skillFocus: meta.skillFocus || meta.topic || "General",
            topic: meta.topic || meta.skillFocus || "General",
            difficulty: content.level,
            numberOfItems: 4,
            aiMode: contentLibraryAiMode,
            activityType: content.contentType,
            repairFeedback: "Replace duplicate question.",
            regenerationNonce: Date.now() + slotIndex,
            avoidPrompts: Array.from(avoidPrompts.values()).slice(0, 24),
          }),
        });

        const payload = await response.json() as GenerationPayload;

        if (!response.ok || payload.success === false) {
          failedSlots.push(slotIndex);
          continue;
        }

        const generatedItems = Array.isArray(payload.content?.items)
          ? payload.content.items.filter(isGeneratedItem)
          : [];

        const replacement = generatedItems.find((candidate) => {
          const prompt = normalizedPrompt(promptLikeText(candidate));
          if (!prompt || avoidPrompts.has(prompt)) return false;
          const trialItems = [...nextItems];
          trialItems[slotIndex] = candidate;
          return !candidateStillDuplicateForSlot(trialItems, slotIndex);
        });

        if (!replacement) {
          failedSlots.push(slotIndex);
          continue;
        }

        nextItems[slotIndex] = replacement;
        const replacementPrompt = normalizedPrompt(promptLikeText(replacement));
        if (replacementPrompt) avoidPrompts.add(replacementPrompt);
        replacedCount += 1;
        const sourceLabel = generationSourceLabelFromPayload(payload);
        if (sourceLabel) latestSourceLabel = sourceLabel;
        console.info("[content-library] duplicate replacement generation", {
          aiMode: contentLibraryAiMode,
          sourceLabel,
          slotIndex,
        });
      } catch {
        failedSlots.push(slotIndex);
      }
    }

    if (!replacedCount) {
      setMessage("Could not regenerate duplicate slots. Use Replace From Library or Edit Manually.");
      setRegeneratingDuplicateSlots(false);
      return false;
    }

    const saved = await saveSlots(
      nextItems,
      `${latestSourceLabel ? `${latestSourceLabel}. ` : ""}Regenerated ${replacedCount} duplicate slot${replacedCount === 1 ? "" : "s"}.${failedSlots.length ? ` ${failedSlots.length} slot${failedSlots.length === 1 ? " still needs" : "s still need"} manual replacement.` : ""}`,
    );

    if (saved && failedSlots.length) {
      selectSlot(failedSlots[0]);
    }

    setRegeneratingDuplicateSlots(false);
    return Boolean(saved);
  }

  async function replaceExactDuplicateSlot(slotIndex: number, issueLabel?: string) {
    if (slotIndex < 0 || slotIndex >= items.length) {
      setMessage("Could not resolve duplicate slot index.");
      return;
    }
    const replaced = await regenerateDuplicateSlots([slotIndex]);
    if (!replaced && issueLabel) {
      setMessage(`Could not replace Slot ${slotIndex + 1}. ${issueLabel}`);
    }
  }

  async function regenerateQuestionPreview(issueText: string) {
    if (!currentItem) {
      setMessage("No selected item to regenerate.");
      return;
    }
    if (!canRunRegeneration) {
      setMessage("Question regeneration needs subject, year group, level, and topic context.");
      return;
    }

    setRegeneratingQuestion(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: generationSubjectContext.subject,
          englishStrand: generationSubjectContext.englishStrand,
          keyStage: meta.keyStage,
          yearGroup: meta.yearGroup,
          curriculumPathway: meta.curriculumPathway,
          examBoard: meta.examBoard,
          skillFocus: meta.skillFocus || meta.topic || "General",
          topic: meta.topic || meta.skillFocus || "General",
          difficulty: content.level,
          numberOfItems: 1,
          aiMode: contentLibraryAiMode,
          activityType: content.contentType,
          repairFeedback: issueText,
          regenerationNonce: Date.now(),
          avoidPrompts: [normalizedPrompt(promptLikeText(currentItem))].filter(Boolean),
        }),
      });

      const payload = await response.json() as GenerationPayload;
      if (!response.ok || payload.success === false) {
        setMessage(payload.error ?? "Question regeneration failed.");
        return;
      }

      const generatedItems = Array.isArray(payload.content?.items)
        ? payload.content.items.filter(isGeneratedItem)
        : [];
      const regenerated = generatedItems[0] ?? null;
      if (!regenerated) {
        setMessage("Question regeneration returned no replacement item.");
        return;
      }

      const sourceLabel = generationSourceLabelFromPayload(payload);
      console.info("[content-library] question regeneration preview", {
        aiMode: contentLibraryAiMode,
        sourceLabel,
        issueText,
      });

      setQuestionRegenerationPreview({
        issueText,
        aiMode: contentLibraryAiMode,
        sourceLabel,
        before: currentItem,
        after: regenerated,
      });
      setMessage(sourceLabel ? `${sourceLabel}. Review the preview before saving.` : "Preview ready. Review before saving.");
    } catch {
      setMessage("Question regeneration request failed.");
    } finally {
      setRegeneratingQuestion(false);
    }
  }

  async function applyQuestionRegenerationPreview() {
    if (!questionRegenerationPreview || !currentItem) return;
    const nextItems = [...items];
    nextItems[selectedItemIndex] = {
      ...currentItem,
      ...questionRegenerationPreview.after,
    };
    const saved = await saveSlots(nextItems, questionRegenerationPreview.sourceLabel
      ? `${questionRegenerationPreview.sourceLabel}. Question regenerated for item ${selectedItemIndex + 1}.`
      : `Question regenerated for item ${selectedItemIndex + 1}.`);
    if (saved) {
      setQuestionRegenerationPreview(null);
    }
  }

  function cancelQuestionRegenerationPreview() {
    setQuestionRegenerationPreview(null);
  }

  function replaceFromLibrary() {
    if (!duplicateReplacementTargets.length) {
      setMessage("No duplicate slots are marked for replacement.");
      return;
    }
    selectSlot(duplicateReplacementTargets[0]);
    setMessage(`Slot ${duplicateReplacementTargets[0] + 1} selected. Replace this slot with a library question, then save slot content.`);
  }

  function editDuplicatesManually() {
    if (!duplicateReplacementTargets.length) {
      setMessage("No duplicate slots are marked for manual editing.");
      return;
    }
    selectSlot(duplicateReplacementTargets[0]);
    setMessage(`Edit Slot ${duplicateReplacementTargets[0] + 1} in the editor below and click Save slot content.`);
  }

  function createDuplicateManually(slotIndex: number) {
    if (slotIndex < 0 || slotIndex >= items.length) {
      setMessage("Could not resolve duplicate slot for manual creation.");
      return;
    }
    selectSlot(slotIndex);
    setMessage(`Create Question Manually selected for Slot ${slotIndex + 1}. Type replacement content in the slot editor and click Save slot content.`);
  }

  function ignoreDuplicateWarning() {
    setDuplicateWarningIgnored(true);
    setMessage("Duplicate warning ignored for this review session. Exact duplicates still block publishing.");
  }

  async function updateCurrentItemLevel(nextLevel: number) {
    if (!currentItem) return;
    setMessage(null);

    const nextItems = items.map((item, index) =>
      index === selectedItemIndex ? withUpdatedItemLevel(item, nextLevel) : item,
    );

    try {
      const response = await fetch(`/api/admin/content/${content.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentJson: JSON.stringify(nextItems) }),
      });
      const payload = await response.json() as VerificationPayload;
      if (!response.ok || !payload.item) {
        setMessage(payload.error ?? "Item level update failed.");
        return;
      }

      onVerified?.({
        ...content,
        status: payload.item.status,
        contentJson: JSON.stringify(nextItems),
        metadataJson: payload.item.metadataJson ?? content.metadataJson,
      });
      setMessage(`Item ${selectedItemIndex + 1} level updated to ${nextLevel}. Re-run Black Box to refresh the score.`);
    } catch {
      setMessage("Item level update request failed.");
    }
  }

  function buildBlackBoxBatchFixPreview() {
    if (!blackBox?.itemChecks?.length) {
      setMessage("No item-level Black Box issues found.");
      return;
    }

    const nextItems = [...items];
    const changed = new Set<number>();
    const details: string[] = [];

    blackBox.itemChecks.forEach((check, fallbackIndex) => {
      const issueList = (check.reasons ?? []).filter(Boolean);
      if (!issueList.length) return;

      const itemIndex = typeof check.itemIndex === "number" ? check.itemIndex : fallbackIndex;
      if (itemIndex < 0 || itemIndex >= nextItems.length) return;

      const result = runIssueSpecificRepairsForItem({
        item: nextItems[itemIndex],
        itemIndex,
        issues: issueList,
        selectedLevel: content.level,
        selectedYearGroup: meta.yearGroup ?? "",
        topic: meta.topic || "",
      });

      if (!result.applied.length) return;
      nextItems[itemIndex] = result.after;
      changed.add(itemIndex);
      details.push(`Item ${itemIndex + 1}: ${result.applied.length} issue-specific fix${result.applied.length === 1 ? "" : "es"}.`);
    });

    if (!changed.size) {
      setMessage("No deterministic Black Box fixes were available.");
      return;
    }

    setBlackBoxBatchFixPreview({
      updatedItems: nextItems,
      changedIndexes: Array.from(changed.values()).sort((a, b) => a - b),
      details,
    });
    setMessage("Black Box fix preview prepared. Review the changes, then click Apply Fixes.");
  }

  function previewFixReasonForSelectedItem(reason: string) {
    const parsedIndex = parseReasonItemIndex(reason);
    const targetIndex = parsedIndex !== null && parsedIndex >= 0 && parsedIndex < items.length
      ? parsedIndex
      : selectedItemIndex;
    const targetItem = items[targetIndex] ?? null;

    if (!targetItem) {
      setMessage("No selected item to fix.");
      return;
    }

    const result = runIssueSpecificRepairsForItem({
      item: targetItem,
      itemIndex: targetIndex,
      issues: [reason],
      selectedLevel: content.level,
      selectedYearGroup: meta.yearGroup ?? "",
      topic: meta.topic || "",
    });

    if (!result.applied.length) {
      setMessage("No deterministic fix available for this issue on the selected item.");
      return;
    }

    const nextItems = [...items];
    nextItems[targetIndex] = result.after;
    setBlackBoxBatchFixPreview({
      updatedItems: nextItems,
      changedIndexes: [targetIndex],
      details: [`Item ${targetIndex + 1}: issue-specific fix preview for "${reason}".`],
    });
    setMessage(`Item ${targetIndex + 1} fix preview prepared. Review and click Apply Fixes.`);
  }

  function previewFixAllForSelectedItem() {
    if (!currentItem) {
      setMessage("No selected item to fix.");
      return;
    }
    if (!currentItemCheck?.reasons?.length) {
      setMessage("No item-specific Black Box issues found for this item.");
      return;
    }
    const result = runIssueSpecificRepairsForItem({
      item: currentItem,
      itemIndex: selectedItemIndex,
      issues: currentItemCheck.reasons,
      selectedLevel: content.level,
      selectedYearGroup: meta.yearGroup ?? "",
      topic: meta.topic || "",
    });
    if (!result.applied.length) {
      setMessage("No deterministic fixes were available for this item.");
      return;
    }
    const nextItems = [...items];
    nextItems[selectedItemIndex] = result.after;
    setBlackBoxBatchFixPreview({
      updatedItems: nextItems,
      changedIndexes: [selectedItemIndex],
      details: [`Item ${selectedItemIndex + 1}: prepared ${result.applied.length} issue-specific fix${result.applied.length === 1 ? "" : "es"}.`],
    });
    setMessage(`Item ${selectedItemIndex + 1} fix-all preview prepared. Review and click Apply Fixes.`);
  }

  async function applyBlackBoxBatchFixPreview() {
    if (!blackBoxBatchFixPreview) return;
    setApplyingBlackBoxBatchFix(true);
    try {
      const updatedItems = blackBoxBatchFixPreview.updatedItems;
      const saved = await saveSlots(
        updatedItems,
        `Applied issue-specific fixes for ${blackBoxBatchFixPreview.changedIndexes.length} item${blackBoxBatchFixPreview.changedIndexes.length === 1 ? "" : "s"}.`,
      );
      if (!saved) return;
      setBlackBoxBatchFixPreview(null);

      const rerunResponse = await fetch(`/api/admin/content/${content.id}/black-box`, {
        method: "POST",
      });
      let rerunPayload: VerificationPayload | null = null;
      try {
        rerunPayload = await rerunResponse.json() as VerificationPayload;
      } catch {
        rerunPayload = null;
      }
      const rerunItem = rerunPayload?.item;
      if (!rerunResponse.ok || !rerunItem) {
        setMessage(rerunPayload?.error ?? "Black Box re-run failed.");
        return;
      }
      onVerified?.({
        ...content,
        status: rerunItem.status,
        contentJson: JSON.stringify(updatedItems),
        metadataJson: rerunItem.metadataJson ?? content.metadataJson,
      });
      setMessage("Black Box test re-run completed.");
    } finally {
      setApplyingBlackBoxBatchFix(false);
    }
  }

  async function handleRepairApplied(repairResult: {
    success: boolean;
    actionType: string;
    after: Record<string, unknown>;
    message: string;
  }) {
    if (!repairResult.success || !currentItem) return;

    try {
      setRepairingItem(true);
      const updatedItems = [...items];
      updatedItems[selectedItemIndex] = {
        ...currentItem,
        ...repairResult.after,
      };

      const response = await fetch(`/api/admin/content/${content.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentJson: JSON.stringify(updatedItems),
          metadataJson: content.metadataJson,
        }),
      });

      const payload = await response.json() as VerificationPayload;
      if (!response.ok || !payload.item) {
        setMessage(payload.error ?? "Repair save failed.");
        return;
      }

      onVerified?.({
        ...content,
        contentJson: JSON.stringify(updatedItems),
        metadataJson: payload.item.metadataJson ?? content.metadataJson,
      });
      setMessage(repairResult.message);
      await rerunBlackBox();
    } catch {
      setMessage("Repair request failed.");
    } finally {
      setRepairingItem(false);
    }
  }

  async function rerunBlackBox() {
    setBlackBoxRetesting(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/content/${content.id}/black-box`, {
        method: "POST",
      });
      const payload = await response.json() as VerificationPayload;
      if (!response.ok || !payload.item) {
        setMessage(payload.error ?? "Black Box re-run failed.");
        return;
      }
      onVerified?.({
        ...content,
        status: payload.item.status,
        metadataJson: payload.item.metadataJson ?? content.metadataJson,
      });
      setMessage("Black Box test re-run completed.");
    } catch {
      setMessage("Black Box re-run request failed.");
    } finally {
      setBlackBoxRetesting(false);
    }
  }

  async function saveVerification(action: VerificationAction) {
    if (!content) return;
    setWorkingAction(action);
    setMessage(null);
    try {
      const payload = await submitVerification(action, selectedItemIndex);
      if (!payload?.item) {
        return;
      }
      onVerified?.({
        ...content,
        status: payload.item.status,
        metadataJson: payload.item.metadataJson ?? content.metadataJson,
      });
      setMessage(`Verification saved: ${payload.item.status}.`);
    } catch {
      setMessage("Verification request failed.");
    } finally {
      setWorkingAction(null);
    }
  }

  async function approveSelectedSlots() {
    if (!selectedApprovalSlots.length) {
      setMessage("Select one or more slots to approve.");
      return;
    }
    const uniqueSelectedSlots = Array.from(new Set(selectedApprovalSlots)).sort((left, right) => left - right);
    const pendingSelectedSlots = uniqueSelectedSlots.filter((index) => !approvalProgress.approvedSlotIndexes.includes(index));
    if (!pendingSelectedSlots.length) {
      setMessage("All selected slots are already approved.");
      return;
    }
    setWorkingAction("approve");
    setMessage(null);
    try {
      let latestPayload: VerificationPayload | null = null;
      for (const questionIndex of pendingSelectedSlots) {
        const payload = await submitVerification("approve", questionIndex);
        if (!payload?.item) {
          return;
        }
        latestPayload = payload;
      }

      if (!latestPayload?.item) return;

      onVerified?.({
        ...content,
        status: latestPayload.item.status,
        metadataJson: latestPayload.item.metadataJson ?? content.metadataJson,
      });
      setMessage(`Approved ${pendingSelectedSlots.length} selected slot${pendingSelectedSlots.length === 1 ? "" : "s"}. Approved Slots: ${approvalProgress.approvedCount + pendingSelectedSlots.length}/${approvalProgress.totalSlots}.`);
      clearApprovalSelection();
    } catch {
      setMessage("Bulk approval request failed.");
    } finally {
      setWorkingAction(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2 sm:p-4">
      <div className="max-h-[calc(100dvh-1rem)] w-full max-w-6xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-3 sm:max-h-[calc(100dvh-2rem)] sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-200">Review Workspace</p>
            <h2 className="truncate text-lg font-black text-white sm:text-xl">{meta.title}</h2>
            <p className="mt-1 text-xs text-slate-400">{meta.subject} | {meta.topic || "General"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-sm font-bold text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-200">Student-style Preview</p>
                  <p className="mt-1 text-sm font-black text-white">Question {items.length ? selectedItemIndex + 1 : 0} of {items.length}</p>
                  <p className="text-xs text-slate-400">{items.length} total questions | Estimated {estimatedMinutes} min | {meta.subject} | {meta.topic || "General"}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      selectSlot(Math.max(0, selectedItemIndex - 1));
                      setRawExpanded(false);
                    }}
                    disabled={selectedItemIndex === 0}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      selectSlot(Math.min(items.length - 1, selectedItemIndex + 1));
                      setRawExpanded(false);
                    }}
                    disabled={!items.length || selectedItemIndex >= items.length - 1}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-200">Session Slot Builder</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 font-black text-slate-200">
                      Filled Slots: {slotSummary.filledSlots}/{slotSummary.totalSlots}
                    </span>
                    <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 font-black text-slate-200">
                      Empty Slots: {Math.max(0, (slotSummary.totalSlots ?? 0) - (slotSummary.filledSlots ?? 0))}
                    </span>
                    <span className={`rounded-full border px-2 py-1 font-black ${totalDuplicateCount > 0 ? "border-amber-500/40 bg-amber-500/10 text-amber-100" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"}`}>
                      Duplicates Found: {totalDuplicateCount}
                    </span>
                    <span className={`rounded-full border px-2 py-1 font-black ${slotSummary.slotValidationExempt ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-100" : slotSummary.isSessionComplete ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-amber-500/40 bg-amber-500/10 text-amber-100"}`}>
                      {slotSummary.slotValidationExempt ? "Ga exempt" : slotSummary.isSessionComplete ? "Session Complete" : "Session Incomplete"}
                    </span>
                    <span className={`rounded-full border px-2 py-1 font-black ${approvalProgress.isFullApproval ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : approvalProgress.isPartialApproval ? "border-amber-500/40 bg-amber-500/10 text-amber-100" : "border-slate-700 bg-slate-900 text-slate-200"}`}>
                      Approved Slots: {approvalProgress.approvedCount}/{approvalProgress.totalSlots}
                    </span>
                    <span className={`rounded-full border px-2 py-1 font-black ${approvalProgress.isFullApproval ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : approvalProgress.isPartialApproval ? "border-amber-500/40 bg-amber-500/10 text-amber-100" : "border-slate-700 bg-slate-900 text-slate-200"}`}>
                      {approvalProgress.isFullApproval ? "Whole Card Approved" : approvalProgress.isPartialApproval ? "Partially Approved" : "Not Yet Approved"}
                    </span>
                  </div>
                </div>

                {duplicatePairs.length > 0 || hasGlobalDuplicates ? (
                  <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${duplicateSummary.hasExactDuplicates || hasGlobalDuplicates ? "border-rose-500/30 bg-rose-500/10 text-rose-100" : "border-amber-500/30 bg-amber-500/10 text-amber-100"}`}>
                    <p className="font-black">Duplicates Found: {totalDuplicateCount}</p>
                    {hasGlobalDuplicates ? (
                      <div className="mt-2 space-y-1">
                        {globalDuplicateIssues.slice(0, 12).map((issue) => (
                          <div key={issue.pairKey} className="rounded-md border border-slate-700/80 bg-slate-950/60 p-2 text-slate-100">
                            <p className="font-black">Duplicate Pair</p>
                            <p className="mt-1 text-[11px] text-slate-300">Slot A: {issue.currentSlotIndex + 1} (current slot ID: {issue.currentSlotId})</p>
                            <p className="text-[11px] text-slate-300">Slot B: {issue.matchedSlotIndex + 1} (matched question ID: {issue.matchedQuestionId})</p>
                            <p className="text-[11px] text-slate-400">Matched content ID: {issue.matchedContentId}</p>
                            <p className="text-[11px] text-slate-400">Type: {issue.duplicateType} | Source: {issue.sourceStatus} | Similarity: {Math.round(issue.similarity * 100)}%</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void replaceExactDuplicateSlot(issue.currentSlotIndex, `Matched with ${issue.matchedQuestionId}.`)}
                                disabled={regeneratingDuplicateSlots || !canRunRegeneration}
                                title={!canRunRegeneration ? "Need subject, year group, level, and topic context." : undefined}
                                className="rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-2 py-1 font-black text-indigo-100 hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Replace Duplicate Question
                              </button>
                              <button
                                type="button"
                                onClick={() => createDuplicateManually(issue.currentSlotIndex)}
                                className="rounded-lg border border-slate-600 px-2 py-1 font-black text-slate-100 hover:bg-slate-800"
                              >
                                Create Question Manually
                              </button>
                            </div>
                          </div>
                        ))}
                        {globalDuplicateSummary && globalDuplicateSummary.matches.length > 12 ? (
                          <p>And {globalDuplicateSummary.matches.length - 12} more global duplicate match{globalDuplicateSummary.matches.length - 12 === 1 ? "" : "es"}.</p>
                        ) : null}
                      </div>
                    ) : null}
                    {duplicatePairs.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {duplicatePairs.map((pair) => (
                          <p key={pair.pairKey}>
                            Slot {pair.slotIndexes[0] + 1} and Slot {pair.slotIndexes[1] + 1} are too similar.
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {duplicateSummary.hasExactDuplicates || hasGlobalDuplicates ? (
                      <p className="mt-2 font-black">Publish is blocked until duplicates are replaced or edited.</p>
                    ) : null}

                    {!hasGlobalDuplicates ? (
                    <div className="mt-3 space-y-2">
                      {duplicatePairs.map((pair) => {
                        const keepIndex = effectivePairKeepChoice[pair.pairKey] ?? pair.slotIndexes[0];
                        const replaceIndex = keepIndex === pair.slotIndexes[0] ? pair.slotIndexes[1] : pair.slotIndexes[0];
                        return (
                          <div key={`resolve-${pair.pairKey}`} className="rounded-md border border-slate-700/80 bg-slate-950/60 p-2 text-slate-100">
                            <p className="font-black">
                              Keep this one / Replace the other one
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setKeepSlot(pair.pairKey, pair.slotIndexes[0])}
                                className={`rounded-lg border px-2 py-1 font-black ${keepIndex === pair.slotIndexes[0] ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-100" : "border-slate-700 text-slate-200 hover:bg-slate-800"}`}
                              >
                                Keep Slot {pair.slotIndexes[0] + 1}
                              </button>
                              <button
                                type="button"
                                onClick={() => setKeepSlot(pair.pairKey, pair.slotIndexes[1])}
                                className={`rounded-lg border px-2 py-1 font-black ${keepIndex === pair.slotIndexes[1] ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-100" : "border-slate-700 text-slate-200 hover:bg-slate-800"}`}
                              >
                                Keep Slot {pair.slotIndexes[1] + 1}
                              </button>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-400">Slot {replaceIndex + 1} will be replaced.</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void replaceExactDuplicateSlot(replaceIndex)}
                                disabled={regeneratingDuplicateSlots || !canRunRegeneration}
                                title={!canRunRegeneration ? "Need subject, year group, level, and topic context." : undefined}
                                className="rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-2 py-1 font-black text-indigo-100 hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Replace Duplicate Question
                              </button>
                              <button
                                type="button"
                                onClick={() => createDuplicateManually(replaceIndex)}
                                className="rounded-lg border border-slate-600 px-2 py-1 font-black text-slate-100 hover:bg-slate-800"
                              >
                                Create Question Manually
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    ) : null}

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => void regenerateDuplicateSlots()}
                        disabled={regeneratingDuplicateSlots || duplicateReplacementTargets.length === 0}
                        className="rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-3 py-2 text-left font-black text-indigo-100 hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {regeneratingDuplicateSlots ? "Replacing..." : "Replace Marked Duplicate Slots"}
                      </button>
                      <button
                        type="button"
                        onClick={replaceFromLibrary}
                        disabled={duplicateReplacementTargets.length === 0}
                        className="rounded-lg border border-slate-600 px-3 py-2 text-left font-black text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Replace From Library
                      </button>
                      <button
                        type="button"
                        onClick={editDuplicatesManually}
                        disabled={duplicateReplacementTargets.length === 0}
                        className="rounded-lg border border-slate-600 px-3 py-2 text-left font-black text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Create Question Manually
                      </button>
                      <button
                        type="button"
                        onClick={ignoreDuplicateWarning}
                        disabled={duplicateSummary.hasExactDuplicates || duplicateWarningIgnored || hasGlobalDuplicates}
                        className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left font-black text-amber-100 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Ignore Warning
                      </button>
                    </div>
                  </div>
                ) : null}

                {!duplicateSummary.hasExactDuplicates && !duplicateWarningIgnored && (duplicateSummary.nearCount > 0 || duplicateSummary.samePatternCount > 0) ? (
                  <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-black text-amber-100">
                    Warning only: near duplicates {duplicateSummary.nearCount}, same-pattern duplicates {duplicateSummary.samePatternCount}. You can override and publish.
                  </p>
                ) : null}

                {!slotSummary.slotValidationExempt && !slotSummary.isSessionComplete ? (
                  <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-xs font-black text-amber-100">
                    <p>{getIncompleteSlotsReason(slotSummary.missingSlots)}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => void generateMissingSlots()}
                        disabled={generatingMissingSlots || slotSummary.missingSlots <= 0 || !canRunRegeneration}
                        title={!canRunRegeneration ? "Need subject, year group, level, and topic context." : undefined}
                        className="rounded-lg border border-amber-300/50 bg-amber-400/10 px-3 py-2 text-left text-xs font-black text-amber-50 hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {generatingMissingSlots ? "Generating..." : "Generate Missing Slots"}
                      </button>
                      <button
                        type="button"
                        onClick={fillMissingFromLibrary}
                        disabled={slotSummary.missingSlots <= 0}
                        className="rounded-lg border border-slate-600 px-3 py-2 text-left text-xs font-black text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Fill From Library
                      </button>
                      <button
                        type="button"
                        onClick={createMissingManually}
                        disabled={slotSummary.missingSlots <= 0}
                        className="rounded-lg border border-slate-600 px-3 py-2 text-left text-xs font-black text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Create Manually
                      </button>
                    </div>
                  </div>
                ) : null}

                {message ? (
                  <p className="mt-3 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200 whitespace-pre-line">
                    {message}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="text-xs text-slate-300">
                    Slot count
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={slotCountValue}
                      onChange={(event) => setSlotCountInput(event.target.value)}
                      className="mt-1 w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void applySlotCount()}
                    className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-black text-slate-100 hover:bg-slate-800"
                  >
                    Apply slot count
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {items.map((slot, index) => {
                    const filled = isQuestionSlotFilled(slot);
                    const selectedSlot = index === selectedItemIndex;
                    const isRejectedSlot = rejectedSlotIndexSet.has(index);
                    const isHighlightedSlot = highlightedSlots.includes(index);
                    const primaryFlag = primaryDuplicateFlag(duplicateSummary.slotFlags[index]);
                    const flagLabel = isRejectedSlot
                      ? "Rejected"
                      : primaryFlag === "exact"
                      ? "Duplicate"
                      : primaryFlag === "near"
                        ? "Near duplicate"
                        : primaryFlag === "same_pattern"
                          ? "Same pattern"
                          : null;
                    const slotColorClass = selectedSlot
                      ? "border-indigo-400 bg-indigo-500/20 text-indigo-100"
                      : isRejectedSlot
                        ? "border-rose-500/60 bg-rose-500/15 text-rose-100"
                      : primaryFlag === "exact"
                        ? "border-rose-500/50 bg-rose-500/10 text-rose-100"
                        : primaryFlag
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
                          : filled
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                            : "border-amber-500/40 bg-amber-500/10 text-amber-100";
                    return (
                      <span key={`slot-${index}`} className={`inline-flex items-center gap-1 rounded-full border text-xs font-black ${slotColorClass} ${isHighlightedSlot ? "ring-2 ring-rose-300/80 animate-pulse" : ""}`}>
                        <button
                          type="button"
                          onClick={() => selectSlot(index)}
                          className="py-1 pl-2 pr-1"
                        >
                          Slot {index + 1} {flagLabel ?? (filled ? "Filled" : "Empty")}
                        </button>
                        {filled ? (
                          <button
                            type="button"
                            title={`Remove slot ${index + 1}`}
                            onClick={() => void removeSlotAt(index)}
                            className="rounded-full py-1 pl-0.5 pr-1.5 opacity-60 hover:opacity-100"
                          >
                            ×
                          </button>
                        ) : null}
                      </span>
                    );
                  })}
                </div>

                <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-200">AI Generation Mode</p>
                      <p className="mt-1 text-xs text-slate-400">Applies to Generate Missing Slots, Replace Duplicate Question, and Regenerate Question.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label="AI generation mode"
                        value={contentLibraryAiMode}
                        onChange={(event) => setContentLibraryAiMode(event.target.value as AiGenerationMode)}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-white outline-none focus:border-indigo-400"
                      >
                        {CONTENT_LIBRARY_AI_MODE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-black ${contentLibraryAiMode === "fallback_only" ? "bg-amber-500/15 text-amber-100" : "bg-indigo-500/15 text-indigo-100"}`}>
                        Selected: {aiModeLabel(contentLibraryAiMode)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">
                    {CONTENT_LIBRARY_AI_MODE_OPTIONS.find((option) => option.value === contentLibraryAiMode)?.helper}
                    {contentLibraryAiMode === "fallback_only" ? " OpenAI will not be called." : ""}
                  </p>
                </div>

                {items.length ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <label className="text-xs font-bold text-slate-300 md:col-span-2">
                      Question / Prompt
                      <textarea
                        value={slotPromptInput}
                        onChange={(event) => setSlotPromptInput(event.target.value)}
                        className="mt-1 min-h-16 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-300">
                      Answer
                      <input
                        value={slotAnswerInput}
                        onChange={(event) => setSlotAnswerInput(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-300">
                      Choices (comma-separated)
                      <input
                        value={slotChoicesInput}
                        onChange={(event) => setSlotChoicesInput(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
                      />
                    </label>
                    <div className="md:col-span-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void saveSelectedSlot()}
                        className="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-black text-white hover:bg-indigo-400"
                      >
                        Save slot content
                      </button>
                      <button
                        type="button"
                        onClick={() => void clearSelectedSlot()}
                        className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-black text-rose-100 hover:bg-rose-500/20"
                      >
                        Clear slot
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {currentItem ? (
              <StarLizQuestionCard
                subjectBadge={<span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-indigo-800">{meta.subject}</span>}
                attemptNumber={1}
                maxAttempts={3}
                progressLabel={`${selectedItemIndex + 1}/${items.length}`}
                contextLabel={`${meta.keyStage ?? "All key stages"} | ${meta.yearGroup ?? "All years"} | ${meta.topic ?? "General"}`}
                reviewNotice="Admin review preview. Answers and diagnostics are shown below the student-style card."
                learningFocus={meta.skillFocus ?? meta.topic}
                hint={hint || null}
                passageSlot={passage ? (
                  <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 text-slate-900">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Reading Passage</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6">{passage}</p>
                  </div>
                ) : null}
                coachPanel={coachSteps.length || workedSolution ? (
                  <div className="rounded-2xl border border-cyan-200 bg-white p-4 text-sm font-bold text-cyan-950">
                    {coachSteps.length ? coachSteps.map((step, idx) => <p key={`${step}-${idx}`}>{idx + 1}. {step}</p>) : null}
                    {workedSolution ? <p className="mt-2 whitespace-pre-wrap">{workedSolution}</p> : null}
                  </div>
                ) : null}
                coachOpen={Boolean(coachSteps.length || workedSolution)}
                questionPrompt={questionText}
                answerOptions={answerOptions.length ? answerOptions : undefined}
                answerValue=""
                actionButtonLabel="Preview only"
              />
            ) : (
              <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm font-bold text-rose-100">
                This content does not contain any reviewable generated items.
              </div>
            )}

            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <p className="text-xs font-bold text-slate-300">Admin Answer Review</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-200">Correct Answer</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm font-black text-white">{correctAnswer || "Not provided"}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-950 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-300">Difficulty</p>
                  <p className="mt-1 text-sm font-black text-white">Level {content.level} | {difficultyLabel(content.level)}</p>
                </div>
                <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3 md:col-span-2">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-indigo-200">Current Item Level</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateCurrentItemLevel(Math.max(1, numericLevel(currentItem?.difficulty ?? currentItem?.level, content.level) - 1))}
                      className="rounded-lg border border-indigo-400/40 px-3 py-2 text-xs font-black text-indigo-100 hover:bg-indigo-500/10"
                    >
                      Demote item
                    </button>
                    <span className="rounded-full bg-slate-950 px-3 py-2 text-xs font-black text-white">
                      Item level {currentItemLevel} | {difficultyLabel(currentItemLevel)}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateCurrentItemLevel(Math.min(10, currentItemLevel + 1))}
                      className="rounded-lg border border-indigo-400/40 px-3 py-2 text-xs font-black text-indigo-100 hover:bg-indigo-500/10"
                    >
                      Move item up
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-indigo-100">Updates only this question. Re-run Black Box afterwards to refresh score and reasons.</p>
                </div>
              </div>
              {currentItem ? (
                <div className="mt-3 rounded-lg border border-sky-500/20 bg-sky-500/10 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-200">Explanation</p>
                  <textarea
                    value={explanationInput}
                    onChange={(event) => setExplanationInput(event.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-sky-400/30 bg-slate-950 px-3 py-2 text-sm font-semibold text-sky-50"
                    placeholder="Add or edit explanation..."
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {explanationHasUnsavedChanges ? (
                      <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-amber-100">
                        Unsaved changes
                      </span>
                    ) : (
                      <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-100">
                        Saved
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => void saveCurrentExplanation()}
                      disabled={!explanationHasUnsavedChanges}
                      className="rounded-lg border border-sky-400/40 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Save explanation
                    </button>
                  </div>
                </div>
              ) : null}
              {workedSolution ? (
                <div className="mt-3 rounded-lg border border-violet-500/20 bg-violet-500/10 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-200">Worked Solution</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-violet-50">{workedSolution}</p>
                </div>
              ) : null}
              {coachSteps.length ? (
                <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-200">Coach Steps</p>
                  <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm font-semibold text-cyan-50">
                    {coachSteps.map((step, idx) => <li key={`${step}-${idx}`}>{step}</li>)}
                  </ol>
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <button
                type="button"
                onClick={() => setRawExpanded((current) => !current)}
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800"
              >
                {rawExpanded ? "Hide raw data" : "Show raw data"}
              </button>
              {rawExpanded && currentItem ? (
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-300">
                  {JSON.stringify(currentItem, null, 2)}
                </pre>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-300">Black Box Content Test</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={rerunBlackBox}
                  disabled={blackBoxRetesting}
                  className="rounded-lg border border-indigo-400/40 px-3 py-1.5 text-xs font-black text-indigo-100 hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {blackBoxRetesting ? "Re-running..." : "Re-run Black Box"}
                </button>
                {/* Part 4: show admin review status separately from machine BB result */}
                {verification?.status === "verified" || verification?.status === "rejected" ? (
                  <span className={`rounded-full px-2 py-1 text-xs font-black ${verification.status === "verified" ? "bg-emerald-500/20 text-emerald-100" : "bg-rose-500/20 text-rose-100"}`}>
                    Admin: {verification.decision ?? verification.status}
                  </span>
                ) : null}
                <span className={`rounded-full px-2 py-1 text-xs font-black ${getBlackBoxBadgeTone(blackBox, verification, blackBoxStale)}`}>
                  {getBlackBoxBadgeLabel(blackBox, verification, blackBoxStale)}
                </span>
              </div>
            </div>
            {blackBoxStale.isStale ? (
              <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-100">
                <p className="font-black">Black Box stale - content changed</p>
                <p className="mt-0.5">Action required: Re-run Black Box before review/publish.</p>
                {typeof blackBox?.score === "number" ? (
                  <p className="mt-0.5 text-rose-200/90">Previous result: {blackBox.score}/100</p>
                ) : null}
              </div>
            ) : null}
            {/* Part 4: explain when admin has already reviewed */}
            {verification?.status === "verified" && blackBox?.decision !== "APPROVE" && !blackBoxStale.isStale ? (
              <div className="mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2 text-xs text-emerald-100">
                <p className="font-black">Admin reviewed · {verification.decision ?? "approved"}</p>
                <p className="mt-0.5 text-emerald-200/80">Original machine result: {verification.originalBlackBoxDecision ?? blackBox?.decision ?? "N/A"}{typeof (verification.originalBlackBoxScore ?? blackBox?.score) === "number" ? ` · ${verification.originalBlackBoxScore ?? blackBox?.score}/100` : ""}</p>
              </div>
            ) : null}
            {blackBox ? (
              <div className="mt-3 space-y-3 text-xs text-slate-400">
                {blackBox.reasons && blackBox.reasons.length > 0 ? (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold text-slate-300">Reasons</p>
                      <button
                        type="button"
                        onClick={buildBlackBoxBatchFixPreview}
                        disabled={blackBoxRetesting || applyingBlackBoxBatchFix || repairingItem}
                        className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
                      >
                        Fix All BlackBox Issues
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {blackBox.reasons.map((reason) => {
                        const parsedReasonIndex = parseReasonItemIndex(reason);
                        const isScoreCapReason = /score capped/i.test(reason);
                        const issueKind = getBlackBoxRepairActionKind(reason);
                        const isLocalRepair = issueKind === "local";
                        const isQualityRepair = issueKind === "quality";
                        return (
                          <div key={reason} className="rounded-lg border border-slate-700/80 bg-slate-950/60 p-2">
                            <p className="text-xs text-slate-300">{reason}</p>
                            {parsedReasonIndex !== null ? (
                              <p className="mt-1 text-[11px] font-black text-rose-100">Rejected slot: Slot {parsedReasonIndex + 1}</p>
                            ) : null}
                            {isScoreCapReason && rejectedSlotIndexes.length > 0 ? (
                              <p className="mt-1 text-[11px] font-black text-amber-100">
                                Rejected slots: {rejectedSlotIndexes.map((index) => `Slot ${index + 1}`).join(", ")}
                              </p>
                            ) : null}
                            <div className="mt-2 flex flex-wrap gap-2">
                              {isLocalRepair ? (
                                <button
                                  type="button"
                                  onClick={() => previewFixReasonForSelectedItem(reason)}
                                  disabled={blackBoxRetesting || applyingBlackBoxBatchFix || repairingItem}
                                  className="rounded border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
                                >
                                  Fix Issue
                                </button>
                              ) : null}
                              {isQualityRepair ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => previewFixReasonForSelectedItem(reason)}
                                    disabled={blackBoxRetesting || applyingBlackBoxBatchFix || repairingItem}
                                    className="rounded border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
                                  >
                                    Quick Repair
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void regenerateQuestionPreview(reason)}
                                    disabled={blackBoxRetesting || applyingBlackBoxBatchFix || repairingItem || regeneratingQuestion || !canRunRegeneration}
                                    title={!canRunRegeneration ? "Need subject, year group, level, and topic context." : undefined}
                                    className="rounded border border-indigo-400/40 bg-indigo-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-indigo-100 hover:bg-indigo-500/20 disabled:opacity-50"
                                  >
                                    {regeneratingQuestion ? "Regenerating..." : "Regenerate Question"}
                                  </button>
                                </>
                              ) : null}
                              {!isLocalRepair && !isQualityRepair ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isScoreCapReason && rejectedSlotIndexes.length > 0) {
                                      selectSlot(rejectedSlotIndexes[0]);
                                      highlightSlotCards(rejectedSlotIndexes);
                                      setMessage(`Rejected slots: ${rejectedSlotIndexes.map((index) => index + 1).join(", ")}. Select a rejected slot and run Fix Issue.`);
                                      return;
                                    }
                                    previewFixReasonForSelectedItem(reason);
                                  }}
                                  disabled={blackBoxRetesting || applyingBlackBoxBatchFix || repairingItem}
                                  className="rounded border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
                                >
                                  {isScoreCapReason ? "Locate Rejected Slots" : "Fix Issue"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {shouldRenderRepairPanel ? (
                  <div>
                    <p className="font-bold text-slate-300">Targeted Repair Actions</p>
                    {offSlotRepairTargets.length > 0 ? (
                      <p className="mt-1 text-xs font-black text-amber-100">
                        Additional local repair issues were detected in {offSlotRepairTargets.map((index) => `Slot ${index + 1}`).join(", ")}. Select those slots or use Fix Issue in the Reasons list above.
                      </p>
                    ) : null}
                    <div className="mt-2">
                      <BlackBoxRepairPanel
                        currentItem={currentItem}
                        itemIndex={selectedItemIndex}
                        selectedLevel={content.level}
                        selectedYearGroup={meta.yearGroup ?? ""}
                        topic={meta.topic || ""}
                        reasons={selectedItemLocalRepairReasons}
                        onRepair={handleRepairApplied}
                        disabled={repairingItem}
                      />
                    </div>
                  </div>
                ) : null}
                {qualityRepairReasons.length > 0 ? (
                  <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-indigo-100">Question Regeneration Preview</p>
                      <button
                        type="button"
                        onClick={() => void regenerateQuestionPreview(qualityRepairReasons.join("; "))}
                        disabled={regeneratingQuestion || blackBoxRetesting || applyingBlackBoxBatchFix || repairingItem || !canRunRegeneration}
                        title={!canRunRegeneration ? "Need subject, year group, level, and topic context." : undefined}
                        className="rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-indigo-100 hover:bg-indigo-500/20 disabled:opacity-50"
                      >
                        {regeneratingQuestion ? "Regenerating..." : "Regenerate All Quality Issues"}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Uses the selected AI mode and keeps manual editing available as backup.</p>
                  </div>
                ) : null}
                {questionRegenerationPreview ? (
                  <div className="rounded-lg border border-indigo-400/20 bg-indigo-500/5 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-indigo-100">Regenerate Question Preview</p>
                      <span className="rounded-full border border-indigo-400/40 bg-indigo-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-indigo-100">
                        {aiModeLabel(questionRegenerationPreview.aiMode)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-300">Issue: {questionRegenerationPreview.issueText}</p>
                    {questionRegenerationPreview.sourceLabel ? (
                      <p className="mt-1 text-xs font-black text-emerald-100">{questionRegenerationPreview.sourceLabel}</p>
                    ) : null}
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-300">Before</p>
                        <pre className="mt-1 max-h-40 overflow-auto rounded border border-slate-700 bg-slate-950 p-2 text-[10px] text-slate-300">
                          {JSON.stringify(questionRegenerationPreview.before, null, 2).slice(0, 1200)}...
                        </pre>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-emerald-200">After</p>
                        <pre className="mt-1 max-h-40 overflow-auto rounded border border-slate-700 bg-slate-950 p-2 text-[10px] text-slate-300">
                          {JSON.stringify(questionRegenerationPreview.after, null, 2).slice(0, 1200)}...
                        </pre>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void applyQuestionRegenerationPreview()}
                        disabled={repairingItem}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-500 disabled:opacity-60"
                      >
                        Apply Regeneration
                      </button>
                      <button
                        type="button"
                        onClick={cancelQuestionRegenerationPreview}
                        disabled={repairingItem}
                        className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-black text-slate-200 hover:bg-slate-700 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
                {blackBoxBatchFixPreview ? (
                  <div className="rounded-lg border border-amber-400/20 bg-amber-500/5 p-3">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-100">Before / After Preview</p>
                    <div className="mt-2 space-y-1 text-xs text-amber-50">
                      {blackBoxBatchFixPreview.details.map((detail) => <p key={detail}>{detail}</p>)}
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <div>
                        <p className="text-[10px] font-black uppercase text-amber-200">Before</p>
                        <pre className="mt-1 max-h-40 overflow-auto rounded border border-slate-700 bg-slate-950 p-2 text-[10px] text-slate-300">
                          {JSON.stringify(blackBoxBatchFixPreview.changedIndexes.map((index) => ({ index, item: items[index] })), null, 2).slice(0, 1200)}...
                        </pre>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-emerald-200">After</p>
                        <pre className="mt-1 max-h-40 overflow-auto rounded border border-slate-700 bg-slate-950 p-2 text-[10px] text-slate-300">
                          {JSON.stringify(blackBoxBatchFixPreview.changedIndexes.map((index) => ({ index, item: blackBoxBatchFixPreview.updatedItems[index] })), null, 2).slice(0, 1200)}...
                        </pre>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void applyBlackBoxBatchFixPreview()}
                        disabled={applyingBlackBoxBatchFix || blackBoxRetesting}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-500 disabled:opacity-60"
                      >
                        {applyingBlackBoxBatchFix ? "Applying..." : "Apply Fixes"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBlackBoxBatchFixPreview(null)}
                        disabled={applyingBlackBoxBatchFix}
                        className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-black text-slate-200 hover:bg-slate-700 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
                {levelQualityWarningSummary ? (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-amber-100">
                    <p className="font-bold">Level-quality warning summary</p>
                    <p className="mt-1">
                      {levelQualityWarningSummary.flaggedItemCount} of {levelQualityWarningSummary.totalItemCount} items flagged.
                    </p>
                    {levelQualityWarningSummary.flaggedItemIds.length > 0 ? (
                      <p className="mt-1 text-amber-200/90">
                        Item IDs: {levelQualityWarningSummary.flaggedItemIds.join(", ")}
                      </p>
                    ) : null}
                    {blackBox.scoreCap ? (
                      <p className="mt-1 text-amber-200/90">
                        Score cap: {blackBox.scoreCap.capPercent}/100. {blackBox.scoreCap.reason}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {gaTwiMarkers.length > 0 ? (
                  <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2 text-rose-100">
                    <p className="font-bold">Ga language diagnostics</p>
                    <p className="mt-1">Detected Twi markers: {gaTwiMarkers.join(", ")}</p>
                  </div>
                ) : null}
                {blackBox.reclassificationRecommendation ? (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-amber-100">
                    <p className="font-bold">Reclassification recommendation</p>
                    <p className="mt-1">
                      Subject: {blackBox.reclassificationRecommendation.subject ?? "N/A"} | Strand: {blackBox.reclassificationRecommendation.strand ?? "N/A"} | Key stage: {blackBox.reclassificationRecommendation.keyStage ?? "N/A"} | Year: {blackBox.reclassificationRecommendation.yearGroup ?? "N/A"} | Level: {blackBox.reclassificationRecommendation.level ?? "N/A"}
                    </p>
                  </div>
                ) : null}
                {blackBox.itemChecks && blackBox.itemChecks.length > 0 ? (
                  <div>
                    <p className="font-bold text-slate-300">Current item checks</p>
                    <div className="mt-2 space-y-2">
                      {currentItemCheck ? (
                        <div className="rounded-lg border border-slate-700 bg-slate-950 p-2">
                          <p className="font-bold text-slate-300">Item {selectedItemIndex + 1}{typeof currentItemCheck.score === "number" ? ` • ${currentItemCheck.score}/100` : ""}</p>
                          <div className="mt-2 rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-2 text-indigo-50">
                            <p className="font-black text-indigo-100">Difficulty recommendation</p>
                            <div className="mt-1 grid gap-1">
                              <p>Current: Level {currentItemCheck.declaredLevel ?? currentItemLevel} | {difficultyLabel(currentItemCheck.declaredLevel ?? currentItemLevel)}</p>
                              <p>Black Box Estimate: Level {currentItemCheck.estimatedLevel ?? "N/A"}{typeof currentItemCheck.estimatedLevel === "number" ? ` | ${difficultyLabel(currentItemCheck.estimatedLevel)}` : ""}</p>
                              <p>Recommendation: {levelRecommendation?.reason ?? "No item-level difficulty recommendation available."}</p>
                            </div>
                            {typeof recommendedLevel === "number" && recommendedLevel !== currentItemLevel ? (
                              <button
                                type="button"
                                onClick={() => updateCurrentItemLevel(recommendedLevel)}
                                className="mt-2 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-black text-white hover:bg-indigo-400"
                              >
                                Apply Recommendation
                              </button>
                            ) : null}
                          </div>
                          {currentItemCheck.reasons && currentItemCheck.reasons.length > 0 ? (
                            <div className="mt-2 space-y-2">
                              {currentItemCheck.reasons.map((reason) => (
                                <div key={reason} className="rounded-lg border border-slate-700/80 bg-slate-950/60 p-2">
                                  <p className="text-xs text-slate-300">{reason}</p>
                                  <button
                                    type="button"
                                    onClick={() => previewFixReasonForSelectedItem(reason)}
                                    disabled={blackBoxRetesting || applyingBlackBoxBatchFix || repairingItem}
                                    className="mt-2 rounded border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
                                  >
                                    Fix Issue
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={previewFixAllForSelectedItem}
                                disabled={blackBoxRetesting || applyingBlackBoxBatchFix || repairingItem}
                                className="rounded border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
                              >
                                Fix All Issues for This Item
                              </button>
                            </div>
                          ) : null}
                          {currentItemCheck.checks ? (
                            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900 p-2 text-[11px] text-slate-400">
                              {JSON.stringify(currentItemCheck.checks, null, 2)}
                            </pre>
                          ) : null}
                        </div>
                      ) : (
                        <p>No item-specific Black Box check is stored for this question.</p>
                      )}
                    </div>
                    <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-200">Bulk Slot Approval</p>
                        <p className="text-xs text-slate-400">Selected: {selectedApprovalSlots.length}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {items.map((_, index) => {
                          const selected = selectedApprovalSlots.includes(index);
                          const approved = approvalProgress.approvedSlotIndexes.includes(index);
                          return (
                            <button
                              key={`approval-slot-${index}`}
                              type="button"
                              onClick={() => toggleApprovalSlot(index)}
                              className={`rounded-full border px-2 py-1 text-[11px] font-black ${selected ? "border-indigo-400 bg-indigo-500/20 text-indigo-100" : approved ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-slate-700 bg-slate-900 text-slate-200"}`}
                            >
                              {selected ? "✓ " : ""}Slot {index + 1}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void approveSelectedSlots()}
                          disabled={workingAction !== null || selectedApprovalSlots.length === 0}
                          className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-black text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {workingAction === "approve" ? "Approving..." : `Approve Selected Slots (${selectedApprovalSlots.length})`}
                        </button>
                        <button
                          type="button"
                          onClick={clearApprovalSelection}
                          disabled={workingAction !== null || selectedApprovalSlots.length === 0}
                          className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Clear Selection
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">No black-box scorecard has been stored for this content yet.</p>
            )}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-300">Runtime Lesson Test</p>
              <span className={`rounded-full px-2 py-1 text-xs font-black ${runtime?.status === "passed" ? "bg-emerald-500/15 text-emerald-200" : runtime?.status === "failed" ? "bg-rose-500/15 text-rose-200" : "bg-amber-500/15 text-amber-200"}`}>
                {runtime ? `${runtime.status}${typeof runtime.score === "number" ? ` • ${runtime.score}/100` : ""}` : "Not run"}
              </span>
            </div>
            {runtime ? (
              <div className="mt-2 space-y-2 text-xs text-slate-400">
                {runtime.flowChecks?.map((entry) => <p key={entry}>{entry}</p>)}
                {runtime.hintChecks?.map((entry) => <p key={entry}>{entry}</p>)}
                {runtime.masteryChecks?.map((entry) => <p key={entry}>{entry}</p>)}
                {runtime.reasons && runtime.reasons.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5">
                    {runtime.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">Runtime simulation will run when an admin saves verification.</p>
            )}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <p className="text-xs font-bold text-slate-300">Metadata</p>
            <div className="mt-2 grid gap-2 text-xs text-slate-400">
              <div><span className="font-bold">Subject:</span> {meta.subject}</div>
              <div><span className="font-bold">Topic:</span> {meta.topic || "General"}</div>
              <div><span className="font-bold">Skill Focus:</span> {meta.skillFocus || "Not tagged"}</div>
              <div><span className="font-bold">Year Group:</span> {meta.yearGroup || "All"}</div>
              <div><span className="font-bold">Key Stage:</span> {meta.keyStage || "All"}</div>
              <div><span className="font-bold">Content Type:</span> {content.contentType}</div>
              <div><span className="font-bold">Pathway:</span> {meta.curriculumPathway || "Not tagged"}</div>
              <div><span className="font-bold">Exam Board:</span> {meta.examBoard || "Not tagged"}</div>
              <div><span className="font-bold">Age Group:</span> {meta.ageGroup || "Any"}</div>
              <div><span className="font-bold">Level:</span> {content.level} | {difficultyLabel(content.level)}</div>
              <div><span className="font-bold">Strand/module:</span> {strand || blackBox?.reclassificationRecommendation?.strand || "Not tagged"}</div>
              <div><span className="font-bold">Status:</span> {content.status}</div>
              <div><span className="font-bold">Used Count:</span> {content.usedCount}</div>
              <div><span className="font-bold">Valid JSON:</span> {summaryWithContext.valid ? "Yes" : "No"}</div>
              <div><span className="font-bold">Filled Slots:</span> {summaryWithContext.filledSlots ?? 0}/{summaryWithContext.totalSlots ?? summaryWithContext.itemCount}</div>
              <div><span className="font-bold">Session:</span> {summaryWithContext.slotValidationExempt ? "Ga exempt" : summaryWithContext.isSessionComplete ? "Complete" : "Incomplete"}</div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <p className="text-xs font-bold text-slate-300">Admin Verification</p>
            <div className="mt-2 text-xs text-slate-400">
              <p>Status: {verification?.status ?? "pending"}</p>
              {verification?.notes ? <p className="mt-1">Latest notes: {verification.notes}</p> : null}
            </div>
            {/* Part 2: per-item notes — Q1 note does not appear on Q2-Q5 */}
            <label className="mt-3 block text-xs font-bold text-slate-300">
              Review notes for Q{selectedItemIndex + 1}{items.length > 1 ? ` (of ${items.length})` : ""}
              <textarea
                value={itemNotes[selectedItemIndex] ?? ""}
                onChange={(event) => setItemNotes((prev) => ({ ...prev, [selectedItemIndex]: event.target.value }))}
                className="mt-1 min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400"
                placeholder={`Add review note for question ${selectedItemIndex + 1}...`}
              />
            </label>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400"
                placeholder="Recommended subject"
              />
              <input
                value={strand}
                onChange={(event) => setStrand(event.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400"
                placeholder="Recommended strand"
              />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {([
                ["approve", "Approve", "bg-emerald-500 hover:bg-emerald-400"],
                ["reject", "Reject", "bg-rose-500 hover:bg-rose-400"],
                ["reclassify", "Reclassify", "bg-sky-500 hover:bg-sky-400"],
                ["needs_changes", "Needs Changes", "bg-amber-500 hover:bg-amber-400"],
                ["send_back", "Regenerate", "bg-slate-700 hover:bg-slate-600"],
              ] as Array<[VerificationAction, string, string]>).map(([action, label, className]) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => void saveVerification(action)}
                  disabled={workingAction !== null || (blackBoxStale.isStale && (action === "approve" || action === "reclassify"))}
                  className={`rounded-lg px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
                >
                  {workingAction === action ? "Saving..." : label}
                </button>
              ))}
            </div>
            {blackBoxStale.isStale ? (
              <p className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-black text-rose-100">
                Approve/Reclassify disabled until Black Box is re-run on the latest content.
              </p>
            ) : null}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <p className="text-xs font-bold text-slate-300">Review History</p>
            <div className="mt-2 space-y-2 text-xs text-slate-400">
              {reviewHistory.length > 0 ? reviewHistory.slice().reverse().map((entry) => (
                <div key={`${entry.createdAt}-${entry.action}`} className="rounded-lg border border-slate-800 bg-slate-950 p-2">
                  {/* Part 3: question reference + action */}
                  <p className="font-bold text-slate-200">
                    {entry.questionIndex !== null && entry.questionIndex !== undefined
                      ? `Q${entry.questionIndex + 1} · `
                      : ""}
                    {entry.action}
                    {entry.status ? ` · ${entry.status}` : ""}
                  </p>
                  {/* Part 3: question preview */}
                  {entry.questionPreview ? (
                    <p className="mt-1 text-slate-300 line-clamp-2">&quot;{entry.questionPreview}&quot;</p>
                  ) : null}
                  {/* Part 3: parent content context */}
                  {(entry.contentTitle ?? entry.subject ?? entry.yearGroup ?? entry.keyStage) ? (
                    <p className="mt-1 text-slate-500">
                      {[entry.contentTitle, entry.subject, entry.yearGroup, entry.keyStage, entry.strandTopic, entry.examBoard]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                  {entry.level !== null && entry.level !== undefined ? (
                    <p className="text-slate-500">Level {entry.level}</p>
                  ) : null}
                  <p>{new Date(entry.createdAt).toLocaleString()}{entry.actor ? ` · ${entry.actor}` : ""}</p>
                  {/* Part 3: per-item note */}
                  {entry.notes ? <p className="mt-1 rounded bg-slate-900 px-2 py-1 text-slate-300">{entry.notes}</p> : null}
                  {/* Part 3 + 4: BB score at time of review */}
                  {(entry.blackBoxDecision ?? entry.blackBoxScore !== null) ? (
                    <p className="mt-0.5 text-slate-600">BB at review: {entry.blackBoxDecision ?? "?"}{typeof entry.blackBoxScore === "number" ? ` ${entry.blackBoxScore}/100` : ""}</p>
                  ) : null}
                  {entry.contentId ? (
                    <p className="mt-0.5 text-slate-600 font-mono text-[10px]">Batch: {entry.contentId}</p>
                  ) : null}
                </div>
              )) : <p>No admin verification history yet.</p>}
            </div>
          </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
        >
          Close
        </button>
      </div>
    </div>
  );
}
