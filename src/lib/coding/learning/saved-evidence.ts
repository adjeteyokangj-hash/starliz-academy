import { prisma } from "@/lib/db";
import { activityDefinition } from "./catalogue";
import { ACTIVITY_VERSION, type PracticalArtifact, type Execution, type Json } from "./types";
import { savedEvidenceSnapshot } from "./saved-evidence-contract";
import { bridgeActivityId } from "./bridge-context";
import type { DemonstrationAttachment } from "./demonstration-contract";

const labels = ["saved-work", "verified-stage", "independent-mastery", "restored-version"];
const creationStages = ["build", "practise", "debug", "create"];
export type SavedEvidenceEntry = { versionId: string; createdAt: Date; stage: string; status: "saved-version" | "practical-verified" | "saved-draft"; practicalCandidate?: boolean; readinessEvidence?: boolean; demonstration?: DemonstrationAttachment | null; activity: { id: string; title: string; year: number; kind: "lesson" | "consolidation" | "project" }; artifact?: PracticalArtifact; artifactHash?: string; files?: Record<string, string>; input?: Json; execution?: Execution | null; checks?: Array<{ description: string; passed: boolean }>; explanation?: string };
export async function learnerSavedEvidence(childId: string, versionId?: string, forLinks = false): Promise<SavedEvidenceEntry[]> {
  if (!versionId) {
    const rows = await prisma.codingProjectVersion.findMany({ where: { label: { in: forLinks ? ["verified-stage", "independent-mastery"] : labels }, ...(forLinks ? { OR: [{ stage: { in: creationStages } }, { label: "independent-mastery" }] } : {}), workspace: { childId, OR: [{ lessonId: { startsWith: `curriculum:${ACTIVITY_VERSION}:` } }, { lessonId: { startsWith: `bridge:${ACTIVITY_VERSION}:` } }] } }, orderBy: { createdAt: "desc" }, take: forLinks ? 480 : 100, distinct: forLinks ? ["workspaceId"] : undefined,
      select: { id: true, createdAt: true, stage: true, label: true, workspace: { select: { lessonId: true } } } });
    return rows.flatMap((row) => {
      const bridge = bridgeActivityId(row.workspace.lessonId), activity = activityDefinition(bridge ?? row.workspace.lessonId.slice(`curriculum:${ACTIVITY_VERSION}:`.length));
      return activity ? [{ versionId: row.id, createdAt: row.createdAt, stage: row.stage, status: "saved-version" as const, readinessEvidence: Boolean(bridge), practicalCandidate: row.label === "independent-mastery" || row.label === "verified-stage" && creationStages.includes(row.stage), activity: { id: activity.id, title: activity.title, year: activity.year, kind: activity.kind } }] : [];
    });
  }
  const rows = await prisma.codingProjectVersion.findMany({ where: { ...(versionId ? { id: versionId } : {}), label: { in: labels }, workspace: { childId, OR: [{ lessonId: { startsWith: `curriculum:${ACTIVITY_VERSION}:` } }, { lessonId: { startsWith: `bridge:${ACTIVITY_VERSION}:` } }] } },
    orderBy: { createdAt: "desc" }, take: versionId ? 1 : 100, select: { id: true, label: true, stage: true, createdAt: true, programJson: true, workspace: { select: { lessonId: true } } } });
  return rows.flatMap((row) => {
    const snapshot = savedEvidenceSnapshot(row.programJson, row.workspace.lessonId, row.label), activity = snapshot && activityDefinition(snapshot.activityId);
    if (!snapshot || !activity) return [];
    const metadata = { versionId: row.id, createdAt: row.createdAt, stage: row.stage, status: snapshot.status, readinessEvidence: Boolean(snapshot.placement), practicalCandidate: snapshot.status === "practical-verified" && (row.label === "independent-mastery" && snapshot.independent || row.label === "verified-stage" && creationStages.includes(row.stage)), activity: { id: activity.id, title: activity.title, year: activity.year, kind: activity.kind } };
    return [{ ...metadata, ...(versionId ? { artifact: snapshot.artifact, artifactHash: snapshot.artifactHash, files: snapshot.files, input: snapshot.input, execution: snapshot.execution ?? null, checks: snapshot.checks, explanation: snapshot.explanation, demonstration: snapshot.demonstration } : {}) }];
  });
}
