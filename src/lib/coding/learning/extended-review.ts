import { createHash } from "node:crypto";
import { atPath, checkExecution, sameJson } from "./checks";
import { extendedReviewMaterial, reviewUnits, unresolvedBrowserReviewIds } from "./review-material";
import type { ActivityContent, ActivityState, Execution, Json, PracticalArtifact } from "./types";
import type { ReviewBindingContext, ReviewChallenge } from "./visual-review";
import type { TutorScope } from "./tutor-privacy";
import { reviewContracts } from "./review-contracts";

export type ReviewScope = Exclude<TutorScope, object> | (Extract<TutorScope, object> & Readonly<{ reviewContext?: string; reviewVariant?: number }>);

export function reviewOwnershipContext(childId: string, activityId: string, state: ActivityState): string {
  return createHash("sha256").update(JSON.stringify({ childId, activityId, variation: state.independentVariant, assistance: state.assistedVariantIds, evidence: state.evidenceBindings?.create, demonstration: state.demonstrations?.create })).digest("hex");
}

export function hasExtendedReview(activity: ActivityContent): boolean {
  const units = extendedReviewMaterial[activity.inventoryId];
  const contract = reviewContracts[activity.inventoryId];
  return Boolean(contract && contract.contentHash === createHash("sha256").update(JSON.stringify(activity)).digest("hex") && contract.objective === activity.objective && contract.workbench === activity.workbench
    && sameJson(contract.essentialChecks, activity.essentialChecks) && sameJson(contract.variants, activity.independent.map(variant => ({ id: variant.id, task: variant.task })))
    && !activity.evidenceSlots && !activity.workflow?.originalDemonstration && !unresolvedBrowserReviewIds.has(activity.inventoryId) && units?.length && units.every(key => reviewUnits[key]));
}
export function remainingReviewCriterion(activity: ActivityContent): string | null {
  if (activity.workflow?.originalDemonstration) return "The recording's actual content, intended audience, explanation and accessible alternative must agree with the current project. Ownership, a source hash or an upload does not establish originality, quality or that correspondence.";
  if (activity.evidenceSlots) return "The meaning of the caption or claim must be supported by the actual selected frozen creations. Ownership and a correctly targeted link alone do not establish that semantic relationship.";
  if (unresolvedBrowserReviewIds.has(activity.inventoryId)) return "The required current-artifact viewport or keyboard/user-task observations must be established. Static DOM/cascade inspection and a submitted assertion are not authenticated browser observations; this Review path does not yet receive those observations.";
  return null;
}
function leaf(value: Json, path: string): { value: string | number | boolean | null; path: string } | null {
  if (value === null || typeof value !== "object") return typeof value === "string" && value.length > 180 ? null : { value, path };
  for (const [key, child] of Object.entries(value).reverse()) { const found = leaf(child, `${path}.${key}`); if (found) return found; }
  return null;
}
function observedChoices(value: string | number | boolean | null): string[] {
  if (value === null) return ["null (no value)", "0 (a number)", '\"\" (empty text)'];
  if (typeof value === "number") return [String(value), String(value + 1), String(value - 1)];
  if (typeof value === "boolean") return [String(value), String(!value), "The field is missing from the result"];
  return [JSON.stringify(value), JSON.stringify(`${value}?`), JSON.stringify(`${value}!`)];
}
/** These objectives include semantic claims in editable prose. A correct quiz
 * must not rescue contradictory prose that merely passes a length/substring
 * practical check. Local assessment supports the complete authored scenario's
 * audited claim bundle; new free-form claims retain permitted provider review.
 * This is not a claim that a matching file establishes media originality. */
