"use client";

import CodingGuideTools from "@/components/coding/CodingGuideTools";
import { codingOutcome } from "@/components/coding/coding-guide-outcomes";
import StarLizHelper from "@/components/guidance/StarLizHelper";
import { clubhouseGuide, skillsGuide, worldGuide } from "@/components/guidance/coding-guides";
import { guideEvent } from "@/components/guidance/guide";
import { newWorldId } from "@/lib/coding/world/identity";
import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import BlockCommandsEditor from "../BlockCommandsEditor";
import { locations, missions as builtInMissions, missionUnlocked, unlockedCosmetics, missionCompletionCount, type LocationId, type WorldState, type WorldAction, type WorldRun } from "@/lib/coding/world/model";
import type { VisualCommand } from "@/lib/coding/learning/visual-machine";
import styles from "./world.module.css";
import SimulationScene from "./SimulationScene";
import SourceEditor from "../SourceEditor";
import WorldBuilding from "./WorldBuilding";
import GuidedWorldLessons from "./GuidedWorldLessons";
import LivingSimulation from "./LivingSimulation";
import ClubhouseDesigner from "./ClubhouseDesigner";
import AvatarPortrait from "./AvatarPortrait";
import { simulationActions } from "@/lib/coding/world/simulation";

type Version = { id: string; label: string; createdAt: string; missionId: string; commands?: VisualCommand[]; language?: "python" | "javascript"; source?: string; projectId?: string };
const button = styles.button;
export default function CodingWorld() {
  const [missions, setMissions] = useState(builtInMissions);
  const [world, setWorld] = useState<WorldState | null>(null), current = useRef<WorldState | null>(null);
  const [missionCopy, setMissionCopy] = useState<Array<{ missionId: string; title: string; objective: string; dialogue: string; metadata?: { chapter?: { title: string; order: number }; badgeTitle?: string } }>>([]);
  const [learnerId, setLearnerId] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null), [historyBusy, setHistoryBusy] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState(""), [projectTitle, setProjectTitle] = useState("My invention");
  const [versions, setVersions] = useState<Version[]>([]), [missionId, setMissionId] = useState("pizza-sequence");
  const [editorMode, setEditorMode] = useState<"blocks" | "python" | "javascript">("blocks"), [source, setSource] = useState("");
  const [commands, setCommands] = useState<VisualCommand[]>([]), [valid, setValid] = useState(true), [busy, setBusy] = useState(false), lock = useRef(false);
  const [dirty, setDirty] = useState(false), generation = useRef(0);
  const [error, setError] = useState(""), [status, setStatus] = useState("Opening your private world…"), [hint, setHint] = useState("");
  const [run, setRun] = useState<WorldRun | null>(null), [frame, setFrame] = useState(0), [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<"world" | "clubhouse" | "portfolio">("world"), [readable, setReadable] = useState(false);
  const [environment, setEnvironment] = useState(0);
  const [actionName, setActionName] = useState(""), [repeatCount, setRepeatCount] = useState(2);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ x: 50, y: 48 }), [zoom, setZoom] = useState(1), [angle, setAngle] = useState(0);
  useEffect(() => {
    if (!stick.x && !stick.y) return;
    const timer = setInterval(() => setPosition(p => ({ x: Math.max(5, Math.min(95, p.x + stick.x * 1.8 * (angle === 180 ? -1 : 1))), y: Math.max(8, Math.min(90, p.y + stick.y * 1.8 * (angle === 180 ? -1 : 1))) })), 80);
    return () => clearInterval(timer);
  }, [stick, angle]);
  function steer(event: ReactPointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left - box.width / 2) / (box.width / 2), y = (event.clientY - box.top - box.height / 2) / (box.height / 2);
    const distance = Math.max(1, Math.hypot(x, y)); setStick({ x: x / distance, y: y / distance });
  }
  useEffect(() => {
    const pause = () => { if (document.hidden) { setPlaying(false); setStick({ x: 0, y: 0 }); } };
    document.addEventListener("visibilitychange", pause);
    const timer = setInterval(() => { if (!document.hidden) setEnvironment(value => value + 1); }, 30000);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", pause); };
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const booking = new URLSearchParams(window.location.search).get("bookingId");
        const response = await fetchWithRefreshRetry(`/api/student/coding/world${booking ? `?bookingId=${encodeURIComponent(booking)}` : ""}`, { cache: "no-store" });
        const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Your world could not open.");
        if (!active) return;
        current.current = data.state; setWorld(data.state); setPosition(data.state.position ?? { x: 50, y: 48 }); setLearnerId(data.learnerId); setVersions(data.versions); setNextCursor(data.nextCursor ?? null); setMissionCopy(data.missionCopy ?? []); setMissions(data.missions ?? builtInMissions);
        const id = `${data.state.location}-sequence`; setActiveProjectId(""); setProjectTitle("My invention"); setMissionId(id); setCommands(data.state.programs[id] ?? []);
        setStatus("Welcome back, inventor. Your active missions wait for you.");
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Your world could not open."); }
    })(); return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!playing || !run) return;
    const reduceMotion = Boolean(world?.reducedMotion) || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setInterval(() => setFrame(value => { if (value >= run.frames.length) { setPlaying(false); return value; } return value + 1; }), reduceMotion ? 1200 : 650);
    return () => clearInterval(timer);
  }, [playing, run, world?.reducedMotion]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function persist(action: WorldAction) {
    if (!current.current || lock.current) return null;
    lock.current = true; setBusy(true); setError(""); const sentGeneration = generation.current;
    const revision = current.current.revision;
    const snapshot = action.type === "snapshot" || action.type === "source-snapshot";
    const previousVersions = new Set(versions.map(version => version.id));
    try {
      const response = await fetchWithRefreshRetry("/api/student/coding/world", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ learnerId, bookingId: new URLSearchParams(window.location.search).get("bookingId") || undefined, revision, action }) });
      const data = await response.json(); if (!response.ok || data.ok === false || data.error || !data.state || !Array.isArray(data.versions)) throw new Error(data.error ?? "The server did not confirm your changes.");
      if (snapshot && (data.state.revision !== revision + 1 || !data.versions.some((version: { id?: string; missionId?: string; projectId?: string; commands?: unknown; source?: string; language?: string }) =>
        typeof version.id === "string" && !previousVersions.has(version.id) && version.missionId === action.missionId &&
        version.projectId === action.projectId && ("commands" in action
          ? JSON.stringify(version.commands) === JSON.stringify(action.commands)
          : "source" in action && version.source === action.source && version.language === action.language)))) {
        throw new Error("The server did not confirm a new project version.");
      }
      current.current = data.state; setWorld(data.state); setVersions(data.versions);
      if (["save", "run", "snapshot", "source-save", "source-run", "source-snapshot", "project-save"].includes(action.type) && sentGeneration === generation.current) setDirty(false);
      if (data.hint) setHint(`${data.hintSource === "model" ? "AI companion" : "Guided hint"}: ${data.hint}`);
      if (data.supportMessage) setHint(data.supportMessage);
      if (data.run) { setRun(data.run); setFrame(0); setPlaying(false); }
      if (sentGeneration === generation.current) setStatus(snapshot ? "Project version saved in your private portfolio." : "World saved.");
      if (data.run) { guideEvent("world-run"); codingOutcome({ kind: "run", passed: data.run.ok === true, error: data.run.feedback, moved: data.run.frames?.length > 0 }); }
      if (snapshot && sentGeneration === generation.current) { guideEvent("world-save"); codingOutcome({ kind: "save", location: "world" }); }
      return data.state as WorldState;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your changes could not be saved."); return null; }
    finally { lock.current = false; setBusy(false); }
  }
  useEffect(() => {
    if (!dirty || !valid || busy || error) return;
    const timer = setTimeout(() => { void persist(draftAction("save")); }, 1200);
    return () => clearTimeout(timer);
    // persist uses the latest revision ref; the draft dependencies restart this timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commands, source, editorMode, dirty, valid, busy, error, missionId, activeProjectId, projectTitle]);
  useEffect(() => {
    if (!world || tab !== "world" || busy || error || position.x === world.position.x && position.y === world.position.y) return;
    const timer = setTimeout(() => { void persist({ type: "position", position }); }, 1000);
    return () => clearTimeout(timer);
    // The last server revision is taken from the shared ref by persist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, world?.position.x, world?.position.y, busy, error, tab]);
  function draftAction(type: "save" | "run" | "snapshot"): WorldAction {
    if (type === "save" && activeProjectId) return { type: "project-save", project: { id: activeProjectId, title: projectTitle.trim() || "My invention", missionId, language: editorMode, commands, ...(editorMode === "blocks" ? {} : { source }) } };
    return editorMode === "blocks" ? { type, missionId, commands, projectId: activeProjectId || undefined } : { type: type === "save" ? "source-save" : type === "run" ? "source-run" : "source-snapshot", missionId, language: editorMode, source, projectId: activeProjectId || undefined };
  }
  async function saveNamedProject(asNew = false) {
    const id = asNew || !activeProjectId ? newWorldId() : activeProjectId;
    const saved = await persist({ type: "project-save", project: { id, title: projectTitle.trim() || "My invention", missionId, language: editorMode, commands, ...(editorMode === "blocks" ? {} : { source }) } });
    if (saved) setActiveProjectId(id);
  }
  async function openProject(project: WorldState["projects"][number]) {
    const mission = missions.find(m => m.id === project.missionId); if (!mission || !await travel(mission.location) || !await chooseMission(mission.id)) return;
    setActiveProjectId(project.id); setProjectTitle(project.title); setEditorMode(project.language); generation.current++;
    setCommands(project.commands); setSource(project.source ?? ""); setDirty(false); setTab("world");
  }
  async function loadOlderVersions() {
    if (!nextCursor || historyBusy) return; setHistoryBusy(true);
    try {
      const query = new URLSearchParams({ versionsBefore: nextCursor }); const booking = new URLSearchParams(window.location.search).get("bookingId"); if (booking) query.set("bookingId", booking);
      const response = await fetchWithRefreshRetry(`/api/student/coding/world?${query}`, { cache: "no-store" }); const data = await response.json();
      if (!response.ok || data.learnerId !== learnerId) throw new Error(data.error ?? "Your learner changed. Reload before opening history.");
      setVersions(previous => [...previous, ...data.versions.filter((version: Version) => !previous.some(existing => existing.id === version.id))]); setNextCursor(data.nextCursor ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "History could not be opened."); } finally { setHistoryBusy(false); }
  }
  async function switchEditor(next: "blocks" | "python" | "javascript") {
    if (busy || !valid) return;
    if (dirty && !await persist(draftAction("save"))) return false;
    setEditorMode(next); setValid(true);
    const saved = current.current?.sources[missionId];
    if (next !== "blocks") setSource(saved?.language === next ? saved.source : sourceStarter(next));
  }
  function edit(next: VisualCommand[]) { generation.current++; setCommands(next); setDirty(true); setError(""); setRun(null); setPlaying(false); }
  async function chooseMission(id: string) {
    if (!world || busy || !valid) return false;
    if (dirty && !await persist(draftAction("save"))) return false;
    setMissionId(id); setCommands(current.current?.programs[id] ?? []); setEditorMode("blocks"); setSource(current.current?.sources[id]?.source ?? ""); setDirty(false); setHint(""); setRun(null); setFrame(0); setPlaying(false); return true;
  }
  async function travel(id: LocationId) {
    if (!world || busy || !valid) return false;
    if (dirty && !await persist(draftAction("save"))) return false;
    const state = current.current!;
    if (!await persist({ type: "preferences", location: id, avatar: state.avatar, companion: state.companion, decoration: state.decoration, highContrast: state.highContrast, reducedMotion: state.reducedMotion })) return false;
    const location = locations.find(l => l.id === id)!; setPosition({ x: location.x, y: location.y }); setTab("world");
    const chosen = await chooseMission(`${id}-sequence`);
    if (chosen) guideEvent("travel");
    return chosen;
  }
  function preference(values: Partial<Pick<WorldState, "avatar" | "companion" | "decoration" | "reducedMotion" | "highContrast">>) {
    if (!world || lock.current) return;
    setWorld({ ...world, ...values });
    void persist({ type: "preferences", location: world.location, avatar: world.avatar, companion: world.companion, decoration: world.decoration, reducedMotion: world.reducedMotion, highContrast: world.highContrast, ...values }).then(saved => { if (!saved) setWorld(current.current); });
  }
  if (!world) return <div className={`starliz-page ${styles.shell}`}><Link href="/student/coding">← Coding Learning</Link><h1>StarLiz Inventors Academy</h1><p role={error ? "alert" : "status"}>{error || status}</p>{error && <button className={button} onClick={() => window.location.reload()}>Try again</button>}</div>;
  const location = locations.find(l => l.id === world.location)!;
  const definition = missions.find(m => m.id === missionId)!;
  const copy = missionCopy.find(copy => copy.missionId === missionId);
  const mission = { ...definition, ...(copy ? { title: copy.title, objective: copy.objective } : {}) };
  const stars = world.completed.length * 3;
  const cosmetics = unlockedCosmetics(world.completed.length);
  const recommended = missions.filter(m => missionUnlocked(world, m) && !world.completed.includes(m.id)).sort((a, b) => a.chapter - b.chapter)[0];
  const project = (value: number) => 50 + (value - 50) * zoom * (angle === 180 ? -1 : 1);
  return <div className={`starliz-page ${styles.shell} ${world.highContrast ? styles.contrast : ""}`}>
    <StarLizHelper learner={learnerId} codingTools={tab === "world" ? <CodingGuideTools key={`${missionId}:${editorMode}`} blocks={editorMode === "blocks"} reducedMotion={world.reducedMotion} /> : undefined} guide={`world-${tab}`} steps={tab === "world" ? worldGuide : tab === "clubhouse" ? clubhouseGuide : skillsGuide} orientationLength={tab === "world" ? 2 : undefined} reducedMotion={world.reducedMotion} established={world.completed.length > 0} />
    <header className={styles.header}><div><Link href="/student/coding" className={styles.back}>← Continue Coding Lesson</Link><p className={styles.eyebrow}>THE STARLIZ INVENTORS ADVENTURE</p><h1>A little code. A world of possibilities.</h1><p>Your own world to explore, experiment and invent.</p></div><div className={styles.score}><AvatarPortrait appearance={world.appearance} size={40}/><strong>★ {stars}</strong><small>Practice stars</small></div></header>
    <nav className={styles.tabs} aria-label="Game World"><button className={button} aria-pressed={tab === "world"} onClick={() => setTab("world")}>✦ Explore world</button><button className={button} aria-pressed={tab === "clubhouse"} data-guide-target="clubhouse-tab" data-guide-action="open-clubhouse" onClick={() => setTab("clubhouse")}>⌂ My clubhouse</button><button className={button} aria-pressed={tab === "portfolio"} data-guide-target="skills-tab" data-guide-action="open-skills" onClick={() => setTab("portfolio")}>▤ Inventions & skills</button><span role="status">{busy ? "Saving…" : dirty ? "Unsaved changes" : status}</span></nav>
    {error && <div role="alert" className={styles.error}>{error} <button className={button} disabled={busy || !valid} onClick={() => void persist(draftAction("save"))}>Retry save</button><button className={button} onClick={() => { if (!dirty || window.confirm("Discard unsaved changes and reload your saved world?")) window.location.reload(); }}>Reload saved world</button></div>}
    {tab === "world" && <>
      <GuidedWorldLessons/>
      {recommended && <section className={styles.recommendation}><div><strong>Your next invention</strong><p>{locations.find(l => l.id === recommended.location)!.title} · {recommended.title}</p><small>Recommended from your practice progress. Your formal learning journey stays separate.</small></div><button className={button} disabled={busy || !valid} onClick={async () => { if (await travel(recommended.location)) await chooseMission(recommended.id); }}>Try this invention →</button></section>}
      <section className={styles.explore} data-guide-target="game-world-map" aria-label="Connected world">
        <div className={styles.mapTitle}><div><p className={styles.eyebrow}>YOUR NEXT GREAT INVENTION STARTS HERE</p><h2>Welcome to Inventors Academy</h2></div><span className={styles.pill}>{Math.floor(environment / 5) % 2 ? "☾ A quiet evening for ideas" : "☀ A bright day for ideas"}</span></div>
        <div className={`${styles.map} ${Math.floor(environment / 5) % 2 ? styles.evening : ""}`} tabIndex={0} role="group" aria-label="World map. Arrow keys move your avatar. Select a location to travel." onKeyDown={event => { if (event.target !== event.currentTarget || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return; event.preventDefault(); setPosition(p => ({ x: Math.max(5, Math.min(95, p.x + (angle === 180 ? -1 : 1) * (event.key === "ArrowRight" ? 3 : event.key === "ArrowLeft" ? -3 : 0))), y: Math.max(8, Math.min(90, p.y + (angle === 180 ? -1 : 1) * (event.key === "ArrowDown" ? 3 : event.key === "ArrowUp" ? -3 : 0))) })); }} onClick={event => { if (event.target !== event.currentTarget) return; const box = event.currentTarget.getBoundingClientRect(); setPosition({ x: 50 + ((event.clientX - box.left) / box.width * 100 - 50) / zoom * (angle === 180 ? -1 : 1), y: 50 + ((event.clientY - box.top) / box.height * 100 - 50) / zoom * (angle === 180 ? -1 : 1) }); }}>
          <div className={styles.island} style={{ transform: `translate(-50%, -50%) rotate(${angle}deg) scale(${zoom})` }} aria-hidden="true"><div className={styles.pathHorizontal}/><div className={styles.pathVertical}/><span className={styles.treeOne}>🌳</span><span className={styles.treeTwo}>🌲</span></div>
          <button className={styles.hubButton} style={{ left: `${project(50)}%`, top: `${project(48)}%` }} onClick={() => setTab("clubhouse")} aria-label="Visit Inventors Academy and Clubhouse">🏫<small>Inventors Academy</small></button>
          {locations.map(l => <button key={l.id} className={`${styles.place} ${world.location === l.id ? styles.selected : ""}`} style={{ left: `${project(l.x)}%`, top: `${project(l.y)}%` }} disabled={busy || !valid} onClick={() => void travel(l.id)} aria-label={`Travel to ${l.title}`}><span className={styles.building}><WorldBuilding location={l.id} level={missionCompletionCount(world, l.id, missions)}/></span><strong>{l.title}</strong><small>{missionCompletionCount(world, l.id, missions)}/{missions.filter(m => m.location === l.id).length} inventions</small></button>)}
          <span className={styles.avatar} style={{ left: `${project(position.x)}%`, top: `${project(position.y)}%`, transition: world.reducedMotion ? "none" : undefined }} aria-label="Your avatar"><AvatarPortrait appearance={world.appearance} size={32}/></span>
        </div>
        <div className={styles.mapControls}><div role="group" aria-label="On-screen joystick" className={styles.joystick} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); steer(event); }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) steer(event); }} onPointerUp={event => { event.currentTarget.releasePointerCapture(event.pointerId); setStick({ x: 0, y: 0 }); }} onPointerCancel={() => setStick({ x: 0, y: 0 })} onLostPointerCapture={() => setStick({ x: 0, y: 0 })}><span style={{ transform: `translate(${stick.x * 15}px, ${stick.y * 15}px)` }}/></div><span>{environment % 4 === 2 ? "🌧 A gentle simulated shower. " : environment % 4 === 3 ? "☁ Passing clouds. " : ""}Walk with arrow keys or tap open ground. Fast travel to any location.</span><div><button aria-label="Move avatar left" className={button} onClick={() => setPosition(p => ({ ...p, x: Math.max(5, p.x - 5 * (angle === 180 ? -1 : 1)) }))}>←</button><button aria-label="Move avatar up" className={button} onClick={() => setPosition(p => ({ ...p, y: Math.max(8, p.y - 5 * (angle === 180 ? -1 : 1)) }))}>↑</button><button aria-label="Move avatar down" className={button} onClick={() => setPosition(p => ({ ...p, y: Math.min(90, p.y + 5 * (angle === 180 ? -1 : 1)) }))}>↓</button><button aria-label="Move avatar right" className={button} onClick={() => setPosition(p => ({ ...p, x: Math.min(95, p.x + 5 * (angle === 180 ? -1 : 1)) }))}>→</button><button className={button} aria-label="Zoom out" onClick={() => setZoom(z => Math.max(.8, z - .1))}>−</button><button className={button} aria-label="Zoom in" onClick={() => setZoom(z => Math.min(1.1, z + .1))}>+</button><button className={button} onClick={() => setAngle(a => a === 0 ? 180 : 0)}>Rotate</button><button className={button} onClick={() => { setZoom(1); setAngle(0); setPosition({ x: 50, y: 48 }); }}>Reset view</button></div></div>
      </section>
      <section className={styles.workspace} aria-label="Mission workspace"><aside data-guide-target="mission-board" data-guide-anchor className={styles.board}><p className={styles.eyebrow}>MISSION BOARD</p><h2>{location.icon} {location.title}</h2><p>{location.story}</p>{missions.filter(m => m.location === world.location).sort((a,b) => (missionCopy.find(copy => copy.missionId === a.id)?.metadata?.chapter?.order ?? a.chapter) - (missionCopy.find(copy => copy.missionId === b.id)?.metadata?.chapter?.order ?? b.chapter)).map(m => <button key={m.id} className={styles.mission} disabled={busy || !valid || !missionUnlocked(world, m)} aria-pressed={m.id === missionId} onClick={() => void chooseMission(m.id)}><small>{missionCopy.find(copy => copy.missionId === m.id)?.metadata?.chapter?.title ?? `CHAPTER ${m.chapter}`} {world.completed.includes(m.id) ? "✓" : !missionUnlocked(world, m) ? "🔒" : ""}</small><strong>{missionCopy.find(copy => copy.missionId === m.id)?.title ?? m.title}</strong></button>)}<div className={styles.companion}><span>✧</span><strong>{world.companion}, your companion</strong><p>{hint || copy?.dialogue || "Every invention begins with a small idea. Try it, watch what happens, then improve it."}</p><button className={button} disabled={busy || !valid} onClick={() => void persist({ type: "hint", missionId, commands })}>Give me a hint</button><button className={button} disabled={busy || !valid} onClick={() => { const query = new URLSearchParams(window.location.search); void persist({ type: "support", missionId, commands, ...(editorMode === "blocks" ? {} : { language: editorMode, source }), bookingId: query.get("bookingId") || undefined, daytimePeriodId: query.get("daytimePeriodId") || undefined }); }}>Ask for teacher support</button></div></aside>
      <div data-guide-target="my-program" data-guide-anchor className={styles.program}><p className={styles.eyebrow}>MY PROGRAM · FREE PRACTICE</p><div className={styles.projectControls}><label>Project name<input maxLength={60} value={projectTitle} disabled={busy} onChange={event => { setProjectTitle(event.target.value); if (activeProjectId) { generation.current++; setDirty(true); } }}/></label><button className={button} disabled={busy || !valid} onClick={() => void saveNamedProject()}>{activeProjectId ? "Save named project" : "Create named project"}</button>{activeProjectId && <button className={button} disabled={busy || !valid} onClick={() => void saveNamedProject(true)}>Save as another project</button>}</div><h2>{mission.title}</h2><p>{mission.objective}</p><p className={styles.help}>Use <strong>emit</strong> blocks and type the action names exactly. Repeat and if blocks make your invention smarter.</p><div className={styles.toolbar}><button className={button} disabled={busy || !valid} data-guide-target="run-program" onClick={() => void persist(draftAction("run"))}>▶ Run invention</button><button className={button} disabled={busy || !valid} data-guide-target="save-project" onClick={() => void persist(draftAction("snapshot"))}>Save project version</button><button className={button} aria-pressed={readable} onClick={() => setReadable(v => !v)}>Readable code</button><button className={button} disabled={busy} onClick={() => edit([])}>Clear program</button></div>
      <div className={styles.toolbar} role="group" aria-label="Coding language">{(["blocks", "python", "javascript"] as const).map(mode => <button key={mode} className={button} disabled={busy || !valid} aria-pressed={editorMode === mode} onClick={() => void switchEditor(mode)}>{mode === "blocks" ? "Visual blocks" : mode === "python" ? "Write Python" : "Write JavaScript"}</button>)}</div>
      {editorMode === "blocks" && <details className={styles.help}><summary>Simple keyboard and touch controls</summary><p>Add one instruction at a time, then use the existing block canvas to connect decisions and nested instructions.</p><label>Action name <select value={actionName} disabled={busy} onChange={event => setActionName(event.target.value)}><option value="">Choose an action</option>{[...new Set([...(mission.simulation ? simulationActions[mission.simulation] : mission.actions ?? location.cycle), "assist", "ready"])].map(name => <option key={name} value={name}>{name}</option>)}</select></label><button className={button} disabled={busy || !valid || !actionName} onClick={() => edit([...commands, { op: "emit", name: actionName }])}>Add action</button><label>Repeat count <input type="number" min={1} max={10} value={repeatCount} disabled={busy} onChange={event => setRepeatCount(Math.min(10, Math.max(1, Number(event.target.value) || 1)))}/></label><button className={button} disabled={busy || !valid || !commands.length} onClick={() => edit([{ op: "repeat", amount: repeatCount, body: commands }])}>Wrap my program in repeat</button><button className={button} disabled={busy || !commands.length} onClick={() => edit(commands.slice(0, -1))}>Remove last instruction</button></details>}
      {editorMode === "blocks" ? <BlockCommandsEditor key={missionId} commands={commands} onChange={next => edit(next as VisualCommand[])} year={6} readOnly={busy} onValidityChange={setValid}/> : <><p className={styles.help}>Write <code>solve(world)</code> and return a list of action names. Use native loops and conditions; <code>{editorMode === "python" ? "world[\"needsHelp\"]" : "world.needsHelp"}</code> supplies the changing situation. Code runs in the existing isolated coding service.</p><SourceEditor language={editorMode} value={source} label="My written invention" readOnly={busy} onChange={value => { generation.current++; setSource(value); setDirty(true); setRun(null); setPlaying(false); }}/></>}
      {readable && <pre className={styles.code}>{renderCode(commands)}</pre>}
      <LivingSimulation key={location.id} location={location.id} persisted={world.simulations[location.id]} busy={busy} onAction={command => persist({ type: "sandbox", location: location.id, command })} onReset={scenario => persist({ type: "sandbox-reset", location: location.id, scenario })} replay={frame > 0 ? run?.frames[frame - 1]?.simulation : undefined} onLeaveReplay={() => { setRun(null); setFrame(0); setPlaying(false); }}/><section data-guide-target="live-simulation" className={styles.simulation} aria-label="Simulation output"><SimulationScene location={location.id} action={frame > 0 ? run?.frames[frame - 1]?.action ?? "" : ""} completed={frame > 0 ? run?.frames[frame - 1]?.completed ?? 0 : 0}/><div className={styles.simulationScene}><span>{location.icon}</span><div><strong>{mission.simulation ? `System goals: ${frame > 0 && run?.frames[frame - 1]?.completed ? "met" : "inspect the system state"}` : `${location.result}: ${frame > 0 ? run?.frames[frame - 1]?.completed ?? 0 : 0}`}</strong><p>{frame > 0 ? `Action ${frame}: ${run?.frames[frame - 1]?.action}` : `${location.character} is ready for your instructions.`}</p></div></div>{run && <><p role="status">{run.feedback}</p><div className={styles.toolbar}><button className={button} disabled={!run.frames.length} onClick={() => { setFrame(0); setPlaying(true); }}>Replay</button><button className={button} disabled={!run.frames.length} onClick={() => setPlaying(v => !v)}>{playing ? "Pause" : "Play"}</button><button className={button} disabled={frame >= run.frames.length} onClick={() => { setPlaying(false); setFrame(f => f + 1); }}>Step →</button><button className={button} onClick={() => { setPlaying(false); setFrame(0); }}>Reset simulation</button></div><p>{frame}/{run.frames.length} simulation actions · {run.trace.length} runtime steps</p></>}</section></div></section>
    </>}
    {tab === "clubhouse" && <section className={styles.clubhouse}><div className={styles.room}><span>{world.decoration}</span><span>{world.avatar}</span><h2 data-guide-target="clubhouse">My Coding Clubhouse</h2><p>A private space for a growing inventor.</p><strong>{stars} ★ · {world.completed.length} inventions</strong><p>{world.completed.length >= 18 ? "🏅 World inventor" : world.completed.length >= 6 ? "🏅 Academy helper" : world.completed.length >= 1 ? "🏅 First invention" : "Your first invention badge is waiting"}</p><p>New appearances and decorations unlock at 3 and 6 inventions.</p></div><div><h2>Make yourself at home</h2><label>My avatar<select disabled={busy} value={world.avatar} onChange={e => preference({ avatar: e.target.value as WorldState["avatar"] })}>{["🧑‍🚀", "🧑‍🔬", "🧑‍🌾", "🧑‍🍳"].map(v => <option key={v} disabled={!cosmetics.avatars.includes(v)}>{v}{!cosmetics.avatars.includes(v) ? " · unlock with inventions" : ""}</option>)}</select></label><label>My companion<select disabled={busy} value={world.companion} onChange={e => preference({ companion: e.target.value as WorldState["companion"] })}>{["Nova", "Pip", "Pixel"].map(v => <option key={v}>{v}</option>)}</select></label><label>My decoration<select disabled={busy} value={world.decoration} onChange={e => preference({ decoration: e.target.value as WorldState["decoration"] })}>{["🌻", "🌈", "🪴"].map(v => <option key={v} disabled={!cosmetics.decorations.includes(v)}>{v}{!cosmetics.decorations.includes(v) ? " · unlock with inventions" : ""}</option>)}</select></label><label><input type="checkbox" disabled={busy} checked={world.reducedMotion} onChange={e => preference({ reducedMotion: e.target.checked })}/> Reduced motion</label><label><input type="checkbox" disabled={busy} checked={world.highContrast} onChange={e => preference({ highContrast: e.target.checked })}/> High contrast</label><p>Companions use text and visual hints. Your world is private.</p></div></section>}
    {tab === "clubhouse" && <ClubhouseDesigner world={world} busy={busy} save={persist}/>}
    {tab === "portfolio" && <section className={styles.portfolio}><h2 data-guide-target="inventions">My invention journey</h2><p>Practice achievements stay separate from formal lesson mastery.</p><div className={styles.skills}>{locations.map(l => <article key={l.id}><span>{l.icon}</span><h3>{l.title}</h3>{missions.filter(m => m.location === l.id).map(m => <p key={m.id}>{world.completed.includes(m.id) ? "✓" : "○"} {m.chapter === 1 ? "Sequences" : m.chapter === 2 ? "Loops" : m.chapter === 3 ? "Conditions" : m.chapter === 4 ? "Connected inventions" : "Living systems"}{world.completed.includes(m.id) && (world.hints[m.id] ?? 0) > 0 ? " · with hints" : ""}</p>)}</article>)}</div>{missionCopy.some(copy => world.completed.includes(copy.missionId) && copy.metadata?.badgeTitle) && <section aria-label="Earned chapter badges"><h2>Earned chapter badges</h2>{missionCopy.filter(copy => world.completed.includes(copy.missionId) && copy.metadata?.badgeTitle).map(copy => <p key={copy.missionId} className={styles.pill}>🏅 {copy.metadata!.badgeTitle}</p>)}</section>}<h2>My named projects</h2>{!world.projects.length && <p>Create a named project in My Program to keep several inventions for the same mission.</p>}{world.projects.map(project => <article key={project.id} className={styles.version}><div><strong>{project.title}</strong><p>{project.language} · {missions.find(m => m.id === project.missionId)?.title ?? project.missionId}</p></div><button className={button} disabled={busy || !valid} onClick={() => void openProject(project)}>Open named project</button></article>)}<h2>Saved project versions</h2>{!versions.length && <p>Save a project version from My Program to keep an invention here.</p>}{versions.map(v => <article key={v.id} className={styles.version}><div><strong>{locations.find(l => v.missionId.startsWith(l.id + "-"))?.title} · {missions.find(m => m.id === v.missionId)?.title}</strong><p>{new Date(v.createdAt).toLocaleString("en-GB")}</p></div><button className={button} disabled={busy || !valid} onClick={async () => { const target = missions.find(m => m.id === v.missionId); if (!target) return; if (!await travel(target.location)) return; if (!await chooseMission(v.missionId)) return; if (v.source !== undefined && v.language) { setEditorMode(v.language); generation.current++; setSource(v.source); setDirty(true); } else edit(v.commands ?? []); }}>Restore as draft</button></article>)}</section>}
    {tab === "portfolio" && nextCursor && <button className={button} disabled={historyBusy || busy} onClick={() => void loadOlderVersions()}>{historyBusy ? "Opening history…" : "Load older project versions"}</button>}
    <footer className={styles.footer}>Private world · No chat or multiplayer · Practice never completes a formal lesson <Link href="/student/coding">Return to Coding Learning →</Link></footer>
  </div>;
}
function renderCode(commands: VisualCommand[], indent = ""): string {
  return commands.map(command => command.op === "repeat" ? `${indent}repeat ${JSON.stringify(command.amount)} times:\n${renderCode(command.body ?? [], indent + "  ")}` : command.op === "if" ? `${indent}if ${JSON.stringify(command.test)}:\n${renderCode(command.body ?? [], indent + "  ")}\n${indent}else:\n${renderCode(command.otherwise ?? [], indent + "  ")}` : `${indent}${command.op}(${command.name ? JSON.stringify(command.name) : JSON.stringify(command.value ?? command.amount ?? "")})`).join("\n") || "# Add blocks to begin your invention";
}




function sourceStarter(language: "python" | "javascript") {
  return language === "python" ? "def solve(world):\n    actions = []\n    # Add your action names, loops and decisions here.\n    return actions\n" : "function solve(world) {\n  const actions = [];\n  // Add your action names, loops and decisions here.\n  return actions;\n}\n";
}
