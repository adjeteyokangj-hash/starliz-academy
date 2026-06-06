"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import {
  GA_BULK_IMPORT_TEMPLATE,
  GA_AUDIO_STATUSES,
  GA_CATEGORIES,
  GA_LEVELS,
  GA_REVIEW_STATUSES,
  GA_WORD_TYPES,
} from "@/lib/ga-word-bank";

const MAX_PDF_BYTES = 25 * 1024 * 1024;

type GaSourceRow = {
  id: string;
  sourceName: string;
  sourceYear: number | null;
  fileName: string | null;
  fileReference: string | null;
  pageNumber: number | null;
  section: string | null;
  notes: string | null;
};

type GaWordRow = {
  id: string;
  englishWord: string;
  gaWord: string;
  wordType: string;
  category: string;
  level: string;
  sourceId: string | null;
  sourcePage: number | null;
  reviewStatus: string;
  audioStatus: string;
  quizReady: boolean;
  storyReady: boolean;
  notes: string | null;
  source: GaSourceRow | null;
};

type WordForm = {
  englishWord: string;
  gaWord: string;
  wordType: string;
  category: string;
  level: string;
  reviewStatus: string;
  audioStatus: string;
  quizReady: boolean;
  storyReady: boolean;
  notes: string;
};

type Filters = {
  q: string;
  reviewStatus: string;
  category: string;
  level: string;
  wordType: string;
  sourcePage: string;
  audioStatus: string;
  quizReady: string;
  storyReady: string;
};

type BulkPreviewRow = {
  rowNumber: number;
  valid: boolean;
  duplicateExisting: boolean;
  errors: string[];
};

type BulkPreview = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateWarnings: number;
  rows: BulkPreviewRow[];
};

const defaultWordForm: WordForm = {
  englishWord: "",
  gaWord: "",
  wordType: "noun",
  category: "Greetings",
  level: "Foundation",
  reviewStatus: "Pending",
  audioStatus: "Not Started",
  quizReady: false,
  storyReady: false,
  notes: "",
};

const defaultFilters: Filters = {
  q: "",
  reviewStatus: "",
  category: "",
  level: "",
  wordType: "",
  sourcePage: "",
  audioStatus: "",
  quizReady: "",
  storyReady: "",
};

function SelectField({ label, value, options, onChange, allowAll = false }: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  allowAll?: boolean;
}) {
  return (
    <label className="block text-xs font-bold uppercase text-slate-400">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
        {allowAll ? <option value="">All</option> : null}
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function TextField({ label, value, onChange, placeholder = "", inputRef }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputRef?: { current: HTMLInputElement | null };
}) {
  return (
    <label className="block text-xs font-bold uppercase text-slate-400">
      {label}
      <input ref={inputRef} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600" />
    </label>
  );
}

function queryFromFilters(filters: Filters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value.trim()) params.set(key, value.trim());
  }
  params.set("limit", "200");
  return params.toString();
}

function wordFormFromRow(row: GaWordRow): WordForm {
  return {
    englishWord: row.englishWord,
    gaWord: row.gaWord,
    wordType: row.wordType,
    category: row.category,
    level: row.level,
    reviewStatus: row.reviewStatus,
    audioStatus: row.audioStatus,
    quizReady: row.quizReady,
    storyReady: row.storyReady,
    notes: row.notes ?? "",
  };
}

function wordPayload(form: WordForm, sourceId: string | null, sourcePage: number | null) {
  return {
    englishWord: form.englishWord,
    gaWord: form.gaWord,
    wordType: form.wordType,
    category: form.category,
    level: form.level,
    sourceId,
    sourcePage,
    reviewStatus: form.reviewStatus,
    audioStatus: form.audioStatus,
    quizReady: form.quizReady,
    storyReady: form.storyReady,
    notes: form.notes || null,
  };
}

