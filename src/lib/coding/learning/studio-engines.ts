import { z } from "zod";
import type { Execution, Json } from "./types";
import { sameJson } from "./checks";
import { classifierDocumentSchema } from "./classifier-contract";
export { classifierDocumentSchema } from "./classifier-contract";

const text = z.string().max(1000), label = z.string().trim().min(1).max(120);
const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const mediaDocumentSchema = z.object({
  name: text, tool: z.enum(["picture", "text", "combined"]), caption: text, narration: text,
  audience: z.enum(["private", "classroom", "public"]),
  shapes: z.array(z.object({ id: label, kind: z.enum(["rectangle", "circle", "text"]),
    x: z.number().min(0).max(600), y: z.number().min(0).max(400), width: z.number().min(1).max(600), height: z.number().min(1).max(400),
    fill: colour, text: text, alt: text }).strict()).max(100),
  steps: z.array(text).max(12), fontSize: z.number().min(10).max(80), foreground: colour, background: colour,
  assets: z.array(z.object({ creator: text, licence: z.enum(["original", "CC0", "CC-BY", "restricted"]), credit: text, alt: text }).strict()).max(20),
}).strict();
export type MediaDocument = z.infer<typeof mediaDocumentSchema>;
export const mediaConstraintSchema = z.object({ first: label, second: label, relation: z.enum(["above", "below", "aligned", "touching", "in-front"]) }).strict();

const cell = z.union([z.string().max(500), z.number().finite().min(-1e9).max(1e9), z.boolean(), z.null()]);
const row = z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/), cell);
export const dataDocumentSchema = z.object({
  dataSource: z.enum(["document", "fixture"]).default("document"),
  question: text, rows: z.array(row).max(200),
  survey: z.object({ field: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/), options: z.array(text).max(12) }).strict().optional(),
  operations: z.array(z.discriminatedUnion("op", [
    z.object({ op: z.literal("filter"), field: label, comparison: z.enum(["equal", "greater", "less", "contains"]), value: cell }).strict(),
    z.object({ op: z.literal("sort"), field: label, descending: z.boolean() }).strict(),
    z.object({ op: z.literal("total"), field: label, output: label }).strict(),
    z.object({ op: z.literal("average"), field: label, output: label }).strict(),
    z.object({ op: z.literal("group"), field: label }).strict(),
    z.object({ op: z.literal("formula"), expression: z.string().max(200), output: label }).strict(),
    z.object({ op: z.literal("unique"), field: label }).strict(),
    z.object({ op: z.literal("select"), columns: z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/)).min(1).max(20) }).strict(),
    z.object({ op: z.literal("normalise"), field: label, letterCase: z.enum(["preserve", "lower", "upper"]), trim: z.boolean() }).strict(),
    z.object({ op: z.literal("parse-number"), field: label }).strict(),
    z.object({ op: z.literal("require"), field: label }).strict(),
  ])).max(30),
  chart: z.object({ type: z.enum(["none", "bar", "pictogram", "line"]), title: text, category: text, value: text, startAtZero: z.boolean() }).strict(),
  conclusion: text, source: text, licence: z.enum(["original", "CC0", "CC-BY", "restricted"]), credit: text,
  alternatives: text, fontSize: z.number().min(10).max(80),
  representation: z.object({ mode: z.enum(["none", "text", "pixels", "sound"]), values: z.array(z.number().int().min(0).max(255)).max(256), text, bits: z.number().int().min(1).max(16),
    width: z.number().int().min(1).max(32).default(16), sampleRate: z.number().int().min(1000).max(48000).default(8000),
  }).strict(),
}).strict();
export type DataDocument = z.infer<typeof dataDocumentSchema>;

