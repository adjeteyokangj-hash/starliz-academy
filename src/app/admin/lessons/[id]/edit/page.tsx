"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type Lesson = {
  id: string;
  title: string;
  subject: string;
  ageGroup: string | null;
  difficulty: number;
  status: string;
  contentRefs: string | null;
  skills: string | null;
};

const inputCls = "w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 py-3 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 transition";

export default function EditLessonPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("spelling");
  const [ageGroup, setAgeGroup] = useState("");
  const [difficulty, setDifficulty] = useState("1");
  const [status, setStatus] = useState("draft");
  const [contentRefs, setContentRefs] = useState("");
  const [skills, setSkills] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/resources/lessons`)
      .then((r) => r.ok ? r.json() : null)
      .then((payload) => {
        const found = (payload?.records ?? []).find((l: Lesson) => l.id === id);
        if (found) {
          setLesson(found);
          setTitle(found.title);
          setSubject(found.subject);
          setAgeGroup(found.ageGroup ?? "");
          setDifficulty(String(found.difficulty));
          setStatus(found.status);
          setContentRefs(found.contentRefs ?? "");
          setSkills(found.skills ?? "");
        }
      });
  }, [id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/admin/resources/lessons/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        subject,
        ageGroup: ageGroup || null,
        difficulty: Number(difficulty),
        status,
        contentRefs: contentRefs || null,
        skills: skills || null,
      }),
    });
    setSaving(false);
    const payload = await res.json();
    if (!res.ok) { setError(payload.error ?? "Unable to save lesson."); return; }
    router.replace(`/admin/lessons/${id}`);
  }

  if (!lesson) return <AdminSectionCard title="Edit Lesson"><p className="text-sm text-slate-400">Loading…</p></AdminSectionCard>;

  return (
    <AdminSectionCard title="Edit Lesson" eyebrow="Lessons">
      <form onSubmit={submit} className="max-w-xl space-y-4">
        <label className="block text-sm font-bold text-slate-300">Title<input value={title} onChange={(e) => setTitle(e.target.value)} required className={`mt-1.5 ${inputCls}`} /></label>
        <label className="block text-sm font-bold text-slate-300">
          Subject
          <select value={subject} onChange={(e) => setSubject(e.target.value)} className={`mt-1.5 ${inputCls}`}>
            {["spelling", "maths", "reading"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="block text-sm font-bold text-slate-300">Age group<input value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} placeholder="e.g. 5-7" className={`mt-1.5 ${inputCls}`} /></label>
        <label className="block text-sm font-bold text-slate-300">Difficulty (1–10)<input type="number" min={1} max={10} value={difficulty} onChange={(e) => setDifficulty(e.target.value)} required className={`mt-1.5 ${inputCls}`} /></label>
        <label className="block text-sm font-bold text-slate-300">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`mt-1.5 ${inputCls}`}>
            {["draft", "published", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="block text-sm font-bold text-slate-300">Content IDs (comma-separated)<input value={contentRefs} onChange={(e) => setContentRefs(e.target.value)} placeholder="id1, id2, id3" className={`mt-1.5 ${inputCls}`} /></label>
        <label className="block text-sm font-bold text-slate-300">Skills (comma-separated)<input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="cvc, silent_e" className={`mt-1.5 ${inputCls}`} /></label>
        {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
        <div className="flex gap-3">
          <button disabled={saving} className="rounded-xl bg-indigo-600 px-5 py-3 font-black text-white hover:bg-indigo-500 disabled:opacity-60 transition">{saving ? "Saving…" : "Save Changes"}</button>
          <button type="button" onClick={() => router.back()} className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-bold text-slate-300 hover:bg-slate-800 transition">Cancel</button>
        </div>
      </form>
    </AdminSectionCard>
  );
}
