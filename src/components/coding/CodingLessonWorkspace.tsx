"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import { moveCodingBlock } from "@/lib/coding/editor";
import { CODING_GRID_SIZE, CODING_STAGES, type CodingDirection, type CodingProgram, type CodingStage } from "@/lib/coding/types";

type Block = CodingProgram["blocks"][number];

type StageBrief = {
  stage: CodingStage;
  title: string;
  prompt: string;
  choices?: Array<{ id: string; label: string }>;
  goal: { x: number; y: number } | null;
  voiceHelp?: boolean;
};

type Workspace = {
  lesson: {
    id: string;
    title: string;
    pathwayTitle: string;
    courseTitle: string;
    moduleTitle: string;
    learningObjective: string;
    voiceHelp: boolean;
    yearBand: string;
    masteryCriteria: string[];
    stages: StageBrief[];
  };
  stage: CodingStage;
  completedStages: CodingStage[];
  program: CodingProgram;
  evidence: Record<string, boolean>;
  skillStatus: string;
  feedback: string | null;
  run: { frames: Array<{ x: number; y: number }>; error: string | null; reachedGoal: boolean } | null;
  teacherFeedback: string | null;
  hintCount: number;
  attemptCount: number;
  checksPassed: number;
};

const STATUS: Record<string, string> = {
  not_started: "Not started",
  learning: "Learning",
  practising: "Practising",
  mastered: "Mastered",
};

const EVIDENCE: Array<{ id: string; label: string }> = [
  { id: "prediction", label: "Prediction" },
  { id: "practical", label: "Practical task" },
  { id: "debugging", label: "Debugging" },
  { id: "explanation", label: "Explanation" },
  { id: "independent", label: "Independent challenge" },
];

function nextId(): string {
  return `b-${Math.random().toString(36).slice(2, 8)}`;
}

type Props = {
  lessonId: string;
  bookingId?: string;
  daytimePeriodId?: string;
};

