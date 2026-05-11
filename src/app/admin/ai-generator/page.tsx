"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type Subject = "spelling" | "math" | "reading";
type GeneratedPreviewItem = Record<string, unknown> & {
  id?: string;
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

const skillPresets: Record<Subject, string[]> = {
  spelling: ["Phase 2 phonics", "Phase 3 phonics", "Phase 4 blends", "Phase 5 alternative sounds", "Common exception words", "Silent e"],
  math: ["Number bonds", "Addition and subtraction", "Times tables", "Fractions", "Place value", "Shape", "Money", "Time", "Measurement"],
  reading: ["Fiction", "Non-fiction", "Inference", "Vocabulary", "Retrieval questions", "Sequencing", "Prediction", "Main idea"],
};

const ks2SpellingPresets = ["Prefixes and suffixes", "Homophones", "Year 3/4 spelling list", "Year 5/6 spelling list", "Irregular spellings", "Spelling rules (-tion, -sion)"];
const yearGroupsByKeyStage: Record<string, string[]> = {
  KS1: ["Year 1", "Year 2"],
  KS2: ["Year 3", "Year 4", "Year 5", "Year 6"],
};

function getSkillOptions(subject: Subject, keyStage: string) {
  if (subject === "spelling" && keyStage === "KS2") return ks2SpellingPresets;
  return skillPresets[subject];
}

function getYearOptions(keyStage: string) {
  return yearGroupsByKeyStage[keyStage] ?? yearGroupsByKeyStage.KS1;
}

function normalizeYearForKeyStage(keyStage: string, yearGroup: string | null | undefined) {
  const options = getYearOptions(keyStage);
  return yearGroup && options.includes(yearGroup) ? yearGroup : options[0];
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

export default function AiGeneratorPage() {
  const searchParams = useSearchParams();
  const prefillSubject = searchParams.get("subject");
  const initialSubject: Subject = prefillSubject === "math" || prefillSubject === "reading" || prefillSubject === "spelling" ? prefillSubject : "spelling";
  const prefillSkill = searchParams.get("skill");
  const prefillWords = searchParams.get("words");
  const prefillStudentId = searchParams.get("studentId");
  const prefillDifficulty = Number(searchParams.get("difficulty"));
  const [subject, setSubject] = useState<Subject>(initialSubject);
  const [keyStage, setKeyStage] = useState("KS1");
  const [yearGroup, setYearGroup] = useState("Year 2");
  const [skillFocus, setSkillFocus] = useState(prefillSkill ?? "Silent e");
  const [ageGroup, setAgeGroup] = useState("6-8");
  const [difficulty, setDifficulty] = useState(Number.isFinite(prefillDifficulty) && prefillDifficulty >= 1 ? prefillDifficulty : prefillWords ? 1 : 2);
  const [items, setItems] = useState(12);
  const [topic, setTopic] = useState(prefillWords ? `Focus practice on: ${prefillWords}` : "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<GeneratedPreview | null>(null);
  const [generationMeta, setGenerationMeta] = useState<{ model?: string; prompt?: string; estimatedCostPence?: number; estimatedTokens?: number; validation?: ValidationMeta } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [automationMessage, setAutomationMessage] = useState<string | null>(prefillWords ? "Follow-up practice prefilled from assignment weak areas." : null);
  const [weakAreas, setWeakAreas] = useState<WeakArea[]>([]);
  const [savedContentId, setSavedContentId] = useState<string | null>(null);
  const [targetStudentId, setTargetStudentId] = useState<string | null>(prefillStudentId);

  const generatedItemsList = preview?.items ?? [];
  const saveBlocked = !generatedItemsList.length || generationMeta?.validation?.valid === false;
  const approvedCount = generatedItemsList.filter((item) => item.status !== "rejected").length;
  const previewBadge = generationMeta?.validation?.valid === false
    ? { label: "Needs Review", className: "bg-rose-500/15 text-rose-200" }
    : generationMeta?.validation?.repaired
      ? { label: "Adjusted", className: "bg-amber-500/15 text-amber-200" }
      : { label: "Perfect", className: "bg-emerald-500/15 text-emerald-200" };

  function formatRepairMessage(error: string) {
    const [type, word] = error.split(":");
    if (type === "duplicate") return `Removed duplicate: ${word}`;
    if (type === "invalid_silent_e") return `Removed invalid word: ${word}`;
    if (type === "incomplete") return `Removed incomplete item: ${word}`;
    return error;
  }

  async function generatePreview() {
    if (!subject || !keyStage || !yearGroup || !skillFocus.trim()) {
      setError("Subject, key stage, year group and skill focus are required.");
      return;
    }
    if (items < 1 || items > 30) {
      setError("Number of items must be between 1 and 30.");
      return;
    }
    const maxDifficulty = subject === "reading" ? 10 : 5;
    if (difficulty < 1 || difficulty > maxDifficulty) {
      setError(`Difficulty must be between 1 and ${maxDifficulty}.`);
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    setSavedContentId(null);
    setPreview(null);
    setGenerationMeta(null);
    try {
      const response = await fetch("/api/admin/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, keyStage, yearGroup, skillFocus, ageGroup, difficulty, numberOfItems: items, topic }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Generation failed.");
      } else {
        setPreview(payload.content);
        setGenerationMeta({
          model: payload.model,
          prompt: payload.prompt,
          estimatedCostPence: payload.estimatedCostPence,
          estimatedTokens: payload.estimatedTokens,
          validation: payload.meta,
        });
      }
    } catch {
      setError("Unable to reach AI generator.");
    } finally {
      setLoading(false);
    }
  }

  async function saveGeneratedContent() {
    if (!preview || !approvedCount) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/content-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: subject,
          ageGroup,
          keyStage,
          yearGroup,
          skillFocus,
          difficulty,
          topic,
          items: {
            ...preview,
            items: preview.items.filter((item) => item.status !== "rejected"),
          },
          status: "review",
          model: generationMeta?.model,
          prompt: generationMeta?.prompt,
          estimatedCostPence: generationMeta?.estimatedCostPence,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Save failed.");
      } else {
        setMessage("Saved to Content Library");
        setSavedContentId(payload.item?.id ?? null);
        if (targetStudentId && payload.item?.id) {
          await fetch("/api/admin/assignments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studentId: targetStudentId, contentId: payload.item.id }),
          });
          setMessage("Saved to Content Library and assigned to student");
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
          skillFocus,
          ageGroup,
          difficulty,
          numberOfItems: 1,
          topic: `${topic || skillFocus} replacement item`,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Regeneration failed.");
        return;
      }
      const replacement = payload.content?.items?.[0] as GeneratedPreviewItem | undefined;
      if (replacement) {
        updatePreviewItem(index, replacement);
      }
    } catch {
      setError("Unable to regenerate item.");
    } finally {
      setLoading(false);
    }
  }

  async function runAutomation(mode: "autofill" | "weaknesses") {
    setAutomationMessage("Running...");
    const response = await fetch(mode === "weaknesses" ? "/api/admin/weak-areas" : "/api/admin/ai/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: mode === "weaknesses" ? undefined : JSON.stringify({ mode }),
    });
    const payload = await response.json();
    setAutomationMessage(response.ok ? JSON.stringify(payload) : payload.error ?? "Automation failed.");
    if (mode === "weaknesses" && response.ok) setWeakAreas(payload.weakAreas ?? []);
  }

  function applyWeakArea(area: WeakArea) {
    const nextSubject = area.subject === "math" ? "math" : area.subject === "reading" ? "reading" : "spelling";
    const nextKeyStage = area.keyStage ?? "KS1";
    setSubject(nextSubject);
    setKeyStage(nextKeyStage);
    setYearGroup(normalizeYearForKeyStage(nextKeyStage, area.yearGroup));
    setSkillFocus(area.skillFocus);
    setDifficulty(Math.max(1, area.status === "active" ? area.currentDifficulty - 1 : area.currentDifficulty));
    setTopic(`${area.weaknessType} support for ${area.skillFocus}`);
    setTargetStudentId(area.studentId);
    setSavedContentId(null);
    setAutomationMessage(`Prefilled targeted content for ${area.student.name}.`);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[32rem_minmax(0,1fr)]">
      <AdminSectionCard title="AI Generator" eyebrow="Content">
        <div className="space-y-4">
          <label className="block text-sm font-bold text-slate-300">
            Subject
            <select value={subject} onChange={(event) => {
              const next = event.target.value as Subject;
              setSubject(next);
              setSkillFocus(getSkillOptions(next, keyStage)[0]);
            }} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white">
              <option value="spelling">Spelling words</option>
              <option value="math">Maths questions</option>
              <option value="reading">Reading passages</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-bold text-slate-300">
            Key stage
            <select value={keyStage} onChange={(event) => {
              const nextKeyStage = event.target.value;
              setKeyStage(nextKeyStage);
              setYearGroup((current) => normalizeYearForKeyStage(nextKeyStage, current));
              setSkillFocus(getSkillOptions(subject, nextKeyStage)[0]);
            }} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white">
              <option>KS1</option>
              <option>KS2</option>
            </select>
          </label>
          <label className="block text-sm font-bold text-slate-300">
            Year group
            <select value={yearGroup} onChange={(event) => setYearGroup(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white">
              {getYearOptions(keyStage).map((year) => <option key={year}>{year}</option>)}
            </select>
          </label>
          </div>
          <label className="block text-sm font-bold text-slate-300">
            Skill focus
            <select value={skillFocus} onChange={(event) => setSkillFocus(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white">
              {getSkillOptions(subject, keyStage).map((preset) => <option key={preset}>{preset}</option>)}
            </select>
          </label>
          <label className="block text-sm font-bold text-slate-300">
            Age group
            <input value={ageGroup} onChange={(event) => setAgeGroup(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
          <label className="block text-sm font-bold text-slate-300">
            Difficulty: {difficulty} / {subject === "reading" ? 10 : 5}
            <input type="range" min={1} max={subject === "reading" ? 10 : 5} value={difficulty} onChange={(event) => setDifficulty(Number(event.target.value))} className="mt-2 w-full accent-indigo-500" />
          </label>
          <label className="block text-sm font-bold text-slate-300">
            Number of items
            <input type="number" min={1} max={30} value={items} onChange={(event) => setItems(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
          <label className="block text-sm font-bold text-slate-300">
            Topic / theme
            <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="space adventure, pets, shopping, seasons" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white placeholder:text-slate-600" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <button onClick={generatePreview} disabled={loading} className="rounded-xl bg-indigo-500 px-4 py-3 font-black text-white hover:bg-indigo-400 disabled:opacity-50">
              {loading ? "Generating with AI..." : "Generate Preview"}
            </button>
            <button onClick={saveGeneratedContent} disabled={saving || saveBlocked || !approvedCount} className="rounded-xl bg-emerald-500 px-4 py-3 font-black text-white hover:bg-emerald-400 disabled:opacity-50">
              {saving ? "Saving..." : saveBlocked ? "Fix required before save" : "Save to Content Library"}
            </button>
          </div>
          {error ? <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
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

      <div className="space-y-6">
      <AdminSectionCard title="Automation" eyebrow="Smart content">
        <div className="flex flex-wrap gap-3">
          <button onClick={() => void runAutomation("autofill")} className="rounded-xl bg-blue-500 px-4 py-3 font-black text-white">Auto-fill Low Library</button>
          <button onClick={() => void runAutomation("weaknesses")} className="rounded-xl border border-slate-700 px-4 py-3 font-black text-slate-200">Detect Weak Areas</button>
        </div>
        {automationMessage ? <pre className="mt-4 max-h-48 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-300">{automationMessage}</pre> : null}
        {weakAreas.length ? (
          <div className="mt-4 space-y-3">
            {weakAreas.slice(0, 8).map((area, index) => (
              <div key={`${area.id}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-white">{area.student.name}</p>
                    <p className="text-xs text-slate-400">{area.subject} · {area.skillFocus} · {area.accuracy}% · {area.weaknessType}</p>
                  </div>
                  <button onClick={() => applyWeakArea(area)} className="rounded-xl bg-indigo-500 px-3 py-2 text-xs font-black text-white">Generate Targeted Content</button>
                </div>
              </div>
            ))}
          </div>
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

            <div className={`rounded-2xl border p-4 text-sm ${generationMeta?.validation?.repaired ? "border-amber-500/30 bg-amber-500/10 text-amber-100" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"}`}>
              {generationMeta?.validation?.repaired ? (
                <>
                  <p className="font-bold">Auto-repair applied before preview.</p>
                  <div className="mt-2 space-y-1 text-xs sm:text-sm">
                    {(generationMeta.validation.fixesApplied.length ? generationMeta.validation.fixesApplied : generationMeta.validation.errors.map(formatRepairMessage)).map((item, index) => (
                      <p key={`${item}-${index}`}>- {item}</p>
                    ))}
                    {generationMeta.validation.cached ? <p>- Loaded from cache</p> : null}
                    <p className="pt-1 font-semibold">Final set: {generationMeta.validation.finalCount} valid {skillFocus} items</p>
                  </div>
                </>
              ) : (
                <p className="font-bold">Final set is valid. No duplicates or invalid skill words detected.</p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {preview.items.map((item, index) => (
                <article key={`${String(item.id ?? "item")}-${index}`} className={`rounded-2xl border p-4 ${item.status === "rejected" ? "border-rose-500/40 bg-rose-950/30 opacity-70" : "border-slate-800 bg-slate-950/70"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-bold text-white">
                      {subject === "spelling" ? `${String((item as SpellingPreviewItem).emoji ?? "🔤")} ${String((item as SpellingPreviewItem).word ?? item.prompt ?? "")}` : String(item.prompt ?? item.question ?? item.title ?? `Item ${index + 1}`)}
                    </h3>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] font-bold text-blue-200">Item {index + 1}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{String(item.hint ?? item.explanation ?? "Review this item before saving.")}</p>
                  <p className="mt-2 text-sm text-slate-400">{String(item.sentence ?? item.sentenceContext ?? item.passage ?? "")}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => markPreviewItem(index, "approved")} className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-white">Approve</button>
                    <button type="button" onClick={() => markPreviewItem(index, "rejected")} className="rounded-xl bg-rose-500 px-3 py-2 text-xs font-black text-white">Reject</button>
                    <button type="button" onClick={() => void regenerateItem(index)} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-200">Regenerate</button>
                  </div>
                  <textarea
                    value={JSON.stringify(item, null, 2)}
                    onChange={(event) => updatePreviewItemJson(index, event.target.value)}
                    className="mt-3 min-h-44 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-xs leading-relaxed text-slate-300 outline-none"
                  />
                </article>
              ))}
            </div>
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
