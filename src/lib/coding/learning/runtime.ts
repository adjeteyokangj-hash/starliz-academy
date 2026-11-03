import { executeVisualWorkspace } from "./visual-workspace";
import { executeMedia, executeData, executeNetwork, executeClassifier } from "./studio-engines";
import { executeScenario } from "./scenario-engine";
import { executeSystems } from "./systems-engine";
import { executeSource } from "./source-execution";
import { executeEngineering } from "./engineering-engine";
import { executeDual } from "./dual-engine";
import { executeMediaLibrary } from "./media-library";
import { executeEvidence } from "./evidence-engine";
import { executeLearningGame } from "./game-engine";
import { executeInvestigation } from "./investigation-engine";
import type { Execution, Json, PracticalArtifact, PracticalEngine } from "./types";
import { executionSchema } from "./types";

export async function executePractical(engine: PracticalEngine, artifact: PracticalArtifact, input: Json, runSource: typeof executeSource = executeSource): Promise<Execution> {
  const run = await executeWorkbench(engine, artifact, input, runSource);
  const parsed = Buffer.byteLength(JSON.stringify(run)) <= 262144 ? executionSchema.safeParse(run) : { success: false as const };
  return parsed.success ? parsed.data : { ok: false, output: null, trace: [], stdout: "", stderr: "", error: "The execution result exceeds the supported workspace limits. Reduce the table, trace or repeated output and run again.", runtime: "execution-result-validation", steps: 0 };
}
async function executeWorkbench(engine: PracticalEngine, artifact: PracticalArtifact, input: Json, runSource: typeof executeSource): Promise<Execution> {
  if (artifact.type === "source") {
    if (!["python", "web", "api", "sql", "security", "portfolio"].includes(engine)
      || engine === "python" && artifact.language !== "python" || engine === "sql" && artifact.language !== "sql"
      || engine === "web" && (artifact.language !== "javascript" || artifact.entry !== "dom")) return { ok: false, output: null, trace: [], stdout: "", stderr: "", error: "Restore the program language and workspace supplied for this activity.", runtime: "artifact-validation", steps: 0 };
    return runSource(artifact, input);
  }
  switch (engine) {
    case "route": case "scene": case "robot": return executeVisualWorkspace(artifact.document, input);
    case "media": return artifact.document && typeof artifact.document === "object" && !Array.isArray(artifact.document) && "media" in artifact.document ? executeMediaLibrary(artifact.document, input) : executeMedia(artifact.document, input);
    case "data": return executeData(artifact.document, input);
    case "evidence": return executeEvidence(artifact.document, input);
    case "game": return executeLearningGame(artifact.document, input);
    case "network": return executeNetwork(artifact.document, input);
    case "scenario": return executeScenario(artifact.document, input);
    case "systems": return executeSystems(artifact.document, input);
    case "ai": return executeClassifier(artifact.document, input);
    case "investigation": return executeInvestigation(artifact.document, input);
    case "engineering": return executeEngineering(artifact.document, input, runSource);
    case "dual": return executeDual(artifact.document, input, runSource);
    default: return { ok: false, output: null, trace: [], stdout: "", stderr: "", error: "This activity needs its source-code artifact. Restore its starter or saved source file.", runtime: "artifact-validation", steps: 0 };
  }
}
