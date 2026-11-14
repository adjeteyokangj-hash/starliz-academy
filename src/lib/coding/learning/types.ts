import { z } from "zod";
import { CODING_PATHWAYS, CODING_STAGES } from "@/lib/coding/types";
import { evidenceSelectionSchema, type EvidenceManifest } from "./evidence-links";
import type { StateDiagram } from "./state-diagram-contract";
import { demonstrationAttachmentSchema, type DemonstrationAttachment } from "./demonstration-contract";

export const ACTIVITY_VERSION = "starliz-coding-2026.11-v1";
export const activityKinds = ["lesson", "consolidation", "project"] as const;
export const practicalEngines = ["route", "scene", "robot", "media", "scenario", "data", "network", "python", "web", "ai", "systems", "api", "sql", "security", "portfolio", "engineering", "dual", "evidence", "game", "investigation"] as const;
export type PracticalEngine = typeof practicalEngines[number];
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
// Inspect depth and size iteratively before invoking the recursive validator.
// A small HTTP body can otherwise contain enough nesting to exhaust the stack.
const recursiveJson: z.ZodType<Json> = z.lazy(() => z.union([z.null(), z.boolean(), z.number().finite(), z.string().max(65536), z.array(recursiveJson).max(1000), z.record(z.string().max(80), recursiveJson)]));
export function boundedJson(value: unknown): boolean {
  const pending: Array<{ value: unknown; depth: number; exit?: boolean }> = [{ value, depth: 0 }], ancestors = new WeakSet<object>();
  let nodes = 0, characters = 0;
  while (pending.length) {
    const current = pending.pop()!;
    if (current.exit) { ancestors.delete(current.value as object); continue; }
    if (++nodes > 12000 || current.depth > 32) return false;
    if (typeof current.value === "string") characters += current.value.length;
    if (characters > 131072) return false;
    if (current.value && typeof current.value === "object") {
      if (ancestors.has(current.value)) return false;
      ancestors.add(current.value);
      pending.push({ value: current.value, depth: current.depth, exit: true });
      const entries = Object.entries(current.value);
      if (entries.length > 1000) return false;
      for (const [key, child] of entries) {
        if (["__proto__", "constructor", "prototype"].includes(key)) return false;
        characters += key.length;
        pending.push({ value: child, depth: current.depth + 1 });
      }
    }
  }
  return true;
}
export const jsonValue: z.ZodType<Json> = z.unknown().superRefine((value, context) => {
  if (!boundedJson(value)) context.addIssue({ code: "custom", message: "The workspace data exceeds its depth or size limit.", fatal: true });
}).pipe(recursiveJson);
export const sourceArtifactSchema = z.object({
  type: z.literal("source"), language: z.enum(["python", "javascript", "sql"]),
  source: z.string().max(65536), html: z.string().max(32768).optional(), css: z.string().max(16384).optional(),
  entry: z.enum(["console", "variables", "solve", "handle", "dom"]).optional(),
  projectFiles: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,40}\.(py|js|json|txt|csv|sql|html|css)$/), z.string().max(8192))
    .refine((files) => Object.keys(files).length <= 8 && Object.values(files).reduce((total, content) => total + content.length, 0) <= 32768, "Use at most eight project files and 32KiB of supporting content").optional(),
}).strict();
export const practicalArtifactSchema = z.union([sourceArtifactSchema, z.object({ type: z.literal("visual"), document: jsonValue }).strict()]);
export type PracticalArtifact = z.infer<typeof practicalArtifactSchema>;

