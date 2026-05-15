"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import { safeJsonParse } from "@/lib/safe-json";
import {
  EXAM_BOARDS,
  GCSE_EXAM_BOARD_WARNING,
  KEY_STAGES,
  YEAR_GROUPS,
  AGE_GROUPS,
  curriculumPathwayForYearGroup,
  GENERATION_CONTENT_TYPE_BY_SUBJECT,
  isValidCurriculumPath,
  keyStageForYearGroup,
  yearGroupsForKeyStage,
  ageGroupForYearGroup,
  shouldApplyExamBoardTag,
  subjectsForYearGroup,
  skillsForSubjectAndYear,
  topicSuggestionsForSelection,
  type Subject,
  type YearGroup,
} from "@/lib/curriculum";

type GeneratedPreviewItem = Record<string, unknown> & {
  id?: string;
  status?: "pending" | "approved" | "rejected";
  type?: string;
  prompt?: string;
  answer?: unknown;
  options?: unknown[];
  sentence?: string;
  explanation?: string;
  hint?: string;
};

type GeneratedPreview = {
  title: string;
  subject: Subject;
  keyStage: string;
  yearGroup: string;
  skillFocus: string;
  difficulty: number;
  topic: string;
  status: "draft";
  safetyStatus: "passed";
  qualityScore: number;
  voiceScript: string;
  imagePrompt: string;
  items: GeneratedPreviewItem[];
};

function getAvailableSubjects(yearGroup: string | null | undefined): readonly Subject[] {
  return subjectsForYearGroup(yearGroup);
}

function getAvailableSkills(subject: Subject, yearGroup: string | null | undefined): readonly string[] {
  return skillsForSubjectAndYear(subject, yearGroup);
}

function normalizeYearForKeyStage(
  keyStage: (typeof KEY_STAGES)[number],
  yearGroup: string | null | undefined
): YearGroup {
  const options = yearGroupsForKeyStage(keyStage);
  return (yearGroup && options.includes(yearGroup as YearGroup) ? yearGroup : options[0]) as YearGroup;
}

type WeakArea = {
  id: string;
  studentId: string;
  subject: string;
  keyStage: string | null;
  yearGroup: string | null;
  skillFocus: string;
  weaknessType: string;
  accuracy: number;
  currentDifficulty: number;
  status: string;
  student: { id: string; name: string };
};

type ValidationMeta = {
  valid: boolean;
  repaired: boolean;
  errors: string[];
  fixesApplied: string[];
  removedWords: string[];
  regeneratedCount: number;
  requestedCount: number;
  finalCount: number;
  cached?: boolean;
};

type SpellingPreviewItem = {
  id: string;
  word: string;
  hint: string;
  sentenceContext: string;
  categoryHint: string;
  syllables: string;
  emoji: string;
  yearGroup: string;
  skillFocus: string;
  difficulty: number;
};

type AutomationStatus = {
  title: string;
  lines: string[];
  ok: boolean;
};

type GenerationContext = {
  subject: Subject;
  keyStage: (typeof KEY_STAGES)[number];
  yearGroup: YearGroup;
  curriculumPathway: string;
  examBoard?: string;
  skillFocus: string;
  ageGroup: (typeof AGE_GROUPS)[number];
  difficulty: number;
  topic: string;
  targetStudentId: string | null;
  source: "manual" | "weak-area";
  weakAreaId: string | null;
};

const CUSTOM_TOPIC_VALUE = "__custom_topic__";

function resolvePreviewItemStatus(item: GeneratedPreviewItem, fallback: "pending" | "approved" = "approved"): "pending" | "approved" | "rejected" {
  return item.status === "approved" || item.status === "rejected" || item.status === "pending" ? item.status : fallback;
}

function applyDefaultItemStatuses(items: GeneratedPreviewItem[], fallback: "pending" | "approved" = "approved"): GeneratedPreviewItem[] {
  return items.map((item) => ({
    ...item,
    status: resolvePreviewItemStatus(item, fallback),
  }));
}

function formatSubjectLabel(value: string): string {
  if (value === "math") return "Maths";
  if (value === "maths") return "Maths";
  if (value === "times-tables") return "Times Tables";
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, " ");
}

function subjectFamily(value: string): "maths" | "science" | "english" | "other" {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("math")) return "maths";
  if (normalized.includes("science")) return "science";
  if (
    normalized.includes("english")
    || normalized.includes("reading")
    || normalized.includes("writing")
    || normalized.includes("grammar")
    || normalized.includes("punctuation")
    || normalized.includes("spelling")
    || normalized.includes("phonics")
    || normalized.includes("literature")
    || normalized.includes("vocabulary")
  ) {
    return "english";
  }
  return "other";
}

function formatFriendlyTopic(value: string): string {
  const normalized = value.replace(/_/g, " ").replace(/-/g, " ").trim();
  if (!normalized) return "Targeted intervention";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function toTitleCaseWords(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatValidationSuccessMessage(subject: Subject): string {
  if (subject === "punctuation") return "Final punctuation set is valid.";
  if (subject === "grammar") return "Final grammar set is valid.";
  if (subject === "reading") return "Final reading set is valid.";
  if (subject === "maths" || subject === "times-tables" || subject === "gcse-maths" || subject === "science" || subject === "gcse-science") {
    return "Final maths set is valid.";
  }
  if (subject === "spelling" || subject === "phonics") {
    return "Final set is valid. No duplicates or invalid skill words detected.";
  }
  if (subject === "writing" || subject === "english-language") return "Final writing set is valid.";
  return `Final ${formatSubjectLabel(subject).toLowerCase()} set is valid.`;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = 25000): Promise<Response> {
  const controller = new AbortController();
  const id = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(id);
  }
}

type SafeApiResponse<T = Record<string, unknown>> = {
  ok: boolean;
  payload: T | null;
  message: string | null;
  diagnostics: {
    status: number;
    contentType: string;
    parseStage: "json" | "text-json" | "invalid-content-type" | "invalid-shape" | "empty";
    rawResponse: string;
  };
};

async function parseApiResponse<T = Record<string, unknown>>(response: Response): Promise<SafeApiResponse<T>> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  const trimmed = text.trim();

  if (!trimmed) {
    return {
      ok: false,
      payload: null,
      message: "The server returned an empty response.",
      diagnostics: { status: response.status, contentType, parseStage: "empty", rawResponse: text },
    };
  }

  if (contentType.includes("application/json")) {
    const parsed = safeJsonParse<T>(trimmed);
    if (parsed.success) {
      return {
        ok: true,
        payload: parsed.data,
        message: null,
        diagnostics: { status: response.status, contentType, parseStage: "json", rawResponse: text },
      };
    }
    return {
      ok: false,
      payload: null,
      message: "Generation failed due to malformed AI output.",
      diagnostics: { status: response.status, contentType, parseStage: "invalid-shape", rawResponse: text },
    };
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = safeJsonParse<T>(trimmed);
    if (parsed.success) {
      return {
        ok: true,
        payload: parsed.data,
        message: null,
        diagnostics: { status: response.status, contentType, parseStage: "text-json", rawResponse: text },
      };
    }
  }

  return {
    ok: false,
    payload: null,
    message: trimmed.toLowerCase().includes("<!doctype") || trimmed.toLowerCase().includes("<html")
      ? `The server returned HTML instead of JSON (status ${response.status}). Check admin session/auth or server errors.`
      : `The server returned a non-JSON response (status ${response.status}).`,
    diagnostics: { status: response.status, contentType, parseStage: "invalid-content-type", rawResponse: text },
  };
}

