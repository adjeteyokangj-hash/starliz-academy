"use client";

import CodingGuideTools from "@/components/coding/CodingGuideTools";
import { codingOutcome } from "@/components/coding/coding-guide-outcomes";
import StarLizHelper from "@/components/guidance/StarLizHelper";
import { lessonGuide } from "@/components/guidance/coding-guides";
import { guideEvent } from "@/components/guidance/guide";
import type { LocationId } from "@/lib/coding/world/model";
import GuidedMissionContext from "./world/GuidedMissionContext";
import { guidedHref } from "@/lib/coding/world/guided-mapping";
import WorldRouteView from "./world/WorldRouteView";

import Link from "next/link";
import CodingStudioFrame from "./CodingStudioFrame";
import CodingNextStep from "./CodingNextStep";
import BlockCommandsEditor from "./BlockCommandsEditor";
import { runCodingProgram } from "@/lib/coding/runner";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import { insertCodingBlock, moveCodingBlock, removeCodingBlock, updateCodingRepeatTimes } from "@/lib/coding/editor";
import { CODING_GRID_SIZE, CODING_MAX_DEPTH, CODING_STAGES, stageUnlocked, type CodingDirection, type CodingProgram, type CodingStage } from "@/lib/coding/types";

type Block = CodingProgram["blocks"][number];

