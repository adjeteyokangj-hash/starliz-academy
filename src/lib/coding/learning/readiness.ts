import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { activityDefinition, activityContentHash, activityReleased } from "./catalogue";
import { ACTIVITY_VERSION, practicalArtifactSchema, executionSchema, type ActivityContent } from "./types";
import { artifactHash, LearningError } from "./state-machine";
import { developmentCurriculumQa } from "./development-qa";
import { bridgeContextSchema } from "./bridge-context";

const specs = [
  { id: "block-coding", entryYear: 3, title: "Visual programming readiness", ids: ["P-Y2-1", "P-Y2-2", "P-Y2-3", "P-Y2-4"] },
  { id: "blocks-to-text", entryYear: 5, title: "Visual-to-text bridge readiness", ids: ["P-Y4-1", "P-Y4-2", "P-Y4-3", "P-Y4-4"] },
  // Four different earlier creations are needed for the portfolio's worked and
  // independent evidence slots. The extra Python benchmark creates real work;
  // no invented or somebody else's portfolio evidence is substituted.
  { id: "programming-web", entryYear: 7, title: "Programming and web readiness", ids: ["Y5.01", "P-Y6-1", "P-Y6-3", "P-Y6-4", "P-Y6-2"] },
  { id: "applied", entryYear: 10, title: "Applied software readiness", ids: ["P-Y9-1", "P-Y9-2", "P-Y9-3", "P-Y9-4"] },
] as const;
export type ReadinessPlan = { id: string; entryYear: number; title: string; hash: string; benchmarks: ActivityContent[] };
export function readinessPlan(id: string): ReadinessPlan | null {
  const spec = specs.find(item => item.id === id); if (!spec) return null;
  const benchmarks = spec.ids.map(id => { const activity = activityDefinition(id); if (!activity) throw new LearningError("A practical readiness benchmark is unavailable.", 503); return activity; });
  const hash = createHash("sha256").update(JSON.stringify({ version: ACTIVITY_VERSION, id: spec.id, entryYear: spec.entryYear, evidence: benchmarks.map(activity => ({ id: activity.id, hash: activityContentHash(activity) })), scope: "entry-readiness-only; no earlier lesson, course or pathway completion" })).digest("hex");
  return { id: spec.id, entryYear: spec.entryYear, title: spec.title, hash, benchmarks };
}
export const readinessPlans = () => specs.map(spec => readinessPlan(spec.id)!);
export function bridgeWorkspaceKey(plan: ReadinessPlan, activityId: string) { return `bridge:${ACTIVITY_VERSION}:${plan.id}:${plan.hash}:${activityId}`; }
const grantKey = (plan: ReadinessPlan) => `bridge:${ACTIVITY_VERSION}:${plan.id}:${plan.hash}:readiness`;
export function readinessBenchmark(plan: ReadinessPlan, id: string) { return plan.benchmarks.find(activity => activity.id === id || activity.inventoryId === id) ?? null; }
export async function authorisedReadinessPlan(childId: string, id: string) {
  const plan = readinessPlan(id);
  if (!plan || !plan.benchmarks.every(activity => activityReleased(activity.id)) && !await developmentCurriculumQa(childId)) throw new LearningError("This practical readiness bridge has not completed release verification.", 404);
  return plan;
}
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const bridgeContext = (plan: ReadinessPlan) => ({ planId: plan.id, planHash: plan.hash, entryYear: plan.entryYear });
const snapshotSchema = z.object({ version: z.literal(ACTIVITY_VERSION), activityId: z.string(), activityHash: hash, artifact: practicalArtifactSchema, artifactHash: hash,
  independent: z.literal(true), checks: z.array(z.object({ passed: z.literal(true) })).min(1).max(200),
  explanationReview: z.object({ passed: z.literal(true), source: z.literal("model"), confidence: z.number().min(.75).max(1) }), execution: executionSchema, placement: bridgeContextSchema });
const grantSchema = z.object({ schema: z.literal(1), version: z.literal(ACTIVITY_VERSION), planId: z.string(), planHash: hash, entryYear: z.number(),
  assessmentVersions: z.array(z.object({ activityId: z.string(), versionId: z.string().min(1).max(100) }).strict()).min(4).max(5), verifiedAt: z.string().datetime() }).strict();
