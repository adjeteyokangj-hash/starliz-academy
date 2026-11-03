import { createHash } from "node:crypto";
import { z } from "zod";
import { CODING_PATHWAYS, CODING_STAGES } from "@/lib/coding/types";

const nonempty = z.string().trim().min(1);
const artifact = z.unknown().refine((value) => value !== undefined && value !== null, "A real artifact is required.");
export const engineIds = ["route", "scene", "robot", "media", "scenario", "data", "network", "python", "web", "ai", "systems", "api", "sql", "security", "portfolio"] as const;

/** Executable packages are separate from the approved inventory. */
export const lessonPackageSchema = z.object({
  id: nonempty,
  version: z.number().int().positive(),
  inventoryId: nonempty,
  pathwayId: z.enum(CODING_PATHWAYS),
  courseId: nonempty,
  moduleId: nonempty,
  projectId: nonempty,
  engine: z.enum(engineIds),
  title: nonempty,
  objective: nonempty,
  evaluationSpec: artifact,
  prerequisites: z.array(nonempty),
  yearMin: z.number().int().min(1).max(11),
  yearMax: z.number().int().min(1).max(11),
  stages: z.array(z.object({
    id: z.enum(CODING_STAGES), instruction: nonempty, teacherGuide: nonempty,
    starter: artifact,
  }).strict()).length(7),
  referenceArtifacts: z.array(z.object({ id: nonempty, stage: z.enum(CODING_STAGES), artifact }).strict()).min(6),
  checks: z.array(z.object({ id: nonempty, stage: z.enum(CODING_STAGES), description: nonempty, evaluatorId: nonempty }).strict()).min(6),
  fault: z.object({ artifact, checkId: nonempty, expectedFailureCode: nonempty }).strict(),
  independentVariants: z.array(z.object({
    id: nonempty, task: nonempty, starter: artifact,
    heldOutCaseIds: z.array(nonempty).min(2), referenceArtifact: artifact,
  }).strict()).min(2),
  explanationRubric: z.array(nonempty).min(2),
  contentProvenance: z.array(z.object({ resourceId: nonempty, origin: nonempty, licence: nonempty }).strict()).min(1),
}).strict().superRefine((lesson, context) => {
  if (lesson.yearMin > lesson.yearMax) context.addIssue({ code: "custom", message: "Invalid year range." });
  const unique = (values: string[], name: string) => {
    if (new Set(values).size !== values.length) context.addIssue({ code: "custom", message: `Duplicate ${name}.` });
  };
  unique(lesson.stages.map((stage) => stage.id), "stages");
  unique(lesson.checks.map((check) => check.id), "check IDs");
  for (const stage of CODING_STAGES.filter((value) => value !== "review")) {
    if (!lesson.referenceArtifacts.some((reference) => reference.stage === stage)) context.addIssue({ code: "custom", message: `Missing ${stage} reference artifact.` });
    if (!lesson.checks.some((check) => check.stage === stage)) context.addIssue({ code: "custom", message: `Missing ${stage} executable check.` });
  }
  unique(lesson.independentVariants.map((variant) => variant.id), "independent variant IDs");
  for (const variant of lesson.independentVariants) unique(variant.heldOutCaseIds, "held-out cases");
  if (!lesson.checks.some((check) => check.id === lesson.fault.checkId)) context.addIssue({ code: "custom", message: "Fault must refer to a real essential check." });
});

export type ExecutableLessonPackage = z.infer<typeof lessonPackageSchema>;
export type CheckResult = { passed: boolean; failureCode?: string };
export type VerifiedEngine = {
  id: (typeof engineIds)[number];
  version: string;
  evaluate: (artifact: unknown, checkId: string) => Promise<CheckResult>;
  evaluateIndependent: (artifact: unknown, variantId: string, caseId: string) => Promise<CheckResult>;
};

export function lessonPackageHash(lesson: ExecutableLessonPackage): string {
  return createHash("sha256").update(JSON.stringify(lesson)).digest("hex");
}

export type PublicationEvidence = {
  packageHash: string;
  engineVersion: string;
  educationalReview: { approved: boolean; reviewerId: string; recordId: string };
  authenticatedUat: { passed: boolean; runId: string };
  accessibility: { passed: boolean; runId: string };
  security: { passed: boolean; runId: string };
};

/** Fail closed: neither approved metadata nor model prose can publish a lesson. */
export async function verifyLessonPublication(input: {
  lesson: unknown;
  engine?: VerifiedEngine;
  evidence?: PublicationEvidence;
}): Promise<{ ready: boolean; issues: string[]; packageHash?: string }> {
  const parsed = lessonPackageSchema.safeParse(input.lesson);
  if (!parsed.success) return { ready: false, issues: parsed.error.issues.map((issue) => issue.message) };
  const lesson = parsed.data;
  const packageHash = lessonPackageHash(lesson);
  const issues: string[] = [];
  const engine = input.engine;
  if (!engine || engine.id !== lesson.engine) return { ready: false, packageHash, issues: ["The declared executable engine is unavailable."] };
  const evidence = input.evidence;
  if (!evidence || evidence.packageHash !== packageHash || evidence.engineVersion !== engine.version) issues.push("Review evidence does not match the exact package and engine version.");
  if (!evidence?.educationalReview.approved || !evidence.educationalReview.reviewerId || !evidence.educationalReview.recordId) issues.push("Recorded educational approval is required.");
  for (const key of ["authenticatedUat", "accessibility", "security"] as const) {
    if (!evidence?.[key].passed || !evidence[key].runId) issues.push(`Passing ${key} evidence is required.`);
  }
  try {
    for (const reference of lesson.referenceArtifacts) {
      for (const check of lesson.checks) {
        if (reference.stage !== check.stage) continue;
        const result = await engine.evaluate(reference.artifact, check.evaluatorId);
        if (!result.passed) issues.push(`Reference ${reference.id} fails essential check ${check.id}.`);
      }
    }
    const faultCheck = lesson.checks.find((check) => check.id === lesson.fault.checkId)!;
    const faulty = await engine.evaluate(lesson.fault.artifact, faultCheck.evaluatorId);
    if (faulty.passed || faulty.failureCode !== lesson.fault.expectedFailureCode) issues.push("The seeded fault does not fail for its declared reason.");
    for (const variant of lesson.independentVariants) {
      for (const caseId of variant.heldOutCaseIds) {
        if (!(await engine.evaluateIndependent(variant.referenceArtifact, variant.id, caseId)).passed) issues.push(`Independent reference ${variant.id} fails case ${caseId}.`);
      }
    }
  } catch {
    issues.push("An executable check failed to run.");
  }
  return { ready: issues.length === 0, issues, packageHash };
}
