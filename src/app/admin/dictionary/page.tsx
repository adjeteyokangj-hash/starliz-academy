"use client";

import { useEffect, useMemo, useState } from "react";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import DictionaryFilters, { type DictionaryFilterState } from "@/components/admin/dictionary/DictionaryFilters";
import DictionaryForm, { type DictionaryFormValues } from "@/components/admin/dictionary/DictionaryForm";
import DictionaryTable from "@/components/admin/dictionary/DictionaryTable";
import type { DictionaryDashboardMetrics, DictionaryWordRecord } from "@/lib/dictionary";

type ListResponse = {
  items: DictionaryWordRecord[];
  total: number;
  page: number;
  limit: number;
  metrics?: DictionaryDashboardMetrics;
};

const defaultFilters: DictionaryFilterState = {
  q: "",
  subject: "",
  keyStage: "",
  yearGroup: "",
  difficulty: "",
  topic: "",
  active: "active",
  tricky: "all",
  topicKeyword: "all",
};

const defaultFormValues: DictionaryFormValues = {
  word: "",
  subject: "english",
  keyStage: "ks1",
  yearGroup: "",
  difficulty: "easy",
  topic: "",
  skillFocus: "",
  definitionChild: "",
  definitionParent: "",
  exampleSentence: "",
  secondExampleSentence: "",
  phonicsPattern: "",
  syllables: "",
  pronunciationHint: "",
  synonyms: "",
  antonyms: "",
  relatedWords: "",
  isTrickyWord: false,
  isTopicKeyword: false,
  isMathsKeyword: false,
  isScienceKeyword: false,
  isReadingKeyword: false,
  isSpellingKeyword: false,
  interventionTags: "",
  senTags: "",
  safeguardingTags: "",
  curriculumTags: "",
  active: true,
};

function toQuery(filters: DictionaryFilterState): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.subject) params.set("subject", filters.subject);
  if (filters.keyStage) params.set("keyStage", filters.keyStage);
  if (filters.yearGroup.trim()) params.set("yearGroup", filters.yearGroup.trim());
  if (filters.difficulty) params.set("difficulty", filters.difficulty);
  if (filters.topic.trim()) params.set("topic", filters.topic.trim());
  if (filters.active !== "all") params.set("active", String(filters.active === "active"));
  if (filters.tricky !== "all") params.set("tricky", filters.tricky);
  if (filters.topicKeyword !== "all") params.set("topicKeyword", filters.topicKeyword);
  params.set("limit", "200");
  return params.toString();
}

function toFormValue(item: DictionaryWordRecord): DictionaryFormValues {
  return {
    word: item.word,
    subject: item.subject,
    keyStage: item.keyStage,
    yearGroup: item.yearGroup ?? "",
    difficulty: item.difficulty,
    topic: item.topic ?? "",
    skillFocus: item.skillFocus ?? "",
    definitionChild: item.definitionChild,
    definitionParent: item.definitionParent ?? "",
    exampleSentence: item.exampleSentence ?? "",
    secondExampleSentence: item.secondExampleSentence ?? "",
    phonicsPattern: item.phonicsPattern ?? "",
    syllables: item.syllables ?? "",
    pronunciationHint: item.pronunciationHint ?? "",
    synonyms: item.synonyms.join(", "),
    antonyms: item.antonyms.join(", "),
    relatedWords: item.relatedWords.join(", "),
    isTrickyWord: item.isTrickyWord,
    isTopicKeyword: item.isTopicKeyword,
    isMathsKeyword: item.isMathsKeyword,
    isScienceKeyword: item.isScienceKeyword,
    isReadingKeyword: item.isReadingKeyword,
    isSpellingKeyword: item.isSpellingKeyword,
    interventionTags: item.interventionTags.join(", "),
    senTags: item.senTags.join(", "),
    safeguardingTags: item.safeguardingTags.join(", "),
    curriculumTags: item.curriculumTags.join(", "),
    active: item.active,
  };
}