export const executionSchema = z.object({
  ok: z.boolean(), output: jsonValue, trace: z.array(jsonValue).max(5000), stdout: z.string().max(32768), stderr: z.string().max(32768),
  error: z.string().max(32768).optional(), runtime: z.string().max(200), steps: z.number().int().nonnegative().max(100000), sourceHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();
export type Execution = z.infer<typeof executionSchema>;
export type Predicate =
  | { path: string; equals: Json; description: string }
  | { path: string; includes: Json; description: string }
  | { path: string; ordered: Json[]; description: string }
  | { path: string; unordered: Json[]; description: string }
  | { path: string; containsText: string; description: string }
  | { path: string; min?: number; max?: number; description: string };
export type PracticalCase = { id: string; input: Json; assertions: Predicate[] };
export type ActivityContent = {
  id: string; version: string; inventoryId: string; kind: typeof activityKinds[number];
  title: string; year: number; pathwayId: typeof CODING_PATHWAYS[number]; courseId: string; moduleId: string; projectId: string;
  engine: PracticalEngine; workbench: PracticalEngine; prerequisites: string[]; objective: string; concepts: string[];
  instruction: { explanation: string; exampleReasoning: string[]; misconception: string; repairPrompt: string; reflection: string[]; stateDiagram?: StateDiagram };
  starter: PracticalArtifact; example: PracticalArtifact; faulty: PracticalArtifact;
  cases: PracticalCase[]; practiceCases: PracticalCase[]; debugCases: PracticalCase[]; debugReference: PracticalArtifact;
  independent: Array<{ id: string; task: string; visibleInput: Json; cases: PracticalCase[]; reference: PracticalArtifact; starter: PracticalArtifact }>;
  reference: PracticalArtifact; prediction: { prompt: string; choices: Array<{ id: string; text: string }>; correctId: string; artifact: PracticalArtifact; input: Json };
  essentialChecks: string[]; projectOutcome: string; alignment: string[];
  workflow?: { saveAndReplay?: boolean; restoreVersion?: boolean; planBeforeRun?: boolean; originalDemonstration?: boolean };
  evidenceSlots?: 1 | 2;
};
export const personalInputSchema = z.unknown().superRefine((value, context) => {
  if (!boundedJson(value)) context.addIssue({ code: "custom", message: "Use bounded JSON without reserved keys.", fatal: true });
}).pipe(z.object({
  variables: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,30}$/).refine((key) => !["constructor", "prototype", "__proto__"].includes(key)), jsonValue).optional(),
  stdin: z.string().max(8192).optional(),
}).strict()).refine((value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= 8192, "Keep personal test input within 8KiB.");
export type PersonalInput = z.infer<typeof personalInputSchema>;
export const activityActionSchema = z.object({
  action: z.enum(["save", "open", "run", "check", "predict", "reflect", "teach", "hint", "restore", "version", "support", "plan"]),
  stage: z.enum(CODING_STAGES), artifact: practicalArtifactSchema.optional(),
  revision: z.string().max(80), explanation: z.string().max(4000).optional(), choiceId: z.string().max(80).optional(),
  versionId: z.string().max(100).optional(), bookingId: z.string().max(100).optional(), daytimePeriodId: z.string().max(100).optional(),
  testInput: personalInputSchema.nullable().optional(),
  evidenceBindings: evidenceSelectionSchema.optional(),
  demonstration: demonstrationAttachmentSchema.optional(),
  interaction: z.object({ target: z.string().min(1).max(120), type: z.enum(["click", "input", "change"]), value: z.string().max(1000).optional() }).strict().optional(),
}).strict();
export type ActivityAction = z.infer<typeof activityActionSchema>;

export type ActivityState = {
  schema: 1; version: string; activityId: string; stage: typeof CODING_STAGES[number];
  completed: Array<typeof CODING_STAGES[number]>; artifacts: Partial<Record<typeof CODING_STAGES[number], PracticalArtifact>>;
  attempts: number; checksPassed: number; independentVariant: number; assistedVariantIds: string[];
  hints: Partial<Record<typeof CODING_STAGES[number], number>>; explanation: string;
  prediction: { choiceId: string; correct: boolean; recordedAt: string } | null;
  lastExecution: Execution | null; lastChecks: Array<{ description: string; passed: boolean }>;
  lastRunStage?: typeof CODING_STAGES[number]; lastRunArtifactHash?: string;
  lastExecutionInput?: Json; lastRunKind?: "personal" | "example" | "assessment";
  personalInputs?: Partial<Record<typeof CODING_STAGES[number], { artifactHash: string; input: PersonalInput; enabled: boolean }>>;
  evidenceBindings?: Partial<Record<typeof CODING_STAGES[number], EvidenceManifest>>;
  webInteractions?: { stage: string; artifactHash: string; events: Array<{ target: string; type: "click" | "input" | "change"; value?: string }>; serviceBaselineFiles?: Record<string, string> };
  files: Record<string, string>;
  filesByStage?: Partial<Record<typeof CODING_STAGES[number], Record<string, string>>>;
  createFilesVariant?: number;
  retainedFiles?: Record<string, string>;
  explanationReview?: { passed: boolean; message: string; source: "model" | "evidence"; confidence: number; pending?: boolean };
  tutorMessages: Array<{ stage: string; message: string; source: "model" | "fallback"; revealing: boolean; purpose?: "instruction" | "hint"; context?: "curriculum" | "project" }>;
  mastered: boolean; masteredArtifact: PracticalArtifact | null; masteredInput: Json | null;
  masteredFiles?: Record<string, string>;
  demonstrations?: Partial<Record<typeof CODING_STAGES[number], DemonstrationAttachment>>;
  workflow?: Partial<Record<typeof CODING_STAGES[number], { savedHash?: string; replayedHash?: string; restoredHash?: string; planHash?: string }>>;
};
