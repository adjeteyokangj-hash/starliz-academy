"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { CODING_STAGES, type CodingStage } from "@/lib/coding/types";
import type { publicActivityView } from "@/lib/coding/learning/public-view";
import type { ActivityAction, PracticalArtifact } from "@/lib/coding/learning/types";
import SourceEditor from "./SourceEditor";
import CodingStudioFrame from "./CodingStudioFrame";
import LessonExample from "./LessonExample";
import Link from "next/link";
import StateTransitionDiagram from "./StateTransitionDiagram";
import SourceTestInputs from "./SourceTestInputs";
import EvidenceSelection from "./EvidenceSelection";
import EvidencePreview from "./EvidencePreview";
import DemonstrationRecorder from "./DemonstrationRecorder";
import PrivateDemonstrationPlayer from "./PrivateDemonstrationPlayer";
import type { EvidenceManifest } from "@/lib/coding/learning/evidence-links";
import { personalInputProfile } from "@/lib/coding/learning/personal-input";
import type { PersonalInput } from "@/lib/coding/learning/types";
import VisualProgramEditor from "./VisualProgramEditor";
import LearningExecution from "./LearningExecution";
import DualProgramEditor from "./DualProgramEditor";
import MediaLibraryEditor from "./MediaLibraryEditor";
import ScenarioEditor from "./ScenarioEditor";
import { visualEventNames } from "@/lib/coding/learning/visual-events";
import ProjectFilesEditor from "./ProjectFilesEditor";
import DataStudio from "./DataStudio";
import RoutePlanEditor from "./RoutePlanEditor";
import NetworkStudio from "./NetworkStudio";
import EvidenceStudio from "./EvidenceStudio";
import EngineeringStudio from "./EngineeringStudio";
import GameStudio from "./GameStudio";
import ClassifierStudio from "./ClassifierStudio";
import SystemsStudio from "./SystemsStudio";
import InvestigationStudio from "./InvestigationStudio";
import ProvidedMaterials from "./ProvidedMaterials";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
const planSignature = (artifact: PracticalArtifact) => artifact.type === "visual" && artifact.document && typeof artifact.document === "object" && !Array.isArray(artifact.document) ? JSON.stringify(artifact.document.plan ?? []) : null;

export type ActivityWorkspaceView = ReturnType<typeof publicActivityView> & { teacherFeedback?: string | null; revision: string; versions: Array<{ id: string; label: string; stage: string; createdAt: string | Date }> };
type Workspace = ActivityWorkspaceView;
type Result = { workspace?: Workspace & { message?: string }; error?: string };
const buttonBase = "min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50";
const button = `${buttonBase} border-slate-300 bg-white text-slate-900`;
const primaryButton = `${buttonBase} border-sky-800 bg-sky-800 text-white`;
const titles: Record<CodingStage, string> = { discover: "Discover", predict: "Predict", build: "Build", practise: "Practise", debug: "Debug", create: "Create", review: "Review" };
const versionNames: Record<string, string> = { "saved-work": "Saved work", "teacher-feedback": "Teacher feedback saved", "restored-version": "Retrieved version", "restored-starter": "Starter restored", "verified-stage": "Practical checks passed", "independent-mastery": "Independent mastery", "reviewed-explanation": "Explanation reviewed", "saved-reflection": "Explanation draft", "recorded-plan": "Plan recorded" };

