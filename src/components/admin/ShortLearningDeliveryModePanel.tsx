"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { skillsForSubjectAndYear, type Subject } from "@/lib/curriculum";
import { SHORT_LEARNING_ADMIN_DURATIONS } from "@/lib/schools/short-learning-session-plan";

type SchoolOption = { id: string; name: string };

type Props = {
  onDaySchoolSelected?: () => void;
  onShortLearningSelected?: () => void;
  onLessonPackImportSelected?: () => void;
};

const YEAR_GROUPS = [
  "Year 1",
  "Year 2",
  "Year 3",
  "Year 4",
  "Year 5",
  "Year 6",
  "Year 7",
  "Year 8",
  "Year 9",
  "Year 10",
  "Year 11",
] as const;

const SUBJECTS = [
  { value: "maths", label: "Maths" },
  { value: "english", label: "English" },
  { value: "science", label: "Science" },
  { value: "spelling", label: "Spelling" },
  { value: "reading", label: "Reading" },
] as const;

const DIFFICULTY_LEVELS = [
  { value: 1, label: "1 · Foundation" },
  { value: 2, label: "2 · Developing" },
  { value: 3, label: "3 · Expected" },
  { value: 4, label: "4 · Secure" },
  { value: 5, label: "5 · Challenge" },
] as const;

/** Map Short Learning delivery subjects onto curriculum skill catalogues. */
function curriculumSubjectForTopics(subject: string): Subject {
  if (subject === "english") return "reading";
  if (subject === "maths" || subject === "science" || subject === "spelling" || subject === "reading") {
    return subject;
  }
  return "maths";
}

const fieldClassName =
  "w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400 [color-scheme:dark]";
/** Native OS dropdown menus are light; keep option text dark so values stay readable. */
const optionClassName = "bg-white text-slate-900";
const labelClassName = "mb-1 block text-xs font-black uppercase tracking-[0.14em] text-slate-300";

