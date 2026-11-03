import { z } from "zod";
import { jsonValue } from "./types";
const text = z.string().max(4000), id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/);
export const engineeringVersionId = id;
export const engineeringFileName = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,40}\.(py|js|html|css|json|txt|csv|sql)$/);
export const engineeringFilesSchema = z.record(engineeringFileName, z.string().max(8192))
  .refine((files) => Object.keys(files).length <= 9 && new TextEncoder().encode(JSON.stringify(files)).length <= 32768, "Use at most nine files and 32KiB of project text, with at most 8KiB per file.");
const version = z.object({ id, author: text, files: engineeringFilesSchema }).strict();
export const engineeringDocumentSchema = z.object({
  purpose: text, audience: text, language: z.enum(["python", "javascript"]), files: engineeringFilesSchema, versions: z.array(version).max(20), selectedVersion: z.string().max(40),
  actions: z.array(z.object({ op: z.enum(["edit", "restore", "snapshot", "merge"]), target: z.string().max(80), content: z.string().max(8192), author: text }).strict()).max(30),
  tasks: z.array(z.object({ id, dependsOn: z.array(id).max(10), need: text, effort: z.number().finite().min(.25).max(40).optional(), criterion: z.object({ measure: text, comparison: z.enum(["equal", "at-most", "at-least"]), target: z.number().finite() }).strict() }).strict()).max(30),
  milestoneBudget: z.number().finite().min(.25).max(200).optional(),
  permissions: z.object({ editors: z.array(z.enum(["owner", "editor", "viewer", "anonymous"])).max(4), viewers: z.array(z.enum(["owner", "editor", "viewer", "anonymous"])).max(4) }).strict(),
  tests: z.array(z.object({ name: text, input: jsonValue, expected: jsonValue }).strict()).max(4), run: z.boolean(), entryFile: engineeringFileName,
  notes: text, sources: z.array(z.object({ creator: text, licence: z.enum(["original", "CC0", "CC-BY", "restricted"]), credit: text }).strict()).max(12),
  handover: z.object({ setup: text, test: text, rollback: text, limitation: text, nextLearning: text }).strict(),
}).strict();
export type EngineeringDocument = z.infer<typeof engineeringDocumentSchema>;
export const engineeringFixtureSchema = z.object({ role: z.enum(["owner", "editor", "viewer", "anonymous"]).default("owner"), claimedRole: z.string().max(30).default("owner"),
  initialFiles: engineeringFilesSchema.optional(), initialVersions: z.array(version).max(20).optional(),
  input: jsonValue.default({}), expectedVersion: z.string().max(40).default("v1"),
}).strict();