export default function LearningWorkspace({ initial, endpoint, bookingId, daytimePeriodId, humanAssistanceEnabled = false }: {
  initial: Workspace; endpoint?: string; bookingId?: string; daytimePeriodId?: string; humanAssistanceEnabled?: boolean;
}) {
  const [workspace, setWorkspace] = useState(initial), saved = useRef(initial);
  const personal = useRef<{ value: PersonalInput | null; valid: boolean }>({ value: initial.personalInput?.enabled ? initial.personalInput.input : null, valid: true });
  const [inputEpoch, setInputEpoch] = useState(0);
  const [artifact, setArtifact] = useState<PracticalArtifact>(initial.artifact), draft = useRef(initial.artifact);
  const [working, setBusy] = useState(false), pending = useRef(false);
  const playQueue = useRef<Array<{ interaction: NonNullable<ActivityAction["interaction"]>; stage: CodingStage; signature: string; activityId: string }>>([]);
  useEffect(() => () => { playQueue.current = []; }, []);
  const [introducedStages, setIntroducedStages] = useState(() => new Set<string>());
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const [question, setQuestion] = useState(""), [explanation, setExplanation] = useState(initial.explanation);
  const [choice, setChoice] = useState(initial.prediction?.choiceId ?? ""), [file, setFile] = useState<"source" | "html" | "css">(initial.artifact.type === "source" && initial.artifact.entry === "dom" ? initial.activity.concepts.includes("javascript") ? "source" : initial.activity.concepts.includes("html") ? "html" : initial.activity.concepts.includes("css") ? "css" : "source" : "source");
  const [selectedVersion, setSelectedVersion] = useState("");
  const [openedEvidence, setOpenedEvidence] = useState<"first" | "second" | null>(null);
  const [eventValue, setEventValue] = useState("0");
  const [blocksValid, setBlocksValid] = useState(true);
  const [traceRun, setTraceRun] = useState(0);
  const stage = workspace.stage, activity = workspace.activity, editable = !["discover", "predict", "review"].includes(stage);
  const introduced = workspace.tutorMessages.some((turn) => turn.stage === stage && turn.purpose === "instruction");
  const busy = working || !introduced && !introducedStages.has(`${activity.id}:${stage}`);
  const dirty = JSON.stringify(artifact) !== JSON.stringify(workspace.artifact);
  const evidenceSignature = JSON.stringify(workspace.savedEvidence ?? []);
  const selectedEvidence = useMemo(() => JSON.parse(evidenceSignature) as EvidenceManifest, [evidenceSignature]);
  const inputProfile = editable ? personalInputProfile(artifact, workspace.input) : null;
  const runLabel = activity.workbench === "evidence" ? "Preview evidence poster" : activity.workbench === "media" ? "Preview card" : activity.workbench === "data" ? "Recalculate data" : activity.workbench === "scenario" ? "Try your choices" : activity.workbench === "network" ? "Run network task" : activity.workbench === "ai" ? "Train and test model" : "Run program";
  const url = endpoint ?? `/api/student/coding/activities/${encodeURIComponent(activity.id)}`;
  const edit = (value: PracticalArtifact) => { draft.current = value; setArtifact(value); };
  async function request(action: ActivityAction["action"], target: CodingStage, extra: Partial<ActivityAction> = {}, sourceDraftOnly = false) {
    const ownInput = !sourceDraftOnly && ["save", "run"].includes(action) && personalInputProfile(draft.current, saved.current.input) && ["build", "practise", "debug", "create"].includes(target);
    if (ownInput && !personal.current.valid) throw new Error("Correct your personal test input before saving or running.");
    const response = await fetchWithRefreshRetry(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, stage: target, revision: saved.current.revision, artifact: draft.current, bookingId, daytimePeriodId, ...(ownInput ? { testInput: personal.current.value } : {}), ...extra }) });
    const result = await response.json() as Result;
    if (!response.ok || !result.workspace) throw new Error(result.error ?? "Your work could not be saved. Keep this editor open and try again.");
    if (action === "run") setTraceRun(value => value + 1);
    saved.current = result.workspace; setWorkspace(result.workspace); edit(result.workspace.artifact); setExplanation(result.workspace.explanation);
    if (["open", "restore", "version", "run", "check", "reflect"].includes(action)) setOpenedEvidence(null);
    if (["open", "restore", "version"].includes(action)) { personal.current = { value: result.workspace.personalInput?.enabled ? result.workspace.personalInput.input : null, valid: true }; setInputEpoch((value) => value + 1); }
    if (result.workspace.message) setMessage(result.workspace.message);
    return result.workspace;
  }
  async function perform(action: ActivityAction["action"], extra: Partial<ActivityAction> = {}) {
    if (!blocksValid && ["save", "run", "check", "reflect", "hint", "open"].includes(action)) { setError("Complete the connected blocks or return to accessible action controls before continuing. Your last saved program is retained."); return; }
    if (pending.current) {
      if (action === "run" && extra.interaction) {
        const queued = { interaction: extra.interaction, stage: saved.current.stage, signature: JSON.stringify(draft.current), activityId: saved.current.activity.id }, previous = playQueue.current.at(-1);
        if (previous && queued.interaction.type !== "click" && previous.interaction.type === queued.interaction.type && previous.interaction.target === queued.interaction.target && previous.stage === queued.stage && previous.signature === queued.signature) playQueue.current[playQueue.current.length - 1] = queued;
        else if (playQueue.current.length < 20) playQueue.current.push(queued);
        else setError("Wait for the queued play to finish before adding more interactions.");
      }
      return;
    }
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try {
      let task: { action: ActivityAction["action"]; extra: Partial<ActivityAction> } | null = { action, extra };
      while (task) {
        const current = task; task = null;
        const target = current.extra.stage ?? saved.current.stage;
        if (["open", "teach", "hint", "support", "restore", "version"].includes(current.action) && JSON.stringify(draft.current) !== JSON.stringify(saved.current.artifact) && !["discover", "predict", "review"].includes(saved.current.stage)) await request("save", saved.current.stage, {}, !personal.current.valid);
        if (current.action === "open" && saved.current.stage === "review" && explanation !== saved.current.explanation) await request("save", "review", { explanation });
        await request(current.action, target, current.extra);
        while (playQueue.current.length) {
          const queued = playQueue.current.shift()!;
          if (queued.activityId === saved.current.activity.id && queued.stage === saved.current.stage && queued.signature === JSON.stringify(draft.current)) { task = { action: "run", extra: { interaction: queued.interaction, stage: queued.stage } }; break; }
        }
      }
    } catch (error) { playQueue.current = []; setError(error instanceof Error ? error.message : "Keep your work open and try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  const readAloud = () => {
    if (!("speechSynthesis" in window)) { setMessage("Read-aloud is unavailable in this browser. The complete instructions remain on screen."); return; }
    speechSynthesis.cancel(); const speech = new SpeechSynthesisUtterance(`${activity.title}. ${stage === "discover" ? activity.instruction.explanation : workspace.independentTask ?? activity.objective}`); speech.lang = "en-GB"; speech.rate = activity.year <= 2 ? .85 : 1; speechSynthesis.speak(speech);
  };
  const introduce = useEffectEvent(() => { void perform("teach"); });
  useEffect(() => {
    const key = `${activity.id}:${stage}`;
    if (working || introduced || introducedStages.has(key)) return;
    const timer = setTimeout(() => { setIntroducedStages((previous) => new Set(previous).add(key)); introduce(); }, 0);
    return () => clearTimeout(timer);
  }, [stage, activity.id, working, introduced, introducedStages]);
  return <main data-coding-year={activity.year} className="mx-auto w-full min-w-0 max-w-[1600px] space-y-5 rounded-3xl bg-slate-50 p-3 text-slate-950 sm:p-6">
    <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/student/coding" className="inline-flex min-h-11 items-center gap-3 text-sm font-bold text-slate-900"><span aria-hidden="true" className="studio-brand-mark" />StarLiz <span className="font-normal text-slate-500">/ Coding Studio</span></Link><div className="flex items-center gap-3"><span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">Private workspace</span><button type="button" className={button} onClick={readAloud}>Read instructions aloud</button></div></div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">{activity.year <= 2 ? "Coding Explorers" : activity.year <= 4 ? "Coding Builders" : activity.year <= 6 ? "Coding Creators" : activity.year <= 9 ? "Coding Developers" : "Coding Engineers"} · Year {activity.year} · {titles[stage]}</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{activity.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{activity.objective}</p></div><div className="w-full shrink-0 sm:w-48"><p className="text-xs font-semibold text-slate-600">{workspace.completedStages.length} of 7 stages verified{workspace.mastered ? " · Achievement saved" : ""}</p><progress aria-label="Verified learning stages" value={workspace.completedStages.length} max={7} className="mt-2 h-1.5 w-full accent-indigo-600" /></div></div>
    </header>
    <nav aria-label="Learning stages" className="studio-stage-nav grid grid-cols-4 gap-2 sm:grid-cols-7">{CODING_STAGES.map((part, index) => <button type="button" key={part} disabled={busy || !workspace.unlockedStages.includes(part)} aria-current={part === stage ? "step" : undefined} className={`${buttonBase} px-2 text-left text-xs ${part === stage ? "border-indigo-600 bg-indigo-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700"}`} onClick={() => perform("open", { stage: part })}><span className="mr-1 opacity-70">{index + 1}.</span> {titles[part]}{workspace.completedStages.includes(part) ? " ✓" : ""}</button>)}</nav>
    <div aria-live="polite">{error && <p role="alert" className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-amber-950">{error} Your current editor has been retained.</p>}{message && <p className="rounded-xl border border-sky-300 bg-sky-50 p-4 text-sky-950">{message}</p>}</div>
    {workspace.teacherFeedback && <section className="rounded-2xl border border-violet-300 bg-violet-50 p-4" aria-label="Saved teacher feedback"><h2 className="font-bold">Saved teacher feedback</h2><p className="mt-2 whitespace-pre-wrap leading-7">{workspace.teacherFeedback}</p><p className="mt-3 text-sm">If a teacher helped with your independent task, use a fresh variation before earning independent credit.</p></section>}
    <p role="status" className="text-xs font-semibold text-slate-600">{working ? "Working… keep this window open" : dirty ? "Unsaved changes · save a version before leaving" : "Workspace matches the saved version"}</p>
    <ProvidedMaterials input={workspace.input} />
    {activity.evidenceSlots && workspace.evidenceScope !== "author" && stage !== "review" && <EvidenceSelection key={`${stage}:${evidenceSignature}`} activityId={activity.id} required={activity.evidenceSlots} current={selectedEvidence} bookingId={bookingId} disabled={busy} onApply={(evidenceBindings) => void perform("open", { stage, evidenceBindings })} />}
    <CodingStudioFrame year={activity.year} learning={<>      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><h2 className="text-xl font-bold">{titles[stage]}</h2>
        {stage === "discover" ? <div className="mt-3 space-y-4"><p className="leading-8 text-slate-800">{activity.instruction.explanation}</p><ol className="list-decimal space-y-2 pl-6 text-slate-700">{activity.instruction.exampleReasoning.map((reason) => <li key={reason}>{reason}</li>)}</ol>{activity.instruction.stateDiagram && <StateTransitionDiagram diagram={activity.instruction.stateDiagram} />}</div>
          : stage === "predict" ? <fieldset className="mt-4 space-y-3"><legend className="font-semibold">{activity.prediction.prompt}</legend>{activity.prediction.choices.map((option) => <label key={option.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-300 p-3"><input type="radio" name="prediction" value={option.id} checked={choice === option.id} disabled={busy} onChange={() => setChoice(option.id)} /><span>{option.text}</span></label>)}</fieldset>
            : <p className="mt-3 leading-7 text-slate-800">{workspace.independentTask ?? (stage === "debug" ? activity.instruction.repairPrompt : stage === "practise" ? "Try the changed starting data. Use the result and trace to check whether your program still meets the same goal." : activity.objective)}</p>}
        {stage === "debug" && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-amber-950">Watch for this misconception: {activity.instruction.misconception}</p>}
        {["build", "practise", "debug"].includes(stage) && <details className="mt-4 rounded-xl border border-slate-200 p-3"><summary className="min-h-11 cursor-pointer font-semibold">Read the lesson brief again</summary><p className="mt-2 leading-7 text-slate-700">{activity.instruction.explanation}</p></details>}
        {stage === "create" && <p className="mt-3 rounded-xl bg-violet-50 p-3 text-violet-950">This is your independent task. The AI tutor can guide your thinking. If an answer is disclosed or human assistance is requested, use a fresh variation for independent credit.</p>}
      </section>
<details data-studio-tutor open className="rounded-2xl border border-violet-200 bg-violet-50/50"><summary className="min-h-11 cursor-pointer p-4 font-bold text-violet-950">✦ StarLiz AI tutor</summary><section className="rounded-2xl border border-sky-200 bg-sky-50 p-5"><h2 className="text-lg font-bold">Your AI coding tutor</h2><p className="mt-2 text-sm leading-6 text-slate-700">Ask about a step, error or idea. In Create, your tutor guides your thinking while you build the solution.</p>{!humanAssistanceEnabled && <p className="mt-2 text-xs font-semibold text-violet-800">Human assistance is disabled. Your AI tutor remains available under the privacy rules.</p>}<label className="mt-4 block text-sm font-semibold">What are you thinking about?<textarea className="mt-2 w-full rounded-xl border border-slate-400 bg-white p-3 font-normal" rows={3} value={question} maxLength={2000} disabled={busy} onChange={(event) => setQuestion(event.currentTarget.value)} /></label><button type="button" className={`${button} mt-3 w-full`} disabled={busy} onClick={() => perform("hint", { explanation: question })}>Ask my AI tutor</button><div className="mt-4 max-h-[500px] space-y-3 overflow-auto" aria-live="polite">{workspace.tutorMessages.filter((turn) => turn.stage === stage).slice(-6).map((turn, i) => <div key={i} className="rounded-xl bg-white p-3 text-sm leading-6 text-slate-800"><p>{turn.message}</p><p className="mt-2 text-xs text-slate-500">{turn.source === "model" ? turn.context === "curriculum" ? "AI lesson guidance · saved project not inspected" : "AI tutor" : "Offline learning guidance"}</p></div>)}</div></section></details>
      <details className="rounded-xl border border-slate-200 bg-white"><summary className="min-h-11 cursor-pointer p-4 font-semibold">Saved versions</summary><section className="p-4"><h2 className="font-bold">Your saved versions</h2><label className="mt-3 block text-sm text-slate-700">Choose a version<select aria-label="Choose a version" className="mt-2 min-h-11 w-full rounded-xl border border-slate-400 p-2" value={selectedVersion} onChange={(event) => setSelectedVersion(event.currentTarget.value)} disabled={busy}><option value="">Select saved work</option>{workspace.versions.map((version) => <option key={version.id} value={version.id}>{versionNames[version.label] ?? "Saved project"} · {titles[version.stage as CodingStage] ?? "Work"} · {new Date(version.createdAt).toLocaleString("en-GB")}</option>)}</select></label><button type="button" className={`${button} mt-3 w-full`} disabled={busy || !editable || !selectedVersion} onClick={() => perform("version", { versionId: selectedVersion })}>Restore as a new working copy</button><p className="mt-2 text-xs leading-5 text-slate-500">Restoring keeps earlier versions and help records.</p></section></details>
      {humanAssistanceEnabled && <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold">Optional teacher assistance</h2><p className="mt-2 text-sm leading-6 text-slate-700">Your administrator has enabled human help. Classroom membership, subject, booking and timetable checks still apply.</p><button type="button" className={`${button} mt-3 w-full`} disabled={busy} onClick={() => perform("support")}>Request authorised assistance</button></section>}
</>} outputs={<><LessonExample key={activity.id} activityId={activity.id} example={workspace.lessonExample} endpoint={url} bookingId={bookingId} predictionLocked={stage === "predict" && !workspace.prediction} />      <section aria-label="My Program" tabIndex={0} className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Your execution</p><h2 className="mt-1 text-lg font-bold">My Program</h2></div><span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">{dirty ? "Changes not yet run" : "Your own result"}</span></div>{dirty && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Your editor has changed. This is the previous result; run again to check your changes.</p>}{workspace.lastExecution && workspace.executionProgram === "learner" && <p className="text-sm text-slate-600">{workspace.executionKind === "personal" ? "Result from your personal test input." : workspace.executionKind === "assessment" ? "Result from the first supplied assessment case." : "Your program with the lesson’s starting data."}</p>}<p role="status" className="rounded-xl bg-slate-50 p-3 text-sm font-semibold">{working ? "Running or saving…" : dirty ? "Run your changes to update this result" : workspace.lastExecution ? workspace.lastExecution.ok ? workspace.checks.some(check => !check.passed) ? "Executed · keep improving against the checks" : "Execution finished · mastery is assessed separately" : "Execution error · inspect the feedback below" : "Ready for your first run"}</p><LearningExecution replayContext="program" evidence={workspace.evidenceScope === "author" ? [] : selectedEvidence} onEvidence={setOpenedEvidence} previewError={error} previewBusy={working} resizablePreview={activity.year >= 6} execution={workspace.executionProgram === "lesson" ? null : workspace.lastExecution} input={workspace.executionInput} map={workspace.map} stylesheet={workspace.artifact.type === "source" ? workspace.artifact.css : ""} onInteraction={!editable || dirty ? undefined : (interaction) => perform("run", { interaction })} />
        {!dirty && openedEvidence && selectedEvidence.filter((entry) => entry.slot === openedEvidence).map((entry) => <EvidencePreview key={`${entry.versionId}:${entry.artifactHash}`} binding={entry} bookingId={bookingId} />)}
        {!dirty && workspace.checks.length > 0 && <ul className="space-y-2 text-sm">{workspace.checks.map((check, i) => <li key={i} className={check.passed ? "text-green-800" : "text-amber-900"}>{check.passed ? "✓" : "○"} {check.description}</li>)}</ul>}
        {Object.keys(workspace.files).length > 0 && <details className="rounded-xl border border-slate-200 p-3"><summary className="min-h-11 cursor-pointer font-semibold">Saved project files</summary><p className="mb-3 text-sm text-slate-600">These are this stage&apos;s saved files. HTML and stylesheets are shown as read-only source. Edit your program and run it to update them.</p>{Object.entries(workspace.files).map(([name, content]) => <details key={name} className="mt-2 rounded-lg border border-slate-200 p-2"><summary className="min-h-11 cursor-pointer break-all font-mono text-sm">{name}</summary><SourceEditor value={content} language={name.endsWith(".json") ? "json" : name.endsWith(".sql") ? "sql" : name.endsWith(".html") ? "html" : name.endsWith(".css") ? "css" : "text"} label={`Saved project file ${name}`} readOnly onChange={() => {}} /></details>)}</details>}
        {Object.keys(workspace.retainedFiles ?? {}).length > 0 && <details className="rounded-xl border border-amber-200 p-3"><summary className="min-h-11 cursor-pointer font-semibold">Earlier files with no stage label</summary><p className="mb-3 text-sm text-slate-600">These earlier workspace files are retained exactly as saved. They are available to inspect and are not used as starting data for a new stage.</p>{Object.entries(workspace.retainedFiles).map(([name, content]) => <div key={name}><h4 className="mt-3 break-all font-mono text-sm">{name}</h4><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs">{content}</pre></div>)}</details>}
      </section>
</>}>
      {stage !== "review" && <section aria-label="Program Editor" className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{editable ? "Program Editor" : "Teaching program"}</h2>{artifact.type === "source" && artifact.entry === "dom" && <div className="flex flex-wrap gap-2" aria-label="Project files">{(["html", "css", "source"] as const).map((name) => <button key={name} type="button" className={`${button} ${name === file ? "bg-sky-100" : ""}`} aria-pressed={name === file} onClick={() => setFile(name)}>{name === "source" ? "JavaScript" : name.toUpperCase()}</button>)}</div>}</div>
        {workspace.input && typeof workspace.input === "object" && !Array.isArray(workspace.input) && "variables" in workspace.input && workspace.input.variables && typeof workspace.input.variables === "object" && !Array.isArray(workspace.input.variables) && <section className="rounded-xl border border-slate-300 bg-slate-50 p-3"><h3 className="font-semibold text-slate-900">Starting data</h3><dl className="mt-2 flex flex-wrap gap-3">{Object.entries(workspace.input.variables).map(([name, value]) => <div key={name} className="rounded-lg bg-white px-3 py-2"><dt className="font-mono text-xs text-slate-600">{name}</dt><dd className="mt-1 font-mono text-base text-slate-950">{JSON.stringify(value)}</dd></div>)}</dl><p className="mt-2 text-xs text-slate-600">These values are supplied before your program starts. Assessment also uses different starting data.</p></section>}
        {artifact.type === "visual" && activity.workflow?.planBeforeRun && <RoutePlanEditor value={artifact.document} readOnly={busy || !editable} required={stage === "build" || stage === "create"} recorded={workspace.planRecorded && planSignature(artifact) === planSignature(workspace.artifact)} onChange={(document) => edit({ type: "visual", document })} onRecord={() => void perform("plan")} />}
        {artifact.type === "source" ? <SourceEditor value={artifact[file] ?? ""} language={file === "html" ? "html" : file === "css" ? "css" : artifact.language} label={`${file === "source" ? artifact.language : file} source code`} executionError={!dirty && workspace.executionProgram === "learner" ? workspace.lastExecution?.error : null} readOnly={busy || !editable} onChange={(value) => edit({ ...artifact, [file]: value })} />
          : activity.workbench === "media" ? <MediaLibraryEditor value={artifact.document} input={workspace.input} readOnly={busy || !editable} onChange={(document) => edit({ type: "visual", document })} onCommit={(document) => void perform("save", { artifact: { type: "visual", document } })} />
            : activity.workbench === "game" ? <GameStudio year={activity.year} value={artifact.document} readOnly={busy || !editable} onChange={(document) => edit({ type: "visual", document })} />
            : activity.workbench === "ai" ? <ClassifierStudio value={artifact.document} readOnly={busy || !editable} onChange={(document) => edit({ type: "visual", document })} />
            : activity.workbench === "systems" ? <SystemsStudio value={artifact.document} input={workspace.input} readOnly={busy || !editable} onChange={(document) => edit({ type: "visual", document })} />
            : activity.workbench === "investigation" ? <InvestigationStudio value={artifact.document} input={workspace.input} readOnly={busy || !editable} onChange={(document) => edit({ type: "visual", document })} />
            : activity.workbench === "engineering" ? <EngineeringStudio value={artifact.document} input={workspace.input} readOnly={busy || !editable} onChange={(document) => edit({ type: "visual", document })} />
            : activity.workbench === "data" ? <DataStudio advancedPreparation={activity.year >= 6} value={artifact.document} input={workspace.input} readOnly={busy || !editable} onChange={(document) => edit({ type: "visual", document })} />
            : activity.workbench === "evidence" ? <EvidenceStudio value={artifact.document} input={workspace.input} readOnly={busy || !editable} onChange={(document) => edit({ type: "visual", document })} onCommit={(document) => void perform("save", { artifact: { type: "visual", document } })} />
            : activity.workbench === "network" ? <NetworkStudio value={artifact.document} input={workspace.input} readOnly={busy || !editable} onChange={(document) => edit({ type: "visual", document })} />
            : activity.workbench === "scenario" ? <ScenarioEditor value={artifact.document} input={workspace.input} concepts={activity.concepts} readOnly={busy || !editable} onChange={(document) => edit({ type: "visual", document })} />
            : activity.workbench === "dual" ? <DualProgramEditor value={artifact.document} year={activity.year} onValidityChange={setBlocksValid} readOnly={busy || !editable} onChange={(document) => edit({ type: "visual", document })} />
            : <VisualProgramEditor value={artifact.document} year={activity.year} onValidityChange={setBlocksValid} playSignal={traceRun} traceOperations={!dirty && workspace.lastExecution ? workspace.lastExecution.trace.flatMap(item => item && typeof item === "object" && !Array.isArray(item) && typeof item.op === "string" ? [item.op] : []) : []} readOnly={busy || !editable} onChange={(document) => edit({ type: "visual", document })} />}
        {artifact.type === "source" && activity.year >= 5 && <ProjectFilesEditor artifact={artifact} readOnly={busy || !editable} onChange={edit} />}
        {(activity.workflow?.saveAndReplay || activity.workflow?.restoreVersion) && editable && <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-950">Before checking this stage, save your work{activity.workflow.restoreVersion ? ", retrieve that copy from Saved versions" : ""}{activity.workflow.saveAndReplay ? ", then run the saved program and inspect its replay" : ""}. Changes to the artifact need fresh save and replay evidence.</p>}
        {artifact.type === "visual" && ["route", "scene", "robot"].includes(activity.workbench) && <div className="flex flex-wrap gap-2" aria-label="Play program events">{activity.year > 2 && <label className="text-sm">Event input value<input className="ml-2 min-h-11 max-w-full rounded-xl border border-slate-400 px-3 text-slate-950" value={eventValue} maxLength={300} disabled={busy || !editable} onChange={(event) => setEventValue(event.target.value)} /></label>}<button className={button} type="button" disabled={busy || !editable} onClick={() => void perform("run", { interaction: { type: "click", target: "restart" } })}>Restart play</button>{visualEventNames(artifact.document).filter((name) => name !== "start" && name !== "restart").map((name) => <button key={name} className={button} type="button" disabled={busy || !editable} onClick={() => void perform("run", { interaction: { type: "click", target: name, value: eventValue } })}>Press {name}</button>)}</div>}
        {inputProfile && <SourceTestInputs key={`${stage}:${inputEpoch}`} initial={workspace.personalInput} defaults={inputProfile.stdin ? { stdin: inputProfile.suppliedStdin } : { variables: inputProfile.variables ?? {} }} stdin={inputProfile.stdin} disabled={busy} onChange={(value, valid) => { personal.current = { value, valid }; }} />}
        <div className="flex flex-wrap gap-2">{editable && <button type="button" className={button} disabled={busy} onClick={() => perform("save")}>Save version</button>}{editable && <button type="button" className={primaryButton} disabled={busy} onClick={() => perform("run")}>{busy ? "Working…" : runLabel}</button>}
          {stage === "predict" ? <button type="button" className={button} disabled={busy || !choice} onClick={() => perform("predict", { choiceId: choice })}>Record prediction</button> : <button type="button" className={button} disabled={busy} onClick={() => perform("check")}>{stage === "create" ? "Assess independently" : "Check and continue"}</button>}
          {editable && <button type="button" className={button} disabled={busy} onClick={() => perform("restore")}>{stage === "create" ? "Fresh independent variation" : "Restore starter"}</button>}
        </div><p className="text-xs leading-5 text-slate-500">Saving retains previous versions. Running alone does not award mastery.</p>
      </section>}
      {stage === "review" && <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="text-lg font-bold">Explain your actual work</h2>{activity.instruction.reflection.map((prompt) => <p key={prompt} className="text-slate-700">{prompt}</p>)}<label className="block font-semibold">Your explanation<textarea value={explanation} maxLength={4000} disabled={busy} rows={6} className="mt-2 w-full rounded-xl border border-slate-400 p-3 font-normal" onChange={(event) => setExplanation(event.currentTarget.value)} /></label><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={() => perform("save", { explanation })}>Save explanation draft</button><button type="button" className={primaryButton} disabled={busy || !explanation.trim()} onClick={() => perform("reflect", { explanation })}>Verify mastery and explanation</button></div>{workspace.explanationReview && <p className="rounded-xl bg-slate-100 p-3 text-slate-800">{workspace.explanationReview.message}</p>}</section>}

    </CodingStudioFrame>
    {activity.workflow?.originalDemonstration && workspace.stage === "create" && <DemonstrationRecorder activityId={activity.id} artifact={artifact} taskHash={workspace.independentFingerprint} disabled={working || dirty} bookingId={bookingId} attached={workspace.demonstration} attachedMatches={workspace.demonstrationMatchesArtifact} authorPreview={workspace.evidenceScope === "author"} onAttach={attachment => perform("save", { demonstration: attachment })} />}
    {activity.workflow?.originalDemonstration && workspace.stage === "review" && workspace.demonstration && <PrivateDemonstrationPlayer attachment={workspace.demonstration} activityId={activity.id} bookingId={bookingId} />}
  </main>;
}
