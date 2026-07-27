"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  YEAR_GROUPS,
  aiGeneratorSubjectsForYearGroup,
} from "@/lib/curriculum";
import { LESSON_PACK_COMPONENT_TYPES, type LessonPackComponentType } from "@/lib/lesson-pack-import/types";
import {
  LESSON_PACK_UPLOAD_LIMITS,
  formatLessonPackFileLimitError,
  formatLessonPackTotalLimitError,
  formatLessonPackFileCountError,
  lessonPackMaxFileMb,
  lessonPackMaxTotalMb,
} from "@/lib/lesson-pack-import/upload-limits";
import {
  mapUploadFailure,
  normalizeLessonPackMimeType,
  UPLOAD_PUT_CONCURRENCY,
} from "@/lib/lesson-pack-import/upload-errors";

type ProgressPhase =
  | "idle"
  | "creating_upload_session"
  | "uploading"
  | "upload_complete"
  | "verifying_upload"
  | "extracting"
  | "classifying"
  | "analysing"
  | "preparing_preview";

const PROGRESS_LABELS: Record<Exclude<ProgressPhase, "idle">, string> = {
  creating_upload_session: "Creating upload session",
  uploading: "Uploading",
  upload_complete: "Upload complete",
  verifying_upload: "Verifying upload",
  extracting: "Extracting files",
  classifying: "Classifying lesson materials",
  analysing: "Analysing lesson content",
  preparing_preview: "Preparing import preview",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

async function putFileWithProgress(
  uploadUrl: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (sent: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    // Only send headers that were included in the signed target (typically Content-Type).
    for (const [key, value] of Object.entries(headers)) {
      if (!key || value == null) continue;
      xhr.setRequestHeader(key, value);
    }
    const onAbort = () => {
      xhr.abort();
    };
    if (signal) {
      if (signal.aborted) {
        reject(new Error("Upload cancelled"));
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    };
    xhr.onload = () => {
      signal?.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        const mapped = mapUploadFailure({
          stage: "r2_put",
          error: new Error(`Upload failed (${xhr.status})`),
          fileName: file.name,
          httpStatus: xhr.status,
        });
        reject(Object.assign(new Error(mapped.message), { stage: mapped.stage, code: mapped.code, httpStatus: xhr.status }));
      }
    };
    xhr.onerror = () => {
      signal?.removeEventListener("abort", onAbort);
      // status 0 + onerror is the browser CORS/preflight/network failure signature
      const mapped = mapUploadFailure({
        stage: "r2_preflight",
        error: new Error("Network error during upload"),
        fileName: file.name,
        httpStatus: 0,
      });
      reject(Object.assign(new Error(mapped.message), { stage: mapped.stage, code: mapped.code, httpStatus: 0 }));
    };
    xhr.onabort = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("Upload cancelled"));
    };
    xhr.send(file);
  });
}

async function runBoundedUploads<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

type LessonPreviewSummary = {
  lessonGroupId: string;
  title: string;
  subject: string | null;
  curriculumArea?: string | null;
  yearGroup: string | null;
  keyStage: string | null;
  difficulty: number;
  subjectConfidence: number;
  yearConfidence: number;
  difficultyConfidence: number;
  yearEvidence: string[];
  difficultyReasons: string[];
  subjectEvidence: string[];
  yearWarning?: string | null;
  subjectWarning?: string | null;
  learningObjective: string | null;
  estimatedDurationMinutes: number;
  sessionType: string;
  fileClassifications: Array<{
    fileId: string;
    originalName: string;
    classification: string;
    confidence: number;
    extractionStatus: string;
    extractionError?: string;
    equivalentGroupId?: string;
    isPrimaryExtractionSource?: boolean;
  }>;
  componentCounts: Record<string, number>;
  questionCount: number;
  answerKeyCount: number;
  qaPairingReport?: {
    questionsFound: number;
    answersPaired: number;
    questionsWithoutAnswers: number;
    answersWithoutQuestions: number;
    teacherGuidanceOnly: number;
    autoMarkedQuestions?: number;
    guidedReviewActivities?: number;
    guidanceGroups?: number;
    lowConfidencePairings?: number;
    excludedFragments?: number;
    orphanCorrectAnswers?: number;
  };
  preDraftValidation?: {
    titleQuality: string;
    objectiveQuality: string;
    encodingQuality: string;
    questionAnswerPairing: string;
    playableFirstActivity: string;
    playableAllActivities?: string;
    visualDependency?: string;
    durationQuality: string;
    licenceResult: string;
    thirdPartyResult: string;
    overallReady: boolean;
    issues: string[];
  };
  academicValidation?: {
    version: string;
    validatedAt: string;
    validator: string;
    readiness: "ready" | "warning" | "needs_input" | "blocked";
    globalPassed: boolean;
    subjectPassed: boolean;
    dependencies: Array<{ type: string; required: boolean; present: boolean; reconstructionStatus: string }>;
    issues: Array<{ code: string; message: string; scope: string; severity: string; activityId?: string }>;
  };
  duplicateReport: {
    level: string;
    label: string;
    blocked: boolean;
    overrideAllowed: boolean;
    sourceFingerprint: string;
    matches: Array<{
      level: string;
      reason: string;
      matchedContentId?: string | null;
      matchedTopic?: string | null;
    }>;
  };
  thirdPartyFindings: Array<{
    id: string;
    fileName: string;
    pageOrSlide: number | null;
    detectedItem: string;
    riskReason: string;
    recommendedAction: string;
    action: string;
  }>;
  licenceType?: string | null;
  attribution?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  starlizMetadata?: Record<string, unknown>;
};

