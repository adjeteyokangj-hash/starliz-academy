import { z } from "zod";
import { dataDocumentSchema, executeData, executeClassifier } from "./studio-engines";
import { classifierDocumentSchema } from "./classifier-contract";
import type { Execution, Json } from "./types";
export const investigationDocumentSchema = z.object({ data: dataDocumentSchema, classifier: classifierDocumentSchema, interpretation: z.string().max(2000) }).strict();
export const investigationFixtureSchema = z.object({ rows: dataDocumentSchema.shape.rows.optional(), test: classifierDocumentSchema.shape.test.optional() }).strict();
export type InvestigationDocument = z.infer<typeof investigationDocumentSchema>;
const record = (value: Json): Record<string, Json> => value && typeof value === "object" && !Array.isArray(value) ? value : {};
export function executeInvestigation(artifact: unknown, input: unknown = {}): Execution {
  const runtime = "starliz-data-investigation-1.0.0";
  try {
    const document = investigationDocumentSchema.parse(artifact), fixture = investigationFixtureSchema.parse(input);
    const data = executeData(document.data, fixture.rows ? { rows: fixture.rows } : {});
    if (!data.ok) return { ...data, runtime, error: `Data preparation: ${data.error}` };
    const classifier = executeClassifier(document.classifier, fixture.test ? { test: fixture.test } : {});
    if (!classifier.ok) return { ...classifier, runtime, error: `Classifier evaluation: ${classifier.error}` };
    const rows = record(data.output).rows;
    const trainingMatchesData = Array.isArray(rows) && rows.length > 0 && rows.length === document.classifier.training.length && new Set(rows.map((value) => record(value).id)).size === rows.length && rows.every((value) => {
      const row = record(value), example = document.classifier.training.find((item) => item.id === row.id);
      return typeof row.amount === "number" && typeof row.category === "string" && example && example.features.length === 1 && example.features[0] === row.amount && example.label === row.category;
    }) && new Set(document.classifier.training.map((example) => example.id)).size === document.classifier.training.length;
    return { ok: true, output: { investigation: true, data: data.output, classifier: classifier.output, trainingMatchesData, interpretation: document.interpretation },
      trace: [...data.trace, ...classifier.trace], stdout: "", stderr: "", runtime, steps: data.steps + classifier.steps };
  } catch { return { ok: false, output: null, trace: [], stdout: "", stderr: "", runtime, steps: 0, error: "Check the data preparation, classifier settings and investigation size limits." }; }
}
