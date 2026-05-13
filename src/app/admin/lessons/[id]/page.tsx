"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type Lesson = {
  id: string;
  title: string;
  subject: string;
  yearGroup: string | null;
  keyStage: string | null;
  ageGroup: string | null;
  skillFocus: string | null;
  template: string | null;
  pathway: string | null;
  objectives: string | null;
  difficultyBand: string | null;
  difficulty: number;
  status: string;
  contentRefs: string | null;
  skills: string | null;
  createdAt: string;
  updatedAt: string;
};

const statusColors: Record<string, string> = {
  draft: "bg-slate-700 text-slate-300",
  published: "bg-green-500/15 text-green-300 border border-green-500/20",
  archived: "bg-amber-500/15 text-amber-300 border border-amber-500/20",
};

export default function LessonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/resources/lessons?search=${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((payload) => {
        const found = (payload?.records ?? []).find((l: Lesson) => l.id === id);
        if (found) setLesson(found);
        else setError("Lesson not found.");
      })
      .catch(() => setError("Unable to load lesson."));
  }, [id]);

  if (error) {
    return (
      <AdminSectionCard title="Error">
        <p className="text-sm text-slate-400">{error}</p>
        <Link href="/admin/lessons" className="mt-3 inline-block text-sm text-indigo-400 hover:underline">← Back to Lessons</Link>
      </AdminSectionCard>
    );
  }

  if (!lesson) {
    return <AdminSectionCard title="Loading…"><p className="text-sm text-slate-400">Loading lesson…</p></AdminSectionCard>;
  }

  const contentIds = lesson.contentRefs ? lesson.contentRefs.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const skillList = lesson.skills ? lesson.skills.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const pathway = lesson.pathway ? (JSON.parse(lesson.pathway) as string[]) : [];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-400">Lessons</p>
          <h1 className="mt-1 text-2xl font-black text-white">{lesson.title}</h1>
          <p className="mt-0.5 text-sm capitalize text-slate-400">{lesson.subject} · Level {lesson.difficulty}</p>
          <p className="mt-1 text-sm text-slate-500">{lesson.yearGroup ?? "No year"} · {lesson.keyStage ?? "No key stage"} · {lesson.skillFocus ?? "No skill focus"}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/admin/lessons/${id}/edit`} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 transition">Edit</Link>
          <button onClick={() => router.back()} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-slate-800 transition">← Back</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <AdminSectionCard title="Details" eyebrow="Lesson info">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-400">Status</dt><dd><span className={`rounded-full px-2.5 py-0.5 text-xs font-black capitalize ${statusColors[lesson.status] ?? "bg-slate-700 text-slate-300"}`}>{lesson.status}</span></dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Subject</dt><dd className="capitalize text-white">{lesson.subject}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Year group</dt><dd className="text-white">{lesson.yearGroup ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Key stage</dt><dd className="text-white">{lesson.keyStage ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Skill focus</dt><dd className="text-white">{lesson.skillFocus ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Template</dt><dd className="text-white">{lesson.template ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Difficulty band</dt><dd className="text-white">{lesson.difficultyBand ?? "core"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Difficulty</dt><dd className="text-white">{lesson.difficulty}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Age group</dt><dd className="text-white">{lesson.ageGroup ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Objective</dt><dd className="text-white text-right">{lesson.objectives ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Created</dt><dd className="text-white">{new Date(lesson.createdAt).toLocaleDateString()}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Updated</dt><dd className="text-white">{new Date(lesson.updatedAt).toLocaleDateString()}</dd></div>
          </dl>
        </AdminSectionCard>

        <AdminSectionCard title="Skills" eyebrow="Linked skills">
          {skillList.length === 0 ? (
            <p className="text-sm text-slate-400">No skills tagged.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {skillList.map((s) => (
                <span key={s} className="rounded-xl bg-indigo-500/15 px-3 py-1 text-xs font-bold text-indigo-300 border border-indigo-500/20">{s}</span>
              ))}
            </div>
          )}
        </AdminSectionCard>
      </div>

      <AdminSectionCard title="Content Items" eyebrow={`${contentIds.length} linked`}>
        {contentIds.length === 0 ? (
          <p className="text-sm text-slate-400">No content items linked to this lesson.</p>
        ) : (
          <div className="space-y-2">
            {contentIds.map((cid) => (
              <div key={cid} className="flex items-center justify-between rounded-xl bg-slate-950/60 px-4 py-2.5 text-sm">
                <span className="font-mono text-xs text-slate-400">{cid}</span>
                <Link href={`/admin/content-library/${cid}`} className="text-xs text-indigo-400 hover:underline">View →</Link>
              </div>
            ))}
          </div>
        )}
      </AdminSectionCard>

      <AdminSectionCard title="Lesson Pathway" eyebrow={lesson.template ?? "template"}>
        {pathway.length === 0 ? (
          <p className="text-sm text-slate-400">No lesson pathway configured.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {pathway.map((step, index) => (
              <div key={`${step}-${index}`} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                <div className="text-xs uppercase tracking-widest text-slate-500">Step {index + 1}</div>
                <div className="mt-1 font-semibold text-white">{step}</div>
              </div>
            ))}
          </div>
        )}
      </AdminSectionCard>
    </div>
  );
}