function buildPayload(form: DictionaryFormValues) {
  return {
    word: form.word,
    subject: form.subject,
    keyStage: form.keyStage,
    yearGroup: form.yearGroup || null,
    difficulty: form.difficulty || null,
    topic: form.topic || null,
    skillFocus: form.skillFocus || null,
    definitionChild: form.definitionChild,
    definitionParent: form.definitionParent || null,
    exampleSentence: form.exampleSentence || null,
    secondExampleSentence: form.secondExampleSentence || null,
    phonicsPattern: form.phonicsPattern || null,
    syllables: form.syllables || null,
    pronunciationHint: form.pronunciationHint || null,
    synonyms: form.synonyms,
    antonyms: form.antonyms,
    relatedWords: form.relatedWords,
    isTrickyWord: form.isTrickyWord,
    isTopicKeyword: form.isTopicKeyword,
    isMathsKeyword: form.isMathsKeyword,
    isScienceKeyword: form.isScienceKeyword,
    isReadingKeyword: form.isReadingKeyword,
    isSpellingKeyword: form.isSpellingKeyword,
    interventionTags: form.interventionTags,
    senTags: form.senTags,
    safeguardingTags: form.safeguardingTags,
    curriculumTags: form.curriculumTags,
    importSource: "admin-ui",
    active: form.active,
  };
}