type AnalyzeResponse = {
  ok?: boolean;
  importId?: string;
  status?: string;
  error?: string;
  analysis?: {
    lessonCount: number;
    lessons: LessonPreviewSummary[];
    files: Array<{
      id: string;
      originalName: string;
      classification: string;
      classificationConfidence: number;
      classificationEvidence: string[];
      extractionStatus: string;
      extractionError?: string;
      kind: string;
      sizeBytes: number;
    }>;
    errors: string[];
    partialFailures: Array<{ fileId: string; fileName: string; error: string }>;
  };
};

const SESSION_TYPES = [
  { value: "school_day", label: "School Day lesson" },
  { value: "short_learning_90", label: "Short Learning 90 minutes" },
  { value: "short_learning_120", label: "Short Learning 120 minutes" },
  { value: "general_library", label: "General Content Library" },
] as const;

const fieldClassName =
  "w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400 [color-scheme:dark]";
const optionClassName = "bg-white text-slate-900";
const labelClassName = "mb-1 block text-xs font-black uppercase tracking-[0.14em] text-slate-300";

function formatSubjectLabel(subject: string): string {
  return subject.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function LessonPackBulkImporter() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [yearGroup, setYearGroup] = useState("auto");
  const [subject, setSubject] = useState("auto");
  const [sessionType, setSessionType] = useState<(typeof SESSION_TYPES)[number]["value"]>("school_day");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [licenceType, setLicenceType] = useState("");
  const [attribution, setAttribution] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse["analysis"] | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [classificationOverrides, setClassificationOverrides] = useState<Record<string, LessonPackComponentType>>({});
  const [draftYearGroup, setDraftYearGroup] = useState("auto");
  const [draftSubject, setDraftSubject] = useState("auto");
  const [draftDifficulty, setDraftDifficulty] = useState<number | null>(null);
  const [duplicateOverrideReason, setDuplicateOverrideReason] = useState("");
  const [draftResult, setDraftResult] = useState<{ contentId: string; reviewPath: string; message: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progressPhase, setProgressPhase] = useState<ProgressPhase>("idle");
  const [uploadProgressLabel, setUploadProgressLabel] = useState<string | null>(null);
  const [licenceConfirmed, setLicenceConfirmed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const subjects = useMemo(() => {
    const yg = draftYearGroup !== "auto" ? draftYearGroup : yearGroup !== "auto" ? yearGroup : "Year 5";
    return aiGeneratorSubjectsForYearGroup(yg);
  }, [draftYearGroup, yearGroup]);

  const selectedLesson = useMemo(() => {
    if (!analysis?.lessons?.length) return null;
    return analysis.lessons.find((l) => l.lessonGroupId === selectedLessonId) ?? analysis.lessons[0];
  }, [analysis, selectedLessonId]);

  function addFiles(list: FileList | File[]) {
    const next = Array.from(list);
    const combinedExisting = files.reduce((sum, f) => sum + f.size, 0);
    let running = combinedExisting;
    const accepted: File[] = [];
    for (const file of next) {
      if (files.length + accepted.length >= LESSON_PACK_UPLOAD_LIMITS.maxFiles) {
        setError(formatLessonPackFileCountError());
        break;
      }
      if (file.size > LESSON_PACK_UPLOAD_LIMITS.maxFileBytes) {
        setError(formatLessonPackFileLimitError());
        continue;
      }
      if (running + file.size > LESSON_PACK_UPLOAD_LIMITS.maxTotalBytes) {
        setError(formatLessonPackTotalLimitError());
        break;
      }
      running += file.size;
      accepted.push(file);
    }
    if (!accepted.length) return;
    setFiles((current) => {
      const map = new Map<string, File>();
      for (const file of [...current, ...accepted]) {
        map.set(`${file.name}:${file.size}:${file.lastModified}`, file);
      }
      return Array.from(map.values());
    });
    setError(null);
    setDraftResult(null);
  }

  async function runAnalyse() {
    if (!files.length) {
      setError("Upload at least one lesson-pack file.");
      return;
    }
    const total = files.reduce((sum, f) => sum + f.size, 0);
    if (files.length > LESSON_PACK_UPLOAD_LIMITS.maxFiles) {
      setError(formatLessonPackFileCountError());
      return;
    }
    if (files.some((f) => f.size > LESSON_PACK_UPLOAD_LIMITS.maxFileBytes)) {
      setError(formatLessonPackFileLimitError());
      return;
    }
    if (total > LESSON_PACK_UPLOAD_LIMITS.maxTotalBytes) {
      setError(formatLessonPackTotalLimitError());
      return;
    }

    setBusy(true);
    setError(null);
    setDraftResult(null);
    setUploadProgressLabel(null);
    setProgressPhase("creating_upload_session");
    const controller = new AbortController();
    abortRef.current = controller;
    let sessionId: string | null = null;

    try {
      const sessionRes = await fetch("/api/admin/lesson-pack-import/upload-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          files: files.map((f) => ({
            fileName: f.name,
            mimeType: normalizeLessonPackMimeType(f.name, f.type),
            sizeBytes: f.size,
          })),
          yearGroup,
          subject,
          sessionType,
          sourceName,
          sourceUrl,
          licenceType,
          attribution,
          notes,
          licenceConfirmed,
        }),
      });
      const sessionData = await sessionRes.json() as {
        ok?: boolean;
        sessionId?: string;
        importId?: string;
        error?: string;
        provider?: "r2" | "local";
        uploads?: Array<{
          fileId: string;
          fileName: string;
          expectedSizeBytes: number;
          uploadUrl: string;
          method: "PUT";
          headers: Record<string, string>;
        }>;
      };
      if (!sessionRes.ok) {
        const mapped = mapUploadFailure({
          stage: /R2 is not configured/i.test(sessionData.error ?? "") ? "provider" : "create_session",
          error: new Error(sessionData.error || "Failed to create upload session"),
        });
        throw Object.assign(new Error(mapped.message), { stage: mapped.stage, code: mapped.code });
      }
      sessionId = sessionData.sessionId ?? sessionData.importId ?? null;
      if (!sessionId || !sessionData.uploads?.length) {
        throw Object.assign(new Error("Could not create the private upload session."), { stage: "create_session", code: "session_empty" });
      }

      // Deployed Admin must never receive local/direct-put targets.
      const isLocalHost = typeof window !== "undefined"
        && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
      if (sessionData.provider === "local" && !isLocalHost) {
        throw Object.assign(
          new Error("Cloudflare R2 is not configured for deployed lesson-pack uploads."),
          { stage: "provider", code: "r2_not_configured" },
        );
      }
      if (sessionData.uploads.some((u) => /\/direct-put(\?|$)/i.test(u.uploadUrl)) && !isLocalHost) {
        throw Object.assign(
          new Error("Cloudflare R2 is not configured for deployed lesson-pack uploads."),
          { stage: "provider", code: "r2_not_configured" },
        );
      }

      setImportId(sessionId);
      setProgressPhase("uploading");

      const transferredByFile = new Array(sessionData.uploads.length).fill(0);
      const reportProgress = () => {
        const overall = transferredByFile.reduce((sum, n) => sum + n, 0);
        setUploadProgressLabel(`Uploading ${formatBytes(overall)} of ${formatBytes(total)}`);
      };

      try {
        await runBoundedUploads(sessionData.uploads, UPLOAD_PUT_CONCURRENCY, async (target, index) => {
          if (controller.signal.aborted) throw new Error("Upload cancelled");
          const file = files.find((f) => f.name === target.fileName && f.size === target.expectedSizeBytes)
            ?? files.find((f) => f.name === target.fileName);
          if (!file) throw new Error(`Missing local file for ${target.fileName}`);
          await putFileWithProgress(
            target.uploadUrl,
            file,
            target.headers,
            (sent) => {
              transferredByFile[index] = sent;
              reportProgress();
            },
            controller.signal,
          );
          transferredByFile[index] = file.size;
          reportProgress();
        });
      } catch (uploadErr) {
        controller.abort();
        await fetch(`/api/admin/lesson-pack-import/upload-session/${sessionId}`, { method: "DELETE" }).catch(() => {});
        throw uploadErr;
      }

      setProgressPhase("upload_complete");
      setUploadProgressLabel(`Upload complete — ${formatBytes(total)}`);
      setProgressPhase("verifying_upload");
      setUploadProgressLabel(`Verifying ${sessionData.uploads.length} file${sessionData.uploads.length === 1 ? "" : "s"}`);

      const completeRes = await fetch(`/api/admin/lesson-pack-import/upload-session/${sessionId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          reportedFiles: sessionData.uploads.map((u) => ({ fileId: u.fileId })),
        }),
      });
      const completeData = await completeRes.json() as { error?: string; verifiedCount?: number };
      if (!completeRes.ok) {
        const mapped = mapUploadFailure({
          stage: "verify",
          error: new Error(completeData.error || "Upload verification failed"),
        });
        throw Object.assign(new Error(mapped.message), { stage: mapped.stage, code: mapped.code });
      }

      setProgressPhase("extracting");
      setUploadProgressLabel(null);
      setProgressPhase("analysing");

      const analyseRes = await fetch(`/api/admin/lesson-pack-import/${sessionId}/analyse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          yearGroup,
          subject,
          sessionType,
          sourceName,
          sourceUrl,
          licenceType,
          attribution,
          notes,
          licenceConfirmed,
          classificationOverrides: Object.keys(classificationOverrides).length ? classificationOverrides : undefined,
        }),
      });
      setProgressPhase("preparing_preview");
      const data = (await analyseRes.json()) as AnalyzeResponse;
      if (!analyseRes.ok) {
        const mapped = mapUploadFailure({
          stage: "analyse",
          error: new Error(data.error || "Analysis failed"),
        });
        throw Object.assign(new Error(mapped.message), { stage: mapped.stage, code: mapped.code });
      }

      setImportId(data.importId ?? sessionId);
      setAnalysis(data.analysis ?? null);
      const first = data.analysis?.lessons?.[0];
      setSelectedLessonId(first?.lessonGroupId ?? null);
      setDraftYearGroup(first?.yearGroup ?? yearGroup);
      setDraftSubject(first?.subject ?? subject);
      setDraftDifficulty(first?.difficulty ?? 3);

      const overrides: Record<string, LessonPackComponentType> = {};
      for (const file of data.analysis?.files ?? []) {
        overrides[file.id] = file.classification as LessonPackComponentType;
      }
      setClassificationOverrides(overrides);
      if (data.analysis?.lessonCount) {
        setUploadProgressLabel(`${data.analysis.lessonCount} lesson pack${data.analysis.lessonCount === 1 ? "" : "s"} detected`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Analysis failed";
      if (sessionId && /cancel/i.test(message)) {
        await fetch(`/api/admin/lesson-pack-import/upload-session/${sessionId}`, { method: "DELETE" }).catch(() => {});
      } else if (sessionId && /preflight|cors|R2|upload failed|signed upload|verification failed/i.test(message)) {
        // Partial/failed PUT sessions should not linger; cleanup is idempotent.
        await fetch(`/api/admin/lesson-pack-import/upload-session/${sessionId}`, { method: "DELETE" }).catch(() => {});
      }
      const mapped = mapUploadFailure({
        stage: (err as { stage?: "create_session" | "r2_put" | "r2_preflight" | "verify" | "analyse" | "cancelled" | "provider" })?.stage
          ?? (/cancel/i.test(message) ? "cancelled" : "r2_put"),
        error: err,
        fileName: (err as { fileName?: string })?.fileName,
        httpStatus: (err as { httpStatus?: number })?.httpStatus,
      });
      setError(mapped.message);
    } finally {
      setBusy(false);
      setProgressPhase("idle");
      abortRef.current = null;
    }
  }

  async function cancelUpload() {
    abortRef.current?.abort();
    if (importId) {
      await fetch(`/api/admin/lesson-pack-import/upload-session/${importId}`, { method: "DELETE" }).catch(() => {});
    }
    setBusy(false);
    setProgressPhase("idle");
    setUploadProgressLabel(null);
    setError("Upload cancelled.");
  }

  async function createDraft() {
    if (!importId || !selectedLesson) {
      setError("Analyse a lesson pack before creating a draft.");
      return;
    }
    if (selectedLesson.duplicateReport.blocked && duplicateOverrideReason.trim().length < 8) {
      setError("This pack looks like a duplicate. Enter an override reason (min 8 characters) or cancel.");
      return;
    }
    const looksThirdParty = Boolean(
      sourceName.trim()
      || selectedLesson.sourceName
      || selectedLesson.thirdPartyFindings.length
      || /oak|twinkl|white rose|bbc/i.test(`${sourceName} ${selectedLesson.sourceName ?? ""}`),
    );
    if (looksThirdParty && (!licenceConfirmed || !sourceName.trim() || !licenceType.trim() || !attribution.trim())) {
      setError("Source name, licence type, attribution, and licence confirmation are required for third-party imports.");
      return;
    }

    setCreatingDraft(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lesson-pack-import/create-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importId,
          lessonGroupId: selectedLesson.lessonGroupId,
          yearGroup: draftYearGroup === "auto" ? selectedLesson.yearGroup : draftYearGroup,
          subject: draftSubject === "auto" ? selectedLesson.subject : draftSubject,
          difficulty: draftDifficulty ?? selectedLesson.difficulty,
          duplicateOverrideReason: selectedLesson.duplicateReport.blocked ? duplicateOverrideReason : null,
          classificationOverrides,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draft creation failed");
      setDraftResult({
        contentId: data.contentId,
        reviewPath: data.reviewPath,
        message: data.message,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draft creation failed");
    } finally {
      setCreatingDraft(false);
    }
  }

  return (
    <div className="space-y-5 rounded-2xl border border-slate-700 bg-slate-950/70 p-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Import Complete Lesson Pack</h2>
        <p className="mt-1 text-sm text-slate-300">
          Upload PDFs, PowerPoint, Word, or a ZIP lesson pack. StarLiz classifies files, detects year group and difficulty,
          converts to StarLiz lesson structure, and creates an editable draft for Admin review — never auto-published.
        </p>
      </div>

      <div
        className={`rounded-2xl border border-dashed px-4 py-8 text-center transition ${
          dragOver ? "border-cyan-400 bg-cyan-500/10" : "border-slate-600 bg-slate-900/50"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
        }}
      >
        <p className="text-sm font-semibold text-slate-100">Drag and drop lesson-pack files here</p>
        <p className="mt-1 text-xs text-slate-400">PDF, PPTX, DOCX, TXT or ZIP</p>
        <p className="mt-1 text-xs text-slate-500">
          Up to {lessonPackMaxFileMb()}MB per file · Up to {lessonPackMaxTotalMb()}MB per lesson-pack upload · Maximum {LESSON_PACK_UPLOAD_LIMITS.maxFiles} files
        </p>
        <button
          type="button"
          className="mt-4 rounded-xl border border-slate-500 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:border-cyan-400"
          onClick={() => inputRef.current?.click()}
        >
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.pptx,.docx,.doc,.zip,.txt,.md,application/pdf,application/zip"
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {files.length ? (
        <ul className="space-y-2 text-sm text-slate-200">
          {files.map((file) => (
            <li key={`${file.name}-${file.size}`} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
              <span>{file.name} <span className="text-xs text-slate-500">({Math.round(file.size / 1024)} KB)</span></span>
              <button
                type="button"
                className="text-xs text-rose-300 hover:text-rose-200"
                onClick={() => setFiles((current) => current.filter((f) => f !== file))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className={labelClassName}>Year group</span>
          <select className={fieldClassName} value={yearGroup} onChange={(e) => setYearGroup(e.target.value)}>
            <option value="auto" className={optionClassName}>Auto-detect</option>
            {YEAR_GROUPS.map((yg) => (
              <option key={yg} value={yg} className={optionClassName}>{yg}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className={labelClassName}>Subject</span>
          <select className={fieldClassName} value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="auto" className={optionClassName}>Auto-detect</option>
            {subjects.map((item) => (
              <option key={item} value={item} className={optionClassName}>{formatSubjectLabel(item)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          <span className={labelClassName}>Session type</span>
          <select className={fieldClassName} value={sessionType} onChange={(e) => setSessionType(e.target.value as typeof sessionType)}>
            {SESSION_TYPES.map((item) => (
              <option key={item.value} value={item.value} className={optionClassName}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className={labelClassName}>Source name</span>
          <input className={fieldClassName} value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="e.g. Oak National Academy" />
        </label>
        <label className="text-sm">
          <span className={labelClassName}>Source URL</span>
          <input className={fieldClassName} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://" />
        </label>
        <label className="text-sm">
          <span className={labelClassName}>Licence type</span>
          <input className={fieldClassName} value={licenceType} onChange={(e) => setLicenceType(e.target.value)} placeholder="e.g. OGL / CC BY" />
        </label>
        <label className="text-sm">
          <span className={labelClassName}>Attribution wording</span>
          <input className={fieldClassName} value={attribution} onChange={(e) => setAttribution(e.target.value)} />
        </label>
        <div className="sm:col-span-2">
          <button
            type="button"
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-cyan-400 hover:text-white"
            onClick={() => {
              setSourceName("Oak National Academy");
              setLicenceType("Open Government Licence v3.0");
              setAttribution("Adapted from Oak National Academy content licensed under the Open Government Licence v3.0.");
            }}
          >
            Apply Oak National Academy preset
          </button>
          <label className="mt-3 flex items-start gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              className="mt-1"
              checked={licenceConfirmed}
              onChange={(e) => setLicenceConfirmed(e.target.checked)}
            />
            <span>I have reviewed the source licence and third-party exclusions.</span>
          </label>
        </div>
        <label className="text-sm sm:col-span-2">
          <span className={labelClassName}>Additional notes</span>
          <textarea className={fieldClassName} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !files.length}
          onClick={() => void runAnalyse()}
          className="rounded-xl border border-cyan-400 bg-cyan-500/20 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? (progressPhase !== "idle" ? PROGRESS_LABELS[progressPhase] : "Working…")
            : "Analyse lesson pack"}
        </button>
        {busy ? (
          <button
            type="button"
            onClick={() => void cancelUpload()}
            className="rounded-xl border border-rose-400/60 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-100"
          >
            Cancel upload
          </button>
        ) : null}
      </div>

      {busy && progressPhase !== "idle" ? (
        <p className="text-xs text-cyan-200/90" aria-live="polite">
          {uploadProgressLabel ?? `${PROGRESS_LABELS[progressPhase]}…`}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</p>
      ) : null}

      {analysis ? (
        <div className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-white">Import preview</h3>
            <p className="text-xs text-slate-400">
              {analysis.lessonCount} lesson pack{analysis.lessonCount === 1 ? "" : "s"} detected
              {importId ? ` · Import ${importId.slice(0, 8)}` : ""}
            </p>
          </div>

          {analysis.lessonCount > 1 ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-white">{analysis.lessonCount} lessons detected</p>
              <div className="grid gap-2">
                {analysis.lessons.map((lesson) => {
                  const ready = lesson.preDraftValidation?.overallReady;
                  return (
                    <button
                      key={lesson.lessonGroupId}
                      type="button"
                      onClick={() => {
                        setSelectedLessonId(lesson.lessonGroupId);
                        setDraftYearGroup(lesson.yearGroup ?? "auto");
                        setDraftSubject(lesson.subject ?? "auto");
                        setDraftDifficulty(lesson.difficulty);
                      }}
                      className={`rounded-xl border px-3 py-2 text-left text-xs ${
                        selectedLesson?.lessonGroupId === lesson.lessonGroupId
                          ? "border-cyan-400 bg-cyan-500/15 text-white"
                          : "border-slate-600 text-slate-300"
                      }`}
                    >
                      <p className="font-semibold text-sm">{lesson.title}</p>
                      <p className="mt-1 text-slate-400">
                        {lesson.yearGroup ?? "—"} · {lesson.subject ?? "—"} · difficulty {lesson.difficulty}/5
                        {" · "}Q/A {lesson.questionCount}/{lesson.answerKeyCount}
                        {" · "}licence {lesson.preDraftValidation?.licenceResult ?? (lesson.licenceType ? "pass" : "needs input")}
                        {" · "}{ready ? "draft ready" : "needs input"}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {analysis.partialFailures?.length ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              <p className="font-bold">Some files need attention</p>
              <ul className="mt-1 list-disc pl-4">
                {analysis.partialFailures.map((fail) => (
                  <li key={`${fail.fileId}-${fail.error}`}>{fail.fileName}: {fail.error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {selectedLesson ? (
            <>
              <div className="grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
                <p><span className="text-slate-400">Title:</span> {selectedLesson.title}</p>
                <p><span className="text-slate-400">Objective:</span> {selectedLesson.learningObjective ?? "—"}</p>
                <p><span className="text-slate-400">Subject:</span> {selectedLesson.subject ?? "—"} ({Math.round(selectedLesson.subjectConfidence * 100)}%)</p>
                <p><span className="text-slate-400">Curriculum area:</span> {selectedLesson.curriculumArea ?? "—"}</p>
                <p><span className="text-slate-400">Year group:</span> {selectedLesson.yearGroup ?? "—"} ({Math.round(selectedLesson.yearConfidence * 100)}%)</p>
                <p><span className="text-slate-400">Key stage:</span> {selectedLesson.keyStage ?? "—"}</p>
                <p><span className="text-slate-400">Difficulty:</span> {selectedLesson.difficulty}/5 ({Math.round(selectedLesson.difficultyConfidence * 100)}%)</p>
                <p><span className="text-slate-400">Duration:</span> ~{selectedLesson.estimatedDurationMinutes} minutes</p>
                <p><span className="text-slate-400">Questions / answers:</span> {selectedLesson.questionCount} / {selectedLesson.answerKeyCount}</p>
                <p className="sm:col-span-2"><span className="text-slate-400">Duplicates:</span> {selectedLesson.duplicateReport.label}</p>
                <p className="sm:col-span-2"><span className="text-slate-400">Licence:</span> {selectedLesson.licenceType || "—"} · {selectedLesson.attribution || "no attribution text"}</p>
              </div>

              {selectedLesson.yearWarning ? (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{selectedLesson.yearWarning}</p>
              ) : null}
              {selectedLesson.subjectWarning ? (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{selectedLesson.subjectWarning}</p>
              ) : null}

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Year-group evidence</p>
                <ul className="mt-1 list-disc pl-4 text-xs text-slate-300">
                  {selectedLesson.yearEvidence.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">File classification</p>
                <div className="mt-2 space-y-2">
                  {selectedLesson.fileClassifications.map((file) => (
                    <div key={file.fileId} className="grid gap-2 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 sm:grid-cols-[1fr_14rem]">
                      <div>
                        <p className="text-sm text-slate-100">{file.originalName}</p>
                        <p className="text-xs text-slate-400">
                          {file.extractionStatus}
                          {file.extractionError ? ` · ${file.extractionError}` : ""}
                          {" · "}{Math.round(file.confidence * 100)}% confidence
                        </p>
                      </div>
                      <select
                        className={fieldClassName}
                        value={classificationOverrides[file.fileId] ?? file.classification}
                        onChange={(e) => setClassificationOverrides((current) => ({
                          ...current,
                          [file.fileId]: e.target.value as LessonPackComponentType,
                        }))}
                      >
                        {LESSON_PACK_COMPONENT_TYPES.map((type) => (
                          <option key={type} value={type} className={optionClassName}>{type}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {selectedLesson.thirdPartyFindings.length ? (
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-200">Third-party material detected</p>
                  <ul className="mt-2 space-y-2 text-xs text-slate-300">
                    {selectedLesson.thirdPartyFindings.map((finding) => (
                      <li key={finding.id} className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                        <p className="font-semibold text-amber-100">{finding.detectedItem} · {finding.fileName}{finding.pageOrSlide ? ` · p/slide ${finding.pageOrSlide}` : ""}</p>
                        <p>{finding.riskReason}</p>
                        <p className="text-amber-200/80">Recommended: {finding.recommendedAction} (default: exclude)</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {selectedLesson.duplicateReport.matches.length ? (
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-200">Duplicate matches</p>
                  <ul className="mt-2 space-y-2 text-xs text-slate-300">
                    {selectedLesson.duplicateReport.matches.map((match, index) => (
                      <li key={`${match.reason}-${index}`} className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
                        <p className="font-semibold text-rose-100">{match.level}: {match.reason}</p>
                        {match.matchedContentId ? (
                          <Link className="text-cyan-300 underline" href={`/admin/content-library?highlight=${match.matchedContentId}`}>
                            Open existing lesson {match.matchedTopic ? `(${match.matchedTopic})` : match.matchedContentId.slice(0, 8)}
                          </Link>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {selectedLesson.duplicateReport.blocked ? (
                    <label className="mt-3 block text-sm">
                      <span className={labelClassName}>Duplicate override reason (required)</span>
                      <textarea
                        className={fieldClassName}
                        rows={2}
                        value={duplicateOverrideReason}
                        onChange={(e) => setDuplicateOverrideReason(e.target.value)}
                        placeholder="Authorised reason for importing despite duplicate detection…"
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm">
                  <span className={labelClassName}>Override year group</span>
                  <select className={fieldClassName} value={draftYearGroup} onChange={(e) => setDraftYearGroup(e.target.value)}>
                    <option value="auto" className={optionClassName}>Keep detected</option>
                    {YEAR_GROUPS.map((yg) => (
                      <option key={yg} value={yg} className={optionClassName}>{yg}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className={labelClassName}>Override subject</span>
                  <select className={fieldClassName} value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)}>
                    <option value="auto" className={optionClassName}>Keep detected</option>
                    {subjects.map((item) => (
                      <option key={item} value={item} className={optionClassName}>{formatSubjectLabel(item)}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className={labelClassName}>Override difficulty</span>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    className={fieldClassName}
                    value={draftDifficulty ?? selectedLesson.difficulty}
                    onChange={(e) => setDraftDifficulty(Math.max(1, Math.min(5, Number(e.target.value) || 3)))}
                  />
                </label>
              </div>

              {selectedLesson.qaPairingReport ? (
                <div className="rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
                  <p className="font-bold uppercase tracking-[0.14em] text-slate-400">Question / Answer pairing</p>
                  <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
                    <p>Student questions: {selectedLesson.qaPairingReport.questionsFound}</p>
                    <p>Auto-marked: {selectedLesson.qaPairingReport.autoMarkedQuestions ?? "—"}</p>
                    <p>Guided-review: {selectedLesson.qaPairingReport.guidedReviewActivities ?? "—"}</p>
                    <p>Answers paired: {selectedLesson.qaPairingReport.answersPaired}</p>
                    <p>Missing answers: {selectedLesson.qaPairingReport.questionsWithoutAnswers}</p>
                    <p>Orphan correct answers: {selectedLesson.qaPairingReport.orphanCorrectAnswers ?? selectedLesson.qaPairingReport.answersWithoutQuestions}</p>
                    <p>Guidance groups: {selectedLesson.qaPairingReport.guidanceGroups ?? selectedLesson.qaPairingReport.teacherGuidanceOnly}</p>
                    <p>Low-confidence pairings: {selectedLesson.qaPairingReport.lowConfidencePairings ?? "—"}</p>
                    <p>Excluded fragments: {selectedLesson.qaPairingReport.excludedFragments ?? "—"}</p>
                  </div>
                </div>
              ) : null}

              {selectedLesson.preDraftValidation ? (
                <div className={`rounded-xl border px-3 py-2 text-xs ${
                  selectedLesson.preDraftValidation.overallReady
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-100"
                }`}>
                  <p className="font-bold uppercase tracking-[0.14em]">Pre-draft validation</p>
                  <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
                    {(["titleQuality", "objectiveQuality", "encodingQuality", "questionAnswerPairing", "playableFirstActivity", "playableAllActivities", "visualDependency", "durationQuality", "licenceResult", "thirdPartyResult"] as const).map((key) => {
                      const val = selectedLesson.preDraftValidation?.[key] ?? "—";
                      const color = val === "pass" ? "text-emerald-300" : val === "warning" ? "text-amber-300" : val === "blocked" || val === "needs_input" ? "text-rose-300" : "text-slate-400";
                      return <p key={key}><span className="text-slate-400">{key.replace(/([A-Z])/g, " $1").trim()}:</span> <span className={color}>{val}</span></p>;
                    })}
                  </div>
                  {Array.isArray((selectedLesson.starlizMetadata as { adminReconstructionQueue?: Array<{ activityId: string; prompt: string; reasons: string[] }> } | undefined)?.adminReconstructionQueue)
                    && ((selectedLesson.starlizMetadata as { adminReconstructionQueue?: Array<{ activityId: string; prompt: string; reasons: string[]; visualType?: string | null }> }).adminReconstructionQueue?.length ?? 0) > 0 ? (
                    <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-amber-100">
                      <p className="font-semibold">Needs Admin reconstruction</p>
                      <ul className="mt-1 list-disc pl-4">
                        {((selectedLesson.starlizMetadata as { adminReconstructionQueue: Array<{ activityId: string; prompt: string; reasons: string[]; visualType?: string | null }> }).adminReconstructionQueue).slice(0, 6).map((item) => (
                          <li key={item.activityId}>
                            {item.prompt.slice(0, 100)}
                            {item.visualType ? ` [${item.visualType}]` : ""}
                            {" — "}
                            {(item.reasons ?? []).join(", ")}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1 text-[11px] text-amber-200/80">Open the private source slide/page in review, enter clean prompt + visual values, then save or exclude.</p>
                    </div>
                  ) : null}
                  {selectedLesson.preDraftValidation.issues.length ? (
                    <ul className="mt-2 list-disc pl-4">
                      {selectedLesson.preDraftValidation.issues.map((issue) => <li key={issue}>{issue}</li>)}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {selectedLesson.academicValidation ? (
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold uppercase tracking-[0.14em]">Academic validation v{selectedLesson.academicValidation.version}</p>
                    <p>{selectedLesson.academicValidation.validator} · {selectedLesson.academicValidation.readiness}</p>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4">
                    <p>Global: {selectedLesson.academicValidation.globalPassed ? "pass" : "needs input"}</p>
                    <p>Subject: {selectedLesson.academicValidation.subjectPassed ? "pass" : "needs input"}</p>
                    <p>Missing dependencies: {selectedLesson.academicValidation.dependencies.filter((item) => item.required && !item.present).length}</p>
                    <p>Validated: {new Date(selectedLesson.academicValidation.validatedAt).toLocaleString()}</p>
                  </div>
                  {selectedLesson.academicValidation.issues.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      {selectedLesson.academicValidation.issues.slice(0, 20).map((issue, index) => (
                        <li key={`${issue.code}-${issue.activityId ?? index}`}><strong>{issue.scope}:</strong> {issue.message}</li>
                      ))}
                    </ul>
                  ) : <p className="mt-2 text-emerald-200">All global, subject, dependency and marking checks passed.</p>}
                </div>
              ) : null}

              <button
                type="button"
                disabled={creatingDraft || (selectedLesson.preDraftValidation != null && !selectedLesson.preDraftValidation.overallReady)}
                onClick={() => void createDraft()}
                className="rounded-xl border border-emerald-400 bg-emerald-500/20 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {creatingDraft ? "Creating draft…" : "Create StarLiz Draft"}
              </button>
              {selectedLesson.preDraftValidation && !selectedLesson.preDraftValidation.overallReady ? (
                <p className="text-xs text-rose-300">Draft creation blocked — resolve the issues above first.</p>
              ) : (
                <p className="text-xs text-slate-400">No content publishes from this screen. Draft enters awaiting_review.</p>
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {draftResult ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100">
          <p className="font-semibold">{draftResult.message}</p>
          <p className="mt-1">Content ID: {draftResult.contentId}</p>
          <Link href={draftResult.reviewPath} className="mt-2 inline-block text-cyan-300 underline">
            Open in Content Library review
          </Link>
        </div>
      ) : null}
    </div>
  );
}
