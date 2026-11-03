import { z } from "zod";
import { mediaDocumentSchema, executeMedia, mediaConstraintSchema } from "./studio-engines";
import { sameJson } from "./checks";
import type { Execution, Json } from "./types";

const filename = z.string().trim().regex(/^[\p{L}\p{N} _-]{3,60}$/u).refine((name) => !["constructor", "prototype", "__proto__"].includes(name));
export const mediaLibrarySchema = z.object({ media: mediaDocumentSchema,
  files: z.array(z.object({ name: filename, document: mediaDocumentSchema }).strict()).max(16),
  actions: z.array(z.discriminatedUnion("op", [
    z.object({ op: z.literal("save"), name: filename }).strict(), z.object({ op: z.literal("open"), name: filename }).strict(),
    z.object({ op: z.literal("close") }).strict(),
    z.object({ op: z.literal("edit"), patch: mediaDocumentSchema.partial(), reason: z.string().max(500) }).strict(),
  ])).max(32),
}).strict();
export type MediaLibraryProgram = z.infer<typeof mediaLibrarySchema>;
const fixtureSchema = z.object({ width: z.number().min(240).max(2000).default(600), requestedFile: filename.optional(),
  files: z.array(z.object({ name: filename, document: mediaDocumentSchema }).strict()).max(16).optional(), initialDocument: mediaDocumentSchema.optional(),
  constraints: z.array(mediaConstraintSchema).max(20).default([]),
  captions: z.array(z.string().max(500)).max(8).default([]), stepChoices: z.array(z.string().max(500)).max(12).default([]),
}).strict();

export function executeMediaLibrary(artifact: unknown, input: unknown = {}): Execution {
  const trace: Json[] = [], runtime = "starliz-media-library-1.0.0";
  try {
    if (JSON.stringify(artifact).length > 65536) throw new Error("This card library exceeds its activity storage limit.");
    const program = mediaLibrarySchema.parse(artifact), fixture = fixtureSchema.parse(input);
    const files = new Map<string, Array<z.infer<typeof mediaDocumentSchema>>>();
    for (const file of fixture.files ?? program.files) {
      if (files.has(file.name)) throw new Error("Give the initial cards different file names.");
      files.set(file.name, [structuredClone(file.document)]);
    }
    const original = fixture.initialDocument ?? program.media;
    const initialRequested = fixture.requestedFile ? structuredClone(files.get(fixture.requestedFile)?.at(-1) ?? null) : null;
    let current: z.infer<typeof mediaDocumentSchema> | null = structuredClone(original);
    let openName: string | null = null, saves = 0, closes = 0, opens = 0;
    const changes: string[] = [];
    for (const [index, action] of program.actions.entries()) {
      if (action.op === "close") { current = null; openName = null; closes++; }
      if (action.op === "open") {
        const versions = files.get(action.name);
        if (!versions?.length) throw new Error(`No saved card is named ${action.name}. Choose its full file name.`);
        current = structuredClone(versions.at(-1)!); openName = action.name; opens++;
      }
      if (action.op === "save") {
        if (!current) throw new Error("Open a card before saving its content.");
        const versions = files.get(action.name) ?? [];
        files.set(action.name, [...versions, structuredClone(current)]); openName = action.name; saves++;
      }
      if (action.op === "edit") {
        if (!current) throw new Error("Open a card before editing it.");
        const changed = mediaDocumentSchema.parse({ ...current, ...action.patch });
        if (action.patch.caption !== undefined && changed.caption !== current.caption && changed.tool === "picture") throw new Error("Choose the text or combined tool before changing a caption.");
        if (action.patch.shapes) {
          const previous = new Map(current.shapes.map((shape) => [shape.id, shape]));
          for (const shape of changed.shapes) if (!sameJson(shape, previous.get(shape.id))) {
            if (shape.kind === "text" && changed.tool === "picture") throw new Error("Choose the text or combined tool to create or edit text marks.");
            if (shape.kind !== "text" && changed.tool === "text") throw new Error("Choose the picture or combined tool to create or edit drawing marks.");
          }
        }
        if (!sameJson(current, changed)) changes.push(action.reason.trim());
        current = changed;
      }
      trace.push({ step: index + 1, operation: action.op, openFile: openName, currentName: current?.name ?? null, savedFiles: [...files.keys()], saves, closes, opens });
    }
    if (!current) return { ok: true, output: { document: null, closed: true, savedNames: [...files.keys()], saves, closes, opens, retrievedCorrectly: false }, trace, stdout: "The card is closed. Open its saved name to see it again.", stderr: "", runtime, steps: trace.length };
    const rendered = executeMedia(current, { width: fixture.width, constraints: fixture.constraints });
    if (!rendered.ok) return rendered;
    const base = rendered.output && typeof rendered.output === "object" && !Array.isArray(rendered.output) ? rendered.output : {};
    const lastSaved = openName ? files.get(openName)?.at(-1) : null;
    const output: Json = { ...base, closed: false, savedNames: [...files.keys()], saves, closes, opens, openFile: openName,
      versionCounts: Object.fromEntries([...files].map(([name, versions]) => [name, versions.length])),
      retrievedCorrectly: Boolean(opens > 0 && openName && (!fixture.requestedFile || openName === fixture.requestedFile) && lastSaved && sameJson(current, lastSaved)),
      contentUnchangedSinceSave: Boolean(lastSaved && sameJson(current, lastSaved)), changedFromOriginal: !sameJson(current, original),
      originalRequestedContent: Boolean(initialRequested && sameJson(current, initialRequested)),
      drawingChanged: !sameJson(current.shapes.map(({ kind, x, y, width, height, fill, text }) => ({ kind, x, y, width, height, fill, text })), original.shapes.map(({ kind, x, y, width, height, fill, text }) => ({ kind, x, y, width, height, fill, text }))),
      originalRetained: [...files.values()].some((versions) => versions.some((saved) => sameJson(saved, original))),
      justifiedChanges: changes.filter((reason) => reason.length >= 5), justifiedChangeCount: changes.filter((reason) => reason.length >= 5).length,
    };
    if (JSON.stringify(output).length > 65536) throw new Error("This card result exceeds the activity's preview limit.");
    return { ...rendered, output, trace: [...trace, ...rendered.trace], runtime, steps: trace.length + rendered.steps };
  } catch (error) {
    return { ok: false, output: null, trace, stdout: "", stderr: "", runtime, steps: trace.length,
      error: error instanceof z.ZodError ? "Check the card library's names, tools and editing actions." : error instanceof Error ? error.message : "The card library could not run." };
  }
}
