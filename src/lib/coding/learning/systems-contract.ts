import { z } from "zod";
const instruction = z.object({ op: z.enum(["LOAD", "CONST", "ADD", "SUB", "STORE", "JNZ", "OUT", "HALT"]), operand: z.number().int().min(-255).max(255) }).strict();
const gate = z.object({ id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,15}$/), op: z.enum(["INPUT", "AND", "OR", "XOR", "NOT"]), inputs: z.array(z.string().max(16)).max(2) }).strict();
export const systemsDocumentSchema = z.object({
  mode: z.enum(["computer", "binary", "circuit", "components"]),
  program: z.array(instruction).max(100), memory: z.array(z.number().int().min(0).max(255)).length(16),
  bits: z.number().int().min(1).max(8), left: z.number().int().min(0).max(255), right: z.number().int().min(0).max(255),
  gates: z.array(gate).max(30), outputGate: z.string().max(16),
  components: z.array(z.object({ id: z.string().max(30), role: z.enum(["input", "processor", "memory", "output"]), next: z.array(z.string().max(30)).max(6) }).strict()).max(20),
  explanation: z.string().max(2000),
}).strict();
export const systemsFixtureSchema = systemsDocumentSchema.pick({ memory: true, left: true, right: true }).partial().strict();
export type SystemsDocument = z.infer<typeof systemsDocumentSchema>;
