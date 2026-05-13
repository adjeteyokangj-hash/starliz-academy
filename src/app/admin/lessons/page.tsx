"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import { AGE_GROUPS, KEY_STAGES, YEAR_GROUPS, ageGroupForYearGroup, keyStageForYearGroup, subjectsForYearGroup, skillsForSubjectAndYear, type Subject, type YearGroup } from "@/lib/curriculum";
import { buildLessonPathway, LESSON_DIFFICULTY_BANDS, LESSON_STATUS_OPTIONS, LESSON_TEMPLATES, type LessonDifficultyBand, type LessonTemplateValue, type LessonPathwayStep } from "@/lib/lesson-curriculum";

type ContentItem = {
  id: string;
  contentType: string;
  level: number;
  topic: string;
  status: string;
  skillFocus?: string | null;
  yearGroup?: string | null;
  keyStage?: string | null;
  createdAt: string;
};

type Lesson = {
  id: string;
  title: string;
  subject: string;
  yearGroup?: string | null;
  keyStage?: string | null;
  ageGroup?: string | null;
  skillFocus?: string | null;
  template?: string | null;
  pathway?: string | null;
  objectives?: string | null;
  difficultyBand?: string | null;
  difficulty: number;
  status: string;
  contentRefs?: string | null;
  skills?: string | null;
  createdAt: string;
  updatedAt: string;
};

type LessonFormState = {
  title: string;
  subject: Subject;
  yearGroup: YearGroup;
  keyStage: (typeof KEY_STAGES)[number];
  ageGroup: string;
  skillFocus: string;
  template: LessonTemplateValue;
  pathway: LessonPathwayStep[];
  objectives: string;
  difficultyBand: LessonDifficultyBand;
  difficulty: number;
  status: (typeof LESSON_STATUS_OPTIONS)[number];
  selectedContentIds: string[];
};

const defaultYearGroup = "Year 3" as YearGroup;

const emptyForm = (): LessonFormState => {
  const subject = "reading" as Subject;
  const yearGroup = defaultYearGroup;
  const template = "reading-comprehension" as LessonTemplateValue;
  return {
    title: "",
    subject,
    yearGroup,
    keyStage: keyStageForYearGroup(yearGroup),
    ageGroup: ageGroupForYearGroup(yearGroup),
    skillFocus: "",
    template,
    pathway: buildLessonPathway(template),
    objectives: "",
    difficultyBand: "core",
    difficulty: 1,
    status: "draft",
    selectedContentIds: [],
  };
};

