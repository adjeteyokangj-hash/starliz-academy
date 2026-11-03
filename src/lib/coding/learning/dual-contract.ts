import { z } from "zod";
import { visualProgramSchema } from "./visual-machine";
import { sourceArtifactSchema } from "./types";

export const dualDocumentSchema = z.object({ dual: z.object({ visual: visualProgramSchema,
  python: sourceArtifactSchema.refine((artifact) => artifact.language === "python" && artifact.entry === "variables", "Use Python variable-trace source in a dual-view program"),
}).strict() }).strict();