export default function GaWordBankPage() {
  const [sources, setSources] = useState<GaSourceRow[]>([]);
  const [words, setWords] = useState<GaWordRow[]>([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [wordForm, setWordForm] = useState(defaultWordForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState("Kasahorow Ga Children's Dictionary");
  const [sourceYear, setSourceYear] = useState("2025");
  const [fileName, setFileName] = useState("");
  const [fileReference, setFileReference] = useState("");
  const [pageNumber, setPageNumber] = useState("");
  const [section, setSection] = useState("English-Ga");
  const [sourceNotes, setSourceNotes] = useState("Verified dictionary scan source");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<{ totalWords: number; approvedWords: number; pendingReview: number; audioApproved: number } | null>(null);
  const [bulkText, setBulkText] = useState(GA_BULK_IMPORT_TEMPLATE);
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkDuplicateStrategy, setBulkDuplicateStrategy] = useState<"skip" | "update">("skip");
  const [pdfFileName, setPdfFileName] = useState<string>("");
  const [pdfUploading, setPdfUploading] = useState(false);
  const editFormRef = useRef<HTMLDivElement | null>(null);
  const englishWordInputRef = useRef<HTMLInputElement | null>(null);

  const isEditing = editingId !== null;
  const editingWord = useMemo(() => words.find((word) => word.id === editingId) ?? null, [editingId, words]);
  const activeSource = useMemo(
    () => sources.find((source) => source.sourceName.trim().toLowerCase() === sourceName.trim().toLowerCase()) ?? sources[0] ?? null,
    [sources, sourceName],
  );

  const focusEditForm = useCallback(() => {
    editFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      englishWordInputRef.current?.focus();
      englishWordInputRef.current?.select();
    }, 200);
  }, []);

  const loadSources = useCallback(async () => {
    const response = await fetch("/api/admin/ga/sources");
    if (response.status === 401) {
      window.location.replace("/admin/login?next=/admin/ga-word-bank");
      return;
    }
    const payload = await response.json().catch(() => null) as { items?: GaSourceRow[] } | null;
    setSources(payload?.items ?? []);
  }, []);

  const loadWords = useCallback(async (nextFilters: Filters) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/ga/words?${queryFromFilters(nextFilters)}`);
      if (response.status === 401) {
        window.location.replace("/admin/login?next=/admin/ga-word-bank");
        return;
      }
      const payload = await response.json().catch(() => null) as { items?: GaWordRow[]; metrics?: typeof metrics; error?: string } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "Unable to load Ga words.");
        setWords([]);
        return;
      }
      setWords(payload?.items ?? []);
      setMetrics(payload?.metrics ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSources();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSources]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWords(appliedFilters);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [appliedFilters, loadWords]);

  async function saveSource() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/ga/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceName,
          sourceYear: sourceYear ? Number(sourceYear) : null,
          fileName: fileName || null,
          fileReference: fileReference || null,
          pageNumber: pageNumber ? Number(pageNumber) : null,
          section: section || null,
          notes: sourceNotes || null,
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "Unable to save source.");
        return;
      }
      setMessage("Ga source saved.");
      setPageNumber("");
      await loadSources();
    } finally {
      setSaving(false);
    }
  }

  async function saveWord() {
    const resolvedSourceId = activeSource?.id ?? editingWord?.sourceId ?? null;
    const resolvedSourcePage = editingWord?.sourcePage ?? null;
    if (!resolvedSourceId) {
      setMessage("Save a source in Source Library first so words can inherit dictionary reference.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(isEditing ? `/api/admin/ga/words/${editingId}` : "/api/admin/ga/words", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(wordPayload(wordForm, resolvedSourceId, resolvedSourcePage)),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "Unable to save Ga word.");
        return;
      }
      setMessage(isEditing ? "Ga word updated." : "Ga word created.");
      setEditingId(null);
      setWordForm(defaultWordForm);
      await loadWords(appliedFilters);
    } finally {
      setSaving(false);
    }
  }

  async function loadBulkFile(file: File) {
    const content = await file.text();
    setBulkText(content);
    setBulkPreview(null);
  }

  async function uploadPdfSource(file: File) {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setMessage("Invalid file type. Please upload a PDF file.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setMessage("File too large. Maximum PDF size is 25MB.");
      return;
    }

    setPdfFileName(file.name);
    setPdfUploading(true);
    setMessage("Uploading PDF...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/admin/ga/pdf-sources", { method: "POST", body: formData });
      const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? payload?.message ?? "Upload failed.");
        return;
      }
      setMessage(payload?.message ?? "PDF uploaded for Ga word extraction review.");
      await loadSources();
    } finally {
      setPdfUploading(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([`${GA_BULK_IMPORT_TEMPLATE}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "ga-word-import-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function previewBulkImport() {
    setBulkLoading(true);
    try {
      const response = await fetch("/api/admin/ga/words/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "preview", text: bulkText }),
      });
      if (response.status === 401) {
        window.location.replace("/admin/login?next=/admin/ga-word-bank");
        return;
      }
      const payload = await response.json().catch(() => null) as (BulkPreview & { error?: string }) | null;
      if (!response.ok || !payload) {
        setMessage(payload?.error ?? "Unable to preview bulk import.");
        return;
      }
      setBulkPreview(payload);
      setMessage(`Preview ready: ${payload.validRows} valid, ${payload.invalidRows} invalid.`);
    } finally {
      setBulkLoading(false);
    }
  }

  async function commitBulkImport() {
    setBulkLoading(true);
    try {
      const response = await fetch("/api/admin/ga/words/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "commit", text: bulkText, duplicateStrategy: bulkDuplicateStrategy }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; created?: number; updated?: number; skipped?: number } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "Unable to import rows.");
        return;
      }
      setMessage(`Bulk import complete. Created ${payload?.created ?? 0}, updated ${payload?.updated ?? 0}, skipped ${payload?.skipped ?? 0}.`);
      setBulkPreview(null);
      await loadWords(appliedFilters);
    } finally {
      setBulkLoading(false);
    }
  }

  function startEdit(row: GaWordRow) {
    setEditingId(row.id);
    setWordForm(wordFormFromRow(row));
    setMessage(null);
    focusEditForm();
  }

  function cancelEdit() {
    setEditingId(null);
    setWordForm(defaultWordForm);
    setMessage("Edit cancelled.");
  }

  return (
    <div className="space-y-6 pb-24">
      <section className="rounded-3xl border border-slate-800/80 bg-linear-to-br from-emerald-500/15 via-slate-950 to-cyan-500/10 p-6 shadow-2xl shadow-slate-950/20">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Ga Learning Hub</p>
        <h1 className="mt-2 text-3xl font-black text-white">Verified Ga Word Bank</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-300">Store Ga vocabulary with source references, review status and student-safe approval controls. Only Approved words are available to student-facing Ga APIs.</p>
      </section>

      {message ? <p className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100">{message}</p> : null}

      {metrics ? (
        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-xs uppercase text-slate-500">Total words</p><p className="mt-2 text-3xl font-black text-white">{metrics.totalWords}</p></div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-xs uppercase text-slate-500">Approved</p><p className="mt-2 text-3xl font-black text-emerald-300">{metrics.approvedWords}</p></div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-xs uppercase text-slate-500">Pending review</p><p className="mt-2 text-3xl font-black text-amber-300">{metrics.pendingReview}</p></div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-xs uppercase text-slate-500">Audio approved</p><p className="mt-2 text-3xl font-black text-cyan-300">{metrics.audioApproved}</p></div>
        </section>
      ) : null}

      <AdminSectionCard title="Source Library" eyebrow="Trusted references">
        <div className="grid gap-3 md:grid-cols-3">
          <TextField label="Source name" value={sourceName} onChange={setSourceName} />
          <TextField label="Source year" value={sourceYear} onChange={setSourceYear} />
          <TextField label="File name" value={fileName} onChange={setFileName} placeholder="Scan_20260605_182045.pdf" />
          <TextField label="File reference" value={fileReference} onChange={setFileReference} placeholder="storage path or note" />
          <TextField label="Page number" value={pageNumber} onChange={setPageNumber} />
          <TextField label="Section" value={section} onChange={setSection} />
          <div className="md:col-span-3">
            <TextField label="Notes" value={sourceNotes} onChange={setSourceNotes} />
          </div>
        </div>
        <button type="button" onClick={saveSource} disabled={saving} className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Save source</button>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {sources.map((source) => (
            <article key={source.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
              <p className="font-black text-white">{source.sourceName}</p>
              <p>{source.sourceYear ?? "-"} · Page {source.pageNumber ?? "-"} · {source.section ?? "-"}</p>
              <p className="mt-1 text-slate-500">{source.fileName ?? source.fileReference ?? "No file reference"}</p>
            </article>
          ))}
        </div>
      </AdminSectionCard>

      <AdminSectionCard title={isEditing ? "Edit Ga Word" : "Add Ga Word"} eyebrow="Controlled vocabulary">
        <div ref={editFormRef} className="h-0" aria-hidden="true" />
        <div className="grid gap-3 md:grid-cols-3">
          <TextField label="English word" value={wordForm.englishWord} onChange={(value) => setWordForm((form) => ({ ...form, englishWord: value }))} inputRef={englishWordInputRef} />
          <TextField label="Ga word" value={wordForm.gaWord} onChange={(value) => setWordForm((form) => ({ ...form, gaWord: value }))} />
          <SelectField label="Word type" value={wordForm.wordType} options={GA_WORD_TYPES} onChange={(value) => setWordForm((form) => ({ ...form, wordType: value }))} />
          <SelectField label="Category" value={wordForm.category} options={GA_CATEGORIES} onChange={(value) => setWordForm((form) => ({ ...form, category: value }))} />
          <SelectField label="Level" value={wordForm.level} options={GA_LEVELS} onChange={(value) => setWordForm((form) => ({ ...form, level: value }))} />
          <SelectField label="Review status" value={wordForm.reviewStatus} options={GA_REVIEW_STATUSES} onChange={(value) => setWordForm((form) => ({ ...form, reviewStatus: value }))} />
          <SelectField label="Audio status" value={wordForm.audioStatus} options={GA_AUDIO_STATUSES} onChange={(value) => setWordForm((form) => ({ ...form, audioStatus: value }))} />
          <label className="flex items-center gap-2 text-sm font-bold text-slate-300"><input type="checkbox" checked={wordForm.quizReady} onChange={(event) => setWordForm((form) => ({ ...form, quizReady: event.target.checked }))} /> Quiz ready</label>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-300"><input type="checkbox" checked={wordForm.storyReady} onChange={(event) => setWordForm((form) => ({ ...form, storyReady: event.target.checked }))} /> Story ready</label>
          <div className="md:col-span-3">
            <TextField label="Notes" value={wordForm.notes} onChange={(value) => setWordForm((form) => ({ ...form, notes: value }))} />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={saveWord} disabled={saving} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{isEditing ? "Update word" : "Add word"}</button>
          {isEditing ? <button type="button" onClick={cancelEdit} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-200">Cancel edit</button> : null}
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="Bulk Import" eyebrow="CSV/Table importer with preview safeguards">
        <p className="text-xs text-slate-400">Required columns: englishWord, gaWord, wordType, category, level, sourcePage, reviewStatus, audioStatus, quizReady, storyReady and sourceId or sourceName. Pending/Reviewed rows remain hidden from student APIs.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={downloadTemplate} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-100">Download CSV template</button>
          <button type="button" onClick={() => { setBulkText(`${GA_BULK_IMPORT_TEMPLATE}\n`); setBulkPreview(null); }} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-100">Reset to template</button>
          <label className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-100">
            Upload CSV
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void loadBulkFile(file);
              }}
            />
          </label>
          <label className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-100">
            Upload PDF
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadPdfSource(file);
              }}
            />
          </label>
        </div>
        {pdfFileName ? <p className="mt-2 text-xs text-slate-400">Selected PDF: {pdfFileName}{pdfUploading ? " (uploading...)" : ""}</p> : null}
        <textarea
          value={bulkText}
          onChange={(event) => { setBulkText(event.target.value); setBulkPreview(null); }}
          rows={8}
          className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
          placeholder="Paste CSV or tab-separated rows with a header row"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={previewBulkImport} disabled={bulkLoading} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Preview import</button>
          <label className="text-xs font-bold uppercase text-slate-400">
            Duplicate strategy
            <select value={bulkDuplicateStrategy} onChange={(event) => setBulkDuplicateStrategy(event.target.value as "skip" | "update")} className="ml-2 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white">
              <option value="skip">Skip duplicates</option>
              <option value="update">Update existing duplicates</option>
            </select>
          </label>
          <button
            type="button"
            onClick={commitBulkImport}
            disabled={bulkLoading || !bulkPreview || bulkPreview.validRows === 0}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
          >
            Import valid rows
          </button>
        </div>

        {bulkPreview ? (
          <div className="mt-4 space-y-3">
            <div className="grid gap-2 text-xs md:grid-cols-4">
              <p className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-300">Total rows: <span className="font-black text-white">{bulkPreview.totalRows}</span></p>
              <p className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-300">Valid rows: <span className="font-black text-emerald-300">{bulkPreview.validRows}</span></p>
              <p className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-300">Invalid rows: <span className="font-black text-amber-300">{bulkPreview.invalidRows}</span></p>
              <p className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-300">Duplicate warnings: <span className="font-black text-cyan-300">{bulkPreview.duplicateWarnings}</span></p>
            </div>
            <div className="max-h-56 overflow-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-200 text-left text-xs">
                <thead className="uppercase text-slate-500">
                  <tr><th className="px-2 py-2">Row</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Notes</th></tr>
                </thead>
                <tbody>
                  {bulkPreview.rows.map((row) => (
                    <tr key={row.rowNumber} className="border-t border-slate-800 text-slate-300">
                      <td className="px-2 py-2">{row.rowNumber}</td>
                      <td className="px-2 py-2">{row.valid ? (row.duplicateExisting ? "Valid (duplicate existing)" : "Valid") : "Invalid"}</td>
                      <td className="px-2 py-2">{row.errors.length ? row.errors.join(" ") : (row.duplicateExisting ? "Will apply duplicate strategy." : "Ready")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </AdminSectionCard>

      <AdminSectionCard title="Search & Filters" eyebrow="Admin-only vocabulary review">
        <div className="grid gap-3 md:grid-cols-4">
          <TextField label="Search" value={filters.q} onChange={(value) => setFilters((next) => ({ ...next, q: value }))} />
          <SelectField label="Review status" value={filters.reviewStatus} options={GA_REVIEW_STATUSES} onChange={(value) => setFilters((next) => ({ ...next, reviewStatus: value }))} allowAll />
          <SelectField label="Category" value={filters.category} options={GA_CATEGORIES} onChange={(value) => setFilters((next) => ({ ...next, category: value }))} allowAll />
          <SelectField label="Level" value={filters.level} options={GA_LEVELS} onChange={(value) => setFilters((next) => ({ ...next, level: value }))} allowAll />
          <SelectField label="Word type" value={filters.wordType} options={GA_WORD_TYPES} onChange={(value) => setFilters((next) => ({ ...next, wordType: value }))} allowAll />
          <TextField label="Source page" value={filters.sourcePage} onChange={(value) => setFilters((next) => ({ ...next, sourcePage: value }))} />
          <SelectField label="Audio status" value={filters.audioStatus} options={GA_AUDIO_STATUSES} onChange={(value) => setFilters((next) => ({ ...next, audioStatus: value }))} allowAll />
          <SelectField label="Quiz ready" value={filters.quizReady} options={["true", "false"]} onChange={(value) => setFilters((next) => ({ ...next, quizReady: value }))} allowAll />
          <SelectField label="Story ready" value={filters.storyReady} options={["true", "false"]} onChange={(value) => setFilters((next) => ({ ...next, storyReady: value }))} allowAll />
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => setAppliedFilters(filters)} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-black text-white">Apply filters</button>
          <button type="button" onClick={() => { setFilters(defaultFilters); setAppliedFilters(defaultFilters); }} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-200">Reset</button>
        </div>
      </AdminSectionCard>

      <AdminSectionCard title={`Ga Words (${words.length})`} eyebrow="Only Approved words can reach students">
        {loading ? <p className="text-sm text-slate-400">Loading Ga words...</p> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-220 text-left text-xs">
            <thead className="uppercase text-slate-500">
              <tr><th className="px-2 py-2">English</th><th className="px-2 py-2">Ga</th><th className="px-2 py-2">Type</th><th className="px-2 py-2">Category</th><th className="px-2 py-2">Level</th><th className="px-2 py-2">Review</th><th className="px-2 py-2">Audio</th><th className="px-2 py-2">Ready</th><th className="px-2 py-2">Action</th></tr>
            </thead>
            <tbody>
              {words.map((word) => (
                <tr key={word.id} className="border-t border-slate-800 text-slate-300">
                  <td className="px-2 py-2 font-bold text-white">{word.englishWord}</td>
                  <td className="px-2 py-2 font-bold text-emerald-200">{word.gaWord}</td>
                  <td className="px-2 py-2">{word.wordType}</td>
                  <td className="px-2 py-2">{word.category}</td>
                  <td className="px-2 py-2">{word.level}</td>
                  <td className="px-2 py-2"><span className={`rounded-full border px-2 py-1 ${word.reviewStatus === "Approved" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-amber-500/40 bg-amber-500/10 text-amber-100"}`}>{word.reviewStatus}</span></td>
                  <td className="px-2 py-2">{word.audioStatus}</td>
                  <td className="px-2 py-2">{word.quizReady ? "Quiz" : "-"} {word.storyReady ? "Story" : ""}</td>
                  <td className="px-2 py-2"><button type="button" onClick={() => startEdit(word)} className="rounded-lg border border-slate-700 px-3 py-1 font-bold text-slate-100">Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSectionCard>
    </div>
  );
}
