import { createHash } from "node:crypto";
import { CODING_STAGES, stageUnlocked, type CodingStage } from "@/lib/coding/types";
import { checkExecution } from "./checks";
import { executePractical } from "./runtime";
import { visualEventNames, visualEventValue } from "./visual-events";
import { visualProgramSchema } from "./visual-machine";
import { evidenceControlNames } from "./evidence-engine";
import { gameControlNames } from "./game-engine";
import { personalInputProfile, restoredPersonalInput } from "./personal-input";
import { bindEvidenceTemplate } from "./evidence-links";
import { initialiseStageFiles, stageProjectFiles, setStageProjectFiles } from "./stage-files";
import type { ActivityAction, ActivityContent, ActivityState, Execution, Json, PracticalArtifact, PracticalCase } from "./types";

export class LearningError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function artifactHash(artifact: PracticalArtifact): string { return createHash("sha256").update(JSON.stringify(artifact)).digest("hex"); }
export function recordedPlanHash(artifact: PracticalArtifact): string | null {
  if (artifact.type !== "visual" || !artifact.document || typeof artifact.document !== "object" || Array.isArray(artifact.document)) return null;
  const plan = artifact.document.plan;
  return Array.isArray(plan) && plan.length > 0 && plan.length <= 40 && plan.every((direction) => typeof direction === "string" && ["right", "left", "up", "down"].includes(direction)) ? createHash("sha256").update(JSON.stringify(plan)).digest("hex") : null;
}
export function capturedFiles(run: Execution): Record<string, string> | null {
  if (!run.ok || !run.output || typeof run.output !== "object" || Array.isArray(run.output) || !Object.hasOwn(run.output, "files")) return null;
  const value = run.output.files;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LearningError("Return a supported saved-file collection.");
  const entries = Object.entries(value);
  if (entries.length > 16 || entries.some(([name, content]) => !/^[A-Za-z0-9_-]{1,48}\.(json|txt|csv|sql|html|css)$/.test(name) || typeof content !== "string" || Buffer.byteLength(content) > 8192)
    || Buffer.byteLength(JSON.stringify(value)) > 32768) throw new LearningError("Saved data files need supported names, at most 8KiB per file and 32KiB in total.");
  return Object.fromEntries(entries) as Record<string, string>;
}
/** Freeze the actual checked dataset, while keeping the learner's separate
 * working data available for save/resume and later personal project runs. */
export function snapshotProjectFiles(state: ActivityState, stage: CodingStage, artifact: PracticalArtifact, assessment: boolean) {
  if (assessment && artifact.type === "source") return state.lastExecution && state.lastRunStage === stage && state.lastRunArtifactHash === artifactHash(artifact) ? capturedFiles(state.lastExecution) ?? {} : {};
  return stageProjectFiles(state, stage);
}
export function initialActivityState(activity: ActivityContent, variant = 0): ActivityState {
  return { schema: 1, version: activity.version, activityId: activity.id, stage: "discover", completed: [], artifacts: {},
    attempts: 0, checksPassed: 0, independentVariant: variant, assistedVariantIds: [], hints: {}, explanation: "", prediction: null,
    lastExecution: null, lastChecks: [], files: {}, tutorMessages: [], mastered: false, masteredArtifact: null, masteredInput: null };
}
export function currentVariant(activity: ActivityContent, state: ActivityState) { return activity.independent[state.independentVariant % activity.independent.length]!; }
export function variantFingerprint(activity: ActivityContent, state: ActivityState): string {
  const variant = currentVariant(activity, state);
  return createHash("sha256").update(JSON.stringify({ task: variant.task, cases: variant.cases })).digest("hex");
}
export function stageArtifact(activity: ActivityContent, state: ActivityState, stage: CodingStage): PracticalArtifact {
  const owned = ["discover", "predict"].includes(stage) ? undefined : state.artifacts[stage] ?? (stage === "practise" ? state.artifacts.build : stage === "review" ? state.artifacts.create : undefined);
  if (owned) return owned;
  const template = stage === "discover" ? activity.example : stage === "predict" ? activity.prediction.artifact : stage === "debug" ? activity.faulty : stage === "create" || stage === "review" ? currentVariant(activity, state).starter : activity.starter;
  const bindings = state.evidenceBindings?.[stage === "review" ? "create" : stage];
  return activity.evidenceSlots && bindings ? bindEvidenceTemplate(template, stage === "predict" ? activity.prediction.input : stageCases(activity, state, stage)[0]!.input, bindings) : template;
}
export function stageCases(activity: ActivityContent, state: ActivityState, stage: CodingStage): PracticalCase[] {
  if (stage === "create" || stage === "review") return currentVariant(activity, state).cases;
  if (stage === "debug") return activity.debugCases;
  if (stage === "practise") return activity.practiceCases;
  return activity.cases;
}