function toCsv(items: DictionaryWordRecord[]): string {
  const headers = ["word", "subject", "keyStage", "yearGroup", "difficulty", "topic", "definitionChild", "active"];
  const rows = items.map((item) => [item.word, item.subject, item.keyStage, item.yearGroup ?? "", item.difficulty, item.topic ?? "", item.definitionChild, String(item.active)]);
  return [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export default function DictionaryPage() {
  const [filters, setFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [items, setItems] = useState<DictionaryWordRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DictionaryFormValues>(defaultFormValues);
  const [metrics, setMetrics] = useState<DictionaryDashboardMetrics | null>(null);

  const editingItem = useMemo(() => items.find((item) => item.id === editingId) ?? null, [editingId, items]);
  const mode = editingItem ? "edit" : "create";

  const fetchWords = async (nextFilters: DictionaryFilterState) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/dictionary?${toQuery(nextFilters)}`);
      if (response.status === 401) {
        window.location.replace("/admin/login?next=/admin/dictionary");
        return;
      }
      const payload = await response.json() as ListResponse;
      setItems(payload.items ?? []);
      setMetrics(payload.metrics ?? null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchWords(appliedFilters);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [appliedFilters]);

  function resetForm() {
    setEditingId(null);
    setForm(defaultFormValues);
  }

  async function submitForm() {
    setSaving(true);
    try {
      const response = await fetch(editingItem ? `/api/admin/dictionary/${editingItem.id}` : "/api/admin/dictionary", {
        method: editingItem ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(form)),
      });
      const payload = await response.json().catch(() => null) as { item?: DictionaryWordRecord; error?: string } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "Unable to save dictionary word.");
        return;
      }
      setMessage(editingItem ? "Word updated." : "Word created.");
      resetForm();
      await fetchWords(appliedFilters);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: DictionaryWordRecord) {
    setBusyId(item.id);
    try {
      const response = await fetch(`/api/admin/dictionary/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !item.active }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "Unable to update status.");
        return;
      }
      setMessage(item.active ? "Word deactivated." : "Word reactivated.");
      await fetchWords(appliedFilters);
    } finally {
      setBusyId(null);
    }
  }

  function applySearch() {
    setAppliedFilters(filters);
  }

  function resetFilters() {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  }

  function startCreate() {
    resetForm();
    setMessage(null);
  }

  function startEdit(item: DictionaryWordRecord) {
    setEditingId(item.id);
    setForm(toFormValue(item));
    setMessage(null);
  }

  async function importStarterWords() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/dictionary/bootstrap", {
        method: "POST",
      });
      const payload = await response.json().catch(() => null) as { addedCount?: number; skippedCount?: number; failedCount?: number; error?: string } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "Unable to import starter words.");
        return;
      }
      setMessage(`Imported starter words: ${payload?.addedCount ?? 0} added, ${payload?.skippedCount ?? 0} skipped, ${payload?.failedCount ?? 0} failed.`);
      await fetchWords(appliedFilters);
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const blob = new Blob([toCsv(items)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dictionary-word-bank.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 pb-24">
      <section className="rounded-3xl border border-slate-800/80 bg-linear-to-br from-cyan-500/15 via-slate-950 to-indigo-500/10 p-6 shadow-2xl shadow-slate-950/20">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Admin</p>
          <h1 className="mt-2 text-3xl font-black text-white">Dictionary / Word Bank</h1>
          <p className="mt-3 text-sm text-slate-300">Manage child-friendly word explanations used by Coach, lessons, spelling, reading, maths and science.</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={startCreate} className="rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-white hover:bg-cyan-400">Add word</button>
          <button type="button" onClick={importStarterWords} disabled={saving} className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-black text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">Import starter words</button>
          <button type="button" onClick={exportCsv} className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-black text-slate-200 hover:bg-slate-800">Export CSV</button>
          <button type="button" onClick={applySearch} className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-black text-slate-200 hover:bg-slate-800">Search words</button>
        </div>
      </section>

      {message ? <p className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-cyan-100">{message}</p> : null}

      {metrics ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Total words</p>
            <p className="mt-2 text-3xl font-black text-white">{metrics.totalWords}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Active words</p>
            <p className="mt-2 text-3xl font-black text-emerald-300">{metrics.activeWords}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Inactive words</p>
            <p className="mt-2 text-3xl font-black text-amber-300">{metrics.inactiveWords}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Top Coach lookup</p>
            <p className="mt-2 text-sm font-black text-white">{metrics.mostUsedCoachLookups[0]?.normalizedWord ?? "—"}</p>
            <p className="text-xs text-slate-400">{metrics.mostUsedCoachLookups[0] ? `${metrics.mostUsedCoachLookups[0].count} lookups` : "No data yet"}</p>
          </div>
        </section>
      ) : null}

      {metrics ? (
        <section className="grid gap-4 md:grid-cols-2">
          <AdminSectionCard title="Words by Subject" eyebrow="Metrics">
            <div className="space-y-2">
              {metrics.wordsBySubject.map((entry) => (
                <div key={entry.subject} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm">
                  <span className="capitalize text-slate-200">{entry.subject}</span>
                  <span className="font-black text-white">{entry.count}</span>
                </div>
              ))}
            </div>
          </AdminSectionCard>
          <AdminSectionCard title="Words by Key Stage" eyebrow="Metrics">
            <div className="space-y-2">
              {metrics.wordsByKeyStage.map((entry) => (
                <div key={entry.keyStage} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm">
                  <span className="uppercase text-slate-200">{entry.keyStage}</span>
                  <span className="font-black text-white">{entry.count}</span>
                </div>
              ))}
            </div>
          </AdminSectionCard>
        </section>
      ) : null}

      <DictionaryFilters value={filters} onChange={setFilters} onSearch={applySearch} onReset={resetFilters} searching={loading} />

      <DictionaryForm value={form} onChange={setForm} onSubmit={submitForm} onCancel={resetForm} saving={saving} mode={mode} />

      <AdminSectionCard title={`Words (${items.length})`} eyebrow="Word Bank">
        {loading ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-8 text-sm text-slate-400">Loading words...</div>
        ) : (
          <DictionaryTable items={items} onEdit={startEdit} onToggleActive={toggleActive} busyId={busyId} />
        )}
      </AdminSectionCard>
    </div>
  );
}
