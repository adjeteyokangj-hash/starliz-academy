import { z } from "zod";
import { prisma } from "@/lib/db";
import { activityDefinition } from "./catalogue";
import { ACTIVITY_VERSION, practicalArtifactSchema, jsonValue, executionSchema } from "./types";
import { artifactHash } from "./state-machine";
import { demonstrationAttachmentSchema } from "./demonstration-contract";

const snapshotSchema = z.object({
  schema: z.literal(1), version: z.literal(ACTIVITY_VERSION), activityId: z.string().max(100),
  artifact: practicalArtifactSchema, artifactHash: z.string().regex(/^[a-f0-9]{64}$/), input: jsonValue.nullable(),
  activityHash: z.string().regex(/^[a-f0-9]{64}$/),
  files: z.record(z.string().max(100), z.string().max(8192)), explanation: z.string().max(4000),
  checks: z.array(z.object({ description: z.string().max(1000), passed: z.boolean() })).max(200),
  independent: z.literal(true), execution: executionSchema.nullable().optional(),
  demonstration: demonstrationAttachmentSchema.nullable().optional(),
  independentFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

const indexSchema = z.object({ curriculumVersion: z.literal(ACTIVITY_VERSION), activityId: z.string().max(100), activityHash: z.string().regex(/^[a-f0-9]{64}$/), artifactVersionId: z.string().min(1).max(100), independent: z.literal(true) });
/** List lightweight achievement metadata. Source and execution snapshots are
 * fetched one at a time, so a 440-activity portfolio does not load hundreds of
 * complete saved projects into the parent dashboard. Caller resolves scope. */
export async function parentActivityPortfolio(childId: string) {
  const certificates = await prisma.certificate.findMany({ where: { studentId: childId, subject: "coding", status: "issued", awardSourceType: "coding_activity", idempotencyKey: { startsWith: `coding:${ACTIVITY_VERSION}:` } },
    orderBy: { issuedAt: "desc" }, take: 440, select: { issuedAt: true, metadataJson: true } });
  const entries = certificates.flatMap((certificate) => {
    try {
      const parsed = indexSchema.safeParse(JSON.parse(certificate.metadataJson ?? "null"));
      if (!parsed.success) return [];
      const activity = activityDefinition(parsed.data.activityId);
      return activity ? [{ versionId: parsed.data.artifactVersionId, createdAt: certificate.issuedAt, activity: { id: activity.id, title: activity.title, kind: activity.kind, year: activity.year, pathwayId: activity.pathwayId } }] : [];
    } catch { return []; }
  });
  if (!entries.length) return [];
  const versions = await prisma.codingProjectVersion.findMany({ where: { id: { in: entries.map((entry) => entry.versionId) }, label: "independent-mastery", workspace: { childId, lessonId: { startsWith: `curriculum:${ACTIVITY_VERSION}:` } } }, select: { id: true } });
  const allowed = new Set(versions.map((version) => version.id)), seen = new Set<string>();
  return entries.filter((entry) => { if (!allowed.has(entry.versionId) || seen.has(entry.activity.id)) return false; seen.add(entry.activity.id); return true; });
}

/** A detail reads the frozen assessed version. Later edits cannot replace it;
 * previewing neither executes student code nor creates a new runner job. */
export async function parentActivityProject(childId: string, versionId: string) {
  const rows = await prisma.codingProjectVersion.findMany({ where: {
    id: versionId, label: "independent-mastery", workspace: { childId, lessonId: { startsWith: `curriculum:${ACTIVITY_VERSION}:` } },
  }, take: 1, select: { id: true, createdAt: true, programJson: true, workspace: { select: { lessonId: true } } } });
  const projects = rows.flatMap((row) => {
    try {
      if (Buffer.byteLength(row.programJson) > 524288) return [];
      const snapshot = snapshotSchema.safeParse(JSON.parse(row.programJson));
      if (!snapshot.success) return [];
      const saved = snapshot.data, activity = activityDefinition(saved.activityId);
      if (!activity || row.workspace.lessonId !== `curriculum:${ACTIVITY_VERSION}:${activity.id}` || saved.artifactHash !== artifactHash(saved.artifact) || !saved.checks.length || !saved.checks.every((check) => check.passed)) return [];
      return [{ versionId: row.id, createdAt: row.createdAt, activity: { id: activity.id, title: activity.title, kind: activity.kind, year: activity.year,
        pathwayId: activity.pathwayId, courseId: activity.courseId, moduleId: activity.moduleId, projectId: activity.projectId, objective: activity.objective, workbench: activity.workbench, contentHash: saved.activityHash },
        artifact: saved.artifact, files: saved.files, input: saved.input, explanation: saved.explanation, checks: saved.checks, execution: saved.execution ?? null,
        demonstration: saved.demonstration?.metadata.artifactHash === saved.artifactHash && saved.demonstration.metadata.taskHash === saved.independentFingerprint ? saved.demonstration : null }];
    } catch { return []; }
  });
  return projects[0] ?? null;
}
