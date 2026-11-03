import { personalInputSchema, type ActivityState, type Json, type PracticalArtifact } from "./types";
import type { CodingStage } from "@/lib/coding/types";
const record = (value: Json | undefined): Record<string, Json> | null => value && typeof value === "object" && !Array.isArray(value) ? value : null;
/** Only explicit source-program data is editable. DOM events, assets, files,
 * classroom roles and assessment fixtures are not personal-input controls. */
export function personalInputProfile(artifact: PracticalArtifact, input: Json) {
  if (artifact.type !== "source" || artifact.language === "sql" || artifact.entry === "dom") return null;
  const supplied = record(input), entry = artifact.entry ?? "console";
  const variables = ["variables", "solve"].includes(entry) ? record(supplied?.variables) : null;
  const stdin = entry === "console";
  return variables || stdin ? { variables, stdin, suppliedStdin: typeof supplied?.stdin === "string" ? supplied.stdin : "" } : null;
}
/** Snapshot restoration accepts only the narrow input contract. Callers supply
 * the hash of the artifact owned by the selected private version. */
export function restoredPersonalInput(value: unknown, hash: string): NonNullable<ActivityState["personalInputs"]>[CodingStage] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const saved = value as Record<string, unknown>, parsed = personalInputSchema.safeParse(saved.input);
  return saved.artifactHash === hash && typeof saved.enabled === "boolean" && parsed.success ? { artifactHash: hash, enabled: saved.enabled, input: parsed.data } : null;
}