function semanticBundle(activity: ActivityContent, artifact: PracticalArtifact, run: Execution, independentVariant?: number): boolean {
  const referenceVariants = independentVariant === undefined ? activity.independent : activity.independent.filter((_, index) => index === independentVariant % activity.independent.length);
  if (["Y4.16", "Y4.17", "Y4.18", "P-Y4-3"].includes(activity.inventoryId)) {
    // Assess the known symbol-to-category meaning, not an originality claim
    // derived from a filename, digest or an upload. Layouts and colours remain
    // free to differ; practical checks require actual editable/retrieved marks.
    return referenceVariants.some(variant => {
      if (variant.reference.type !== "visual") return false;
      const actions = atPath(variant.reference.document, "picture.actions");
      if (!Array.isArray(actions)) return false;
      const drawing = actions.find(action => atPath(action, "op") === "edit");
      if (!drawing) return false;
      return atPath(run.output, "picture.document.caption") === atPath(drawing, "patch.caption")
        && atPath(run.output, "picture.document.narration") === atPath(drawing, "patch.narration");
    });
  }
  const planning = ["Y9.19", "Y10.19", "Y11.13"].includes(activity.inventoryId);
  if (planning || ["Y6.22", "Y9.22", "Y9.23"].includes(activity.inventoryId)) {
    if (artifact.type !== "visual") return false;
    const projection = (document: Json) => planning ? {
      purpose: atPath(document, "purpose"), audience: atPath(document, "audience"), notes: atPath(document, "notes"),
      tasks: Array.isArray(atPath(document, "tasks")) ? (atPath(document, "tasks") as Json[]).map(task => ({ id: atPath(task, "id"), need: atPath(task, "need"), criterion: atPath(task, "criterion") })).sort((a, b) => String(a.id).localeCompare(String(b.id))) : null,
    } : { notes: atPath(document, "notes"), ...(activity.inventoryId === "Y9.23" ? { handover: atPath(document, "handover") } : {}) };
    return referenceVariants.some(variant => variant.reference.type === "visual" && sameJson(projection(artifact.document), projection(variant.reference.document)));
  }
  if (activity.inventoryId === "Y8.21") {
    const text = atPath(run.output, "result.review");
    return text === "The function is short and readable. The supplied executions show an extra one in the returned supply count. Please remove + 1, then rerun zero and the inclusive upper boundary. This feedback concerns the code behaviour, not the author."
      || text === "The returned count has an extra one. Remove + 1 and test zero and the inclusive upper boundary again. This is feedback about behaviour, not the author.";
  }
  if (activity.inventoryId === "Y10.21") return atPath(run.output, "result.record.purpose") === "Pure quantity formatting; no microphone or network capability is needed."
    && atPath(run.output, "result.scope") === "Fictional supplied local dependency review only; no package installed, permission granted or external registry provenance claimed.";
  return true;
}
export function extendedReviewUnavailableReason(activity: ActivityContent, artifact: PracticalArtifact, run: Execution, independentVariant?: number): string {
  if (!run.ok) return "A successful current independent execution is missing. Correct choices cannot replace the required practical evidence.";
  if (!semanticBundle(activity, artifact, run, independentVariant)) {
    if (["Y9.19", "Y10.19", "Y11.13"].includes(activity.inventoryId)) return "The actual problem, audience, task needs and measurable criteria must form a coherent plan under its constraints. This artifact differs from the complete locally audited scenario; its free-form relationships still require permitted semantic review.";
    if (["Y4.16", "Y4.17", "Y4.18", "P-Y4-3"].includes(activity.inventoryId)) return "The full visible and spoken legend must accurately connect this poster's symbols to its categories for the intended reader. The current legend is outside the locally audited mappings; filenames, hashes and completed fields do not establish its meaning.";
    if (["Y9.22", "Y9.23", "Y10.21"].includes(activity.inventoryId)) return "The complete saved incident, reuse or dependency policy must accurately describe its actual authority, permissions, intended use and limits. Unassessed additional prose cannot be certified from a permission flag, digest or isolated phrase.";
    return "The complete saved feedback must agree with the actual defect, repair and attribution without contradictory or personal claims. This wording is outside the locally audited feedback and needs permitted semantic review.";
  }
  return "The saved result does not establish the required independent variation's practical case. Run Check and continue on the current independent work before trying Review again; personal output or another variation is not a replacement.";
}
/** The existing state machine separately checks ALL independent cases and
 * independence eligibility. This additional guard rejects a Review challenge
 * even before submission if its observed run violates the selected case. */