function luminance(hex: string) {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
export function privacyIssues(value: unknown): string[] {
  const content = JSON.stringify(value);
  const issues = [];
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(content)) issues.push("Email address");
  if (/\b(?:\+44|0)\s?\d[\d\s-]{8,12}\b/.test(content)) issues.push("Telephone-like number");
  if (/\b(?:password|secret|api_key)\s*[=:]\s*[^\s,}"]+/i.test(content)) issues.push("Possible secret");
  return issues;
}
function complete(output: Json, trace: Json[], runtime: string, stdout = ""): Execution {
  return { ok: true, output, trace, stdout, stderr: "", runtime, steps: trace.length };
}
function failure(error: unknown, runtime: string): Execution {
  return { ok: false, output: null, trace: [], stdout: "", stderr: "", runtime, steps: 0,
    error: error instanceof z.ZodError ? "Check the document's fields, value ranges and required controls." : error instanceof Error ? error.message : "The document could not be processed." };
}
function pictureLayers(document: MediaDocument) {
  const pixels = new Int16Array(600 * 400).fill(-1), counts = new Array<number>(document.shapes.length).fill(0), differences = new Array<number>(document.shapes.length).fill(0);
  const contacts = new Set<string>();
  for (const [index, shape] of document.shapes.entries()) {
    if (shape.kind === "text") continue;
    const endX = Math.min(600, Math.ceil(shape.x + shape.width)), endY = Math.min(400, Math.ceil(shape.y + shape.height));
    for (let y = Math.max(0, Math.floor(shape.y)); y < endY; y++) for (let x = Math.max(0, Math.floor(shape.x)); x < endX; x++) {
      if (x + .5 < shape.x || y + .5 < shape.y || x + .5 > shape.x + shape.width || y + .5 > shape.y + shape.height) continue;
      if (shape.kind === "circle" && ((x + .5 - shape.x - shape.width / 2) / (shape.width / 2)) ** 2 + ((y + .5 - shape.y - shape.height / 2) / (shape.height / 2)) ** 2 > 1) continue;
      pixels[y * 600 + x] = index;
    }
  }
  const colours = document.shapes.map((shape) => parseInt(shape.fill.slice(1), 16)), background = parseInt(document.background.slice(1), 16);
  for (let y = 0; y < 400; y++) for (let x = 0; x < 600; x++) {
    const index = pixels[y * 600 + x]!;
    if (index < 0) continue;
    counts[index]++;
    for (const neighbour of [x ? pixels[y * 600 + x - 1]! : -1, x < 599 ? pixels[y * 600 + x + 1]! : -1, y ? pixels[(y - 1) * 600 + x]! : -1, y < 399 ? pixels[(y + 1) * 600 + x]! : -1]) {
      if (neighbour === index) continue;
      if (neighbour >= 0) contacts.add(`${Math.min(index, neighbour)}:${Math.max(index, neighbour)}`);
      const other = neighbour >= 0 ? colours[neighbour]! : background, colour = colours[index]!;
      const difference = Math.max(...[0, 8, 16].map((shift) => Math.abs((colour >> shift & 255) - (other >> shift & 255))));
      differences[index] = Math.max(differences[index]!, difference);
    }
  }
  return { visiblePixelsById: Object.fromEntries(document.shapes.filter((shape) => shape.kind !== "text").map((shape) => [shape.id, counts[document.shapes.indexOf(shape)]!])),
    visibleById: Object.fromEntries(document.shapes.filter((shape) => shape.kind !== "text").map((shape) => { const index = document.shapes.indexOf(shape); return [shape.id, counts[index]! > 0 && differences[index]! >= 20]; })),
    layerOrder: document.shapes.map((shape) => shape.id), contacts };
}
export function executeMedia(artifact: unknown, input: unknown = {}): Execution {
  const runtime = "starliz-media-1.0.0";
  try {
    const document = mediaDocumentSchema.parse(artifact);
    const viewport = z.object({ width: z.number().min(240).max(2000).default(600), constraints: z.array(mediaConstraintSchema).max(20).default([]) }).strict().parse(input);
    if (new Set(document.shapes.map((shape) => shape.id)).size !== document.shapes.length) throw new Error("Give each picture layer a different name.");
    const light = Math.max(luminance(document.foreground), luminance(document.background));
    const dark = Math.min(luminance(document.foreground), luminance(document.background));
    const contrast = (light + 0.05) / (dark + 0.05);
    const privacy = privacyIssues(document);
    const permitted = document.assets.every((asset) => asset.licence !== "restricted" && (asset.licence !== "CC-BY" || Boolean(asset.credit.trim() && asset.creator.trim())));
    const { contacts, ...visibility } = pictureLayers(document);
    const relationships = viewport.constraints.map((constraint) => {
      const first = document.shapes.find((shape) => shape.id === constraint.first), second = document.shapes.find((shape) => shape.id === constraint.second);
      let satisfied = false;
      if (first && second) {
        const firstX = first.x + first.width / 2, secondX = second.x + second.width / 2, firstY = first.y + first.height / 2, secondY = second.y + second.height / 2;
        satisfied = constraint.relation === "above" ? firstY < secondY : constraint.relation === "below" ? firstY > secondY
          : constraint.relation === "aligned" ? Math.abs(firstX - secondX) <= Math.max(12, Math.min(first.width, second.width) / 2)
            : constraint.relation === "in-front" ? document.shapes.indexOf(first) > document.shapes.indexOf(second)
              : contacts.has(`${Math.min(document.shapes.indexOf(first), document.shapes.indexOf(second))}:${Math.max(document.shapes.indexOf(first), document.shapes.indexOf(second))}`);
      }
      return { ...constraint, satisfied };
    });
    return complete({ document: document as unknown as Json, ...visibility, relationships, shapeCount: document.shapes.length, caption: document.caption,
      steps: document.steps, stepCount: document.steps.filter((step) => step.trim()).length, named: document.name.trim().length >= 3,
      hasPicture: document.shapes.some((shape) => shape.kind !== "text"), hasText: Boolean(document.caption.trim()) || document.shapes.some((shape) => shape.kind === "text" && Boolean(shape.text.trim())),
      accessible: document.fontSize >= 18 && contrast >= 4.5 && document.shapes.every((shape) => Boolean(shape.alt.trim())) && Boolean(document.narration.trim()),
      contrast, permitted, privacySafe: privacy.length === 0 && document.audience !== "public", privacyIssues: privacy,
      fitsCanvas: document.shapes.every((shape) => shape.x + shape.width <= 600 && shape.y + shape.height <= 400),
      renderedWidth: viewport.width, renderedShapeWidths: document.shapes.map((shape) => shape.width * viewport.width / 600),
      credited: document.assets.every((asset) => asset.licence === "original" || Boolean(asset.credit.trim())),
    }, document.shapes.map((shape, index) => ({ layer: index, id: shape.id, kind: shape.kind, x: shape.x, y: shape.y })), runtime);
  } catch (error) { return failure(error, runtime); }
}

/** Spreadsheet cell references are parsed, never evaluated as JavaScript. */
function formula(expression: string, rows: Array<Record<string, string | number | boolean | null>>) {
  const match = /^(SUM|AVERAGE|COUNT)\(([A-Z])([1-9]\d?):\2([1-9]\d?)\)$/.exec(expression.trim().toUpperCase());
  if (!match) throw new Error("Use a formula such as SUM(A1:A4), AVERAGE(A1:A4) or COUNT(A1:A4).");
  const columns = [...new Set(rows.flatMap((record) => Object.keys(record)))];
  const column = columns[match[2]!.charCodeAt(0) - 65];
  const from = Number(match[3]) - 1, to = Number(match[4]);
  if (!column || from >= to || to > rows.length) throw new Error("The formula range points outside the table.");
  const values = rows.slice(from, to).map((record) => record[column]);
  if (match[1] === "COUNT") return values.filter((value) => typeof value === "number").length;
  if (values.some((value) => typeof value !== "number")) throw new Error("Use numeric cells for this total or average.");
  const sum = (values as number[]).reduce((total, value) => total + value, 0);
  if (!Number.isFinite(sum)) throw new Error("The calculation exceeds the supported finite numeric range.");
  return match[1] === "AVERAGE" ? sum / values.length : sum;
}
export function executeData(artifact: unknown, input: unknown = {}): Execution {
  const runtime = "starliz-data-1.0.0";
  try {
    const document = dataDocumentSchema.parse(artifact);
    const fixture = z.object({ rows: z.array(row).max(200).optional(), query: z.object({ field: label, value: cell }).strict().optional(), claims: z.array(text).max(8).default([]) }).strict().parse(input);
    if (document.dataSource === "fixture" && !fixture.rows) throw new Error("This data program needs the supplied dataset.");
    let rows = (document.dataSource === "fixture" ? fixture.rows! : document.rows).map((record) => ({ ...record }));
    const summaries: Record<string, Json> = {}, trace: Json[] = [], cleaningLog: Json[] = [];
    for (const operation of document.operations) {
      const beforeCount = rows.length;
      if (operation.op === "parse-number") {
        const changedRows: number[] = [];
        rows = rows.map((record, index) => {
          const original = record[operation.field];
          if (typeof original === "number") return record;
          if (typeof original !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(original.trim())) throw new Error(`Row ${index + 1} needs valid decimal text in ${operation.field}; missing, blank and non-numeric values cannot become zero.`);
          const value = Number(original.trim());
          if (!Number.isFinite(value) || Math.abs(value) > 1e9) throw new Error(`Row ${index + 1} exceeds the supported numeric range in ${operation.field}.`);
          changedRows.push(index + 1);
          return { ...record, [operation.field]: value };
        });
        cleaningLog.push({ operation: "parse-number", field: operation.field, beforeCount, afterCount: rows.length, changedRows });
      }
      if (operation.op === "select") {
        rows = rows.map((record) => Object.fromEntries(operation.columns.filter((field) => Object.hasOwn(record, field)).map((field) => [field, record[field]!])));
        cleaningLog.push({ operation: "select", beforeCount, afterCount: rows.length, retainedFields: operation.columns });
      }
      if (operation.op === "normalise") {
        const changedRows: number[] = [];
        rows = rows.map((record, index) => {
          const original = record[operation.field];
          if (typeof original !== "string") return record;
          const trimmed = operation.trim ? original.trim() : original;
          const value = operation.letterCase === "lower" ? trimmed.toLowerCase() : operation.letterCase === "upper" ? trimmed.toUpperCase() : trimmed;
          if (value !== original) changedRows.push(index + 1);
          return { ...record, [operation.field]: value };
        });
        cleaningLog.push({ operation: "normalise", field: operation.field, beforeCount, afterCount: rows.length, changedRows });
      }
      if (operation.op === "require") {
        const removedRows: number[] = [];
        rows = rows.filter((record, index) => {
          const value = record[operation.field], present = value !== undefined && value !== null && !(typeof value === "string" && !value.trim());
          if (!present) removedRows.push(index + 1);
          return present;
        });
        cleaningLog.push({ operation: "require", field: operation.field, beforeCount, afterCount: rows.length, removedRows });
      }
      if (operation.op === "filter") rows = rows.filter((record) => {
        const value = record[operation.field];
        if (operation.comparison === "equal") return value === operation.value;
        if (operation.comparison === "contains") return typeof value === "string" && value.includes(String(operation.value));
        return typeof value === "number" && typeof operation.value === "number" && (operation.comparison === "greater" ? value > operation.value : value < operation.value);
      });
      if (operation.op === "sort") rows.sort((a, b) => {
        const left = a[operation.field], right = b[operation.field];
        const comparison = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "en");
        return operation.descending ? -comparison : comparison;
      });
      if (operation.op === "unique") { const seen = new Set(), removedRows: number[] = []; rows = rows.filter((record, index) => { const value = record[operation.field]; if (seen.has(value)) { removedRows.push(index + 1); return false; } seen.add(value); return true; }); cleaningLog.push({ operation: "unique", field: operation.field, beforeCount, afterCount: rows.length, removedRows }); }
      if (operation.op === "total" || operation.op === "average") {
        const values = rows.map((record) => record[operation.field]);
        if (values.some((value) => typeof value !== "number")) throw new Error("A calculation includes a missing or non-numeric value.");
        const total = (values as number[]).reduce((sum, value) => sum + value, 0);
        if (!Number.isFinite(total)) throw new Error("The calculation exceeds the supported finite numeric range.");
        summaries[operation.output] = operation.op === "average" ? values.length ? total / values.length : null : total;
      }
      if (operation.op === "formula") summaries[operation.output] = formula(operation.expression, rows);
      if (operation.op === "group") {
        const groups = new Map<string, number>();
        for (const record of rows) { const key = String(record[operation.field] ?? "Missing"); groups.set(key, (groups.get(key) ?? 0) + 1); }
        summaries.groups = [...groups].map(([category, count]) => ({ category, count }));
      }
      trace.push({ operation: operation.op, rows: rows.length, summaries: { ...summaries } });
    }
    const representation = document.representation;
    if (representation.mode === "text" && representation.bits !== 8) throw new Error("This UTF-8 workspace uses eight-bit bytes. Change the bit width to eight.");
    const encoded = Array.from(new TextEncoder().encode(representation.text));
    const decoded = representation.mode === "text" ? new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(representation.values)) : "";
    const maxValue = 2 ** representation.bits - 1;
    const quantised = representation.values.map((value) => Math.min(maxValue, Math.round(value * maxValue / 255)));
    const chartRows = Array.isArray(summaries.groups) ? summaries.groups as Array<Record<string, Json>> : rows;
    const chartPoints = chartRows.flatMap((record) => typeof record[document.chart.value] === "number" && record[document.chart.category] !== undefined
      ? [{ category: String(record[document.chart.category]), value: record[document.chart.value] }] : []);
    const chartDataValid = chartRows.length > 0 && chartPoints.length === chartRows.length
      && (document.chart.type !== "pictogram" || chartPoints.every((point) => typeof point.value === "number" && Number.isInteger(point.value) && point.value >= 0 && point.value <= 200));
    const canonicalRows = (records: Array<Record<string, unknown>>) => records.map((record) => JSON.stringify(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)))).sort();
    const numericTotal = rows.reduce((sum, record) => sum + Object.values(record).filter((value) => typeof value === "number").reduce((total: number, value) => total + Number(value), 0), 0);
    if (!Number.isFinite(numericTotal)) throw new Error("The dataset total exceeds the supported finite numeric range.");
    const surveyOptions = document.survey?.options.map((option) => option.trim().toLowerCase()) ?? [];
    const surveyOptionsDistinct = surveyOptions.length >= 2 && surveyOptions.every(Boolean) && new Set(surveyOptions).size === surveyOptions.length;
    const sourceRows = document.dataSource === "fixture" ? fixture.rows ?? [] : document.rows;
    return complete({ rows: rows as Json[], count: rows.length, summaries, cleaningLog, question: document.question, conclusion: document.conclusion, dataSource: document.dataSource,
      alternatives: document.alternatives, source: document.source, licence: document.licence, credit: document.credit,
      columns: [...new Set(rows.flatMap((record) => Object.keys(record)))],
      queryCount: fixture.query ? rows.filter((record) => record[fixture.query!.field] === fixture.query!.value).length : rows.length,
      chart: document.chart, chartPoints, chartDataValid, fontSize: document.fontSize, chartAccessible: chartDataValid && document.fontSize >= 18 && Boolean(document.chart.title && document.alternatives) && document.chart.startAtZero,
      recordedRowsMatch: document.dataSource === "document" && Boolean(fixture.rows) && sameJson(canonicalRows(document.rows), canonicalRows(fixture.rows ?? [])),
      surveyField: document.survey?.field ?? null, surveyOptions: document.survey?.options ?? [], surveyOptionsDistinct,
      responsesRecordable: surveyOptionsDistinct && sourceRows.length > 0 && sourceRows.every((record) => typeof record[document.survey!.field] === "string" && surveyOptions.includes(String(record[document.survey!.field]).trim().toLowerCase())),
      credited: document.licence === "original" || document.licence === "CC0" || document.licence === "CC-BY" && Boolean(document.credit.trim()),
      permitted: document.licence !== "restricted", privacySafe: privacyIssues({ document, suppliedRows: fixture.rows ?? [] }).length === 0,
      encoded, decoded, quantised, representationBits: representation.values.length * representation.bits,
      representationMode: representation.mode, representationWidth: representation.width, representationDepth: representation.bits,
      encodedBits: encoded.length * 8, sampleRate: representation.sampleRate, durationSeconds: representation.values.length / representation.sampleRate, bitRate: representation.sampleRate * representation.bits,
      numericTotal,
    }, trace, runtime);
  } catch (error) { return failure(error, runtime); }
}