type Db = Pick<Prisma.TransactionClient, "codingWorkspace" | "codingProjectVersion">;
export function verifiedBridgeSnapshot(plan: ReadinessPlan, activityId: string, programJson: string) {
  try {
    if (Buffer.byteLength(programJson) > 524288) return false;
    const parsed = snapshotSchema.safeParse(JSON.parse(programJson)), activity = readinessBenchmark(plan, activityId);
    if (!parsed.success || !activity) return false; const value = parsed.data;
    if (value.artifact.type !== activity.reference.type || value.artifact.type === "source" && activity.reference.type === "source" && (value.artifact.language !== activity.reference.language || (value.artifact.entry ?? "console") !== (activity.reference.entry ?? "console"))) return false;
    return value.activityId === activity.id && value.activityHash === activityContentHash(activity) && value.artifactHash === artifactHash(value.artifact) && value.execution.ok && (value.artifact.type !== "source" || value.execution.sourceHash === value.artifactHash) && value.placement.planId === plan.id && value.placement.planHash === plan.hash && value.placement.entryYear === plan.entryYear;
  } catch { return false; }
}
export async function recordReadinessIfComplete(db: Db, childId: string, plan: ReadinessPlan, yearGroup: string | null) {
  const versions = await db.codingProjectVersion.findMany({ where: { label: "independent-mastery", workspace: { childId, lessonId: { in: plan.benchmarks.map(activity => bridgeWorkspaceKey(plan, activity.id)) } } }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, programJson: true, workspace: { select: { lessonId: true } } } });
  const evidence = plan.benchmarks.map(activity => { const version = versions.find(version => version.workspace.lessonId === bridgeWorkspaceKey(plan, activity.id) && verifiedBridgeSnapshot(plan, activity.id, version.programJson)); return version ? { activityId: activity.id, versionId: version.id } : null; });
  if (evidence.some(item => !item)) return false;
  const grant = grantSchema.parse({ schema: 1, version: ACTIVITY_VERSION, planId: plan.id, planHash: plan.hash, entryYear: plan.entryYear, assessmentVersions: evidence, verifiedAt: new Date().toISOString() });
  await db.codingWorkspace.upsert({ where: { childId_lessonId: { childId, lessonId: grantKey(plan) } }, create: { childId, lessonId: grantKey(plan), yearGroup, pathwayId: plan.id, privateProject: true, stage: "review", skillStatus: "placement-ready", programsJson: JSON.stringify(grant) }, update: {} });
  return true;
}
export async function readinessEntryYear(childId: string, db: Db = prisma): Promise<number> {
  const plans = readinessPlans(), rows = await db.codingWorkspace.findMany({ where: { childId, lessonId: { in: plans.map(grantKey) }, skillStatus: "placement-ready" }, select: { lessonId: true, programsJson: true } });
  for (const plan of plans.slice().reverse()) {
    const row = rows.find(row => row.lessonId === grantKey(plan)); if (!row) continue;
    let grant; try { grant = grantSchema.safeParse(JSON.parse(row.programsJson)); } catch { continue; }
    if (!grant.success || grant.data.planId !== plan.id || grant.data.planHash !== plan.hash || grant.data.entryYear !== plan.entryYear || grant.data.assessmentVersions.length !== plan.benchmarks.length || new Set(grant.data.assessmentVersions.map(item => item.activityId)).size !== plan.benchmarks.length) continue;
    const assessmentVersions = grant.data.assessmentVersions;
    const versions = await db.codingProjectVersion.findMany({ where: { id: { in: assessmentVersions.map(item => item.versionId) }, label: "independent-mastery", workspace: { childId } }, select: { id: true, programJson: true, workspace: { select: { lessonId: true } } } });
    if (plan.benchmarks.every(activity => { const expected = assessmentVersions.find(item => item.activityId === activity.id), version = versions.find(version => version.id === expected?.versionId); return version && version.workspace.lessonId === bridgeWorkspaceKey(plan, activity.id) && verifiedBridgeSnapshot(plan, activity.id, version.programJson); })) return plan.entryYear;
  }
  return 1;
}
export async function readinessOverview(childId: string) {
  const qa = await developmentCurriculumQa(childId);
  const plans = readinessPlans().filter(plan => qa || plan.benchmarks.every(activity => activityReleased(activity.id))), definitions = plans.flatMap(plan => plan.benchmarks.map(activity => bridgeWorkspaceKey(plan, activity.id)));
  const rows = await prisma.codingWorkspace.findMany({ where: { childId, lessonId: { in: definitions } }, select: { lessonId: true, skillStatus: true } });
  const entryYear = await readinessEntryYear(childId);
  return { entryYear, scope: "Verified entry readiness. Earlier lessons, courses and pathways remain uncompleted unless separately earned.", plans: plans.map(plan => ({ id: plan.id, title: plan.title, entryYear: plan.entryYear, ready: entryYear >= plan.entryYear, benchmarks: plan.benchmarks.map(activity => ({ id: activity.id, title: activity.title, objective: activity.objective, year: activity.year, kind: activity.kind, status: rows.find(row => row.lessonId === bridgeWorkspaceKey(plan, activity.id))?.skillStatus ?? "not_started" })) })) };
}