export default function LessonsPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [contentSearch, setContentSearch] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const [aiBuilding, setAiBuilding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const availableSubjects = useMemo(() => subjectsForYearGroup(form.yearGroup), [form.yearGroup]);
  const availableSkills = useMemo(() => {
    const skills = skillsForSubjectAndYear(form.subject, form.yearGroup);
    return skillSearch.trim()
      ? skills.filter((skill) => skill.toLowerCase().includes(skillSearch.toLowerCase()))
      : skills;
  }, [form.subject, form.yearGroup, skillSearch]);
  const availablePathway = useMemo(() => buildLessonPathway(form.template), [form.template]);

  // ------------------------------------------------------------------
  // Data loading
  // ------------------------------------------------------------------
  const loadLessons = useCallback(async () => {
    const res = await fetch("/api/admin/resources/lessons?orderBy=createdAt&dir=desc");
    if (!res.ok) return;
    const data = (await res.json()) as { records: Lesson[] };
    setLessons(data.records ?? []);
  }, []);

  const loadContent = useCallback(
    async (subject: Subject, yearGroup: YearGroup, skillFocus: string) => {
      const type = subject === "maths" ? "math" : subject === "gcse-maths" ? "math" : subject === "science" || subject === "gcse-science" ? "math" : subject;
      const params = new URLSearchParams({ type });
      params.set("yearGroup", yearGroup);
      params.set("keyStage", keyStageForYearGroup(yearGroup));
      if (skillFocus.trim()) params.set("skill", skillFocus.trim());
      if (contentSearch.trim()) params.set("search", contentSearch.trim());
      const res = await fetch(`/api/admin/content?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { items: ContentItem[] };
      setContentItems(data.items ?? []);
    },
    [contentSearch],
  );

  function syncCurriculum(nextYearGroup: YearGroup, nextSubject?: Subject) {
    const nextKeyStage = keyStageForYearGroup(nextYearGroup);
    const nextAgeGroup = ageGroupForYearGroup(nextYearGroup);
    const subject = (nextSubject ?? subjectsForYearGroup(nextYearGroup)[0] ?? "reading") as Subject;
    const subjectSkills = skillsForSubjectAndYear(subject, nextYearGroup);
    setForm((prev) => ({
      ...prev,
      yearGroup: nextYearGroup,
      keyStage: nextKeyStage,
      ageGroup: nextAgeGroup,
      subject,
      skillFocus: subjectSkills.includes(prev.skillFocus) ? prev.skillFocus : subjectSkills[0] ?? "",
      selectedContentIds: prev.selectedContentIds,
      pathway: buildLessonPathway(prev.template),
    }));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLessons();
  }, [loadLessons]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadContent(form.subject, form.yearGroup, form.skillFocus);
  }, [form.subject, form.yearGroup, form.skillFocus, loadContent]);

  // ------------------------------------------------------------------
  // Form helpers
  // ------------------------------------------------------------------
  function setField<K extends keyof ReturnType<typeof emptyForm>>(key: K, value: ReturnType<typeof emptyForm>[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleContentId(id: string) {
    setForm((prev) => ({
      ...prev,
      selectedContentIds: prev.selectedContentIds.includes(id)
        ? prev.selectedContentIds.filter((x) => x !== id)
        : [...prev.selectedContentIds, id],
    }));
  }

  function startEdit(lesson: Lesson) {
    setEditingId(lesson.id);
    const ids = lesson.contentRefs
      ? lesson.contentRefs
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const yearGroup = (lesson.yearGroup ?? defaultYearGroup) as YearGroup;
    const subject = (subjectsForYearGroup(yearGroup).includes(lesson.subject as Subject) ? lesson.subject : "reading") as Subject;
    const template = (lesson.template as LessonTemplateValue) ?? "reading-comprehension";
    const pathway = lesson.pathway ? (JSON.parse(lesson.pathway) as LessonPathwayStep[]) : buildLessonPathway(template);
    setForm({
      title: lesson.title,
      subject,
      yearGroup,
      keyStage: (lesson.keyStage ?? keyStageForYearGroup(yearGroup)) as (typeof KEY_STAGES)[number],
      ageGroup: lesson.ageGroup ?? "",
      skillFocus: lesson.skillFocus ?? "",
      template,
      pathway,
      objectives: lesson.objectives ?? "",
      difficultyBand: (lesson.difficultyBand as LessonDifficultyBand) ?? "core",
      difficulty: lesson.difficulty,
      status: lesson.status,
      selectedContentIds: ids,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setMsg(null);
  }

  // ------------------------------------------------------------------
  // Save / Delete
  // ------------------------------------------------------------------
  async function save() {
    if (!form.title.trim()) {
      setMsg({ text: "Lesson title is required.", ok: false });
      return;
    }
    setBusy(true);
    setMsg(null);
    const body = {
      title: form.title.trim(),
      subject: form.subject,
      yearGroup: form.yearGroup,
      keyStage: form.keyStage,
      ageGroup: form.ageGroup.trim() || null,
      skillFocus: form.skillFocus.trim() || null,
      template: form.template,
      pathway: JSON.stringify(form.pathway),
      objectives: form.objectives.trim() || null,
      difficultyBand: form.difficultyBand,
      difficulty: form.difficulty,
      status: form.status,
      contentRefs: form.selectedContentIds.join(",") || null,
      skills: form.skillFocus.trim() || null,
    };
    const url = editingId ? `/api/admin/resources/lessons/${editingId}` : "/api/admin/resources/lessons";
    const res = await fetch(url, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      setMsg({ text: err.error ?? "Could not save. Check the required fields.", ok: false });
      return;
    }
    setMsg({ text: editingId ? "Lesson updated." : "Lesson created.", ok: true });
    cancelEdit();
    await loadLessons();
  }

  async function buildWithAi() {
    setAiBuilding(true);
    setMsg(null);
    try {
      const response = await fetch("/api/admin/lessons/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim() || undefined,
          subject: form.subject,
          yearGroup: form.yearGroup,
          skillFocus: form.skillFocus.trim() || undefined,
          template: form.template,
          difficultyBand: form.difficultyBand,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; draft?: Record<string, unknown>; error?: string };
      if (!response.ok || !payload.ok || !payload.draft) {
        setMsg({ text: payload.error ?? "Could not build lesson.", ok: false });
        return;
      }

      const draft = payload.draft;
      const linkedContent = Array.isArray(draft.linkedContentSuggestions) ? (draft.linkedContentSuggestions as ContentItem[]) : [];
      setForm((prev) => ({
        ...prev,
        title: String(draft.title ?? prev.title),
        objectives: String(draft.objective ?? draft.objectives ?? prev.objectives),
        pathway: Array.isArray(draft.pathway) ? (draft.pathway as LessonPathwayStep[]) : prev.pathway,
        skillFocus: String(draft.skillFocus ?? prev.skillFocus),
        yearGroup: (draft.yearGroup as YearGroup) ?? prev.yearGroup,
        keyStage: (draft.keyStage as (typeof KEY_STAGES)[number]) ?? prev.keyStage,
        ageGroup: String(draft.ageGroup ?? prev.ageGroup),
        selectedContentIds: linkedContent.map((item) => item.id),
      }));
      setMsg({ text: payload.source === "openai" ? "Built lesson with AI." : "Built lesson draft from curriculum fallback.", ok: true });
    } finally {
      setAiBuilding(false);
    }
  }

  async function remove(id: string, title: string) {
    if (!window.confirm(`Delete lesson "${title}"? This cannot be undone.`)) return;
    setBusy(true);
    await fetch(`/api/admin/resources/lessons/${id}`, { method: "DELETE" });
    setBusy(false);
    await loadLessons();
  }

  const filteredContent = contentItems.filter((item) => !contentSearch.trim() || item.topic.toLowerCase().includes(contentSearch.toLowerCase()) || (item.skillFocus ?? "").toLowerCase().includes(contentSearch.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-white">Lessons</h1>
          <p className="mt-1 max-w-2xl text-slate-400">Curriculum-aware lesson orchestration for Reception to Year 11 with templates, linked content, and AI draft building.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/ai-generator" className="rounded-2xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm font-bold text-violet-300 hover:bg-violet-500/20">Open AI Generator</Link>
          <button type="button" onClick={() => void buildWithAi()} disabled={aiBuilding} className="rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-60">{aiBuilding ? "Building…" : "Build lesson with AI"}</button>
        </div>
      </div>

      <AdminSectionCard title={editingId ? "Edit Lesson" : "Create New Lesson"}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Lesson Title *</span>
            <input className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-violet-500" placeholder="e.g. Year 6 Fractions Mastery" value={form.title} onChange={(e) => setField("title", e.target.value)} />
          </label>
          <label><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Year Group</span><select className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-violet-500" value={form.yearGroup} onChange={(e) => syncCurriculum(e.target.value as YearGroup, form.subject)}>{YEAR_GROUPS.map((yearGroup) => <option key={yearGroup} value={yearGroup}>{yearGroup}</option>)}</select></label>
          <label><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Key Stage</span><select className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-violet-500" value={form.keyStage} onChange={(e) => setField("keyStage", e.target.value as (typeof KEY_STAGES)[number])}>{KEY_STAGES.map((keyStage) => <option key={keyStage} value={keyStage}>{keyStage}</option>)}</select></label>
          <label><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Age Group</span><select className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-violet-500" value={form.ageGroup} onChange={(e) => setField("ageGroup", e.target.value)}>{AGE_GROUPS.map((ageGroup) => <option key={ageGroup} value={ageGroup}>{ageGroup}</option>)}</select></label>
          <label><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Subject</span><select className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-violet-500" value={form.subject} onChange={(e) => syncCurriculum(form.yearGroup, e.target.value as Subject)}>{availableSubjects.map((subject) => <option key={subject} value={subject}>{subject.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</option>)}</select></label>
          <label><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Skill Focus</span><input className="mb-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-violet-500" placeholder="Search skills…" value={skillSearch} onChange={(e) => setSkillSearch(e.target.value)} /><select className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-violet-500" value={form.skillFocus} onChange={(e) => setField("skillFocus", e.target.value)}><option value="">Select a skill focus…</option>{availableSkills.map((skill) => <option key={skill} value={skill}>{skill}</option>)}</select></label>
          <label><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Lesson Template</span><select className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-violet-500" value={form.template} onChange={(e) => setForm((prev) => ({ ...prev, template: e.target.value as LessonTemplateValue, pathway: buildLessonPathway(e.target.value as LessonTemplateValue) }))}>{LESSON_TEMPLATES.map((template) => <option key={template.value} value={template.value}>{template.label}</option>)}</select></label>
          <label><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Difficulty Band</span><select className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-violet-500" value={form.difficultyBand} onChange={(e) => setField("difficultyBand", e.target.value as LessonDifficultyBand)}>{LESSON_DIFFICULTY_BANDS.map((band) => <option key={band} value={band}>{band}</option>)}</select></label>
          <label><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Difficulty — <span className="text-violet-300">{form.difficulty}</span></span><input type="range" min={1} max={10} value={form.difficulty} onChange={(e) => setField("difficulty", Number(e.target.value))} className="w-full accent-violet-500" /></label>
          <label><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Status</span><select className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-violet-500" value={form.status} onChange={(e) => setField("status", e.target.value as LessonFormState["status"]) }>{LESSON_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}</select></label>
          <label className="md:col-span-2"><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Lesson Objective</span><textarea className="min-h-24 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-violet-500" value={form.objectives} onChange={(e) => setField("objectives", e.target.value)} placeholder="What should the learner be able to do by the end of the lesson?" /></label>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs font-bold uppercase tracking-widest text-slate-500">Lesson Pathway</span><span className="text-xs text-slate-500">{form.template}</span></div>
            <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">{availablePathway.map((step, index) => <button key={step} type="button" onClick={() => setForm((prev) => ({ ...prev, pathway: prev.pathway.includes(step) ? prev.pathway.filter((item) => item !== step) : [...prev.pathway, step] }))} className={`rounded-full px-3 py-1 text-xs font-bold ${form.pathway.includes(step) ? "bg-cyan-500 text-slate-950" : "bg-white/5 text-slate-300"}`}>{index + 1}. {step}</button>)}</div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs font-bold uppercase tracking-widest text-slate-500">Linked Content</span><button type="button" onClick={() => void loadContent(form.subject, form.yearGroup, form.skillFocus)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white">Refresh</button></div>
            <input className="mb-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none" placeholder="Filter by topic or skill…" value={contentSearch} onChange={(e) => setContentSearch(e.target.value)} />
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-2xl border border-white/10 p-2">{filteredContent.map((item) => { const selected = form.selectedContentIds.includes(item.id); return (<button key={item.id} type="button" onClick={() => toggleContentId(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${selected ? "bg-violet-600/30 text-white" : "text-slate-300 hover:bg-white/5"}`}><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${selected ? "border-violet-500 bg-violet-500 text-white" : "border-white/20"}`}>{selected ? "✓" : ""}</span><span className="min-w-0 flex-1 truncate font-medium">{item.topic || "(no topic)"} {item.skillFocus ? <span className="text-slate-500">· {item.skillFocus}</span> : null}</span><span className="shrink-0 text-xs text-slate-500">Lv {item.level}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${item.status === "published" ? "bg-emerald-500/20 text-emerald-300" : item.status === "approved" ? "bg-sky-500/20 text-sky-300" : "bg-slate-500/20 text-slate-400"}`}>{item.status}</span></button>); })}{!filteredContent.length ? <p className="px-3 py-6 text-center text-sm text-slate-500">No linked content found for this curriculum slice.</p> : null}</div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3"><button type="button" onClick={() => void save()} disabled={busy} className="rounded-2xl bg-violet-500 px-6 py-3 font-bold text-white disabled:opacity-60 hover:bg-violet-400">{busy ? "Saving…" : editingId ? "Update Lesson" : "Create Lesson"}</button>{editingId ? <button type="button" onClick={cancelEdit} className="rounded-2xl border border-white/10 px-6 py-3 font-bold text-slate-200 hover:bg-white/5">Cancel</button> : null}{msg ? <span className={`text-sm ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}>{msg.text}</span> : null}</div>
      </AdminSectionCard>

      <AdminSectionCard title="All Lessons">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-widest text-slate-500"><tr><th className="px-3 py-2">Title</th><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Year</th><th className="px-3 py-2">Key Stage</th><th className="px-3 py-2">Skill</th><th className="px-3 py-2">Difficulty</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Linked</th><th className="px-3 py-2">Updated</th><th className="px-3 py-2">Actions</th></tr></thead>
            <tbody className="divide-y divide-white/10 text-slate-300">{lessons.map((lesson) => { const refs = lesson.contentRefs ? lesson.contentRefs.split(",").map((s) => s.trim()).filter(Boolean) : []; return (<tr key={lesson.id} className="hover:bg-white/5"><td className="px-3 py-3 font-semibold text-white">{lesson.title}</td><td className="px-3 py-3 capitalize">{lesson.subject}</td><td className="px-3 py-3">{lesson.yearGroup ?? "—"}</td><td className="px-3 py-3">{lesson.keyStage ?? "—"}</td><td className="px-3 py-3 text-slate-400">{lesson.skillFocus ?? "—"}</td><td className="px-3 py-3">{lesson.difficultyBand ?? "core"} · {lesson.difficulty}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${lesson.status === "completed" ? "bg-emerald-500/20 text-emerald-300" : lesson.status === "assigned" ? "bg-cyan-500/20 text-cyan-300" : lesson.status === "ready" ? "bg-sky-500/20 text-sky-300" : lesson.status === "archived" ? "bg-amber-500/20 text-amber-300" : "bg-slate-500/20 text-slate-400"}`}>{lesson.status}</span></td><td className="px-3 py-3 text-slate-400">{refs.length}</td><td className="px-3 py-3 text-slate-400">{new Date(lesson.updatedAt).toLocaleDateString()}</td><td className="px-3 py-3"><div className="flex gap-2"><button type="button" onClick={() => startEdit(lesson)} className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10">Edit</button><button type="button" onClick={() => void remove(lesson.id, lesson.title)} className="rounded-xl border border-rose-400/30 px-3 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-500/10">Delete</button></div></td></tr>); })}{!lessons.length ? <tr><td colSpan={10} className="px-3 py-10 text-center text-slate-500">No lessons yet. Build the first lesson above.</td></tr> : null}</tbody>
          </table>
        </div>
      </AdminSectionCard>
    </div>
  );
}