export function extendedReview(activity: ActivityContent, artifact: PracticalArtifact, run: Execution, ownershipContext: ReviewBindingContext = ""): ReviewChallenge | null {
  if (!hasExtendedReview(activity) || !run.ok || !semanticBundle(activity, artifact, run, typeof ownershipContext === "object" ? ownershipContext.independentVariant : undefined)) return null;
  const eligible = typeof ownershipContext === "object" ? activity.independent.filter((_, index) => index === ownershipContext.independentVariant % activity.independent.length) : activity.independent;
  const variants = eligible.filter(variant => checkExecution(run, variant.cases[0]!.assertions).every(check => check.passed));
  if (!variants.length) return null;
  const units = extendedReviewMaterial[activity.inventoryId]!.map(key => reviewUnits[key]!);
  const observations = variants[0]!.cases[0]!.assertions.flatMap(assertion => { const value = atPath(run.output, assertion.path); const found = value === undefined ? null : leaf(value, assertion.path); return found ? [{ ...found, description: assertion.description }] : []; });
  if (!observations.length) return null;
  const correct: Record<string, string> = {};
  const accepted: Record<string, string[]> = {};
  const authored = units.flatMap((unit, index) => unit.questions.map(question => ({ criterion: unit.criterion, group: index + 1, question })));
  // Mastery reruns the program. Wall-clock diagnostics may legitimately change
  // on replay; their authored practical bounds still have to pass. They are
  // neither a stable learner answer nor an artifact/version identity.
  const stableObservations = observations.filter(observation => !/(?:^|\.)(?:elapsed_ms|durationMs|duration_ms)$/.test(observation.path));
  const observationsToAsk = stableObservations.filter(observation => typeof observation.value !== "boolean").slice(0, 2);
  if (!observationsToAsk.length && stableObservations.length) observationsToAsk.push(stableObservations[0]!);
  if (!observationsToAsk.length) return null;
  const binding = createHash("sha256").update(JSON.stringify({ rubric: "extended-review-v1", ownershipContext, activity: activity.id, version: activity.version, objective: activity.objective, variants: variants.map(variant => ({ id: variant.id, task: variant.task, cases: variant.cases })), units, artifact, observations: stableObservations })).digest("hex");
  const specifications = [...observationsToAsk.map(observation => ({ criterion: observation.description, group: 0, question: [`Inspect ${observation.path} in your saved result. Which value is recorded?`, ...observedChoices(observation.value)] })), ...authored];
  const questions = specifications.map(({ criterion, question: [prompt, ...rawOptions] }, index) => {
    const options = rawOptions.filter((option): option is string => typeof option === "string");
    const id = `criterion-${index}`, offset = parseInt(binding.slice((index % 32) * 2, (index % 32) * 2 + 2), 16) % options.length;
    const order = options.map((_, position) => (position + offset) % options.length);
    correct[id] = String(order.indexOf(0));
    accepted[id] = [correct[id]!, ...(options.length === 4 ? [String(order.indexOf(3))] : [])];
    return { id, prompt: `${criterion}. ${prompt}`, choices: order.map((option, position) => ({ id: String(position), text: options[option]! })) };
  });
  if (questions.some(question => new Set(question.choices.map(choice => choice.text)).size !== question.choices.length)) return null;
  const groups = ["Your saved result", ...units.map(unit => unit.criterion)].map((title, index) => ({ title, questionIds: questions.filter((_, position) => specifications[position]!.group === index).map(question => question.id) }));
  return { public: { binding, task: variants[0]!.task, groups, questions }, correct, accepted };
}
