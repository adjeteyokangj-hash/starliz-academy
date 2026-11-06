"use client";
import { useEffect, useState } from "react";
import { Code2, Globe, Play, RotateCcw, ArrowRight } from "lucide-react";
import SourceEditor from "./SourceEditor";
import FunctionCodeGuide from "./FunctionCodeGuide";
import LearningExecution from "./LearningExecution";
import { beginnerTracks } from "@/lib/coding/learning/beginner-playground";
import type { Execution, PracticalArtifact } from "@/lib/coding/learning/types";
import ProjectPreview, { type ProjectInteraction } from "./ProjectPreview";
import styles from "./CodingPlayground.module.css";
import { openPlaygroundStep, resetPlaygroundStep, playgroundStorageKey, restorePlaygroundSession, samePlaygroundArtifact } from "@/lib/coding/learning/playground-drafts";
import type { PlaygroundAssessment } from "@/lib/coding/learning/playground-assessment";
import SyntaxGuide from "./SyntaxGuide";
import { syntaxGuidance } from "@/lib/coding/learning/code-guidance";
export default function CodingPlayground() {
  const [trackId, setTrackId] = useState("python"), [stepIndex, setStepIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, PracticalArtifact>>({});
  const [result, setResult] = useState<Execution | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [checked, setChecked] = useState<{ id: string; artifact: PracticalArtifact; assessment: PlaygroundAssessment } | null>(null);
  const [ready, setReady] = useState(false), [storageMessage, setStorageMessage] = useState("");
  const [events, setEvents] = useState<ProjectInteraction[]>([]);
  const track = beginnerTracks.find(item => item.id === trackId)!;
  const step = track.steps[stepIndex];
  const artifact = drafts[step.id] ?? openPlaygroundStep(drafts, step.id);
  const assessment = checked?.id === step.id && samePlaygroundArtifact(checked.artifact, artifact) ? checked.assessment : null;
  useEffect(() => {
    try {
      const saved = restorePlaygroundSession(localStorage.getItem(playgroundStorageKey) ?? localStorage.getItem("starliz-coding-playground-v1"));
      // Browser-only drafts are restored after hydration; no academic record is touched.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDrafts(saved.drafts); setTrackId(saved.trackId); setStepIndex(saved.stepIndex);
    } catch { setStorageMessage("This browser cannot save drafts. Keep this tab open to keep your work."); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(playgroundStorageKey, JSON.stringify({ version: 2, drafts, trackId, stepIndex })); }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    catch { setStorageMessage("This browser cannot save drafts. Keep this tab open to keep your work."); }
  }, [drafts, trackId, stepIndex, ready]);
  const web = trackId === "web";
  const runLabel = web ? "See my page" : "Run code";
  const output = result?.output && typeof result.output === "object" && !Array.isArray(result.output) ? result.output : {};
  const rendered = output.result && typeof output.result === "object" && !Array.isArray(output.result) ? output.result : {};
  function clearResult() { setResult(null); setChecked(null); setError(""); setEvents([]); }
  function navigate(nextTrack: string, index: number) {
    const destination = beginnerTracks.find(item => item.id === nextTrack)!.steps[index]!;
    setDrafts(previous => { const retained = { ...previous, [step.id]: artifact }; return { ...retained, [destination.id]: openPlaygroundStep(retained, destination.id) }; });
    setTrackId(nextTrack); setStepIndex(index); clearResult();
  }
  async function run(interaction?: ProjectInteraction) {
    if (busy) return;
    const nextEvents = interaction ? [...events, interaction].slice(-30) : [];
    setBusy(true); setError(""); setChecked(null);
    try {
      const response = await fetch("/api/dev/coding-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: step.id, artifact, events: nextEvents }) });
      const data = await response.json();
      if (!response.ok) throw new Error("We could not run your code just now. Try again in a moment.");
      setResult(data.execution); setEvents(nextEvents);
      setChecked({ id: step.id, artifact: structuredClone(artifact), assessment: data.assessment });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Try running your code again."); }
    finally { setBusy(false); }
  }
  if (!ready) return <main className={`${styles.page} ${styles.beginner}`}><p role="status">Opening your practice drafts…</p></main>;
  return <main className={`${styles.page} ${styles.beginner}`}>
    <header className={styles.header}><div className={styles.brand}><span className={styles.brandIcon}><Code2 size={24} /></span><div><p className={styles.eyebrow}>STARLIZ CODING CLUB</p><h1>Let’s make something!</h1></div></div><p className={styles.intro}>A little code. A big imagination. Choose where to start.</p></header>
    <nav className={`${styles.tracks} ${styles.beginnerTracks}`} aria-label="Choose an activity">{beginnerTracks.filter(item => item.id !== "python-functions").map(item => <button type="button" key={item.id} aria-pressed={trackId === item.id || item.id === "python" && trackId === "python-functions"} disabled={busy} onClick={() => { navigate(item.id, 0); }}><span className={styles.trackIcon}>{item.id === "python" ? <Code2 /> : <Globe />}</span><span><strong>{item.title}</strong><small>{item.description}</small></span></button>)}</nav>
    {!web && <nav className={styles.pythonTopics} aria-label="Python topics">{beginnerTracks.filter(item => item.id.startsWith("python")).map(item => <button type="button" key={item.id} disabled={busy} aria-pressed={trackId === item.id} onClick={() => { navigate(item.id, 0); }}>{item.id === "python" ? "1. First messages" : "2. Functions"}</button>)}</nav>}
    <section className={styles.mission} aria-labelledby="mission-title"><div className={styles.missionTop}><p className={styles.eyebrow}>STEP {stepIndex + 1} OF 3 · {stepIndex === 0 ? "EXPLORE" : stepIndex === 1 ? "CHANGE" : "MAKE IT YOURS"}</p><div className={styles.dots} aria-label={`Step ${stepIndex + 1} of 3`}>{track.steps.map((item, index) => <span key={item.id} data-active={index <= stepIndex} />)}</div></div><h2 id="mission-title">{step.title}</h2><p>{step.task}</p><details><summary>Need a little help?</summary><p>{step.hint}</p></details></section>
    {trackId === "python-functions" && <FunctionCodeGuide />}<SyntaxGuide pieces={syntaxGuidance(artifact, step.field)} />
    <div className={styles.beginnerWorkspace}><section className={styles.editor} aria-label="Your code"><div className={styles.editorToolbar}><h2>Your code</h2><span className={styles.languageTag}>{web ? step.field === "html" ? "HTML · words" : step.field === "css" ? "CSS · colours" : "JavaScript · actions" : "Python"}</span></div><div className={styles.code}>{artifact.type === "source" && <SourceEditor key={step.id} value={artifact[step.field] ?? ""} label="Your code" language={step.field === "source" ? artifact.language : step.field} readOnly={busy} onChange={value => { setDrafts(previous => ({ ...previous, [step.id]: { ...artifact, [step.field]: value } })); clearResult(); }} />}</div><footer className={styles.beginnerActions}><button type="button" className={styles.run} disabled={busy} onClick={() => void run()}><Play size={16} fill="currentColor" />{busy ? "Working…" : runLabel}</button><button type="button" className={styles.startAgain} disabled={busy} onClick={() => { setDrafts(previous => ({ ...previous, [step.id]: resetPlaygroundStep(step.id, artifact) })); clearResult(); }}><RotateCcw size={15} />Start again</button></footer></section>
    <section className={styles.results} aria-label="See what happens"><div className={styles.panelHeading}><h2>See what happens</h2><span role="status" className={styles.resultStatus}>{busy ? "Working…" : result?.ok ? "Your code ran!" : ""}</span></div><div className={styles.resultsBody}>{!result && !busy && !error ? <div className={styles.empty}><span className={styles.bigSpark}>✦</span><h3>{web ? "Your planet page goes here" : "Your robot’s message goes here"}</h3><p>Select <strong>{runLabel}</strong> to see what your code makes.</p></div> : error || result && !result.ok ? <div className={styles.friendlyError} role="alert"><h3>Let’s try that again</h3><p>{error || "Something in the code needs a small fix. Check the quotes and brackets, or select Start again to try the example."}</p>{result?.error && <details><summary>Show the error details</summary><pre>{result.error}</pre></details>}</div> : <>{busy && <p role="status">Making your result…</p>}{web && typeof rendered.html === "string" ? <ProjectPreview html={rendered.html} css={rendered.styleInspection ? "" : artifact.type === "source" ? artifact.css : ""} title="Your planet page" onInteraction={step.field === "source" && !busy ? interaction => void run(interaction) : undefined} busy={busy} resetKey={result?.sourceHash} /> : result?.ok && <pre className={styles.robotOutput}>{result.stdout || "Your code ran. Add a print line to show a message."}</pre>}{result && <details className={styles.more}><summary>Show more about this run</summary><LearningExecution execution={result} input={{ events }} stylesheet={artifact.type === "source" ? artifact.css ?? "" : ""} replayContext="program" /></details>}</>}</div></section></div>
    <footer className={styles.lessonFooter}>{stepIndex > 0 && <button type="button" disabled={busy} onClick={() => { navigate(trackId, stepIndex - 1); }}>← Previous step</button>}<span>{assessment?.completed ? "Task complete! You made the requested change." : assessment?.message ?? "Try the task, then run your code to check it."}</span>{stepIndex < 2 && <button type="button" className={styles.run} disabled={busy || !assessment?.completed} onClick={() => { navigate(trackId, stepIndex + 1); }}>Next step <ArrowRight size={16} /></button>}</footer>
    {storageMessage && <p role="status">{storageMessage}</p>}<p className={styles.note}>Just for practice. Drafts stay in this browser after a refresh. Each step keeps its own draft; changing an earlier step does not replace a later draft. Start again resets only the code shown in this step; your other files stay.</p>
  </main>;
}