export type TeachingTurn = { message: string; source: "model" | "fallback"; revealing: boolean; context?: "curriculum" | "project" };
type Dependencies = {
  run: typeof executePractical;
  teach: (activity: ActivityContent, state: ActivityState, stage: CodingStage, artifact: PracticalArtifact, question?: string) => Promise<TeachingTurn>;
  reflect: (activity: ActivityContent, artifact: PracticalArtifact, run: Execution, explanation: string) => Promise<{ passed: boolean; message: string; source: "model" | "evidence"; confidence: number; pending?: boolean }>;
};
export type TransitionResult = { state: ActivityState; message: string; passed?: boolean; versionLabel?: string; newlyMastered: boolean };

export async function transitionActivity(activity: ActivityContent, current: ActivityState, action: ActivityAction, deps: Dependencies): Promise<TransitionResult> {
  if (current.version !== activity.version || current.activityId !== activity.id) throw new LearningError("This saved activity belongs to another curriculum version. Its original work has been retained.", 409);
  if (!stageUnlocked(action.stage, current.completed)) throw new LearningError("Complete the earlier parts of this activity before opening this stage.", 403);
  const state = structuredClone(current), stage = action.stage;
  initialiseStageFiles(state);
  if (action.evidenceBindings !== undefined) throw new LearningError("Saved creation selections must be resolved by the authorised workspace service.", 403);
  state.stage = stage;
  state.files = structuredClone(stageProjectFiles(state, stage));
  let artifact = action.artifact ?? stageArtifact(activity, state, stage);
  if (stage === "discover" || stage === "predict") artifact = stageArtifact(activity, state, stage);
  if (!["open", "restore"].includes(action.action)) {
    const expected = stage === "predict" ? activity.prediction.artifact : stage === "create" || stage === "review" ? currentVariant(activity, state).reference : stage === "debug" ? activity.debugReference : activity.reference;
    if (artifact.type !== expected.type || artifact.type === "source" && expected.type === "source"
      && (artifact.language !== expected.language || (artifact.entry ?? "console") !== (expected.entry ?? "console"))) throw new LearningError("Use this activity's own workspace and program language. Restore its starter if needed; saved versions are retained.");
  }
  let personalRunInput: Json | undefined;
  if (action.testInput !== undefined) {
    const input = stageCases(activity, state, stage)[0]!.input, profile = personalInputProfile(artifact, input);
    if (!["save", "run"].includes(action.action) || !["build", "practise", "debug", "create"].includes(stage) || !profile) throw new LearningError("Personal input belongs to an editable source-program run or save; assessment inputs remain protected.");
    state.personalInputs ??= {};
    if (action.testInput === null) { if (state.personalInputs[stage]) state.personalInputs[stage]!.enabled = false; }
    else {
      if (action.testInput.variables !== undefined && !profile.variables || action.testInput.stdin !== undefined && !profile.stdin) throw new LearningError("Use the input fields provided for this source workspace.");
      personalRunInput = { ...(input as Record<string, Json>), ...action.testInput };
      state.personalInputs[stage] = { artifactHash: artifactHash(artifact), input: structuredClone(action.testInput), enabled: true };
    }
  }
  if (action.action === "run" && action.testInput === undefined && ["build", "practise", "debug", "create"].includes(stage)) {
    const restored = restoredPersonalInput(state.personalInputs?.[stage], artifactHash(artifact));
    const input = stageCases(activity, state, stage)[0]!.input, profile = personalInputProfile(artifact, input);
    if (restored?.enabled && profile && (restored.input.variables === undefined || profile.variables) && (restored.input.stdin === undefined || profile.stdin)) personalRunInput = { ...(input as Record<string, Json>), ...restored.input };
  }
  const result = (message: string, extra: Partial<Omit<TransitionResult, "state" | "message">> = {}): TransitionResult => ({ state, message, newlyMastered: false, ...extra });
  const workflow = () => { state.workflow ??= {}; return state.workflow[stage] ??= {}; };
  const clearPlay = () => {
    delete state.webInteractions;
    state.lastExecution = null; state.lastChecks = [];
    delete state.lastExecutionInput; delete state.lastRunStage; delete state.lastRunArtifactHash; delete state.lastRunKind;
  };
  const workflowChecks = (candidate: PracticalArtifact) => {
    if (!["build", "practise", "debug", "create", "review"].includes(stage)) return [];
    const evidence = state.workflow?.[stage === "review" ? "create" : stage], hash = artifactHash(candidate);
    return [
      ...(activity.workflow?.planBeforeRun && ["build", "create", "review"].includes(stage) ? [{ description: "The matching route plan was recorded before coding", passed: Boolean(recordedPlanHash(candidate) && evidence?.planHash === recordedPlanHash(candidate)) }] : []),
      ...(activity.workflow?.saveAndReplay ? [{ description: "Save this work, then replay the saved artifact successfully", passed: evidence?.savedHash === hash && evidence?.replayedHash === hash }] : []),
      ...(activity.workflow?.restoreVersion ? [{ description: "Retrieve an actual saved version of this artifact", passed: evidence?.restoredHash === hash }] : []),
      ...(activity.workflow?.originalDemonstration && ["create", "review"].includes(stage) ? [{ description: "Attach your original private video demonstration, written alternative, source rights and honest limitation for this exact saved artifact", passed: state.demonstrations?.create?.metadata.artifactHash === hash && state.demonstrations.create.metadata.taskHash === variantFingerprint(activity, state) }] : []),
    ];
  };
  const advance = () => {
    if (!state.completed.includes(stage)) state.completed.push(stage);
    state.stage = CODING_STAGES[Math.min(CODING_STAGES.indexOf(stage) + 1, CODING_STAGES.length - 1)]!;
    state.files = structuredClone(stageProjectFiles(state, state.stage));
    if (activity.evidenceSlots && ["predict", "build", "practise", "debug"].includes(state.stage) && state.evidenceBindings?.discover && !state.evidenceBindings[state.stage]) state.evidenceBindings[state.stage] = structuredClone(state.evidenceBindings.discover);
  };
  if (action.action === "open") return result("Your saved activity is open.");
  if (action.action === "plan") {
    if (!activity.workflow?.planBeforeRun || !["build", "create"].includes(stage) || artifact.type !== "visual") throw new LearningError("Record a route plan in Build or Create for a planning activity.");
    const hash = recordedPlanHash(artifact);
    const program = visualProgramSchema.safeParse(artifact.document);
    if (!hash || !program.success || !Object.keys(program.data.handlers).length || Object.values(program.data.handlers).some((commands) => commands.length > 0) || Object.values(program.data.procedures ?? {}).some((procedure) => procedure.body.length > 0)) throw new LearningError("Record a non-empty arrow plan while the coding area is empty. Your existing draft can still be saved as a version.");
    state.artifacts[stage] = artifact; workflow().planHash = hash;
    return result("Your route plan is recorded. Now build the code and compare its actual trail with that plan.", { versionLabel: "recorded-plan" });
  }
  if (action.action === "save" || action.action === "version") {
    if (stage === "review" && action.action === "save") {
      state.explanation = action.explanation ?? state.explanation;
      return result("Your explanation draft is saved. Saving does not award mastery.", { versionLabel: "saved-reflection" });
    }
    if (["discover", "predict", "review"].includes(stage)) throw new LearningError("Edit your own program in Build, Practise, Debug or Create.");
    state.artifacts[stage] = artifact;
    workflow().savedHash = artifactHash(artifact);
    delete workflow().replayedHash;
    if (action.action === "version") { workflow().restoredHash = artifactHash(artifact); clearPlay(); }
    return result(action.action === "version" ? "Your selected version has been restored as a new working copy." : "Your work has been saved.", { versionLabel: action.action === "version" ? "restored-version" : "saved-work" });
  }
  if (action.action === "restore") {
    if (["discover", "predict", "review"].includes(stage)) throw new LearningError("Choose a practical stage to restore its starter.");
    if (stage === "create") {
      const original = state.independentVariant;
      do { state.independentVariant++; } while (state.assistedVariantIds.includes(variantFingerprint(activity, state)) && state.independentVariant - original < activity.independent.length);
      if (state.assistedVariantIds.includes(variantFingerprint(activity, state))) throw new LearningError("Both independent variations have received answer disclosure. Continue practice and request a reviewed fresh task; your earlier work remains saved.", 409);
      state.completed = state.completed.filter((part) => part !== "create" && part !== "review");
      state.files = structuredClone(stageProjectFiles(state, stage));
      if (state.evidenceBindings) delete state.evidenceBindings.create;
    }
    if (activity.evidenceSlots) delete state.artifacts[stage];
    else state.artifacts[stage] = stage === "debug" ? activity.faulty : stage === "create" ? currentVariant(activity, state).starter : activity.starter;
    if (state.workflow) delete state.workflow[stage];
    if (state.personalInputs) delete state.personalInputs[stage];
    clearPlay();
    return result(stage === "create" ? "A fresh equivalent challenge is ready. Earlier help remains recorded." : "The starter is restored. Your previous versions are retained.", { versionLabel: "restored-starter" });
  }
  if (action.action === "hint" || action.action === "teach") {
    const existing = action.action === "teach" ? state.tutorMessages.find((turn) => turn.stage === stage && turn.purpose === "instruction") : null;
    if (existing) return result(existing.message);
    const turn = await deps.teach(activity, state, stage, artifact, action.explanation);
    if (action.action === "hint") state.hints[stage] = (state.hints[stage] ?? 0) + 1;
    state.tutorMessages.push({ ...turn, stage, purpose: action.action === "teach" ? "instruction" : "hint" });
    if ((stage === "create" || stage === "review") && turn.revealing) {
      const fingerprint = variantFingerprint(activity, state);
      if (!state.assistedVariantIds.includes(fingerprint)) state.assistedVariantIds.push(fingerprint);
    }
    return result(turn.message);
  }
  if (action.action === "predict") {
    if (stage !== "predict") throw new LearningError("Record the prediction in Predict.");
    const choice = activity.prediction.choices.find((candidate) => candidate.id === action.choiceId);
    if (!choice) throw new LearningError("Choose an expected outcome before running.");
    const correct = choice.id === activity.prediction.correctId;
    state.prediction = { choiceId: choice.id, correct, recordedAt: new Date().toISOString() };
    state.attempts++;
    if (correct) { state.checksPassed++; advance(); }
    return result(correct ? "Your prediction matches the demonstrated program. Explain the order or calculation that produces it." : "Record your reasoning, then step through the demonstration and compare its result with your prediction.", { passed: correct });
  }
  if (action.action === "support") throw new LearningError("Human support must pass the classroom or booking authorisation checks.", 403);
  if (stage === "predict" && !state.prediction) throw new LearningError("Record a prediction before running the demonstration.");
  const cases = stageCases(activity, state, stage);
  const input = stage === "predict" ? activity.prediction.input : cases[0]!.input;
  if (action.action === "run") {
    if (activity.workflow?.planBeforeRun && ["build", "create"].includes(stage) && (!recordedPlanHash(artifact) || state.workflow?.[stage]?.planHash !== recordedPlanHash(artifact))) throw new LearningError("Record the matching arrow plan before running your own program.");
    let runInput = personalRunInput ?? input;
    if (artifact.type === "source" && !["discover", "predict"].includes(stage) && runInput && typeof runInput === "object" && !Array.isArray(runInput) && Object.keys(state.files).length) runInput = { ...runInput, files: state.files };
    if (artifact.type === "visual" && ["ai", "investigation"].includes(activity.workbench) && !["discover", "predict", "review"].includes(stage) && runInput && typeof runInput === "object" && !Array.isArray(runInput)) {
      const playInput: Record<string, Json> = { ...runInput };
      delete playInput.test;
      runInput = playInput;
    }
    const visualPlay = artifact.type === "visual" && ["route", "scene", "robot"].includes(activity.workbench) && !["discover", "predict", "review"].includes(stage);
    const editableInteraction = !["discover", "predict", "review"].includes(stage) && (["evidence", "game"].includes(activity.workbench) || artifact.type === "source" && artifact.entry === "dom");
    if (visualPlay && runInput && typeof runInput === "object" && !Array.isArray(runInput)) runInput = { ...runInput, events: [{ name: "start", value: 0 }] };
    else if (editableInteraction && runInput && typeof runInput === "object" && !Array.isArray(runInput)) runInput = { ...runInput, events: [] };
    if (action.interaction) {
      const visual = artifact.type === "visual" && ["route", "scene", "robot"].includes(activity.workbench);
      const poster = artifact.type === "visual" && ["evidence", "game"].includes(activity.workbench);
      if (visual && artifact.type === "visual" && (action.interaction.type !== "click" || action.interaction.target !== "restart" && !visualEventNames(artifact.document).includes(action.interaction.target))) throw new LearningError("Choose a button declared in this visual program.");
      if (poster && artifact.type === "visual" && (action.interaction.type !== "click" || !(activity.workbench === "game" ? gameControlNames(artifact.document) : evidenceControlNames(artifact.document)).includes(action.interaction.target))) throw new LearningError("Choose an enabled control declared in this project.");
      if (!visual && !poster && (artifact.type !== "source" || artifact.entry !== "dom")) throw new LearningError("Interactive controls belong to a supported project.");
      const hash = artifactHash(artifact);
      const previousPlay = state.webInteractions?.stage === stage && state.webInteractions.artifactHash === hash ? state.webInteractions : null;
      const previous = visual && action.interaction.target === "restart" ? [] : previousPlay?.events ?? [];
      if (previous.length >= 40) throw new LearningError("This play has reached 40 interactions. Run the program again to start a fresh play.");
      const base = runInput && typeof runInput === "object" && !Array.isArray(runInput) ? runInput : {};
      const servicePlay = artifact.type === "source" && artifact.entry === "dom" && runInput && typeof runInput === "object" && !Array.isArray(runInput) && runInput.fixtureService !== undefined;
      let baseline = servicePlay ? previousPlay?.serviceBaselineFiles : undefined;
      if (servicePlay && baseline === undefined) {
        const supplied = base.files;
        if (supplied !== undefined && (!supplied || typeof supplied !== "object" || Array.isArray(supplied) || Object.values(supplied).some(value => typeof value !== "string"))) throw new LearningError("Use supported text files for the local service snapshot.");
        baseline = structuredClone(supplied ?? {}) as Record<string, string>;
      }
      state.webInteractions = { stage, artifactHash: hash, events: [...previous, action.interaction], ...(baseline ? { serviceBaselineFiles: baseline } : {}) };
      try {
        const baseEvents = visual && action.interaction.target === "restart" ? [] : Array.isArray(base.events) ? base.events : visual ? [{ name: "start", value: 0 }] : [];
        runInput = { ...base, ...(baseline ? { files: baseline } : {}), events: [...baseEvents, ...state.webInteractions.events.map((event) => visual ? { name: event.target, value: visualEventValue(event.value) } : poster ? { target: event.target, type: "click" as const } : event)] };
      } catch (error) { throw new LearningError(error instanceof Error ? error.message : "Check the event input value."); }
    } else state.webInteractions = undefined;
    const run = await deps.run(activity.workbench, artifact, runInput);
    if (run.ok && state.workflow?.[stage]?.savedHash === artifactHash(artifact)) workflow().replayedHash = artifactHash(artifact);
    if (!["discover", "predict", "review"].includes(stage)) state.artifacts[stage] = artifact;
    state.lastExecution = run; state.lastChecks = []; state.lastRunStage = stage; state.lastRunArtifactHash = artifactHash(artifact);
    state.lastExecutionInput = structuredClone(runInput); state.lastRunKind = personalRunInput ? "personal" : "example";
    if (artifact.type === "source" && stage !== "review") { const files = capturedFiles(run); if (files) setStageProjectFiles(state, stage, files); }
    return result(run.ok ? "The program ran. Inspect its output and trace; running alone does not award mastery." : run.error ?? "Inspect the error and repair the program.");
  }
  if (action.action === "reflect") {
    if (stage !== "review" || !state.completed.includes("create")) throw new LearningError("Complete the independent practical challenge before its review.");
    if (!action.explanation?.trim()) throw new LearningError("Explain one decision using a value, action or test from your actual project.");
    if (state.assistedVariantIds.includes(variantFingerprint(activity, state))) throw new LearningError("This independent task received an answer. Restore Create to take a fresh equivalent challenge.", 409);
    // Re-run the stored independent artifact; draft edits cannot inherit old checks.
    artifact = state.artifacts.create ?? currentVariant(activity, state).starter;
    const runs: Execution[] = [];
    for (const test of cases) runs.push(await deps.run(activity.workbench, artifact, test.input));
    const checks = [...runs.flatMap((run, index) => checkExecution(run, cases[index]!.assertions)), ...workflowChecks(artifact)];
    state.lastExecution = runs[0]!; state.lastChecks = checks; state.lastRunStage = stage; state.lastRunArtifactHash = artifactHash(artifact);
    state.lastExecutionInput = structuredClone(cases[0]!.input); state.lastRunKind = "assessment";
    if (!checks.every((check) => check.passed)) return result("The saved independent program changed or no longer passes. Return to Create and repair it.", { passed: false });
    const explanation = await deps.reflect(activity, artifact, runs[0]!, action.explanation);
    state.explanationReview = explanation;
    state.explanation = action.explanation;
    if (explanation.pending) return result(explanation.message, { passed: false });
    state.attempts++;
    if (explanation.passed) {
      state.checksPassed++; advance(); state.mastered = true;
      if (!current.mastered) { state.masteredArtifact = structuredClone(artifact); state.masteredInput = structuredClone(input); state.masteredFiles = artifact.type === "source" ? capturedFiles(runs[0]!) ?? {} : {}; }
    }
    return result(explanation.message, { passed: explanation.passed, newlyMastered: explanation.passed && !current.mastered, versionLabel: explanation.passed ? current.mastered ? "reviewed-explanation" : "independent-mastery" : undefined });
  }
  if (action.action !== "check") throw new LearningError("Choose a supported activity action.");
  if (stage === "predict" || stage === "review") throw new LearningError("Use the prediction or reflection control for this stage.");
  if (stage === "create" && state.assistedVariantIds.includes(variantFingerprint(activity, state))) throw new LearningError("A solution was disclosed for this variation. Restore Create for a fresh equivalent task.", 409);
  if (stage === "debug" && artifactHash(artifact) === artifactHash(activity.faulty)) throw new LearningError("Repair the seeded fault before checking the program.");
  const runs: Execution[] = [];
  // A request never floods the two-worker execution host with an unbounded batch.
  for (const test of cases) runs.push(await deps.run(activity.workbench, artifact, test.input));
  state.lastExecution = runs[0]!;
  state.lastExecutionInput = structuredClone(cases[0]!.input); state.lastRunKind = "assessment";
  state.lastRunStage = stage; state.lastRunArtifactHash = artifactHash(artifact);
  state.lastChecks = [...runs.flatMap((run, index) => checkExecution(run, cases[index]!.assertions)), ...workflowChecks(artifact)];
  if (artifact.type === "source") {
    const files = capturedFiles(runs[0]!);
    // A controlled assessment has its own fixture. Never overwrite a real
    // earlier project save with the assessor's starting/resulting dataset.
    if (files && Object.keys(stageProjectFiles(state, stage)).length === 0) setStageProjectFiles(state, stage, files);
  }
  const passed = state.lastChecks.length > 0 && state.lastChecks.every((check) => check.passed);
  state.attempts++;
  if (!["discover", "predict"].includes(stage)) state.artifacts[stage] = artifact;
  if (passed) { state.checksPassed++; advance(); }
  return result(passed ? stage === "create" ? "Your independent program passes the unseen checks. Review the evidence and explain your decision." : "The practical checks pass. Continue to the next part." : "Some checks need attention. Inspect the visible result and use the criteria to guide your next change.",
    { passed, versionLabel: passed ? "verified-stage" : undefined });
}

export const defaultRun = executePractical;