export default function AiGeneratorPage() {
  const searchParams = useSearchParams();
  const prefillSubject = searchParams.get("subject");
  const prefillSkill = searchParams.get("skill");
  const prefillWords = searchParams.get("words");
  const prefillStudentId = searchParams.get("studentId");
  const prefillDifficulty = Number(searchParams.get("difficulty"));

  // Initialize with sensible defaults; validate against curriculum
  const initialYearGroup: YearGroup = "Year 1";
  const initialAgeGroup = ageGroupForYearGroup(initialYearGroup);

  const [yearGroup, setYearGroup] = useState<string>(initialYearGroup);
  const [examBoard, setExamBoard] = useState("");
  const [ageGroup, setAgeGroup] = useState(initialAgeGroup);
  const availableSubjects = getAvailableSubjects(yearGroup);
  const [subject, setSubject] = useState<Subject>(
    prefillSubject && (availableSubjects as string[]).includes(prefillSubject as string)
      ? (prefillSubject as Subject)
      : availableSubjects[0]
  );
  const [keyStage, setKeyStage] = useState(keyStageForYearGroup(yearGroup));
  const availableSkills = getAvailableSkills(subject, yearGroup);
  const [skillFocus, setSkillFocus] = useState(
    prefillSkill && availableSkills.includes(prefillSkill) ? prefillSkill : availableSkills[0] ?? ""
  );
  const [difficulty, setDifficulty] = useState(
    Number.isFinite(prefillDifficulty) && prefillDifficulty >= 1 ? prefillDifficulty : prefillWords ? 1 : 2
  );
  const [items, setItems] = useState(12);
  const [topicChoice, setTopicChoice] = useState<string>(prefillWords ? CUSTOM_TOPIC_VALUE : "");
  const [customTopic, setCustomTopic] = useState(prefillWords ? `Focus practice on: ${prefillWords}` : "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<GeneratedPreview | null>(null);
  const [generationMeta, setGenerationMeta] = useState<{
    model?: string;
    prompt?: string;
    estimatedCostPence?: number;
    estimatedTokens?: number;
    validation?: ValidationMeta;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [automationStatus, setAutomationStatus] = useState<AutomationStatus | null>(null);
  const [automationDebugPayload, setAutomationDebugPayload] = useState<string | null>(null);
  const [automationLoading, setAutomationLoading] = useState<"autofill" | "weaknesses" | null>(null);
  const [automationDurationMs, setAutomationDurationMs] = useState<number | null>(null);
  const [automationRetryMode, setAutomationRetryMode] = useState<"autofill" | "weaknesses" | null>(null);
  const [automationMessage, setAutomationMessage] = useState<string | null>(
    prefillWords ? "Follow-up practice prefilled from assignment weak areas." : null
  );
  const [weakAreas, setWeakAreas] = useState<WeakArea[]>([]);
  const [weakAreaKeyStageFilter, setWeakAreaKeyStageFilter] = useState("");
  const [weakAreaYearGroupFilter, setWeakAreaYearGroupFilter] = useState("");
  const [weakAreaSubjectFilter, setWeakAreaSubjectFilter] = useState<"manual" | "all">("manual");
  const [savedContentId, setSavedContentId] = useState<string | null>(null);
  const [targetStudentId, setTargetStudentId] = useState<string | null>(prefillStudentId);
  const [generationPhase, setGenerationPhase] = useState<"idle" | "generating" | "repairing-response" | "validating-content" | "retrying-parse">("idle");
  const [generationDiagnostics, setGenerationDiagnostics] = useState<{
    rawResponse: string;
    parseStage: string;
    statusCode: number;
    contentType: string;
    model?: string;
    provider?: string;
  } | null>(null);
  const [previewContext, setPreviewContext] = useState<GenerationContext | null>(null);
  const [loadedWeakAreaId, setLoadedWeakAreaId] = useState<string | null>(null);
  const [weakAreaFormSynced, setWeakAreaFormSynced] = useState(false);

  const topicSuggestions = useMemo(() => topicSuggestionsForSelection({
    yearGroup,
    subject,
    skillFocus,
  }), [yearGroup, subject, skillFocus]);
  const effectiveTopicChoice = topicChoice === CUSTOM_TOPIC_VALUE
    ? CUSTOM_TOPIC_VALUE
    : topicSuggestions.includes(topicChoice)
      ? topicChoice
      : topicSuggestions[0] ?? "";
  const selectedTopicTheme = (effectiveTopicChoice === CUSTOM_TOPIC_VALUE ? customTopic : effectiveTopicChoice).trim();
  const curriculumPathway = curriculumPathwayForYearGroup(yearGroup);
  const shouldTagExamBoard = shouldApplyExamBoardTag({
    yearGroup,
    keyStage,
    curriculumPathway,
    subject,
  });

  const canGenerate = Boolean(subject && keyStage && yearGroup && skillFocus.trim() && selectedTopicTheme);

  const automationDurationLabel = automationDurationMs === null
    ? null
    : `${(automationDurationMs / 1000).toFixed(1)}s`;

  const previewTitle = preview?.topic?.trim() || selectedTopicTheme;

  const phonicsMismatchDetected = (generationMeta?.validation?.errors ?? []).some((value) =>
    value.includes("phonics_stage")
  );

  const generatedItemsList = (preview?.items ?? []) as GeneratedPreviewItem[];
  const saveBlocked = !generatedItemsList.length || generationMeta?.validation?.valid === false;
  const approvedCount = generatedItemsList.filter((item) => item.status === "approved").length;
  const effectiveGenerationContext = previewContext ?? {
    subject,
    keyStage,
    yearGroup: yearGroup as YearGroup,
    curriculumPathway,
    examBoard: shouldTagExamBoard ? examBoard : undefined,
    skillFocus,
    ageGroup: ageGroup as (typeof AGE_GROUPS)[number],
    difficulty,
    topic: selectedTopicTheme,
    targetStudentId,
    source: "manual" as const,
    weakAreaId: null,
  };
  const selectedGenerationTypeForContext = GENERATION_CONTENT_TYPE_BY_SUBJECT[effectiveGenerationContext.subject];

  const weakAreasWithMatch = weakAreas.map((area) => {
    const areaDerivedKeyStage = area.keyStage ?? keyStageForYearGroup(area.yearGroup ?? "Year 1");
    const subjectMatches = subjectFamily(area.subject) === subjectFamily(subject);
    const keyStageMatches = areaDerivedKeyStage === keyStage;
    const yearGroupMatches = area.yearGroup ? area.yearGroup === yearGroup : true;
    return {
      area,
      subjectMatches,
      contextMatches: subjectMatches && keyStageMatches && yearGroupMatches,
    };
  });
  const visibleWeakAreas = weakAreaSubjectFilter === "all"
    ? weakAreasWithMatch
    : weakAreasWithMatch.filter((entry) => entry.contextMatches);
  const showDeveloperDetails = process.env.NEXT_PUBLIC_ADMIN_DEBUG === "1";
  const previewBadge = generationMeta?.validation?.valid === false
    ? { label: "Needs Review", className: "bg-rose-500/15 text-rose-200" }
    : generationMeta?.validation?.repaired
      ? { label: "Adjusted", className: "bg-amber-500/15 text-amber-200" }
      : { label: "Perfect", className: "bg-emerald-500/15 text-emerald-200" };

  const clearWeakAreaLink = () => {
    setLoadedWeakAreaId(null);
    setWeakAreaFormSynced(false);
  };

  function formatRepairMessage(error: string) {
    const [type, word] = error.split(":");
    if (type === "duplicate") return `Removed duplicate: ${word}`;
    if (type === "invalid_silent_e") return `Removed invalid word: ${word}`;
    if (type.startsWith("phonics_stage")) return `Removed out-of-stage phonics word: ${word}`;
    if (type === "incomplete") return `Removed incomplete item: ${word}`;
    return error;
  }

  async function generatePreview(retryCount = 0, contextOverride?: GenerationContext) {
    const context: GenerationContext = contextOverride ?? {
      subject,
      keyStage,
      yearGroup: yearGroup as YearGroup,
      curriculumPathway,
      examBoard: shouldTagExamBoard ? examBoard : undefined,
      skillFocus,
      ageGroup: ageGroup as (typeof AGE_GROUPS)[number],
      difficulty,
      topic: selectedTopicTheme,
      targetStudentId,
      source: "manual",
      weakAreaId: null,
    };

    if (!context.subject || !context.keyStage || !context.yearGroup || !context.skillFocus.trim()) {
      setError("Subject, key stage, year group and skill focus are required.");
      return;
    }
    if (!context.topic) {
      setError("Topic/theme is required before generating content.");
      return;
    }
    const pathValidation = isValidCurriculumPath({
      yearGroup: context.yearGroup,
      subject: context.subject,
      skillFocus: context.skillFocus,
      topic: context.topic,
    });
    if (!pathValidation.ok) {
      setError(pathValidation.reason);
      return;
    }
    if (items < 1 || items > 30) {
      setError("Number of items must be between 1 and 30.");
      return;
    }
    const maxDifficulty = 5;
    if (difficulty < 1 || difficulty > maxDifficulty) {
      setError(`Difficulty must be between 1 and ${maxDifficulty}.`);
      return;
    }
    setLoading(true);
    setGenerationPhase("generating");
    setError(null);
    setMessage(null);
    setSavedContentId(null);
    setPreview(null);
    setGenerationMeta(null);
    setPreviewContext(null);
    setGenerationDiagnostics(null);
    try {
      const response = await fetch("/api/admin/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: context.subject,
          keyStage: context.keyStage,
          yearGroup: context.yearGroup,
          curriculumPathway: context.curriculumPathway,
          examBoard: context.examBoard,
          skillFocus: context.skillFocus,
          ageGroup: context.ageGroup,
          difficulty: context.difficulty,
          numberOfItems: items,
          topic: context.topic,
        }),
      });
      setGenerationPhase("repairing-response");
      const parsed = await parseApiResponse<Record<string, unknown>>(response);
      setGenerationDiagnostics({
        rawResponse: parsed.diagnostics.rawResponse,
        parseStage: parsed.diagnostics.parseStage,
        statusCode: parsed.diagnostics.status,
        contentType: parsed.diagnostics.contentType,
        model: typeof parsed.payload?.model === "string" ? parsed.payload.model : undefined,
        provider: "openai",
      });

      if (!parsed.ok || !parsed.payload) {
        if (retryCount === 0) {
          setGenerationPhase("retrying-parse");
          await generatePreview(1, context);
          return;
        }
        setError(parsed.message ?? "The AI returned an invalid response. Please try again.");
        return;
      }

        const payload = parsed.payload as {
        success?: boolean;
        error?: string;
        details?: unknown;
          content?: Partial<GeneratedPreview> & { items?: unknown[]; title?: string };
        model?: string;
        prompt?: string;
        estimatedCostPence?: number;
        estimatedTokens?: number;
        meta?: ValidationMeta;
      };

      setGenerationPhase("validating-content");
      if (!response.ok || payload.success === false) {
        const errorMsg = payload.error ?? "The AI returned an invalid response. Please try again.";
        const details = payload.details ? `\n\nDetails: ${JSON.stringify(payload.details, null, 2)}` : "";
        setError(errorMsg + details);
      } else {
        const content = payload.content;
        const incomingItems = Array.isArray(payload.content?.items)
          ? (payload.content.items as GeneratedPreviewItem[])
          : [];
        setPreview({
          ...(content ?? {}),
          subject: context.subject,
          keyStage: context.keyStage,
          yearGroup: context.yearGroup,
          skillFocus: context.skillFocus,
          difficulty: context.difficulty,
          status: "draft",
          safetyStatus: content?.safetyStatus ?? "passed",
          qualityScore: content?.qualityScore ?? 80,
          voiceScript: content?.voiceScript ?? "",
          imagePrompt: content?.imagePrompt ?? "",
          topic: context.topic,
          title: `${formatSubjectLabel(context.subject)} - ${context.topic}`,
          items: applyDefaultItemStatuses(incomingItems, "approved"),
        });
        setGenerationMeta({
          model: payload.model,
          prompt: payload.prompt,
          estimatedCostPence: payload.estimatedCostPence,
          estimatedTokens: payload.estimatedTokens,
          validation: payload.meta,
        });
        setPreviewContext(context);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unable to reach AI generator";
      setError(`Network or server error: ${errorMsg}`);
    } finally {
      setLoading(false);
      setGenerationPhase("idle");
    }
  }

  async function saveGeneratedContent() {
    if (!preview || !approvedCount) return;
    const context = previewContext ?? {
      subject,
      keyStage,
      yearGroup: yearGroup as YearGroup,
      curriculumPathway,
      examBoard: shouldTagExamBoard ? examBoard : undefined,
      skillFocus,
      ageGroup: ageGroup as (typeof AGE_GROUPS)[number],
      difficulty,
      topic: selectedTopicTheme,
      targetStudentId,
      source: "manual" as const,
      weakAreaId: null,
    };

    const generationTypeForContext = GENERATION_CONTENT_TYPE_BY_SUBJECT[context.subject];
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/content-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: context.subject,
          generationType: generationTypeForContext,
          ageGroup: context.ageGroup,
          keyStage: context.keyStage,
          yearGroup: context.yearGroup,
          curriculumPathway: context.curriculumPathway,
          examBoard: context.examBoard,
          skillFocus: context.skillFocus,
          difficulty: context.difficulty,
          topic: context.topic,
          itemSchema: generationTypeForContext,
          items: {
            ...preview,
            items: (preview.items as GeneratedPreviewItem[]).filter((item) => item.status === "approved"),
          },
          status: "review",
          model: generationMeta?.model,
          prompt: generationMeta?.prompt,
          estimatedCostPence: generationMeta?.estimatedCostPence,
          generationSource: context.source,
          weakAreaId: context.weakAreaId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Save failed.");
      } else {
        const warnings = Array.isArray(payload.warnings)
          ? payload.warnings.filter((entry: unknown): entry is string => typeof entry === "string")
          : [];
        setMessage(warnings.length ? `Saved to Content Library. Warning: ${warnings.join(" ")}` : "Saved to Content Library");
        setSavedContentId(payload.item?.id ?? null);
        if (context.targetStudentId && payload.item?.id) {
          const assignResponse = await fetch("/api/admin/assignments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studentId: context.targetStudentId, contentId: payload.item.id }),
          });
          const assignPayload = await assignResponse.json().catch(() => ({} as { error?: string }));
          if (assignResponse.ok) {
            setMessage("Saved to Content Library and assigned to student");
          } else {
            setMessage(assignPayload.error ?? "Saved to Content Library, but assignment failed.");
          }
        }
      }
    } catch {
      setError("Unable to save to Content Library.");
    } finally {
      setSaving(false);
    }
  }

  function updatePreviewItem(index: number, patch: Partial<GeneratedPreviewItem>) {
    setPreview((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
      };
    });
  }

  function replacePreviewItem(index: number, nextItem: GeneratedPreviewItem) {
    setPreview((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item, itemIndex) => itemIndex === index ? nextItem : item),
      };
    });
  }

  function updatePreviewItemJson(index: number, value: string) {
    try {
      const parsed = JSON.parse(value) as GeneratedPreviewItem;
      updatePreviewItem(index, parsed);
      setError(null);
    } catch {
      setError("Item JSON is not valid yet. Fix it before saving.");
    }
  }

  function markPreviewItem(index: number, status: "approved" | "rejected") {
    updatePreviewItem(index, { status });
  }

  async function regenerateItem(index: number) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          keyStage,
          yearGroup,
          curriculumPathway,
          examBoard: shouldTagExamBoard ? examBoard : undefined,
          skillFocus,
          ageGroup,
          difficulty,
          numberOfItems: 1,
          topic: `${selectedTopicTheme || skillFocus} replacement item`,
        }),
      });
      const parsed = await parseApiResponse<Record<string, unknown>>(response);
      if (!parsed.ok || !parsed.payload) {
        setError(parsed.message ?? "Regeneration failed due to malformed AI output.");
        return;
      }
      const payload = parsed.payload as { success?: boolean; error?: string; content?: { items?: unknown[] }; meta?: { valid?: boolean } };
      if (!response.ok || payload.success === false) {
        setError(payload.error ?? "Regeneration failed.");
        return;
      }
      const replacement = payload.content?.items?.[0] as GeneratedPreviewItem | undefined;
      if (replacement) {
        const fallbackStatus = payload.meta?.valid === false ? "pending" : "approved";
        replacePreviewItem(index, {
          ...replacement,
          status: resolvePreviewItemStatus(replacement, fallbackStatus),
        });
      }
    } catch {
      setError("Unable to regenerate item.");
    } finally {
      setLoading(false);
    }
  }

  async function runAutomation(mode: "autofill" | "weaknesses") {
    const startedAt = Date.now();
    setAutomationLoading(mode);
    setAutomationRetryMode(null);
    setAutomationDurationMs(null);
    setAutomationStatus({
      title: mode === "weaknesses" ? "Running weak area detection..." : "Running library automation...",
      lines: ["Please wait while processing."],
      ok: true,
    });
    setAutomationDebugPayload(null);
    try {
      if (mode === "weaknesses") {
        const detectResponse = await fetchWithTimeout("/api/admin/weak-areas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyStage: weakAreaKeyStageFilter || undefined,
            yearGroup: weakAreaYearGroupFilter || undefined,
          }),
        });
        const detectPayload = await detectResponse.json() as { error?: string; weakAreas?: unknown[] };
        if (!detectResponse.ok) {
          setAutomationRetryMode(mode);
          setAutomationStatus({
            title: "Weak area scan failed",
            lines: [detectPayload.error ?? "Could not detect weak areas. Try again."],
            ok: false,
          });
          return;
        }

        const weaknessParams = new URLSearchParams();
        if (weakAreaKeyStageFilter) weaknessParams.set("keyStage", weakAreaKeyStageFilter);
        if (weakAreaYearGroupFilter) weaknessParams.set("yearGroup", weakAreaYearGroupFilter);
        const weakAreasUrl = `/api/admin/weak-areas${weaknessParams.toString() ? `?${weaknessParams.toString()}` : ""}`;
        const listResponse = await fetchWithTimeout(weakAreasUrl, { method: "GET" });
        const listPayload = await listResponse.json() as { error?: string; weakAreas?: WeakArea[] };
        if (!listResponse.ok) {
          setAutomationRetryMode(mode);
          setAutomationStatus({
            title: "Weak area listing failed",
            lines: [listPayload.error ?? "Unable to fetch weak area list."],
            ok: false,
          });
          return;
        }

        const detectedCount = Array.isArray(detectPayload.weakAreas) ? detectPayload.weakAreas.length : 0;
        const currentWeakAreas = listPayload.weakAreas ?? [];
        setWeakAreas(currentWeakAreas);
        setAutomationStatus({
          title: "Weak area detection complete",
          lines: currentWeakAreas.length
            ? [
                `${currentWeakAreas.length} active weak areas currently tracked.`,
                `${detectedCount} weak area signals detected in latest scan.`,
              ]
            : ["No weak areas detected."],
          ok: true,
        });
        setAutomationDebugPayload(JSON.stringify({ detectPayload, listPayload }, null, 2));
        return;
      }

      const response = await fetchWithTimeout("/api/admin/ai/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const payload = await response.json() as {
        error?: string;
        created?: Array<{ type: string; id: string; reused: boolean }>;
      };
      if (!response.ok) {
        setAutomationRetryMode(mode);
        setAutomationStatus({
          title: "Library automation failed",
          lines: [payload.error ?? "Automation failed."],
          ok: false,
        });
        return;
      }

      const created = payload.created ?? [];
      const reusedCount = created.filter((entry) => entry.reused).length;
      const freshCount = created.length - reusedCount;
      const subjectLabels = Array.from(new Set(created.map((entry) => formatSubjectLabel(entry.type))));
      setAutomationStatus({
        title: "Library updated successfully",
        lines: freshCount > 0
          ? [
              `${freshCount} content sets generated.`,
              `${reusedCount} existing content sets reused.`,
              subjectLabels.length ? `${subjectLabels.join(", ")} library refreshed.` : "Library refreshed.",
            ]
          : [
              `${reusedCount} existing content sets reused.`,
              "No new content generation required.",
            ],
        ok: true,
      });
      setAutomationDebugPayload(JSON.stringify(payload, null, 2));
    } catch (error) {
      const timeout = error instanceof DOMException && error.name === "AbortError";
      setAutomationRetryMode(mode);
      setAutomationStatus({
        title: timeout ? "Automation timed out" : "Automation failed",
        lines: [timeout ? "Request timed out. Please retry." : "Unexpected error while running automation."],
        ok: false,
      });
    } finally {
      setAutomationLoading(null);
      setAutomationDurationMs(Date.now() - startedAt);
    }
  }

  function weakAreaToGenerationContext(area: WeakArea): GenerationContext {
    const subjectLower = area.subject.toLowerCase();
    const skillLower = area.skillFocus.toLowerCase();
    const inferredYearGroup = area.yearGroup ?? (skillLower.includes("algebra") ? "Year 10" : "Year 4");
    const derivedKeyStage = (area.keyStage ?? keyStageForYearGroup(inferredYearGroup)) as typeof KEY_STAGES[number];
    const derivedYearGroup = normalizeYearForKeyStage(derivedKeyStage, inferredYearGroup);
    const availableForYear = getAvailableSubjects(derivedYearGroup);

    const preferredSubjects: Subject[] =
      subjectLower === "math" || subjectLower === "maths"
        ? (["gcse-maths", "maths", "times-tables"] as Subject[])
        : subjectLower.includes("science")
          ? (["gcse-science", "science"] as Subject[])
          : subjectLower.includes("reading")
            ? (["reading", "english-language", "grammar"] as Subject[])
            : (["spelling", "writing", "grammar"] as Subject[]);

    let mappedSubject = preferredSubjects.find((candidate) => availableForYear.includes(candidate));
    if (!mappedSubject) {
      mappedSubject = availableForYear[0];
    }
    if (!mappedSubject) {
      mappedSubject = "spelling";
    }

    const skills = getAvailableSkills(mappedSubject, derivedYearGroup);
    const skillExact = skills.find((skill) => skill.toLowerCase() === skillLower);
    const skillLoose = skills.find((skill) => skill.toLowerCase().includes(skillLower) || skillLower.includes(skill.toLowerCase()));
    const mappedSkill = skillExact ?? skillLoose ?? skills[0] ?? area.skillFocus;
    const mappedTopics = topicSuggestionsForSelection({
      yearGroup: derivedYearGroup,
      subject: mappedSubject,
      skillFocus: mappedSkill,
    });

    const curriculum = curriculumPathwayForYearGroup(derivedYearGroup);
    const needExamBoard = shouldApplyExamBoardTag({
      yearGroup: derivedYearGroup,
      keyStage: derivedKeyStage,
      curriculumPathway: curriculum,
      subject: mappedSubject,
    });
    const recommendedExamBoard = needExamBoard ? EXAM_BOARDS.find((value) => value.toUpperCase() === "AQA") ?? EXAM_BOARDS[0] ?? "" : "";
    const baselineDifficulty = Math.max(1, Math.min(5, area.currentDifficulty || 2));
    const recommendedDifficulty = Math.max(1, baselineDifficulty - 1);
    const recommendedTopic = mappedTopics[0] ?? `${mappedSkill} practice`;

    return {
      subject: mappedSubject,
      keyStage: derivedKeyStage,
      yearGroup: derivedYearGroup,
      curriculumPathway: curriculum,
      examBoard: needExamBoard ? recommendedExamBoard : undefined,
      skillFocus: mappedSkill,
      ageGroup: ageGroupForYearGroup(derivedYearGroup),
      difficulty: recommendedDifficulty,
      topic: recommendedTopic,
      targetStudentId: area.studentId,
      source: "weak-area",
      weakAreaId: area.id,
    };
  }

  function applyWeakArea(area: WeakArea) {
    const context = weakAreaToGenerationContext(area);
    setSubject(context.subject);
    setKeyStage(context.keyStage);
    setYearGroup(context.yearGroup);
    setAgeGroup(context.ageGroup);
    setSkillFocus(context.skillFocus);
    setDifficulty(context.difficulty);
    setExamBoard(context.examBoard ?? "");
    setTopicChoice(context.topic);
    setCustomTopic("");
    setTargetStudentId(area.studentId);
    setLoadedWeakAreaId(area.id);
    setWeakAreaFormSynced(true);
    setSavedContentId(null);
    setAutomationMessage(`Loaded ${area.student.name}'s weak area into the manual generator.`);
  }

  async function generateInterventionFromWeakArea(area: WeakArea) {
    const context = weakAreaToGenerationContext(area);
    setTargetStudentId(area.studentId);
    setLoadedWeakAreaId(area.id);
    setWeakAreaFormSynced(false);
    setAutomationMessage(`Generating direct intervention from detected weak-area analytics for ${area.student.name}.`);
    await generatePreview(0, context);
  }

  return (
    <div className="relative z-0 grid items-start gap-6 xl:grid-cols-[32rem_minmax(0,1fr)]">
      <div className="xl:sticky xl:top-36 xl:z-20">
      <AdminSectionCard title="Manual Curriculum Generator" eyebrow="Manual AI generator">
        <div className="space-y-4 pb-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              Year group
              <select
                value={yearGroup}
                onChange={(event) => {
                  clearWeakAreaLink();
                  const nextYear = event.target.value;
                  setYearGroup(nextYear);
                  setKeyStage(keyStageForYearGroup(nextYear));
                  setAgeGroup(ageGroupForYearGroup(nextYear));
                  if (!shouldApplyExamBoardTag({
                    yearGroup: nextYear,
                    keyStage: keyStageForYearGroup(nextYear),
                    curriculumPathway: curriculumPathwayForYearGroup(nextYear),
                    subject,
                  })) {
                    setExamBoard("");
                  }
                  setTopicChoice("");
                  setCustomTopic("");

                  // Update subject if current is no longer available
                  const nextAvailable = getAvailableSubjects(nextYear);
                  if (!nextAvailable.includes(subject)) {
                    setSubject(nextAvailable[0]);
                    const nextSkills = getAvailableSkills(nextAvailable[0], nextYear);
                    setSkillFocus(nextSkills[0] ?? "");
                  } else {
                    // Update skill focus if current is no longer available
                    const nextSkills = getAvailableSkills(subject, nextYear);
                    if (!nextSkills.includes(skillFocus)) {
                      setSkillFocus(nextSkills[0] ?? "");
                    }
                  }
                }}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
              >
                {YEAR_GROUPS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Key stage
              <select
                value={keyStage}
                onChange={(event) => {
                  clearWeakAreaLink();
                  const nextKeyStage = event.target.value as typeof KEY_STAGES[number];
                  setKeyStage(nextKeyStage);
                  const options = yearGroupsForKeyStage(nextKeyStage);
                  const nextYear = options.includes(yearGroup as (typeof YEAR_GROUPS)[number])
                    ? yearGroup
                    : options[0];
                  setYearGroup(nextYear);
                  setAgeGroup(ageGroupForYearGroup(nextYear));
                  if (!shouldApplyExamBoardTag({
                    yearGroup: nextYear,
                    keyStage: nextKeyStage,
                    curriculumPathway: curriculumPathwayForYearGroup(nextYear),
                    subject,
                  })) {
                    setExamBoard("");
                  }
                  setTopicChoice("");
                  setCustomTopic("");
                }}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
              >
                {KEY_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm font-bold text-slate-300">
            Subject
            <select
              value={subject}
              onChange={(event) => {
                clearWeakAreaLink();
                const nextSubject = event.target.value as Subject;
                setSubject(nextSubject);
                const nextSkills = getAvailableSkills(nextSubject, yearGroup);
                setSkillFocus(nextSkills[0] ?? "");
                setTopicChoice("");
                setCustomTopic("");
              }}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
            >
              {availableSubjects.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ")}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-bold text-slate-300">
            Skill focus
            <select
              value={skillFocus}
              onChange={(event) => {
                clearWeakAreaLink();
                const nextSkill = event.target.value;
                setSkillFocus(nextSkill);
                setTopicChoice("");
                setCustomTopic("");
              }}
              className="mt-2 max-h-72 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
            >
              <option value="">Select a skill focus</option>
              {availableSkills.map((skill) => (
                <option key={skill} value={skill}>
                  {skill}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              Curriculum pathway
              <input
                value={curriculumPathway.toUpperCase()}
                readOnly
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white"
              />
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Exam board {shouldTagExamBoard ? "(recommended)" : "(not needed)"}
              <select
                value={examBoard}
                onChange={(event) => {
                  clearWeakAreaLink();
                  setExamBoard(event.target.value);
                }}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
                disabled={!shouldTagExamBoard}
              >
                <option value="">None</option>
                {EXAM_BOARDS.map((board) => (
                  <option key={board} value={board}>{board}</option>
                ))}
              </select>
            </label>
          </div>
          {shouldTagExamBoard && !examBoard ? (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">{GCSE_EXAM_BOARD_WARNING}</p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              Age group
              <select
                value={ageGroup}
                onChange={(event) => {
                  clearWeakAreaLink();
                  setAgeGroup(event.target.value as typeof AGE_GROUPS[number]);
                }}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
              >
                {AGE_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Difficulty: {difficulty} / 5
              <input
                type="range"
                min={1}
                max={5}
                value={difficulty}
                onChange={(event) => {
                  clearWeakAreaLink();
                  setDifficulty(Number(event.target.value));
                }}
                className="mt-2 w-full accent-indigo-500"
              />
            </label>
          </div>

          <label className="block text-sm font-bold text-slate-300">
            Number of items
            <input
              type="number"
              min={1}
              max={30}
              value={items}
              onChange={(event) => {
                clearWeakAreaLink();
                setItems(Number(event.target.value));
              }}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
            />
          </label>

          <label className="block text-sm font-bold text-slate-300">
            Topic / theme
            <select
              value={effectiveTopicChoice}
              onChange={(event) => {
                clearWeakAreaLink();
                setTopicChoice(event.target.value);
                if (event.target.value !== CUSTOM_TOPIC_VALUE) {
                  setCustomTopic("");
                }
              }}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
            >
              {topicSuggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion}>{suggestion}</option>
              ))}
              <option value={CUSTOM_TOPIC_VALUE}>Custom topic</option>
            </select>
            {effectiveTopicChoice === CUSTOM_TOPIC_VALUE ? (
              <input
                value={customTopic}
                onChange={(event) => {
                  clearWeakAreaLink();
                  setCustomTopic(event.target.value);
                }}
                placeholder="Type a custom topic/theme"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white placeholder:text-slate-600"
              />
            ) : null}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <button onClick={() => void generatePreview()} disabled={loading || !canGenerate} className="rounded-xl bg-indigo-500 px-4 py-3 font-black text-white hover:bg-indigo-400 disabled:opacity-50">
              {loading ? "Generating with AI..." : "Generate Preview"}
            </button>
            <button onClick={saveGeneratedContent} disabled={saving || saveBlocked || !approvedCount} className="rounded-xl bg-emerald-500 px-4 py-3 font-black text-white hover:bg-emerald-400 disabled:opacity-50">
              {saving ? "Saving..." : saveBlocked ? "Fix required before save" : "Save to Content Library"}
            </button>
          </div>
          {error ? <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
          {loading ? (
            <p className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-sm text-indigo-100">
              {generationPhase === "retrying-parse" ? "Retrying parse..."
                : generationPhase === "repairing-response" ? "Repairing response..."
                  : generationPhase === "validating-content" ? "Validating content..."
                    : "Generating content..."}
            </p>
          ) : null}
          {(generatedItemsList.length > 0 || generationMeta || error) ? (
            <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-400">
              <p className="font-bold text-slate-300 mb-2">Diagnostic Info:</p>
              <ul className="space-y-1">
                <li><strong>Source:</strong> {effectiveGenerationContext.source === "weak-area" ? "AI Intervention Engine" : "Manual generator"}</li>
                <li><strong>Year Group:</strong> {effectiveGenerationContext.yearGroup}</li>
                <li><strong>Subject:</strong> {formatSubjectLabel(effectiveGenerationContext.subject)}</li>
                <li><strong>Skill Focus:</strong> {effectiveGenerationContext.skillFocus || "(none)"}</li>
                <li><strong>Topic/Theme:</strong> {effectiveGenerationContext.topic || "(none)"}</li>
                <li><strong>Generation Type:</strong> {selectedGenerationTypeForContext || "(unknown)"}</li>
                <li><strong>Difficulty:</strong> {effectiveGenerationContext.difficulty}/5</li>
                <li><strong>Items Requested:</strong> {items}</li>
                {generationMeta?.model ? <li><strong>Model:</strong> {generationMeta.model}</li> : null}
                {generationMeta?.validation ? (
                  <>
                    <li><strong>API Valid:</strong> {generationMeta.validation.valid ? "✓" : "✗"}</li>
                    <li><strong>Repaired:</strong> {generationMeta.validation.repaired ? "Yes" : "No"}</li>
                  </>
                ) : null}
              </ul>
            </div>
          ) : null}
          {showDeveloperDetails && generationDiagnostics ? (
            <details className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-xs text-slate-300">
              <summary className="cursor-pointer font-bold uppercase tracking-[0.16em] text-slate-200">Developer Diagnostics</summary>
              <ul className="mt-2 space-y-1">
                <li>Parse stage failed: {generationDiagnostics.parseStage}</li>
                <li>Backend status code: {generationDiagnostics.statusCode}</li>
                <li>Content-Type: {generationDiagnostics.contentType || "(none)"}</li>
                <li>Provider/model: {generationDiagnostics.provider || "openai"}/{generationDiagnostics.model || generationMeta?.model || "unknown"}</li>
              </ul>
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-900 p-2 text-xs">{generationDiagnostics.rawResponse}</pre>
            </details>
          ) : null}
          {message ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              <p>{message}</p>
              <Link href="/admin/content-library" className="mt-3 inline-flex rounded-lg bg-emerald-500 px-3 py-2 text-xs font-black text-white">
                View in Content Library
              </Link>
              {savedContentId && targetStudentId ? <p className="mt-2 text-xs text-emerald-100">Assigned content {savedContentId} to targeted learner.</p> : null}
            </div>
          ) : null}
        </div>
      </AdminSectionCard>
      </div>

      <div className="space-y-6 pb-24 xl:max-h-[calc(100vh-10rem)] xl:overflow-y-auto xl:pr-1">
      <AdminSectionCard title="AI Intervention Engine" eyebrow="Intervention analytics">
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <select
            value={weakAreaKeyStageFilter}
            onChange={(event) => {
              const nextStage = event.target.value;
              setWeakAreaKeyStageFilter(nextStage);
              if (!nextStage) {
                setWeakAreaYearGroupFilter("");
                return;
              }
              const options = yearGroupsForKeyStage(nextStage);
              setWeakAreaYearGroupFilter((current) => options.includes(current as (typeof YEAR_GROUPS)[number]) ? current : "");
            }}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"
          >
            <option value="">All key stages</option>
            {KEY_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
          </select>
          <select
            value={weakAreaYearGroupFilter}
            onChange={(event) => {
              const nextYear = event.target.value;
              setWeakAreaYearGroupFilter(nextYear);
              if (nextYear) {
                setWeakAreaKeyStageFilter(keyStageForYearGroup(nextYear));
              }
            }}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"
          >
            <option value="">All year groups</option>
            {(weakAreaKeyStageFilter ? yearGroupsForKeyStage(weakAreaKeyStageFilter) : [...YEAR_GROUPS]).map((group) => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>
          <select
            value={weakAreaSubjectFilter}
            onChange={(event) => setWeakAreaSubjectFilter(event.target.value as "manual" | "all")}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"
          >
            <option value="manual">Match manual form subject/year/key stage</option>
            <option value="all">All subjects</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => void runAutomation("autofill")}
            disabled={automationLoading !== null}
            className="rounded-xl bg-blue-500 px-4 py-3 font-black text-white disabled:opacity-60"
          >
            {automationLoading === "autofill" ? "Running..." : "Auto-fill Low Library"}
          </button>
          <button
            onClick={() => void runAutomation("weaknesses")}
            disabled={automationLoading !== null}
            className="rounded-xl border border-slate-700 px-4 py-3 font-black text-slate-200 disabled:opacity-60"
          >
            {automationLoading === "weaknesses" ? "Scanning..." : "Detect Weak Areas"}
          </button>
          <Link href="/admin/content-library" className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-black text-slate-200">View Content Library</Link>
          <button
            onClick={() => void runAutomation("autofill")}
            disabled={automationLoading !== null}
            className="rounded-xl border border-blue-500/60 px-4 py-3 text-sm font-black text-blue-200 disabled:opacity-60"
          >
            Generate Missing Content
          </button>
          <Link href="/admin/content-library" className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-black text-slate-200">View Updated Subjects</Link>
        </div>
        {automationLoading ? <p className="mt-3 text-xs text-slate-400">Processing automation request...</p> : null}
        {automationMessage ? <p className="mt-4 text-sm text-slate-400">{automationMessage}</p> : null}
        {automationStatus ? (
          <div className={`mt-4 rounded-2xl border p-4 ${automationStatus.ok ? "border-emerald-500/30 bg-emerald-500/10" : "border-rose-500/30 bg-rose-500/10"}`}>
            <p className={`text-sm font-black ${automationStatus.ok ? "text-emerald-100" : "text-rose-100"}`}>{automationStatus.title}</p>
            {automationDurationLabel ? <p className="mt-1 text-xs text-slate-300">Duration: {automationDurationLabel}</p> : null}
            <div className="mt-2 space-y-1 text-sm text-slate-200">
              {automationStatus.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            {!automationStatus.ok && automationRetryMode ? (
              <button
                type="button"
                onClick={() => void runAutomation(automationRetryMode)}
                className="mt-3 rounded-lg border border-slate-600 px-3 py-2 text-xs font-black text-slate-100"
              >
                Retry
              </button>
            ) : null}
            {showDeveloperDetails && automationDebugPayload ? (
              <details className="mt-3 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.16em] text-slate-300">Developer Details</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-900 p-2 text-xs text-slate-300">{automationDebugPayload}</pre>
              </details>
            ) : null}
          </div>
        ) : null}
        {visibleWeakAreas.length ? (
          <div className="mt-4 space-y-3">
            {visibleWeakAreas.slice(0, 8).map(({ area, contextMatches }, index) => (
              <div key={`${area.id}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-300">Detected Weak Area</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-white">Student: {area.student.name}</p>
                    <p className="text-xs text-slate-300">Subject: {formatSubjectLabel(area.subject)}</p>
                    <p className="text-xs text-slate-300">Weak topic: {formatFriendlyTopic(area.skillFocus)}</p>
                    <p className="text-xs text-slate-300">Accuracy: {area.accuracy}%</p>
                    <p className="mt-2 text-xs text-cyan-200">{toTitleCaseWords(formatSubjectLabel(area.subject))} · {toTitleCaseWords(formatFriendlyTopic(area.skillFocus))} Intervention</p>
                    <p className="text-xs text-cyan-200">{area.accuracy}% accuracy detected</p>
                    <p className="text-xs text-cyan-200">Targeted support recommended</p>
                    <p className="mt-2 text-xs text-amber-200">This intervention is based on detected weak-area data, not the manual form above.</p>
                    {!contextMatches ? (
                      <p className="mt-2 text-xs text-rose-300">Weak-area context does not match the current manual form. Interventions here will still use the weak-area subject.</p>
                    ) : null}
                    {loadedWeakAreaId === area.id ? (
                      <p className={`mt-2 text-xs ${weakAreaFormSynced ? "text-emerald-300" : "text-slate-400"}`}>
                        {weakAreaFormSynced
                          ? "Loaded into manual generator."
                          : "Previously loaded into manual generator. Manual form has changed since load."}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    onClick={() => applyWeakArea(area)}
                    className="rounded-xl border border-indigo-400/70 px-3 py-2 text-xs font-black text-indigo-100"
                  >
                    Load into generator
                  </button>
                  <button
                    onClick={() => void generateInterventionFromWeakArea(area)}
                    className="rounded-xl bg-indigo-500 px-3 py-2 text-xs font-black text-white"
                  >
                    Generate Weak-Area Support
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : weakAreas.length ? (
          <p className="mt-4 rounded-xl border border-slate-700 bg-slate-950/40 p-3 text-sm text-slate-300">
            No weak-area cards match the current manual form context. Switch intervention filter to &quot;All subjects&quot; to review every weak area.
          </p>
        ) : null}
      </AdminSectionCard>

      <AdminSectionCard title="Generated Preview" eyebrow="Review">
        {preview ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Title</p>
                <p className="mt-2 font-bold text-white">{preview.title}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Topic</p>
                <p className="mt-2 font-bold text-white">{previewTitle || "Mapped topic required"}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Quality</p>
                <p className="mt-2 text-2xl font-black text-emerald-300">{preview.qualityScore}%</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Safety</p>
                <p className="mt-2 font-bold text-emerald-300">{preview.safetyStatus}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Approved</p>
                <p className="mt-2 text-2xl font-black text-white">{approvedCount}/{preview.items.length}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-black ${previewBadge.className}`}>
                {previewBadge.label}
              </span>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-black text-slate-200">
                {effectiveGenerationContext.source === "weak-area" ? "Source: AI Intervention Engine" : "Source: Manual generator"}
              </span>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-black text-slate-200">
                Subject: {formatSubjectLabel(effectiveGenerationContext.subject)}
              </span>
              {generationMeta?.validation?.repaired ? (
                <span className="text-sm text-slate-400">
                  Auto-repaired before preview ({generationMeta.validation.fixesApplied.length || generationMeta.validation.errors.length} item fixes).
                </span>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Auto voice script</span>
                <textarea
                  value={preview.voiceScript}
                  onChange={(event) => setPreview((current) => current ? { ...current, voiceScript: event.target.value } : current)}
                  className="mt-2 min-h-24 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none"
                />
              </label>
              <label className="block rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Image prompt</span>
                <textarea
                  value={preview.imagePrompt}
                  onChange={(event) => setPreview((current) => current ? { ...current, imagePrompt: event.target.value } : current)}
                  className="mt-2 min-h-24 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none"
                />
              </label>
            </div>

            {phonicsMismatchDetected ? (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100">
                <p className="font-bold">Phonics-stage mismatch detected.</p>
                <p className="mt-1 text-xs text-rose-100/90">Some generated words exceeded the selected phonics stage and were automatically rejected/regenerated.</p>
              </div>
            ) : null}

            <div className={`rounded-2xl border p-3 text-sm ${generationMeta?.validation?.repaired ? "border-amber-500/30 bg-amber-500/10 text-amber-100" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"}`}>
              {generationMeta?.validation?.repaired ? (
                <>
                  <p className="font-bold">Auto-repair applied before preview.</p>
                  <div className="mt-2 space-y-1 text-xs sm:text-sm">
                    {(generationMeta.validation.fixesApplied.length ? generationMeta.validation.fixesApplied : generationMeta.validation.errors.map(formatRepairMessage)).map((item, index) => (
                      <p key={`${item}-${index}`}>- {item}</p>
                    ))}
                    {generationMeta.validation.cached ? <p>- Loaded from cache</p> : null}
                    <p className="pt-1 font-semibold">Final set: {generationMeta.validation.finalCount} valid {effectiveGenerationContext.skillFocus} items</p>
                  </div>
                </>
              ) : (
                <p className="font-bold">{formatValidationSuccessMessage(subject)}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {preview.items.map((item, index) => (
                <article key={`${String(item.id ?? "item")}-${index}`} className={`relative z-10 flex min-h-0 flex-col rounded-2xl border p-3 ${item.status === "rejected" ? "border-rose-500/40 bg-rose-950/30 opacity-70" : item.status === "approved" ? "border-emerald-500/35 bg-emerald-950/20" : "border-amber-500/30 bg-amber-950/20"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-white">
                      {subject === "spelling" ? `${String((item as SpellingPreviewItem).emoji ?? "🔤")} ${String((item as SpellingPreviewItem).word ?? item.prompt ?? "")}` : String(item.prompt ?? item.question ?? item.title ?? `Item ${index + 1}`)}
                    </h3>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-bold text-blue-200">Item {index + 1}</span>
                  </div>
                  <p className={`mt-1 inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${item.status === "approved" ? "bg-emerald-500/20 text-emerald-200" : item.status === "rejected" ? "bg-rose-500/20 text-rose-200" : "bg-amber-500/20 text-amber-200"}`}>
                    {item.status === "approved" ? "Approved" : item.status === "rejected" ? "Rejected" : "Pending"}
                  </p>
                  {typeof item.phonicsStage === "string" ? (
                    <p className="mt-1 inline-flex w-fit rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-100">
                      {String(item.phonicsStage)}
                    </p>
                  ) : null}
                  <p className="mt-1 line-clamp-3 text-xs text-slate-300">{String(item.hint ?? item.explanation ?? "Review this item before saving.")}</p>
                  <p className="mt-1 line-clamp-3 text-xs text-slate-400">{String(item.sentence ?? item.sentenceContext ?? item.passage ?? "")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => markPreviewItem(index, "approved")} className={`min-w-24 flex-1 rounded-lg px-2 py-1.5 text-[11px] font-black text-white ${item.status === "approved" ? "bg-emerald-400 ring-2 ring-emerald-200" : "bg-emerald-500 hover:bg-emerald-400"}`}>Approve</button>
                    <button type="button" onClick={() => markPreviewItem(index, "rejected")} className={`min-w-24 flex-1 rounded-lg px-2 py-1.5 text-[11px] font-black text-white ${item.status === "rejected" ? "bg-rose-400 ring-2 ring-rose-200" : "bg-rose-500 hover:bg-rose-400"}`}>Reject</button>
                    <button type="button" onClick={() => void regenerateItem(index)} className="min-w-24 flex-1 rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] font-black text-slate-200">Regenerate</button>
                  </div>
                  <details className="mt-2 rounded-xl border border-slate-800 bg-slate-900/70 p-2">
                    <summary className="cursor-pointer text-xs font-bold text-slate-300">Preview details</summary>
                    <div className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-slate-300">
                      {typeof item.answer !== "undefined" ? <p><span className="font-semibold text-slate-200">Answer:</span> {String(item.answer)}</p> : null}
                      {Array.isArray(item.options) && item.options.length ? <p><span className="font-semibold text-slate-200">Options:</span> {item.options.map((option) => String(option)).join(", ")}</p> : null}
                      {typeof item.explanation === "string" && item.explanation ? <p><span className="font-semibold text-slate-200">Explanation:</span> {item.explanation}</p> : null}
                      {typeof item.hint === "string" && item.hint ? <p><span className="font-semibold text-slate-200">Hint:</span> {item.hint}</p> : null}
                    </div>
                  </details>
                  {showDeveloperDetails ? (
                    <details className="mt-2 rounded-xl border border-slate-800 bg-slate-900/70 p-2">
                      <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.14em] text-slate-300">Developer Details</summary>
                      <textarea
                        value={JSON.stringify(item, null, 2)}
                        onChange={(event) => updatePreviewItemJson(index, event.target.value)}
                        className="mt-2 min-h-28 w-full rounded-xl border border-slate-800 bg-slate-900 px-2 py-2 font-mono text-[11px] leading-relaxed text-slate-300 outline-none"
                      />
                    </details>
                  ) : null}
                </article>
              ))}
            </div>

            {showDeveloperDetails && generationMeta ? (
              <details className="rounded-2xl border border-slate-700 bg-slate-950/70 p-3">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.16em] text-slate-300">Developer Details</summary>
                <pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-300">
                  {JSON.stringify(generationMeta, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/35 p-8 text-center text-sm text-slate-400">
            Spelling words, maths questions, reading passages, comprehension questions and prompts will appear here.
          </div>
        )}
      </AdminSectionCard>
      </div>
    </div>
  );
}
