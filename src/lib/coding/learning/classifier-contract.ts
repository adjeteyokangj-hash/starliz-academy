import { z } from "zod";
const label = z.string().trim().min(1).max(120), text = z.string().max(1000);
export const classifierExampleSchema = z.object({ id: label, features: z.array(z.number().finite().min(-1000).max(1000)).min(1).max(8), label, group: text }).strict();
export const classifierDocumentSchema = z.object({
  training: z.array(classifierExampleSchema).max(100), test: z.array(classifierExampleSchema).max(100),
  ruleTest: z.array(classifierExampleSchema).max(100).optional(),
  k: z.number().int().min(1).max(9), abstainBelow: z.number().min(0).max(1), ruleThreshold: z.number().finite(),
  modelVersion: label, source: text, limitation: text, humanReview: z.boolean(),
}).strict();
export type ClassifierDocument = z.infer<typeof classifierDocumentSchema>;