export default function ShortLearningDeliveryModePanel({
  onDaySchoolSelected,
  onShortLearningSelected,
  onLessonPackImportSelected,
}: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialMode =
    searchParams.get("deliveryMode") === "SHORT_LEARNING"
      ? "SHORT_LEARNING"
      : searchParams.get("deliveryMode") === "LESSON_PACK_IMPORT"
        ? "LESSON_PACK_IMPORT"
        : "DAY_SCHOOL";
  const [deliveryMode, setDeliveryMode] = useState<"DAY_SCHOOL" | "SHORT_LEARNING" | "LESSON_PACK_IMPORT">(initialMode);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [schoolId, setSchoolId] = useState(searchParams.get("schoolId") ?? "");
  const [subject, setSubject] = useState("maths");
  const [yearGroup, setYearGroup] = useState("Year 4");
  const [difficulty, setDifficulty] = useState(3);
  const [topic, setTopic] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<90 | 120>(90);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);

  const durationOptions = useMemo(() => [...SHORT_LEARNING_ADMIN_DURATIONS], []);
  const topicOptions = useMemo(
    () => [...skillsForSubjectAndYear(curriculumSubjectForTopics(subject), yearGroup)],
    [subject, yearGroup],
  );
  const selectedTopic = topicOptions.includes(topic) ? topic : (topicOptions[0] ?? "");

  useEffect(() => {
    if (deliveryMode !== "SHORT_LEARNING") return;
    fetch("/api/admin/schools")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load schools");
        const data = await res.json();
        const list = (data.schools ?? data.data?.schools ?? data.items ?? []) as SchoolOption[];
        setSchools(Array.isArray(list) ? list.map((s) => ({ id: s.id, name: s.name })) : []);
      })
      .catch(() => setSchools([]));
  }, [deliveryMode]);

  async function generate() {
    setBusy(true);
    setError(null);
    setResultId(null);
    try {
      const res = await fetch("/api/admin/short-learning/journeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId,
          subject,
          yearGroup,
          difficulty,
          topic: selectedTopic || undefined,
          skillFocus: selectedTopic || undefined,
          durationMinutes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setResultId(data.journey?.id ?? null);
      if (data.journey?.id) {
        router.push(`/admin/short-learning/journeys/${data.journey.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-700 bg-slate-950/70 p-5">
      <h2 className="text-lg font-semibold text-white">Delivery mode</h2>
      <p className="mt-1 text-sm text-slate-300">
        One shared OpenAI Daytime engine. Short Learning and bulk lesson-pack imports enter Admin review — never auto-published.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
            deliveryMode === "DAY_SCHOOL"
              ? "border-cyan-400 bg-cyan-500/15 text-white"
              : "border-slate-600 bg-slate-900 text-slate-200 hover:border-slate-500"
          }`}
          onClick={() => {
            setDeliveryMode("DAY_SCHOOL");
            onDaySchoolSelected?.();
          }}
        >
          Day School
        </button>
        <button
          type="button"
          className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
            deliveryMode === "SHORT_LEARNING"
              ? "border-cyan-400 bg-cyan-500/15 text-white"
              : "border-slate-600 bg-slate-900 text-slate-200 hover:border-slate-500"
          }`}
          onClick={() => {
            setDeliveryMode("SHORT_LEARNING");
            onShortLearningSelected?.();
          }}
        >
          Short Learning
        </button>
        <button
          type="button"
          className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
            deliveryMode === "LESSON_PACK_IMPORT"
              ? "border-cyan-400 bg-cyan-500/15 text-white"
              : "border-slate-600 bg-slate-900 text-slate-200 hover:border-slate-500"
          }`}
          onClick={() => {
            setDeliveryMode("LESSON_PACK_IMPORT");
            onLessonPackImportSelected?.();
          }}
        >
          Import Complete Lesson Pack
        </button>
      </div>

      {deliveryMode === "SHORT_LEARNING" ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className={labelClassName}>School</span>
            <select
              className={fieldClassName}
              value={schoolId}
              onChange={(e) => setSchoolId(e.target.value)}
            >
              <option value="" className={optionClassName}>
                Select school…
              </option>
              {schools.map((s) => (
                <option key={s.id} value={s.id} className={optionClassName}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className={labelClassName}>Subject</span>
            <select
              className={fieldClassName}
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setTopic("");
              }}
            >
              {SUBJECTS.map((item) => (
                <option key={item.value} value={item.value} className={optionClassName}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className={labelClassName}>Year group</span>
            <select
              className={fieldClassName}
              value={yearGroup}
              onChange={(e) => {
                setYearGroup(e.target.value);
                setTopic("");
              }}
            >
              {YEAR_GROUPS.map((year) => (
                <option key={year} value={year} className={optionClassName}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className={labelClassName}>Year difficulty level</span>
            <select
              className={fieldClassName}
              value={difficulty}
              onChange={(e) => setDifficulty(Number(e.target.value))}
            >
              {DIFFICULTY_LEVELS.map((level) => (
                <option key={level.value} value={level.value} className={optionClassName}>
                  {level.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className={labelClassName}>Duration</span>
            <select
              className={fieldClassName}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value) as 90 | 120)}
            >
              {durationOptions.map((d) => (
                <option key={d} value={d} className={optionClassName}>
                  {d} minutes
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-400">105 minutes is not available.</span>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className={labelClassName}>Curriculum topic / objective</span>
            <select
              className={fieldClassName}
              value={selectedTopic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={!topicOptions.length}
            >
              {!topicOptions.length ? (
                <option value="" className={optionClassName}>
                  No topics for this subject and year
                </option>
              ) : (
                topicOptions.map((option) => (
                  <option key={option} value={option} className={optionClassName}>
                    {option}
                  </option>
                ))
              )}
            </select>
          </label>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy || !schoolId || !subject || !yearGroup || !selectedTopic}
              onClick={() => void generate()}
              className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {busy ? "Generating with OpenAI…" : "Generate Short Learning journey"}
            </button>
            <Link
              href="/admin/short-learning/journeys?status=awaiting_review"
              className="text-sm font-medium text-cyan-300 underline hover:text-cyan-200"
            >
              Open awaiting review
            </Link>
          </div>
          {error ? <p className="sm:col-span-2 text-sm text-rose-300">{error}</p> : null}
          {resultId ? (
            <p className="sm:col-span-2 text-sm text-emerald-300">
              Journey created for review: {resultId}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-300">
          Day School keeps the existing AI Generator behaviour below (and timetable Daytime generation/approval).
        </p>
      )}
    </div>
  );
}