type StageBrief = {
  stage: CodingStage;
  title: string;
  prompt: string;
  choices?: Array<{ id: string; label: string }>;
  goal: { x: number; y: number } | null;
  example?: CodingProgram | null;
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
  explainedProgram?: CodingProgram | null;
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

function LegacyLessonExample({ brief, worldLocation }: { brief: StageBrief; worldLocation?: LocationId }) {
  const result = brief.example ? runCodingProgram(brief.example, brief.goal) : null;
  const [frame, setFrame] = useState(0), [playing, setPlaying] = useState(false);
  const count = result?.frames.length ?? 0;
  useEffect(() => {
    if (!playing || !count) return;
    const timer = window.setInterval(() => setFrame(current => {
      const next = current + 1;
      if (next >= count) { setPlaying(false); return count - 1; }
      return next;
    }), 450);
    return () => window.clearInterval(timer);
  }, [playing, count]);
  const position = result?.frames[Math.min(frame, count - 1)] ?? { x: 0, y: 0 };
  return <section data-guide-target="coding-lesson-example" aria-label="Lesson Example" tabIndex={0} className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-2"><h2 className="text-base font-bold text-indigo-950">Lesson Example</h2><span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">Read only</span></div>
    <p className="mt-2 text-sm leading-5 text-slate-600">Reference example: three moves right. Your current task’s target is shown in My Program.</p>
    {result && (worldLocation ? <WorldRouteView location={worldLocation} goal={brief.goal} actors={[{ name: "Lesson example", visits: result.frames.slice(0, frame + 1) }]}/> : <div className="mt-3 grid grid-cols-6 gap-1 rounded-xl bg-slate-100 p-2" aria-label="Lesson example output">{Array.from({ length: CODING_GRID_SIZE ** 2 }, (_, index) => {
      const x = index % CODING_GRID_SIZE, y = CODING_GRID_SIZE - 1 - Math.floor(index / CODING_GRID_SIZE);
      const destination = brief.goal?.x === x && brief.goal.y === y;
      return <div key={index} className={`relative flex aspect-square items-center justify-center rounded-lg border bg-white text-xl ${destination ? "border-amber-500 ring-2 ring-amber-300" : "border-slate-200"}`} aria-label={destination ? "Example destination" : undefined}>{position.x === x && position.y === y ? "🙂" : ""}{destination && <span aria-hidden="true" className="absolute right-0 top-0 text-xs">⭐</span>}</div>;
    })}</div>)}
    <p role="status" className="mt-2 text-sm font-semibold text-indigo-900">{frame === 0 ? "Start here. Press Replay Example to watch." : frame === count - 1 && result?.reachedGoal ? "The example reached the star!" : `Move ${frame} of ${Math.max(0, count - 1)}`}</p>
    <button type="button" disabled={!result} onClick={() => { if (!playing) setFrame(0); setPlaying(!playing); }} className="mt-3 min-h-11 w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">{playing ? "Pause Example" : "Replay Example"}</button>
    {brief.example && <details className="mt-3 rounded-xl bg-indigo-50 p-3"><summary className="min-h-11 cursor-pointer text-sm font-semibold text-indigo-900">Example blocks</summary><ProgramOutline program={brief.example} /></details>}
  </section>;
}

function nextId(): string {
  return `b-${Math.random().toString(36).slice(2, 8)}`;
}

type Props = {
  lessonId: string;
  bookingId?: string;
  daytimePeriodId?: string;
  worldLocation?: LocationId;
};

export default function CodingLessonWorkspace({ lessonId, bookingId, daytimePeriodId, worldLocation }: Props) {
  const [blocksValid, setBlocksValid] = useState(true), [accessibleBlocks, setAccessibleBlocks] = useState(false);
  const [humanAssistanceEnabled, setHumanAssistanceEnabled] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [stage, setStage] = useState<CodingStage>("discover");
  const boundLearner = useRef<string | null>(null);
  const [guideLearner, setGuideLearner] = useState<string | null>(null);
  const currentStage = useRef<CodingStage>("discover");
  const [program, setProgramState] = useState<CodingProgram>({ blocks: [] });
  const programRef = useRef(program);
  const saveRequest = useRef(0);
  function setProgram(value: CodingProgram | ((current: CodingProgram) => CodingProgram)) {
    const next = typeof value === "function" ? value(programRef.current) : value;
    programRef.current = next;
    setProgramState(next);
  }
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stageMessage, setStageMessage] = useState<string | null>(null);
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const [editorNote, setEditorNote] = useState<string | null>(null);
  const [choice, setChoice] = useState("");
  const [explanation, setExplanation] = useState("");
  const [reviewResult, setReviewResult] = useState<{ passed: boolean; message: string } | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const reviewFeedback = useRef<HTMLDivElement>(null);
  const [tutor, setTutor] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackLabel, setPlaybackLabel] = useState<"example" | "learner" | null>(null);
  const [runSignature, setRunSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);
  const dirty = workspace !== null && JSON.stringify(program) !== JSON.stringify(workspace.program);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const apply = useCallback((next: Workspace, message?: string | null) => {
    if (currentStage.current !== next.stage) {
      setFrame(0);
      setPlaybackLabel(null);
      setSelected(null);
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
      setPlaying(false);
      setChoice("");
      setTutor(null);
      setNotice(null);
    }
    currentStage.current = next.stage;
    setStage(next.stage);
    setWorkspace(next);
    setProgram(next.program);
    if (next.stage === "review" && next.explainedProgram && next.run?.frames.length) {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
      setPlaying(false);
      setFrame(next.run.frames.length - 1);
      setPlaybackLabel("learner");
      setRunSignature(JSON.stringify(next.program));
    }
    setEditorNote(null);
    if (message) setNotice(message);
  }, [setChoice, setTutor, setNotice]);

  useEffect(() => {
    void (async () => {
      const query = bookingId ? `?bookingId=${encodeURIComponent(bookingId)}` : "";
      const response = await fetchWithRefreshRetry(`/api/student/coding/lessons/${lessonId}${query}`, { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      setHumanAssistanceEnabled(data.humanAssistanceEnabled === true);
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "This lesson could not be opened.");
        return;
      }
      boundLearner.current = response.headers.get("X-Coding-Learner");
      setGuideLearner(boundLearner.current);
      apply(data.workspace as Workspace);
    })();
  }, [apply, lessonId, bookingId]);

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

  async function post(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    if (!blocksValid && body.action !== "restore") { setError("Complete the connected blocks or return to accessible controls before continuing."); return null; }
    if (body.action === "open" && dirty) {
      const saved = await post({ action: "save" });
      if (!saved) return null;
    }
    const submitted = programRef.current;
    const saveId = body.action === "save" ? ++saveRequest.current : undefined;
    setBusy(true);
    setError(null);
    setNotice(null);
    setStageMessage(null);
    try {
      const response = await fetchWithRefreshRetry(`/api/student/coding/lessons/${lessonId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(boundLearner.current ? { "X-Coding-Learner": boundLearner.current } : {}) },
        body: JSON.stringify({ stage, program: submitted, bookingId, daytimePeriodId, ...body }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(typeof data.error === "string" ? data.error : "That action did not work.");
      }
      if (saveId !== undefined) {
        if (data.ok !== true || data.error || data.workspace?.lesson?.id !== lessonId ||
          data.workspace.stage !== stage || !Array.isArray(data.workspace.program?.blocks)) {
          throw new Error("The server did not confirm this save. Keep your work open and try again.");
        }
        if (saveId !== saveRequest.current || programRef.current !== submitted) return null;
      }
      if (data.workspace) apply(data.workspace as Workspace, typeof data.feedback === "string" ? data.feedback : data.message);
      const changedStage = data.workspace && data.workspace.stage !== stage;
      if (changedStage && ["run", "discover", "predict"].includes(String(body.action))) {
        const finished = workspace?.lesson.stages.find(item => item.stage === stage)?.title ?? stage;
        const next = data.workspace.lesson.stages.find((item: StageBrief) => item.stage === data.workspace.stage)?.title ?? data.workspace.stage;
        setStageMessage(`${finished} complete. You are now on ${next}. ${data.feedback ?? "Your progress has been saved."}`);
        setNotice(null);
      } else if (body.action === "open") { setStageMessage(null); setNotice(null); }
      if (body.action === "run" && !changedStage) setPlaybackLabel(data.runSource === "example" ? "example" : "learner");
      if (body.action === "run" && data.runSource === "learner" && !changedStage) setRunSignature(JSON.stringify(data.workspace?.program ?? program));
      if (data.tutor?.message) setTutor(data.tutor.message);
      if (data.message && body.action === "support") setNotice(data.message);
      const frames = data.run?.frames ?? data.workspace?.run?.frames;
      if (!changedStage && Array.isArray(frames) && body.action === "run") play(frames);
      if (changedStage || body.action === "open") requestAnimationFrame(() => { stageHeading.current?.focus(); stageHeading.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
      if (body.action === "run" && body.runSource === "learner") {
        const run = data.run ?? data.workspace?.run;
        const passed = Boolean(changedStage || run?.reachedGoal);
        guideEvent(passed ? "run" : "run-needs-work");
        if (run && ["build", "practise", "debug"].includes(stage)) codingOutcome({ kind: "run", passed, error: run.error, moved: run.frames?.length > 1 });
        if (changedStage) guideEvent("stage-passed");
      }
      if (body.action === "save") { guideEvent("save"); codingOutcome({ kind: "save", location: "lesson" }); }
      if (changedStage && body.action !== "run" || body.action === "open") guideEvent("check");
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

  async function submitReview() {
    if (busy || reviewSubmitting) return;
    if (!explanation.trim()) {
      setReviewResult({ passed: false, message: "Write your explanation first. Describe each repeat in your finished program." });
      reviewFeedback.current?.focus();
      return;
    }
    setReviewSubmitting(true);
    setReviewResult(null);
    try {
      const result = await post({ action: "review", explanation });
      setReviewResult({ passed: result?.passed === true, message: result ? typeof result.feedback === "string" ? result.feedback : "Your explanation has been checked. Look at your progress below." : "Your explanation could not be checked. Your text is still here; please try again." });
    } finally {
      setReviewSubmitting(false);
      requestAnimationFrame(() => { reviewFeedback.current?.focus(); reviewFeedback.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
    }
  }

  function addBlock(block: Block) {
    const result = insertCodingBlock(program, selected, block);
    if (!result.inserted) {
      setEditorNote(result.reason);
      return;
    }
    setEditorNote(null);
    setProgram(result.program);
    guideEvent("edit");
  }

  function addRepeat() {
    addBlock({ id: nextId(), kind: "repeat", times: 2, body: [] });
  }

  function addMove(direction: CodingDirection) {
    addBlock({ id: nextId(), kind: "move", direction });
  }

  function updateTimes(id: string, times: number) {
    setProgram((current) => updateCodingRepeatTimes(current, id, times));
  }

  function moveBlock(id: string, direction: "up" | "down") {
    setProgram((current) => moveCodingBlock(current, id, direction));
  }

  function removeBlock(id: string) {
    setProgram((current) => removeCodingBlock(current, id));
  }

  if (error && !workspace) return <p className="mx-auto max-w-3xl px-6 py-10 text-sm text-rose-700">{error}</p>;
  if (!workspace) return <p className="mx-auto max-w-3xl px-6 py-10 text-sm text-slate-600">Opening the coding lesson…</p>;

  const brief = workspace.lesson.stages.find((item) => item.stage === stage) ?? workspace.lesson.stages[0]!;
  const frames = playbackLabel ? (workspace.run?.frames ?? [{ x: 0, y: 0 }]) : [{ x: 0, y: 0 }];
  const position = frames[Math.min(frame, frames.length - 1)] ?? { x: 0, y: 0 };
  const goal = brief.goal;
  const instruction = `${brief.title}. ${brief.prompt}`;
  const EditorContainer = stage === "review" ? "details" : "div";
  const stageIndex = CODING_STAGES.indexOf(stage);
  const previousStage = CODING_STAGES[stageIndex - 1];
  const nextStage = CODING_STAGES[stageIndex + 1];
  const stageComplete = workspace.completedStages.includes(stage);
  const nextTitle = workspace.lesson.stages.find(item => item.stage === nextStage)?.title;

  return (
    <div className="starliz-page mx-auto max-w-[1440px] space-y-5 rounded-3xl bg-slate-50 px-4 py-6 text-slate-900 sm:px-6">
      {guideLearner && <StarLizHelper learner={guideLearner} guide="coding-project" project={lessonId} codingTools={<CodingGuideTools key={lessonId} blocks={stage === "build" && !accessibleBlocks && !stageComplete} />} stage={stage} objective={workspace.lesson.learningObjective} steps={lessonGuide({ stage, objective: workspace.lesson.learningObjective, editor: accessibleBlocks ? "tools" : "blocks", completed: stageComplete })} secondSteps={lessonGuide({ stage, objective: workspace.lesson.learningObjective, editor: accessibleBlocks ? "tools" : "blocks", completed: stageComplete }, true)} established={workspace.skillStatus === "mastered"} context={stage === "discover" || stage === "create" ? "coding-task-description" : stage === "predict" ? "coding-prediction" : stage === "review" ? "coding-review" : dirty ? "run-program" : stageComplete ? "check-program" : "coding-workspace"} />}
      {worldLocation && <GuidedMissionContext location={worldLocation} objective={workspace.lesson.learningObjective} stage={brief.title}/>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/student/coding" className="text-xs font-bold uppercase tracking-wide text-sky-700">Coding</Link>
          <h1 data-guide-target="lesson-task" className="text-2xl font-black">{workspace.lesson.title}</h1>{!worldLocation && <Link className="inline-flex min-h-11 items-center text-sm font-bold text-emerald-800" href={guidedHref("lesson", lessonId, { bookingId, daytimePeriodId })} onClick={event => { if (dirty) { event.preventDefault(); setNotice("Save your current program before opening the world mission."); } }}>Open this lesson as a world mission →</Link>}
          <p className="text-sm text-slate-600">
            {workspace.lesson.pathwayTitle} · {workspace.lesson.courseTitle} · {workspace.lesson.moduleTitle} · {workspace.lesson.yearBand}
          </p>
        </div>
        <p className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide">
          {STATUS[workspace.skillStatus] ?? workspace.skillStatus}
        </p>
      </div>
      {workspace.skillStatus === "mastered" ? (
        <div role="status" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-lg font-black text-amber-950">You mastered {workspace.lesson.title}</p>
          <p className="mt-1 text-sm text-amber-950">A loop repeats a move, so you do not have to write that move again and again.</p>
        </div>
      ) : null}

      <nav aria-label="Lesson stages" className="flex flex-wrap gap-2">
        {CODING_STAGES.map((item) => {
          const open = stageUnlocked(item, workspace.completedStages);
          return (
            <button
              key={item}
              type="button"
              disabled={!open || busy}
              aria-label={workspace.lesson.stages.find(entry => entry.stage === item)?.title ?? item}
              title={workspace.completedStages.includes(item) ? "Completed. Revisit this stage." : open ? "Open this stage." : "Complete the earlier stages first."}
              aria-current={stage === item ? "step" : undefined}
              onClick={() => void post({ action: "open", stage: item })}
              className={`min-h-11 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wide ${stage === item ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-700"} disabled:opacity-40`}
            >
              {workspace.lesson.stages.find((entry) => entry.stage === item)?.title ?? item}
              {workspace.completedStages.includes(item) && <span className="ml-1" aria-hidden="true">✓</span>}
            </button>
          );
        })}
      </nav>
      <section aria-label="Stage navigation" className="rounded-2xl border border-sky-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-bold text-sky-950">Step {stageIndex + 1} of {CODING_STAGES.length} · {brief.title}{stageComplete ? " · Completed" : " · In progress"}</p><div className="flex flex-wrap gap-2"><button type="button" disabled={!previousStage || busy} onClick={() => previousStage && void post({ action: "open", stage: previousStage })} className="min-h-11 rounded-xl border border-sky-300 px-4 py-2 font-bold text-sky-900 disabled:opacity-40">Previous stage</button>{nextStage && <button type="button" disabled={busy || !stageComplete || !stageUnlocked(nextStage, workspace.completedStages)} data-guide-target="check-program" onClick={() => void post({ action: "open", stage: nextStage })} className="min-h-11 rounded-xl bg-sky-700 px-4 py-2 font-bold text-white disabled:opacity-40">Continue to {nextTitle} →</button>}</div></div>
        {nextStage && !stageComplete && <p className="mt-2 text-sm text-slate-600">{stage === "discover" ? "Watch the example, then choose I can see the goal to continue." : stage === "predict" ? "Choose and check your prediction to continue." : "Run your blocks to check this task. When your program passes, your progress is saved and the next stage opens."}</p>}
        {stageComplete && nextStage && <p className="mt-2 text-sm text-slate-600">You have already completed this stage. Continue without repeating its assessment, or revisit your saved work.</p>}
        {stageMessage && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-950">{stageMessage}</p>}
        {notice && !stageMessage && <p role="status" className="mt-3 rounded-xl bg-sky-50 p-3 text-sm font-semibold text-sky-950">{notice}</p>}
        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      </section>
      <p role="status" className="text-xs font-semibold text-slate-600">{busy ? "Saving your work…" : dirty ? "You have unsaved changes. Save before leaving this lesson." : "Your workspace matches the saved version."}</p>

      <CodingStudioFrame year={4} beginner learning={<>        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Instructions</h2>
          <p className="mt-2 text-sm font-semibold">{workspace.lesson.learningObjective}</p>
          <p data-guide-target="coding-task-description" className="mt-3 text-sm leading-6">{brief.prompt}</p>
          {stage === "review" && workspace.explainedProgram ? (
            <div className="mt-3 rounded-xl bg-sky-50 p-3">
              <p className="text-sm font-semibold">Your finished program</p>
              <ProgramOutline program={workspace.explainedProgram} />
            </div>
          ) : null}
          {workspace.lesson.voiceHelp && !worldLocation ? (
            <button type="button" onClick={() => speak(instruction)} className="mt-3 text-sm font-bold text-sky-800">
              Read this aloud
            </button>
          ) : null}
        </section>

<details data-studio-tutor open={Boolean(tutor)} className="rounded-xl border border-violet-200"><summary className="min-h-11 cursor-pointer p-3 font-bold text-violet-900">✦ Help from StarLiz AI</summary>      <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
        <h2 className="text-sm font-black uppercase tracking-wide text-violet-800">Coding tutor</h2>
        <p className="mt-1 text-sm text-violet-950">The tutor asks a question before it shows a fuller hint. It uses the blocks you have now.</p>
        {tutor ? <p role="status" className="mt-2 text-sm">{tutor}</p> : null}
        {!humanAssistanceEnabled ? <p className="mt-2 text-xs text-violet-800">Human assistance is disabled. Your AI tutor will continue to help you.</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void post({ action: "hint" })} className="min-h-11 rounded-xl bg-violet-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">
            Ask for a hint
          </button>
          <button type="button" disabled={busy || !humanAssistanceEnabled} onClick={() => void post({ action: "support" })} className="min-h-11 rounded-xl border border-violet-400 px-3 py-2 text-sm font-bold text-violet-900 disabled:opacity-60">
            Ask a person
          </button>
        </div>
      </section></details>        <details className="order-5 rounded-2xl border border-slate-200 bg-white p-4"><summary className="min-h-11 cursor-pointer text-sm font-bold text-slate-700">My progress & project details</summary>
          <ul className="space-y-1 text-xs text-slate-600">
            {EVIDENCE.map((item) => (
              <li key={item.id}>{workspace.evidence[item.id] ? "Done" : "Still to show"} · {item.label}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">Attempts {workspace.attemptCount} · Checks passed {workspace.checksPassed} · Hints on this part {workspace.hintCount}</p>
          <p className="mt-2 text-xs text-slate-500">This project stays private to you, your teachers and your parent account.</p>
        </details>

</>} outputs={<>        <LegacyLessonExample worldLocation={worldLocation} key={lessonId} brief={workspace.lesson.stages.find(item => item.stage === "discover")!} />
        <section data-guide-target="program-result" aria-label="My Program" tabIndex={0} className="order-4 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-bold text-emerald-950">My Program</h2>
          <p className="mt-2 text-xs text-slate-600">Your blocks. Your actual execution.</p>
          {playbackLabel === "learner" && runSignature !== JSON.stringify(program) && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Your blocks have changed. This is your previous run; run again to update it.</p>}
          {playbackLabel !== "learner" && <p className="mt-3 text-sm font-semibold text-emerald-950">Your target for {brief.title}. Run your blocks to see the movement.</p>}
          {worldLocation ? <WorldRouteView location={worldLocation} goal={goal} actors={[{ name: "My Program", visits: frames.slice(0, frame + 1) }]}/> : <div className="mt-3 grid grid-cols-6 gap-1 rounded-xl bg-slate-100 p-2" aria-label="Program output">
            {Array.from({ length: CODING_GRID_SIZE * CODING_GRID_SIZE }, (_, index) => {
              const x = index % CODING_GRID_SIZE;
              const y = CODING_GRID_SIZE - 1 - Math.floor(index / CODING_GRID_SIZE);
              const here = position.x === x && position.y === y;
              const star = goal?.x === x && goal?.y === y;
              return (
                <div key={`${x}-${y}`} className="flex aspect-square items-center justify-center rounded-lg border border-slate-200 bg-white text-xl">
                  {here ? "🙂" : star ? "⭐" : ""}
                </div>
              );
            })}
          </div>}
          <p className="mt-2 text-xs text-slate-500">
            {playbackLabel === "example"
              ? (playing ? "Running the lesson example" : "Showing the lesson example")
              : playbackLabel === "learner"
                ? (playing ? "Running your program" : "Showing your program")
                : "This task has not been run in this view"}
            {" · "}column {position.x}, row {position.y}
          </p>
          <button type="button" disabled={busy || playbackLabel !== "learner" || !workspace.run} onClick={() => { if (playing) stopPlayback(); else play(workspace.run?.frames ?? []); }} className="mt-3 min-h-11 rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{playing && playbackLabel === "learner" ? "Pause My Program" : "Replay My Program"}</button>
          {stage === "discover" || stage === "predict" ? (
            <p className="mt-1 text-xs text-slate-600">The example is the lesson. Your program is the blocks you built.</p>
          ) : null}
          <div role="status" className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
            {error ?? (dirty ? "Your blocks have changed. Run them to check this task." : notice ?? (playbackLabel === "learner" ? workspace.feedback ?? workspace.run?.error ?? (workspace.run?.reachedGoal ? "Your program reached the star!" : "Inspect your program’s result.") : "Run your blocks to check the current task."))}
          </div>
          {workspace.teacherFeedback ? (
            <p className="mt-3 text-sm"><span className="font-bold">Teacher: </span>{workspace.teacherFeedback}</p>
          ) : null}
        </section>

</>}>        <section className="order-3 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 ref={stageHeading} tabIndex={-1} className="text-lg font-black text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-700">{stage === "discover" ? "Try a repeating move" : brief.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{stage === "discover" ? "1. Replay the Lesson Example. 2. Connect a move inside repeat. 3. Run your blocks and watch My Program." : brief.prompt}</p>
          {stage === "predict" && brief.choices && <fieldset data-guide-target="coding-prediction" disabled={busy} className="mt-4 space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-4"><legend className="font-bold">Your prediction</legend><p className="text-sm">Predict the Lesson Example before checking your answer.</p>{brief.choices.map(item => <label key={item.id} className="flex min-h-11 items-center gap-3 text-sm"><input type="radio" name="predict" checked={choice === item.id} onChange={() => setChoice(item.id)} />{item.label}</label>)}<button type="button" disabled={busy || !choice} data-guide-target="check-program" onClick={() => void post({ action: "predict", choiceId: choice })} className="min-h-11 rounded-xl bg-sky-700 px-4 py-2 font-bold text-white disabled:opacity-50">Check my prediction</button></fieldset>}
          {stage === "review" && <section data-guide-target="coding-review" aria-label="Review your learning" className="mt-4 space-y-4">
            <div className="rounded-xl bg-sky-50 p-4"><h3 className="font-bold">Your finished program</h3><ProgramOutline program={workspace.explainedProgram ?? program} /></div>
            {workspace.skillStatus !== "mastered" && <div>
              <label className="text-base font-bold" htmlFor="coding-explanation">Explain your finished program</label>
              <p id="coding-review-help" className="mt-1 text-sm leading-6 text-slate-600">Describe every repeat: which way does it move, and how many times? Tell us why repeating is useful. Use your own words.</p>
              <textarea id="coding-explanation" aria-describedby="coding-review-help" disabled={busy || reviewSubmitting} value={explanation} onChange={(event) => { setExplanation(event.target.value); setReviewResult(null); setError(null); }} className="mt-2 w-full rounded-xl border border-slate-400 p-3 text-base focus-visible:outline-2 focus-visible:outline-sky-700" rows={4} />
              <button type="button" disabled={busy || reviewSubmitting} onClick={() => void submitReview()} className="mt-2 min-h-12 rounded-xl bg-sky-700 px-5 py-3 text-base font-bold text-white disabled:opacity-60">{reviewSubmitting ? "Checking your explanation…" : "Send explanation"}</button>
            </div>}
            <div ref={reviewFeedback} tabIndex={-1} role="status" aria-live="polite" aria-atomic="true" className={`rounded-xl border p-4 focus-visible:outline-2 focus-visible:outline-sky-700 ${workspace.skillStatus === "mastered" ? "border-emerald-300 bg-emerald-50" : "border-sky-200 bg-sky-50"}`}>
              {reviewSubmitting ? <p>Checking your explanation. Please wait…</p> : workspace.skillStatus === "mastered" ? <><h3 className="font-bold text-emerald-950">Lesson mastered — well done!</h3><p className="mt-2 text-sm">Your lesson progress has been saved. This completes Understanding Loops, not the whole pathway.</p><CodingNextStep lessonId={lessonId} bookingId={bookingId} /></> : <><h3 className="font-bold">{error ? "Your explanation could not be checked" : reviewResult ? reviewResult.passed ? "Explanation accepted — one more check" : "Your review needs another try" : "Ready for your explanation"}</h3><p className="mt-2 text-sm">{error ?? reviewResult?.message ?? "Send your explanation to finish the review. We will show the result here."}</p>{reviewResult?.passed && <p className="mt-2 text-sm">Still to show: {EVIDENCE.filter(item => !workspace.evidence[item.id]).map(item => item.label).join(", ") || "your remaining lesson progress"}. Open the relevant lesson stage to finish.</p>}</>}
            </div>
          </section>}
          <EditorContainer className="mt-4">
          {stage === "review" && <summary className="min-h-11 cursor-pointer font-semibold text-slate-600">Open program editor & replay controls</summary>}
          <fieldset data-guide-target="coding-prediction" disabled={busy}>
          <legend className="sr-only">Edit and run your program</legend>
          <div className="my-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy} data-guide-target="run-program" onClick={() => void post({ action: "run", runSource: "learner" })} className="min-h-11 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">Run my blocks</button>
            {playing && <button type="button" onClick={stopPlayback} className="min-h-11 rounded-xl bg-slate-800 px-3 py-2 text-sm font-bold text-white">Stop</button>}
            <button type="button" disabled={busy} data-guide-target="save-project" onClick={() => void post({ action: "save" })} className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-60">Save</button>
            {stage === "discover" && !stageComplete && <button type="button" disabled={busy} data-guide-target="check-program" onClick={() => void post({ action: "discover" })} className="min-h-11 rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white">I can see the goal — next</button>}
          </div>
          <details className="my-3 text-sm"><summary className="min-h-11 cursor-pointer font-semibold text-slate-600">Choose another way to edit</summary><button type="button" aria-pressed={accessibleBlocks} className="my-2 min-h-11 rounded-xl border border-violet-200 px-3 text-sm font-semibold" onClick={() => { setAccessibleBlocks(!accessibleBlocks); setBlocksValid(true); }}>{accessibleBlocks ? "Open connected blocks" : "Use accessible action controls"}</button></details>
          {accessibleBlocks ? <>          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={addRepeat} className="min-h-11 rounded-lg bg-violet-100 px-3 py-2 text-sm font-bold text-violet-900">Add repeat</button>
            <button type="button" onClick={() => setSelected(null)} aria-pressed={selected === null} className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-800">Add at the top</button>
            {(["right", "left", "up", "down"] as CodingDirection[]).map((direction) => (
              <button key={direction} type="button" onClick={() => addMove(direction)} className="min-h-11 rounded-lg bg-sky-100 px-3 py-2 text-sm font-bold text-sky-900">
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
                depth={1}
                selected={selected}
                onSelect={setSelected}
                onTimes={updateTimes}
                onMove={moveBlock}
                onRemove={removeBlock}
              />
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-600">{selected ? "The next block goes inside the selected repeat. Tap Add at the top to place a block outside it." : "Tap a Repeat to put the next block inside it. Tap Add at the top to keep a block outside. Use Up and Down to change the order."}</p>
          {editorNote ? <p className="mt-2 text-xs font-semibold text-slate-700">{editorNote}</p> : null}
</> : <BlockCommandsEditor commands={program.blocks} legacy year={4} readOnly={busy} onValidityChange={setBlocksValid} onChange={blocks => { setProgram({ blocks: blocks as Block[] }); guideEvent("edit"); }} />}
          <details className="mt-3"><summary className="min-h-11 cursor-pointer text-sm font-semibold text-slate-600">More program options</summary><div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void post({ action: "undo" })} className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-60">Undo</button>
            <button type="button" disabled={busy} onClick={() => void post({ action: "restore" })} className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-60">Restore starter</button>
          </div></details>
          </fieldset>
          </EditorContainer>
        </section>
</CodingStudioFrame>
    </div>
  );
}

function ProgramOutline({ program }: { program: CodingProgram }) {
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {program.blocks.map((block) => <OutlineItem key={block.id} block={block} />)}
    </ul>
  );
}

function OutlineItem({ block }: { block: Block }) {
  if (block.kind === "move") return <li>Move {block.direction}</li>;
  return (
    <li>
      Repeat {block.times}
      <ul className="ml-4 list-disc">
        {block.body.map((child) => <OutlineItem key={child.id} block={child} />)}
      </ul>
    </li>
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
  depth,
  selected,
  onSelect,
  onTimes,
  onMove,
  onRemove,
}: {
  block: Block;
  index: number;
  count: number;
  depth: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
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
          <button type="button" onClick={() => onSelect(selected === block.id ? null : block.id)} className="font-bold">Repeat</button>
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
        {block.body.length === 0 ? <li className="text-xs text-slate-500">{depth + 1 < CODING_MAX_DEPTH ? "Put a move or another repeat inside." : "Put a move inside this repeat."}</li> : null}
        {block.body.map((child, childIndex) => (
          <BlockRow
            key={child.id}
            block={child}
            index={childIndex}
            count={block.body.length}
            depth={depth + 1}
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
