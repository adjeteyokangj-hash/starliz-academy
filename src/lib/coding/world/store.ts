import { publishedWorldMissions } from "./content";
import { runWorldSource } from "./source";
import { worldCompanionHint } from "./companion";
import { requestCodingAssistanceForHandoff } from "../human-support";
import { runMission } from "./model";
import type { Json } from "../learning/types";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { WORLD_KEY, initialWorld, worldStateSchema, transitionWorld, type WorldAction, WorldInputError } from "./model";

export class WorldConflict extends Error {}
export async function loadWorld(childId: string, yearGroup: string | null, options: { before?: string } = {}) {
  const where = { childId_lessonId: { childId, lessonId: WORLD_KEY } };
  let row = await prisma.codingWorkspace.findUnique({ where });
  if (!row) {
    try { row = await prisma.codingWorkspace.create({ data: { childId, yearGroup, lessonId: WORLD_KEY, programsJson: JSON.stringify(initialWorld()), privateProject: true, stage: "world-practice" } }); }
    catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error; row = await prisma.codingWorkspace.findUniqueOrThrow({ where }); }
  }
  // A corrupt or future-format save must never be silently replaced.
  const state = worldStateSchema.parse(JSON.parse(row.programsJson));
  if (options.before && !await prisma.codingProjectVersion.findFirst({ where: { id: options.before, workspaceId: row.id, stage: "world-practice" }, select: { id: true } })) throw new WorldInputError("That history page is not available to this learner.");
  const versions = await prisma.codingProjectVersion.findMany({ where: { workspaceId: row.id, stage: "world-practice" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 41, ...(options.before ? { cursor: { id: options.before }, skip: 1 } : {}), select: { id: true, label: true, createdAt: true, programJson: true } });
  return { row, state, nextCursor: versions.length > 40 ? versions[39]!.id : null, versions: versions.slice(0, 40).map(v => ({ id: v.id, label: v.label, createdAt: v.createdAt, ...JSON.parse(v.programJson) as { missionId: string; commands: unknown[] } })) };
}
export async function updateWorld(childId: string, yearGroup: string | null, revision: number, action: WorldAction) {
  const loaded = await loadWorld(childId, yearGroup);
  if (loaded.state.revision !== revision) throw new WorldConflict("Your world changed in another window. Reload before saving again.");
  const availableMissions = await publishedWorldMissions();
  const result = transitionWorld(loaded.state, action, availableMissions);
  if (action.type === "source-run") { try { result.run = await runWorldSource(action.missionId, action.language, action.source, undefined, availableMissions.find(mission => mission.id === action.missionId)); } catch { result.run = { ok: false, completed: 0, frames: [], trace: [], feedback: "The isolated execution service is unavailable. Your source has been saved. Try again later." }; } const simulation = result.run.frames.at(-1)?.simulation; if (simulation) result.state.simulations[simulation.location] = simulation; if (result.run.ok && !result.state.completed.includes(action.missionId)) result.state.completed.push(action.missionId); }
  await prisma.$transaction(async tx => {
    const updated = await tx.codingWorkspace.updateMany({ where: { id: loaded.row.id, childId, programsJson: loaded.row.programsJson }, data: { programsJson: JSON.stringify(result.state) } });
    if (updated.count !== 1) throw new WorldConflict("Your world changed in another window. Reload before saving again.");
    if (action.type === "snapshot" || action.type === "source-snapshot") {
      await tx.codingProjectVersion.create({ data: { workspaceId: loaded.row.id, stage: "world-practice", label: (action.projectId ? result.state.projects.find(project => project.id === action.projectId)?.title : null) ?? action.missionId, programJson: JSON.stringify("commands" in action ? { missionId: action.missionId, projectId: action.projectId, commands: action.commands } : { missionId: action.missionId, projectId: action.projectId, language: action.language, source: action.source }) } });
    }
  });
  let hintSource: "model" | "fallback" | undefined;
  if (action.type === "hint" && result.hint) {
    const hint = await worldCompanionHint(action.missionId, result.hint);
    result.hint = hint.message; hintSource = hint.source;
  }
  let supportMessage: string | undefined;
  if (action.type === "support") {
    const mission = availableMissions.find(m => m.id === action.missionId)!;
    const run = action.source !== undefined ? { ok: true, feedback: "Written program support requested." } : runMission(mission.id, action.commands, { definition: mission });
    const support = await requestCodingAssistanceForHandoff({ childId, bookingId: action.bookingId, daytimePeriodId: action.daytimePeriodId }, {
      subject: "coding", lessonId: `world:${mission.id}`, lessonTitle: mission.title, pathwayTitle: "Coding Game World · Free Practice", moduleTitle: mission.location,
      stage: "practise", learningObjective: mission.objective, task: mission.objective, program: action.source !== undefined && action.language ? { type: "source", language: action.language, source: action.source, entry: "solve" } : { type: "visual", document: JSON.parse(JSON.stringify({ handlers: { start: action.commands }, variables: {} })) as Json },
      error: run.ok ? null : run.feedback, feedback: run.feedback, hintsAttempted: [], hintCount: result.state.hints[mission.id] ?? 0, skillStatus: "practising", privateProject: true,
    });
    supportMessage = support.ok ? support.message : support.error;
  }
  const latest = await loadWorld(childId, yearGroup);
  return { ...result, hintSource, supportMessage, versions: latest.versions, nextCursor: latest.nextCursor };
}
