"use client";

import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import FloatingGuide from "./FloatingGuide";
import GuideSettings from "./GuideSettings";
import { useGuideSpeech } from "./useGuideSpeech";
import { advance, guideTarget, humanCharacters, readPreferences, writePreferences, type GuidePreferences, type Level, type Step } from "./guide";

type Props = {
  learner: string;
  guide: string;
  steps: readonly Step[];
  established?: boolean;
  reducedMotion?: boolean;
  project?: string;
  secondSteps?: readonly Step[];
  context?: string;
  orientationLength?: number;
  codingTools?: ReactNode;
  stage?: string;
  objective?: string;
};

export default function StarLizHelper(props: Props) {
  return <Helper key={props.learner} {...props} />;
}

function Helper({ learner, guide, steps, established, reducedMotion, project, secondSteps, context, orientationLength, stage, objective, codingTools }: Props) {
  const [prefs, setPrefs] = useState<GuidePreferences | null>(null);
  const [requested, setRequested] = useState(false);
  const [fullTour, setFullTour] = useState(false);
  const [stuck, setStuck] = useState<"instructions" | "context" | null>(null);
  const [minimised, setMinimised] = useState<boolean | null>(null);
  const [celebration, setCelebration] = useState(0);
  const second = Boolean(project && prefs?.firstProject && prefs.firstProject !== project);
  const baseId = fullTour && orientationLength ? `${guide}:full` : project ? `${guide}:${second ? "second" : "first"}:${project}` : guide;
  const id = stage ? `${baseId}:${stage}` : baseId;
  const allSteps = second && secondSteps ? secondSteps : steps;
  const visibleSteps = orientationLength && !fullTour ? allSteps.slice(0, orientationLength) : allSteps;
  const level = prefs?.level;
  const activeSteps = level === "gentle" && !second && !orientationLength
    ? visibleSteps.filter(item => !["editor", "tools", "fit", "start", "result"].includes(item.id))
    : visibleSteps;
  const current = activeSteps.find(item => item.id === prefs?.progress[id]) ?? activeSteps[0];
  const enabled = prefs?.enabled === true;
  const showing = Boolean(enabled && current && (requested || (level !== "minimal" && !prefs?.completed.includes(id))));
  const expanded = minimised === null ? showing : !minimised;
  const instructionsTarget = stage ? "coding-task-description" : "lesson-instructions";
  const target = stuck === "instructions" ? instructionsTarget : stuck === "context" ? context ?? current?.target : current?.target;
  const title = stuck === "instructions" && stage ? "Find the instructions" : current?.title;
  const instruction = stuck === "instructions"
    ? objective ?? "Learn & Explore has the task, examples, and steps. Open it whenever you need the instructions."
    : stuck === "context" ? activeSteps.find(step => step.target === target)?.hint ?? current?.hint
    : level === "full" && !second ? current?.text : current?.hint;
  const speech = useGuideSpeech(showing && expanded && instruction ? instruction : "", prefs?.speakInstructions === true, prefs?.voiceId, prefs?.voiceSpeed, id, prefs?.character, prefs?.voiceAccent, expanded);

  useEffect(() => {
    if (learner) queueMicrotask(() => setPrefs(current => current ?? readPreferences(learner, established)));
  }, [learner, established]);

  function update(value: GuidePreferences) {
    setPrefs(value);
    writePreferences(learner, value);
  }

  function closeHelp() {
    setRequested(false);
    setStuck(null);
    setMinimised(null);
  }

  function handleAction(action: string) {
    if (!showing || !prefs || !current) return;
    if (stuck && action === "ack") { closeHelp(); return; }
    const next = advance(activeSteps, current, action);
    if (next === current) return;
    if (action !== "skip" && action !== "run-needs-work") setCelebration(value => value + 1);
    if (next) {
      update({ ...prefs, progress: { ...prefs.progress, [id]: next.id } });
      return;
    }
    const finishedProject = !stage || stage === "build" && current.id === "check" && ["check", "stage-passed"].includes(action);
    update({ ...prefs, firstProject: prefs.firstProject ?? (finishedProject ? project : undefined), completed: [...new Set([...prefs.completed, id])], progress: { ...prefs.progress, [id]: "" } });
    closeHelp();
  }
  const onGuideAction = useEffectEvent(handleAction);

  useEffect(() => {
    if (!enabled) return;
    const action = (event: Event) => onGuideAction((event as CustomEvent<string>).detail);
    const click = (event: MouseEvent) => {
      if (event.target instanceof Element) {
        const name = event.target.closest<HTMLElement>("[data-guide-action]")?.dataset.guideAction;
        if (name && !event.defaultPrevented) onGuideAction(name);
      }
    };
    document.addEventListener("starliz-guide-action", action);
    document.addEventListener("click", click, true);
    return () => { document.removeEventListener("starliz-guide-action", action); document.removeEventListener("click", click, true); };
  }, [enabled]);

  if (!prefs || !learner) return null;

  function locate(target: string) {
    if (target === "coding-task-description") {
      const panel = document.querySelector<HTMLDetailsElement>("[data-coding-instructions]");
      if (panel) panel.open = true;
    }
    (guideTarget(target) ?? (target === "coding-task-description" ? guideTarget("lesson-instructions") : undefined))?.scrollIntoView({ block: "center", behavior: "instant" });
  }

  function requestHelp(kind: "instructions" | "context") {
    setStuck(kind);
    setRequested(true);
    setMinimised(false);
    locate(kind === "instructions" ? instructionsTarget : context ?? current?.target ?? "");
  }

  const restart = (tour: boolean) => {
    const restartId = tour && orientationLength ? `${guide}:full` : id;
    update({ ...prefs, progress: { ...prefs.progress, [restartId]: "" } });
    setMinimised(false);
    setFullTour(tour);
    setStuck(null);
    setRequested(true);
  };
  const toggle = <button type="button" className="starliz-guide-action" aria-pressed={enabled} onClick={() => { closeHelp(); update({ ...prefs, enabled: !enabled }); }}>Helper: {enabled ? "ON" : "OFF"}</button>;
  if (!enabled) return <div className="starliz-guide-off">{toggle}</div>;

  const accentVoices = speech.voices.filter(voice => !prefs.voiceAccent || voice.lang === prefs.voiceAccent);
  const selectableVoices = accentVoices.length ? accentVoices : speech.voices;
  const voiceOptions = speech.voices.filter(voice => selectableVoices.includes(voice) || voice.voiceURI === prefs.voiceId);
  const settings = <GuideSettings key={id} character={prefs.character} alternateAppearances={prefs.alternateAppearances} onCharacter={character => update({ ...prefs, character })}>
    {toggle}
    {speech.voices.length === 0 && <p>No on-device English voices available. Instructions are shown as text.</p>}
    {speech.voices.length > 0 && <label><input type="checkbox" checked={prefs.speakInstructions === true} onChange={event => update({ ...prefs, speakInstructions: event.target.checked })} /> Speak instructions</label>}
    {speech.voices.length > 0 && <>
      <label>Accent <select aria-label="Accent" value={speech.voices.some(voice => voice.lang === prefs.voiceAccent) ? prefs.voiceAccent : ""} onChange={event => update({ ...prefs, voiceAccent: event.target.value })}>
        <option value="">Automatic</option>
        {[...new Set(speech.voices.map(voice => voice.lang))].sort().map(locale => <option key={locale} value={locale}>{locale === "en-GB" ? "British English" : locale === "en-US" ? "American English" : locale}</option>)}
      </select></label>
      <label>Voice <select aria-label="Voice" value={prefs.voiceId ?? ""} onChange={event => update({ ...prefs, voiceId: event.target.value })}>
        <option value="">Automatic voice</option>
                {prefs.voiceId && !voiceOptions.some(voice => voice.voiceURI === prefs.voiceId) && <option value={prefs.voiceId}>Saved voice (unavailable)</option>}
        {voiceOptions.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
      </select></label>
      <label>Speed <select aria-label="Speed" value={prefs.voiceSpeed ?? "normal"} onChange={event => update({ ...prefs, voiceSpeed: event.target.value as GuidePreferences["voiceSpeed"] })}>
        <option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option>
      </select></label>
      <p role="status">Character style: {speech.style}. {speech.voice && <>Playing voice: {speech.voice.name} ({speech.voice.lang}). </>}{speech.fallback}
        {speech.voices.length === 1 && " This device has one eligible voice."}</p>
      <button type="button" className="starliz-guide-action" onClick={speech.preview}>Preview voice</button>
      {expanded && showing && <button type="button" className="starliz-guide-action" onClick={speech.replay}>Replay instruction</button>}
      <button type="button" className="starliz-guide-action" onClick={speech.stop}>Stop speaking</button>
    </>}
    {humanCharacters.includes(prefs.character) && <label><input type="checkbox" checked={prefs.alternateAppearances?.[prefs.character] === true}
      onChange={event => update({ ...prefs, alternateAppearances: { ...prefs.alternateAppearances, [prefs.character]: event.target.checked } })} /> Alternate appearance</label>}
    <label>Assistance <select value={prefs.level} onChange={event => { closeHelp(); update({ ...prefs, level: event.target.value as Level }); }}><option value="full">Full Guide</option><option value="gentle">Gentle Guide</option><option value="minimal">Minimal Guide</option></select></label>
    {!showing && <button type="button" className="starliz-guide-action" onClick={() => requestHelp("context")}>I’m stuck</button>}
    {project && <button type="button" className="starliz-guide-action" onClick={() => requestHelp("instructions")}>Find instructions</button>}
    {orientationLength ? <button type="button" className="starliz-guide-action" onClick={() => restart(true)}>Full tour</button> : prefs.completed.includes(id) && <button type="button" className="starliz-guide-action" onClick={() => restart(false)}>Replay guide</button>}
    {stuck && project && <button type="button" className="starliz-guide-action" onClick={() => { const tutor = guideTarget("existing-tutor"); tutor?.scrollIntoView({ block: "center" }); tutor?.focus({ preventScroll: true }); }}>Find AI tutor</button>}
    <button type="button" className="starliz-guide-action" onClick={() => update({ ...prefs, resting: prefs.resting?.x === 0 ? { x: 1, y: 1 } : { x: 0, y: 1 } })}>Switch resting corner</button>
  </GuideSettings>;

  return <FloatingGuide settings={settings} character={prefs.character} alternate={prefs.alternateAppearances?.[prefs.character]} resting={prefs.resting} target={showing && expanded ? target : undefined}
    highlight={showing && expanded && (level === "full" || stuck === "instructions")} reducedMotion={reducedMotion} expanded={expanded} thinking={Boolean(stuck || current?.id === "repair" || current?.id === "plan")} speaking={speech.speaking}
    celebration={celebration} onToggle={() => setMinimised(expanded)} onRest={resting => update({ ...prefs, resting })}>
      {showing && current && <div className="starliz-guide-bubble" data-reduced-motion={reducedMotion || undefined} aria-label={prefs.character}>
        <div className="min-w-0 flex-1">
          <p role="status" className="starliz-guide-copy"><strong>{title}</strong><span>{instruction}</span></p>
          <div className="starliz-guide-actions">
            <button type="button" className="starliz-guide-action starliz-guide-locate" onClick={() => locate(target ?? "")}>Show me</button>
            {(current.action === "ack" || stuck) && <button type="button" className="starliz-guide-action" onClick={() => handleAction("ack")}>Got it</button>}
            <button type="button" className="starliz-guide-action" onClick={() => requestHelp("context")}>I’m stuck</button>
            {!stuck && <button type="button" className="starliz-guide-action" onClick={() => handleAction("skip")}>Skip</button>}
            {requested && <button type="button" className="starliz-guide-action" onClick={closeHelp}>Close help</button>}
          </div>
        </div>
      </div>}
      {codingTools && <div className="starliz-guide-tools">{codingTools}</div>}

  </FloatingGuide>;
}
