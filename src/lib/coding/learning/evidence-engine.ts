import { z } from "zod";
import { dataDocumentSchema, mediaDocumentSchema, executeData, executeMedia } from "./studio-engines";
import { mediaLibrarySchema, executeMediaLibrary } from "./media-library";
import type { Execution, Json } from "./types";

const text = z.string().max(1000), identifier = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/);
export const evidenceDocumentSchema = z.object({
  data: dataDocumentSchema, picture: mediaLibrarySchema,
  assetId: identifier.or(z.literal("")), assetCredit: text,
  controls: z.array(z.object({ id: identifier, label: z.string().max(200), element: z.enum(["button", "skip-tab"]),
    action: z.enum(["describe-largest", "describe-total", "show-table", "show-chart"]), disabled: z.boolean().default(false) }).strict()).max(8),
}).strict();
export const evidenceAssetSchema = z.object({ id: identifier, title: text, creator: text,
  licence: z.enum(["original", "CC0", "CC-BY", "restricted"]), shapes: mediaDocumentSchema.shape.shapes.max(20) }).strict();
const inputSchema = z.object({ data: z.unknown().default({}), picture: z.unknown().default({}),
  assets: z.array(evidenceAssetSchema).max(8).default([]),
  events: z.array(z.object({ target: identifier, type: z.literal("click") }).strict()).max(40).default([]),
}).strict();
const record = (value: Json | undefined) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

export function evidenceControlNames(document: Json): string[] {
  const parsed = evidenceDocumentSchema.safeParse(document);
  return parsed.success ? parsed.data.controls.filter((control) => !control.disabled).map((control) => control.id) : [];
}
export function executeEvidence(artifact: unknown, input: unknown): Execution {
  const runtime = "starliz-evidence-workbench-1.0.0";
  try {
    const document = evidenceDocumentSchema.parse(artifact), fixture = inputSchema.parse(input);
    if (new Set(document.controls.map((control) => control.id)).size !== document.controls.length) throw new Error("Give each poster control its own name.");
    if (new Set(fixture.assets.map((asset) => asset.id)).size !== fixture.assets.length) throw new Error("The supplied source assets need unique identifiers.");
    const data = executeData(document.data, fixture.data), library = executeMediaLibrary(document.picture, fixture.picture);
    if (!data.ok) throw new Error(data.error ?? "Repair the poster's data calculation.");
    if (!library.ok) throw new Error(library.error ?? "Repair the poster's original picture.");
    const working = mediaDocumentSchema.safeParse(record(library.output).document);
    if (!working.success) throw new Error("Open the poster's original picture before previewing the combined project.");
    const asset = fixture.assets.find((candidate) => candidate.id === document.assetId);
    if (document.assetId && !asset) throw new Error("Choose a source picture supplied for this activity.");
    const rendered = mediaDocumentSchema.parse({ ...working.data,
      shapes: [...working.data.shapes, ...(asset?.shapes.map((shape, index) => ({ ...shape, id: `provided_${asset.id}_${index}` })) ?? [])],
      assets: [...working.data.assets, ...(asset ? [{ creator: asset.creator, licence: asset.licence, credit: document.assetCredit, alt: asset.title }] : [])],
    });
    const pictureInput = record(fixture.picture as Json);
    const picture = executeMedia(rendered, { width: pictureInput.width ?? 600, constraints: pictureInput.constraints ?? [] });
    if (!picture.ok) throw new Error(picture.error ?? "Repair the combined poster layout.");
    const calculated = record(data.output), summary = record(calculated.summaries);
    const groups = Array.isArray(summary.groups) ? summary.groups.map(record).filter((group) => typeof group.category === "string" && typeof group.count === "number") : [];
    const maximum = Math.max(0, ...groups.map((group) => Number(group.count))), leading = groups.filter((group) => group.count === maximum).map((group) => String(group.category));
    const total = groups.length ? groups.reduce((sum, group) => sum + Number(group.count), 0) : Number(calculated.count ?? 0);
    let view = "chart", explanation = ""; const activated: string[] = [];
    for (const event of fixture.events) {
      const control = document.controls.find((control) => control.id === event.target && !control.disabled);
      if (!control) throw new Error("Choose an enabled control declared in this poster.");
      activated.push(control.id);
      if (control.action === "show-table") view = "table";
      else if (control.action === "show-chart") view = "chart";
      else if (control.action === "describe-total") { view = "explanation"; explanation = `These fictional observations contain ${total} recorded responses. This does not describe every group.`; }
      else {
        if (!leading.length) throw new Error("Group the response categories before explaining the largest group.");
        view = "explanation"; explanation = leading.length === 1 ? `${leading[0]} has the largest count, with ${maximum}, in these fictional observations. Other groups could differ.` : `${leading.join(" and ")} share the largest count, with ${maximum} each, in these fictional observations. Other groups could differ.`;
      }
    }
    const credited = !asset || asset.licence !== "CC-BY" || Boolean(asset.creator.trim() && document.assetCredit.trim().toLowerCase() === asset.creator.trim().toLowerCase());
    const reuse = { assetId: document.assetId, creator: asset?.creator ?? "", licence: asset?.licence ?? "original", credit: document.assetCredit,
      permitted: !asset || asset.licence !== "restricted" && credited, credited };
    const visibility = record(record(picture.output).visibleById), history = record(library.output);
    return { ok: true, output: { evidencePoster: true, data: data.output, picture: picture.output, document: rendered,
      reuse, controls: document.controls, controlsAccessible: document.controls.length > 0 && document.controls.every((control) => control.element === "button" && Boolean(control.label.trim()) && !control.disabled),
      interaction: { view, explanation, activated }, originalRetained: history.originalRetained === true,
      originalVisibleShapeCount: working.data.shapes.filter((shape) => shape.kind !== "text" && visibility[shape.id] === true).length,
      originalAlternatives: working.data.shapes.filter((shape) => shape.kind !== "text").map((shape) => ({ kind: shape.kind, alt: shape.alt })),
      providedVisibleShapeCount: Object.entries(visibility).filter(([id, shown]) => id.startsWith("provided_") && shown === true).length,
      pictureHistory: { saves: history.saves ?? 0, opens: history.opens ?? 0, closes: history.closes ?? 0, retrievedCorrectly: history.retrievedCorrectly === true },
    }, trace: [{ component: "data", trace: data.trace }, { component: "picture", trace: library.trace }, ...fixture.events.map((event) => ({ control: event.target }))],
      stdout: "The poster was calculated from its actual data, editable picture and declared controls.", stderr: "", runtime, steps: data.steps + library.steps + picture.steps + fixture.events.length };
  } catch (error) { return { ok: false, output: null, trace: [], stdout: "", stderr: "", error: error instanceof z.ZodError ? "Check the poster's data, picture, source choice and controls." : error instanceof Error ? error.message : "The evidence poster could not run.", runtime, steps: 0 }; }
}
