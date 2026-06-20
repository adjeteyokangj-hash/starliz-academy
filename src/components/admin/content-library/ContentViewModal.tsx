"use client";

import { useMemo, useState } from "react";
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
import { analyzeContentSessionSlots, getIncompleteSlotsReason, isQuestionSlotFilled } from "@/lib/session-slot-validation";
import { analyzeSessionSlotDuplicates, primaryDuplicateFlag } from "@/lib/session-slot-duplicates";
import {
  buildMissingSlotGenerationRequest,
  buildMissingSlotRecoveryPlan,
  formatMissingSlotRecoveryDiagnostics,
  mergeGeneratedIntoEmptySlots,
  selectBestMissingSlotCandidates,
  summarizeSessionSlots,
  type MissingSlotRecoveryAttempt,
} from "@/lib/session-slot-recovery";

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
  /** Per-item review notes — keyed by item index (Part 2) */
  const [itemNotes, setItemNotes] = useState<Record<number, string>>({});
  const [subject, setSubject] = useState(blackBox?.reclassificationRecommendation?.subject ?? meta.subject ?? "");
  const [strand, setStrand] = useState(blackBox?.reclassificationRecommendation?.strand ?? "");
  const [workingAction, setWorkingAction] = useState<VerificationAction | null>(null);
  const [blackBoxRetesting, setBlackBoxRetesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [slotCountInput, setSlotCountInput] = useState("");
  const currentItem = items[selectedItemIndex] ?? null;
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
  const hasGlobalDuplicates = Boolean(globalDuplicateSummary?.hasDuplicates);
  const totalDuplicateCount = globalDuplicateSummary?.duplicateCount ?? duplicatePairs.length;
  const [pairKeepChoice, setPairKeepChoice] = useState<Record<string, number>>({});
  const [duplicateWarningIgnored, setDuplicateWarningIgnored] = useState(false);
  const [regeneratingDuplicateSlots, setRegeneratingDuplicateSlots] = useState(false);
  const [generatingMissingSlots, setGeneratingMissingSlots] = useState(false);
  const [repairingItem, setRepairingItem] = useState(false);
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
    const targets = new Set<number>();
    for (const pair of duplicatePairs) {
      const keepIndex = effectivePairKeepChoice[pair.pairKey] ?? pair.slotIndexes[0];
      const replaceIndex = keepIndex === pair.slotIndexes[0] ? pair.slotIndexes[1] : pair.slotIndexes[0];
      targets.add(replaceIndex);
    }
    return Array.from(targets.values()).sort((a, b) => a - b);
  }, [duplicatePairs, effectivePairKeepChoice]);
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

    setGeneratingMissingSlots(true);
    setMessage(null);

    try {
      const avoidPrompts = items
        .filter((slot) => isQuestionSlotFilled(slot))
        .map((slot) => normalizedPrompt(promptLikeText(slot)))
        .filter(Boolean);

      const plan = buildMissingSlotRecoveryPlan({ missingSlots: missingSlotIndexes.length, contentType: content.contentType });
      const attempts: MissingSlotRecoveryAttempt[] = [];
      const generatedItems: GeneratedReviewItem[] = [];
      const passFailures: string[] = [];

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
            avoidPrompts,
          },
          missingSlots: missingSlotIndexes.length,
          candidatePoolSize: pass.candidateCount,
          questionStyles: pass.questionStyles,
          passId: pass.id,
          passLabel: pass.label,
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
          let payload: {
            success?: boolean;
            error?: string;
            content?: { items?: unknown[] };
          } | null = null;
          if (raw) {
            try {
              payload = JSON.parse(raw) as {
                success?: boolean;
                error?: string;
                content?: { items?: unknown[] };
              };
            } catch {
              payload = null;
            }
          }

          if (!response.ok || payload?.success === false) {
            const fallbackMessage = raw && !raw.trim().startsWith("<") ? raw : null;
            passFailures.push(payload?.error ?? fallbackMessage ?? `Pass failed (${response.status}).`);
          } else {
            passItems = Array.isArray(payload?.content?.items)
              ? payload.content.items.filter((entry): entry is GeneratedReviewItem => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)))
              : [];
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

      const merged = mergeGeneratedIntoEmptySlots({
        existingItems: items,
        generatedItems: selection.selectedItems,
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
        `${diagnosticsMessage}\n${merged.summary.missingSlots === 0
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

  async function regenerateDuplicateSlots() {
    if (!duplicateReplacementTargets.length) {
      setMessage("No duplicate slots need replacement.");
      return;
    }

    setRegeneratingDuplicateSlots(true);
    setMessage(null);
    const nextItems = [...items];
    const avoidPrompts = new Set<string>();
    for (let index = 0; index < nextItems.length; index += 1) {
      if (duplicateReplacementTargets.includes(index)) continue;
      const prompt = normalizedPrompt(promptLikeText(nextItems[index]));
      if (prompt) avoidPrompts.add(prompt);
    }

    const failedSlots: number[] = [];
    let replacedCount = 0;

    for (const slotIndex of duplicateReplacementTargets) {
      try {
        const response = await fetch("/api/admin/ai/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: meta.subject,
            keyStage: meta.keyStage,
            yearGroup: meta.yearGroup,
            curriculumPathway: meta.curriculumPathway,
            examBoard: meta.examBoard,
            skillFocus: meta.skillFocus || meta.topic || "General",
            topic: meta.topic || meta.skillFocus || "General",
            difficulty: content.level,
            numberOfItems: 4,
            aiMode: "live_openai_only",
            activityType: content.contentType,
            avoidPrompts: Array.from(avoidPrompts.values()).slice(0, 10),
          }),
        });

        const payload = await response.json() as {
          success?: boolean;
          error?: string;
          content?: { items?: unknown[] };
        };

        if (!response.ok || payload.success === false) {
          failedSlots.push(slotIndex);
          continue;
        }

        const generatedItems = Array.isArray(payload.content?.items)
          ? payload.content.items.filter((item): item is GeneratedReviewItem => Boolean(item && typeof item === "object" && !Array.isArray(item)))
          : [];

        const replacement = generatedItems.find((candidate) => {
          const prompt = normalizedPrompt(promptLikeText(candidate));
          return Boolean(prompt) && !avoidPrompts.has(prompt);
        }) ?? generatedItems.find((candidate) => Boolean(normalizedPrompt(promptLikeText(candidate))));

        if (!replacement) {
          failedSlots.push(slotIndex);
          continue;
        }

        nextItems[slotIndex] = replacement;
        const replacementPrompt = normalizedPrompt(promptLikeText(replacement));
        if (replacementPrompt) avoidPrompts.add(replacementPrompt);
        replacedCount += 1;
      } catch {
        failedSlots.push(slotIndex);
      }
    }

    if (!replacedCount) {
      setMessage("Could not regenerate duplicate slots. Use Replace From Library or Edit Manually.");
      setRegeneratingDuplicateSlots(false);
      return;
    }

    const saved = await saveSlots(
      nextItems,
      `Regenerated ${replacedCount} duplicate slot${replacedCount === 1 ? "" : "s"}.${failedSlots.length ? ` ${failedSlots.length} slot${failedSlots.length === 1 ? " still needs" : "s still need"} manual replacement.` : ""}`,
    );

    if (saved && failedSlots.length) {
      selectSlot(failedSlots[0]);
    }

    setRegeneratingDuplicateSlots(false);
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
    const currentNote = itemNotes[selectedItemIndex] ?? "";
    try {
      const response = await fetch(`/api/admin/content/${content.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          notes: currentNote,
          // Pass item-level context for richer history (Part 3)
          questionContext: currentItem
            ? {
                questionIndex: selectedItemIndex,
                questionPreview: questionText.slice(0, 200) || undefined,
                itemId: typeof currentItem.id === "string" ? currentItem.id : undefined,
              }
            : undefined,
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
                  </div>
                </div>

                {duplicatePairs.length > 0 || hasGlobalDuplicates ? (
                  <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${duplicateSummary.hasExactDuplicates || hasGlobalDuplicates ? "border-rose-500/30 bg-rose-500/10 text-rose-100" : "border-amber-500/30 bg-amber-500/10 text-amber-100"}`}>
                    <p className="font-black">Duplicates Found: {totalDuplicateCount}</p>
                    {hasGlobalDuplicates ? (
                      <div className="mt-2 space-y-1">
                        {globalDuplicateSummary?.matches.slice(0, 5).map((match) => (
                          <p key={`${match.currentSlotId}-${match.matchedQuestionId}-${match.matchedContentId}`}>
                            {match.duplicateType} found against {match.sourceStatus} content (score {Math.round(match.similarity * 100)}%).
                          </p>
                        ))}
                        {globalDuplicateSummary && globalDuplicateSummary.matches.length > 5 ? (
                          <p>And {globalDuplicateSummary.matches.length - 5} more global duplicate match{globalDuplicateSummary.matches.length - 5 === 1 ? "" : "es"}.</p>
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
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => void regenerateDuplicateSlots()}
                        disabled={regeneratingDuplicateSlots || duplicateReplacementTargets.length === 0}
                        className="rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-3 py-2 text-left font-black text-indigo-100 hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {regeneratingDuplicateSlots ? "Finding replacement..." : "Find replacement / Generate fallback question"}
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
                        Edit Manually
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
                        disabled={generatingMissingSlots || slotSummary.missingSlots <= 0}
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
                    const primaryFlag = primaryDuplicateFlag(duplicateSummary.slotFlags[index]);
                    const flagLabel = primaryFlag === "exact"
                      ? "Duplicate"
                      : primaryFlag === "near"
                        ? "Near duplicate"
                        : primaryFlag === "same_pattern"
                          ? "Same pattern"
                          : null;
                    return (
                      <button
                        key={`slot-${index}`}
                        type="button"
                        onClick={() => selectSlot(index)}
                        className={`rounded-full border px-2 py-1 text-xs font-black ${selectedSlot ? "border-indigo-400 bg-indigo-500/20 text-indigo-100" : primaryFlag === "exact" ? "border-rose-500/50 bg-rose-500/10 text-rose-100" : primaryFlag ? "border-amber-500/40 bg-amber-500/10 text-amber-100" : filled ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-amber-500/40 bg-amber-500/10 text-amber-100"}`}
                      >
                        Slot {index + 1} {flagLabel ?? (filled ? "Filled" : "Empty")}
                      </button>
                    );
                  })}
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
                    <p className="font-bold text-slate-300">Reasons</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {blackBox.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
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
                            <ul className="mt-1 list-disc space-y-1 pl-5">
                              {currentItemCheck.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                            </ul>
                          ) : null}
                          {currentItemCheck.reasons && currentItemCheck.reasons.length > 0 ? (
                            <div className="mt-3">
                              <BlackBoxRepairPanel
                                currentItem={currentItem}
                                itemIndex={selectedItemIndex}
                                currentItemLevel={currentItemLevel}
                                correctAnswer={slotAnswerInput}
                                topic={meta.topic || ""}
                                reasons={currentItemCheck.reasons}
                                onRepair={handleRepairApplied}
                                disabled={repairingItem}
                              />
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
            {message ? <p className="mt-3 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200">{message}</p> : null}
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
