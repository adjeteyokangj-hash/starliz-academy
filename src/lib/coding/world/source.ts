import { executeSource } from "../learning/source-execution";
import { missions, runMission, type WorldRun, type Mission } from "./model";

/** Student source runs only in the existing isolated execution service.
 * Its returned actions are checked again by the shared visual runtime. */
export async function runWorldSource(missionId: string, language: "python" | "javascript", source: string, execute = executeSource, definition?: Mission): Promise<WorldRun> {
  const mission = definition ?? missions.find(m => m.id === missionId);
  if (!mission || source.length > 8192) throw new Error("Choose a supported mission and source file.");
  const frames: WorldRun["frames"] = [], trace: string[] = [];
  for (const needsHelp of mission.conditional ? [true, false] : [false]) {
    const execution = await execute({ type: "source", language, source, entry: "solve" }, { needsHelp });
    if (!execution.ok) return { ok: false, completed: 0, frames, trace, feedback: execution.error ?? "Check your source program." };
    const output = execution.output;
    const actions = output && typeof output === "object" && !Array.isArray(output) ? output.result : null;
    if (!Array.isArray(actions) || actions.length > 100 || !actions.every(action => typeof action === "string" && /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(action))) return { ok: false, completed: 0, frames, trace, feedback: "solve(world) must return a list of up to 100 action names." };
    const result = runMission(missionId, actions.map(name => ({ op: "emit", name })), { fixtures: [needsHelp], requirePatterns: false, definition: mission });
    frames.push(...result.frames); trace.push(...result.trace);
    if (!result.ok) return { ...result, frames, trace };
  }
  return { ok: true, completed: mission.count, frames, trace, feedback: "Your written program passed every simulation situation. Explain how your algorithm works, then try another solution." };
}