export const networkDocumentSchema = z.object({
  nodes: z.array(label).min(2).max(30), links: z.array(z.tuple([label, label])).max(80), from: label, to: label,
  service: z.enum(["web", "email", "file", "message"]), query: text,
  index: z.array(z.object({ id: label, title: text, words: z.array(label).max(20), promotion: z.number().min(0).max(10), reliable: z.boolean(), source: text, licence: text, content: text.default("") }).strict()).max(30),
  relevanceWeight: z.number().min(0).max(10), promotionWeight: z.number().min(0).max(10),
  selected: z.array(label).max(10), evidence: text, concern: z.enum(["none", "trusted-adult", "platform-report", "reply-with-details"]),
  credits: z.record(label, text).default({}), answer: text.default(""),
  packets: z.array(z.object({ sequence: z.number().int().min(0).max(100), text }).strict()).max(30), expectedPackets: z.number().int().min(0).max(30),
}).strict();
export function executeNetwork(artifact: unknown, input: unknown = {}): Execution {
  const runtime = "starliz-network-1.0.0";
  try {
    const base = networkDocumentSchema.parse(artifact);
    const overrides = networkDocumentSchema.pick({ from: true, to: true, query: true, index: true, packets: true, expectedPackets: true }).partial().strict().parse(input);
    const document = { ...base, ...overrides }, nodes = new Set(document.nodes);
    if (nodes.size !== document.nodes.length || !nodes.has(document.from) || !nodes.has(document.to)
      || document.links.some(([a, b]) => !nodes.has(a) || !nodes.has(b))) throw new Error("Each device needs a unique name, and every connection must join existing devices.");
    const queue: string[][] = [[document.from]], visited = new Set<string>(), trace: Json[] = [];
    let delivered: string[] = [];
    while (queue.length) {
      const route = queue.shift()!, current = route.at(-1)!;
      if (visited.has(current)) continue;
      visited.add(current); trace.push({ device: current, path: route });
      if (current === document.to) { delivered = route; break; }
      for (const [a, b] of document.links) { if (a === current && !visited.has(b)) queue.push([...route, b]); if (b === current && !visited.has(a)) queue.push([...route, a]); }
    }
    const terms = document.query.toLowerCase().split(/\W+/).filter(Boolean);
    const ranking = document.index.map((page) => ({ id: page.id, relevant: terms.filter((term) => page.words.some((word) => word.toLowerCase().includes(term))).length,
      score: terms.filter((term) => page.words.some((word) => word.toLowerCase().includes(term))).length * document.relevanceWeight + page.promotion * document.promotionWeight,
      promoted: page.promotion > 0, reliable: page.reliable })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const packets = [...document.packets].sort((a, b) => a.sequence - b.sequence);
    const packetIds = new Set(packets.map((packet) => packet.sequence));
    const completePackets = packetIds.size === document.expectedPackets && packets.every((packet, index) => packet.sequence === index);
    const reconstructed = completePackets ? packets.map((packet) => packet.text).join("") : null;
    const selectedPages = document.selected.map((id) => document.index.find((page) => page.id === id)).filter((page) => page !== undefined);
    const citations = selectedPages.map((page) => ({ id: page.id, source: page.source, licence: page.licence, credit: document.credits[page.id] ?? "" }));
    const credited = document.selected.length > 0 && selectedPages.length === document.selected.length && citations.every((citation) => citation.source.trim() && citation.licence.trim() && citation.credit.trim().toLowerCase() === citation.source.trim().toLowerCase());
    const answer = document.answer.trim(), normal = (value: string) => value.toLowerCase().replace(/\s+/g, " ");
    const supportedAnswer = answer.length >= 4 && selectedPages.some((page) => page.reliable && normal(page.content).includes(normal(answer)));
    const page = selectedPages[0] ?? document.index.find((item) => item.id === ranking[0]?.id);
    const packetTransfer = document.expectedPackets > 0 || packets.length > 0;
    const payload = packetTransfer ? reconstructed ?? "" : document.query;
    const payloadBytes = Array.from(new TextEncoder().encode(payload));
    const serviceResult: Json = delivered.length === 0 || packetTransfer && !completePackets ? null : document.service === "web" ? { kind: "web-page", title: page?.title ?? "No curated page selected", content: page?.content ?? "", source: page?.source ?? "" }
      : document.service === "email" ? { kind: "email-envelope", from: document.from, to: document.to, body: payload }
        : document.service === "file" ? { kind: "file-transfer", name: "practice.txt", byteLength: payloadBytes.length, byteChunks: Array.from({ length: Math.ceil(payloadBytes.length / 256) }, (_, index) => payloadBytes.slice(index * 256, (index + 1) * 256)), text: payload }
          : { kind: "message", from: document.from, to: document.to, text: payload };
    return complete({ network: { nodes: document.nodes, links: document.links }, connected: delivered.length > 0, path: delivered, service: document.service, ranking, relevantResults: ranking.filter((page) => page.relevant > 0).map((page) => page.id),
      selectedTrusted: document.selected.length > 0 && document.selected.every((id) => document.index.some((page) => page.id === id && page.reliable)),
      credited, citations, answer, supportedAnswer, query: document.query, concern: document.concern, serviceResult,
      safeConcern: document.concern !== "reply-with-details", evidence: document.evidence,
      packetLoss: !completePackets, reconstructed, packetOrder: packets.map(packet => packet.sequence),
      missingSequences: Array.from({ length: document.expectedPackets }, (_, sequence) => sequence).filter(sequence => !packetIds.has(sequence)),
      duplicateSequences: [...packetIds].filter(sequence => packets.filter(packet => packet.sequence === sequence).length > 1),
    }, trace, runtime);
  } catch (error) { return failure(error, runtime); }
}

export function executeClassifier(artifact: unknown, input: unknown = {}): Execution {
  const runtime = "starliz-knn-1.0.0";
  try {
    const base = classifierDocumentSchema.parse(artifact);
    const fixture = z.object({ test: classifierDocumentSchema.shape.test.optional() }).strict().parse(input);
    const document = { ...base, ...(fixture.test ? { test: fixture.test } : {}) };
    const ruleExamples = document.ruleTest ?? document.test;
    if (!document.training.length || !document.test.length) throw new Error("Supply separate training examples and test examples.");
    const dimensions = document.training[0]!.features.length;
    if ([...document.training, ...document.test, ...ruleExamples].some((item) => item.features.length !== dimensions)) throw new Error("Each example needs the same number of measured features.");
    if (document.k > document.training.length) throw new Error("Use no more neighbours than there are training examples.");
    const trainingIds = new Set(document.training.map((item) => item.id));
    const overlap = document.test.filter((item) => trainingIds.has(item.id));
    const learned = document.test.map((item) => {
      const nearest = document.training.map((example) => ({ label: example.label, distance: Math.sqrt(example.features.reduce((sum, value, index) => sum + (value - item.features[index]!) ** 2, 0)) }))
        .sort((a, b) => a.distance - b.distance || a.label.localeCompare(b.label)).slice(0, document.k);
      const votes = new Map<string, number>();
      for (const neighbour of nearest) votes.set(neighbour.label, (votes.get(neighbour.label) ?? 0) + 1);
      const [prediction, count] = [...votes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]!;
      const confidence = count / nearest.length, abstained = confidence < document.abstainBelow;
      return { id: item.id, expected: item.label, predicted: prediction, correct: prediction === item.label, confidence, abstained, reviewRequired: abstained || document.humanReview, group: item.group, neighbours: nearest };
    });
    const groups = [...new Set(learned.map((item) => item.group))].map((group) => {
      const cases = learned.filter((item) => item.group === group), correct = cases.filter((item) => item.correct).length;
      return { group, count: cases.length, correct, accuracy: correct / cases.length };
    });
    const labels = [...new Set([...document.training, ...document.test].map(item => item.label))].sort();
    const labelMetrics = labels.map(label => ({ label,
      truePositive: learned.filter(item => item.expected === label && item.predicted === label).length,
      falsePositive: learned.filter(item => item.expected !== label && item.predicted === label).length,
      falseNegative: learned.filter(item => item.expected === label && item.predicted !== label).length,
      trueNegative: learned.filter(item => item.expected !== label && item.predicted !== label).length,
      support: learned.filter(item => item.expected === label).length,
    }));
    const featureOverlaps = document.test.flatMap(item => {
      const matches = document.training.filter(example => example.features.every((value, index) => value === item.features[index])).map(example => example.id);
      return matches.length ? [{ testId: item.id, trainingIds: matches }] : [];
    });
    return complete({ predictions: learned, correct: learned.filter((item) => item.correct).length, errors: learned.filter((item) => !item.correct).length,
      accuracy: learned.filter((item) => item.correct).length / learned.length, disjoint: overlap.length === 0,
      uniqueExamples: trainingIds.size === document.training.length && new Set(document.test.map((item) => item.id)).size === document.test.length,
      groups, disparity: Math.max(...groups.map((group) => group.accuracy)) - Math.min(...groups.map((group) => group.accuracy)),
      uncertain: learned.filter((item) => item.abstained).length, modelVersion: document.modelVersion, limitation: document.limitation,
      trainingCount: document.training.length, testCount: document.test.length, reviewEnabled: document.humanReview,
      rulePredictions: ruleExamples.map((item) => item.features[0]! >= document.ruleThreshold),
      ruleObservations: ruleExamples.map(item => ({ id: item.id, feature: item.features[0]!, passesThreshold: item.features[0]! >= document.ruleThreshold, expected: item.label })),
      comparisonSameExamples: sameJson(ruleExamples, document.test),
      trainingIds: document.training.map(item => item.id), testIds: document.test.map(item => item.id), featureOverlaps, labelMetrics,
      accepted: learned.filter(item => !item.abstained).length, deferred: learned.filter(item => item.abstained).length,
      metricScope: "Confusion counts and accuracy describe raw neighbour-vote labels, including deferred predictions; vote share is not calibrated certainty. Equal feature vectors require provenance review, not an automatic claim of data leakage.",
    }, learned as unknown as Json[], runtime);
  } catch (error) { return failure(error, runtime); }
}