export default function CodingLessonWorkspace({ lessonId, bookingId, daytimePeriodId }: Props) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [stage, setStage] = useState<CodingStage>("discover");
  const [program, setProgram] = useState<CodingProgram>({ blocks: [] });
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [choice, setChoice] = useState("");
  const [explanation, setExplanation] = useState("");
  const [tutor, setTutor] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackLabel, setPlaybackLabel] = useState<"example" | "learner" | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  const apply = useCallback((next: Workspace, message?: string | null) => {
    setWorkspace(next);
    setStage(next.stage);
    setProgram(next.program);
    if (message) setNotice(message);
  }, []);

  useEffect(() => {
    void (async () => {
      const response = await fetchWithRefreshRetry(`/api/student/coding/lessons/${lessonId}`, { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "This lesson could not be opened.");
        return;
      }
      apply(data.workspace as Workspace);
    })();
  }, [apply, lessonId]);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  function stopPlayback() {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
  }

  function play(frames: Array<{ x: number; y: number }>) {
    stopPlayback();
    if (!frames.length) return;
    setFrame(0);
    setPlaying(true);
    let index = 0;
    timer.current = window.setInterval(() => {
      index += 1;
      if (index >= frames.length) {
        stopPlayback();
        setFrame(frames.length - 1);
        return;
      }
      setFrame(index);
    }, 450);
  }

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchWithRefreshRetry(`/api/student/coding/lessons/${lessonId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, program, bookingId, daytimePeriodId, ...body }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(typeof data.error === "string" ? data.error : "That action did not work.");
      }
      if (data.workspace) apply(data.workspace as Workspace, typeof data.feedback === "string" ? data.feedback : data.message);
      if (body.action === "run") setPlaybackLabel(data.runSource === "example" ? "example" : "learner");
      if (data.tutor?.message) setTutor(data.tutor.message);
      if (data.message && body.action === "support") setNotice(data.message);
      const frames = data.run?.frames ?? data.workspace?.run?.frames;
      if (Array.isArray(frames) && (body.action === "run" || body.action === "discover")) play(frames);
      return data;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That action did not work.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function speak(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-GB";
    window.speechSynthesis.speak(utterance);
  }

  function addRepeat() {
    setProgram((current) => ({
      blocks: [...current.blocks, { id: nextId(), kind: "repeat", times: 2, body: [] }],
    }));
  }

  function addMove(direction: CodingDirection) {
    setProgram((current) => {
      if (selected) {
        const blocks = current.blocks.map((block) => {
          if (block.kind === "repeat" && block.id === selected) {
            return { ...block, body: [...block.body, { id: nextId(), kind: "move" as const, direction }] };
          }
          return block;
        });
        if (blocks.some((block, index) => block !== current.blocks[index])) return { blocks };
      }
      return { blocks: [...current.blocks, { id: nextId(), kind: "move", direction }] };
    });
  }

  function updateTimes(id: string, times: number) {
    setProgram((current) => ({
      blocks: current.blocks.map((block) => block.kind === "repeat" && block.id === id
        ? { ...block, times }
        : block),
    }));
  }

  function moveBlock(id: string, direction: "up" | "down") {
    setProgram((current) => moveCodingBlock(current, id, direction));
  }

  function removeBlock(id: string) {
    setProgram((current) => ({
      blocks: current.blocks.flatMap((block): Block[] => {
        if (block.id === id) return [];
        if (block.kind === "repeat") {
          return [{ ...block, body: block.body.filter((child) => child.id !== id) }];
        }
        return [block];
      }),
    }));
  }

  if (error && !workspace) return <p className="mx-auto max-w-3xl px-6 py-10 text-sm text-rose-700">{error}</p>;
  if (!workspace) return <p className="mx-auto max-w-3xl px-6 py-10 text-sm text-slate-600">Opening the coding lesson…</p>;

  const brief = workspace.lesson.stages.find((item) => item.stage === stage) ?? workspace.lesson.stages[0]!;
  const frames = workspace.run?.frames ?? [{ x: 0, y: 0 }];
  const position = frames[Math.min(frame, frames.length - 1)] ?? { x: 0, y: 0 };
  const goal = brief.goal;
  const instruction = `${brief.title}. ${brief.prompt}`;

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 text-slate-900">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/student/coding" className="text-xs font-bold uppercase tracking-wide text-sky-700">Coding</Link>
          <h1 className="text-2xl font-black">{workspace.lesson.title}</h1>
          <p className="text-sm text-slate-600">
            {workspace.lesson.pathwayTitle} · {workspace.lesson.courseTitle} · {workspace.lesson.moduleTitle} · {workspace.lesson.yearBand}
          </p>
        </div>
        <p className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide">
          {STATUS[workspace.skillStatus] ?? workspace.skillStatus}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CODING_STAGES.map((item) => {
          const open = item === "discover" || workspace.completedStages.includes(item) || item === workspace.stage || workspace.completedStages.includes(CODING_STAGES[CODING_STAGES.indexOf(item) - 1] as CodingStage);
          return (
            <button
              key={item}
              type="button"
              disabled={!open}
              onClick={() => void post({ action: "open", stage: item })}
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${stage === item ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-700"} disabled:opacity-40`}
            >
              {workspace.lesson.stages.find((entry) => entry.stage === item)?.title ?? item}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Instructions</h2>
          <p className="mt-2 text-sm font-semibold">{workspace.lesson.learningObjective}</p>
          <p className="mt-3 text-sm leading-6">{brief.prompt}</p>
          {workspace.lesson.voiceHelp ? (
            <button type="button" onClick={() => speak(instruction)} className="mt-3 text-sm font-bold text-sky-800">
              Read this aloud
            </button>
          ) : null}
          <ul className="mt-4 space-y-1 text-xs text-slate-600">
            {EVIDENCE.map((item) => (
              <li key={item.id}>{workspace.evidence[item.id] ? "Done" : "Still to show"} · {item.label}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">Attempts {workspace.attemptCount} · Checks passed {workspace.checksPassed} · Hints on this part {workspace.hintCount}</p>
          <p className="mt-2 text-xs text-slate-500">This project stays private to you, your teachers and your parent account.</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Blocks</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={addRepeat} className="rounded-lg bg-violet-100 px-2 py-1 text-xs font-bold text-violet-900">Add repeat</button>
            {(["right", "left", "up", "down"] as CodingDirection[]).map((direction) => (
              <button key={direction} type="button" onClick={() => addMove(direction)} className="rounded-lg bg-sky-100 px-2 py-1 text-xs font-bold text-sky-900">
                Move {direction}
              </button>
            ))}
          </div>
          <ul className="mt-3 space-y-2">
            {program.blocks.length === 0 ? <li className="text-sm text-slate-500">No blocks yet.</li> : null}
            {program.blocks.map((block, index) => (
              <BlockRow
                key={block.id}
                block={block}
                index={index}
                count={program.blocks.length}
                selected={selected}
                onSelect={setSelected}
                onTimes={updateTimes}
                onMove={moveBlock}
                onRemove={removeBlock}
              />
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-600">Use Up and Down to change the order. A block stays inside its Repeat.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {stage === "discover" || stage === "predict" ? (
              <button type="button" disabled={busy} onClick={() => void post({ action: "run", runSource: "example" })} className="rounded-xl bg-sky-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">Run the example</button>
            ) : null}
            <button type="button" disabled={busy} onClick={() => void post({ action: "run", runSource: "learner" })} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">{stage === "discover" || stage === "predict" ? "Run my blocks" : "Run"}</button>
            <button type="button" onClick={stopPlayback} className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-bold text-white">Stop</button>
            <button type="button" disabled={busy} onClick={() => void post({ action: "save" })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-60">Save</button>
            <button type="button" disabled={busy} onClick={() => void post({ action: "undo" })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-60">Undo</button>
            <button type="button" disabled={busy} onClick={() => void post({ action: "restore" })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-60">Restore starter</button>
          </div>
          {stage === "discover" ? (
            <button type="button" disabled={busy} onClick={() => void post({ action: "discover" })} className="mt-3 text-sm font-bold text-sky-800">I can see the goal</button>
          ) : null}
          {stage === "predict" && brief.choices ? (
            <fieldset className="mt-3 space-y-1">
              <legend className="text-sm font-semibold">Your prediction</legend>
              {brief.choices.map((item) => (
                <label key={item.id} className="flex gap-2 text-sm">
                  <input type="radio" name="predict" checked={choice === item.id} onChange={() => setChoice(item.id)} />
                  {item.label}
                </label>
              ))}
              <button type="button" disabled={busy || !choice} onClick={() => void post({ action: "predict", choiceId: choice })} className="mt-2 rounded-xl bg-sky-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">
                Check my prediction
              </button>
            </fieldset>
          ) : null}
          {stage === "review" ? (
            <div className="mt-3">
              <label className="text-sm font-semibold" htmlFor="coding-explanation">Your explanation</label>
              <textarea id="coding-explanation" value={explanation} onChange={(event) => setExplanation(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-sm" rows={4} />
              <button type="button" disabled={busy} onClick={() => void post({ action: "review", explanation })} className="mt-2 rounded-xl bg-sky-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">
                Send explanation
              </button>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Output</h2>
          <div className="mt-3 grid grid-cols-6 gap-1" aria-label="Program output">
            {Array.from({ length: CODING_GRID_SIZE * CODING_GRID_SIZE }, (_, index) => {
              const x = index % CODING_GRID_SIZE;
              const y = CODING_GRID_SIZE - 1 - Math.floor(index / CODING_GRID_SIZE);
              const here = position.x === x && position.y === y;
              const star = goal?.x === x && goal?.y === y;
              return (
                <div key={`${x}-${y}`} className="flex h-8 items-center justify-center rounded bg-slate-100 text-base">
                  {here ? "🙂" : star ? "⭐" : ""}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {playbackLabel === "example"
              ? (playing ? "Running the lesson example" : "Showing the lesson example")
              : playbackLabel === "learner"
                ? (playing ? "Running your program" : "Showing your program")
                : (playing ? "Running…" : "Stopped")}
            {" · "}column {position.x}, row {position.y}
          </p>
          {stage === "discover" || stage === "predict" ? (
            <p className="mt-1 text-xs text-slate-600">The example is the lesson. Your program is the blocks you built.</p>
          ) : null}
          <div role="status" className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
            {error ?? notice ?? workspace.feedback ?? "Run the blocks to see what happens."}
          </div>
          {workspace.teacherFeedback ? (
            <p className="mt-3 text-sm"><span className="font-bold">Teacher: </span>{workspace.teacherFeedback}</p>
          ) : null}
        </section>
      </div>

      <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
        <h2 className="text-sm font-black uppercase tracking-wide text-violet-800">Coding tutor</h2>
        <p className="mt-1 text-sm text-violet-950">The tutor asks a question before it shows a fuller hint. It uses the blocks you have now.</p>
        {tutor ? <p className="mt-2 text-sm">{tutor}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void post({ action: "hint" })} className="rounded-xl bg-violet-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">
            Ask for a hint
          </button>
          <button type="button" disabled={busy} onClick={() => void post({ action: "support" })} className="rounded-xl border border-violet-400 px-3 py-2 text-sm font-bold text-violet-900 disabled:opacity-60">
            Ask a person
          </button>
        </div>
      </section>
    </div>
  );
}

function OrderButtons({
  id,
  index,
  count,
  onMove,
}: {
  id: string;
  index: number;
  count: number;
  onMove: (id: string, direction: "up" | "down") => void;
}) {
  return (
    <span className="flex gap-1">
      <button type="button" aria-label="Move this block up" disabled={index === 0} onClick={() => onMove(id, "up")} className="rounded bg-white px-2 py-1 text-xs font-bold text-slate-800 disabled:opacity-40">Up</button>
      <button type="button" aria-label="Move this block down" disabled={index >= count - 1} onClick={() => onMove(id, "down")} className="rounded bg-white px-2 py-1 text-xs font-bold text-slate-800 disabled:opacity-40">Down</button>
    </span>
  );
}

function BlockRow({
  block,
  index,
  count,
  selected,
  onSelect,
  onTimes,
  onMove,
  onRemove,
}: {
  block: Block;
  index: number;
  count: number;
  selected: string | null;
  onSelect: (id: string) => void;
  onTimes: (id: string, times: number) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onRemove: (id: string) => void;
}) {
  if (block.kind === "move") {
    return (
      <li className="flex items-center justify-between gap-2 rounded-lg bg-sky-50 px-2 py-1 text-sm">
        <span>Move {block.direction}</span>
        <span className="flex items-center gap-2">
          <OrderButtons id={block.id} index={index} count={count} onMove={onMove} />
          <button type="button" onClick={() => onRemove(block.id)} className="text-xs font-bold text-rose-700">Remove</button>
        </span>
      </li>
    );
  }
  return (
    <li className={`rounded-lg border px-2 py-2 text-sm ${selected === block.id ? "border-violet-500 bg-violet-50" : "border-violet-200"}`}>
      <div className="flex items-center justify-between gap-2">
        <span>
          <button type="button" onClick={() => onSelect(block.id)} className="font-bold">Repeat</button>
          <label className="ml-2 text-xs">
            times
            <input
              type="number"
              min={0}
              max={8}
              value={block.times}
              onChange={(event) => onTimes(block.id, Number(event.target.value))}
              className="ml-1 w-14 rounded border border-slate-300 px-1"
            />
          </label>
        </span>
        <span className="flex items-center gap-2">
          <OrderButtons id={block.id} index={index} count={count} onMove={onMove} />
          <button type="button" onClick={() => onRemove(block.id)} className="text-xs font-bold text-rose-700">Remove</button>
        </span>
      </div>
      <ul className="mt-2 space-y-1 pl-3">
        {block.body.length === 0 ? <li className="text-xs text-slate-500">Put a move inside this repeat.</li> : null}
        {block.body.map((child, childIndex) => (
          <BlockRow
            key={child.id}
            block={child}
            index={childIndex}
            count={block.body.length}
            selected={selected}
            onSelect={onSelect}
            onTimes={onTimes}
            onMove={onMove}
            onRemove={onRemove}
          />
        ))}
      </ul>
    </li>
  );
}
