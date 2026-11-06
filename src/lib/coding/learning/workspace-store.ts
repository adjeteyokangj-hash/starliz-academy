import { reviewOwnershipContext } from "./extended-review";
import { createHash, randomInt } from "node:crypto";
import { Prisma, type CodingWorkspace } from "@prisma/client";
import { prisma } from "@/lib/db";
import { applyWalletMutation } from "@/lib/wallet_ledger";
import { activityDefinition, activityReleased, activityContentHash } from "./catalogue";
import { initialActivityState, LearningError, stageArtifact, transitionActivity, artifactHash, snapshotProjectFiles } from "./state-machine";
import { publicActivityView } from "./public-view";
import { teachActivity, reviewExplanation } from "./teacher";
import { executePractical } from "./runtime";
import type { ActivityAction, ActivityContent, ActivityState, PracticalArtifact } from "./types";
import { requestCodingAssistanceForHandoff } from "@/lib/coding/human-support";
import { codingAssistanceEnabled } from "@/lib/coding/settings";
import type { CodingSupportHandoff } from "@/lib/coding/support-handoff";
import { variantFingerprint } from "./state-machine";
import type { CodingFunding } from "@/lib/coding/student-context";
import { getTrialSessionLimit } from "@/lib/subscriptions/enforcement";
import { completedLearningGroups } from "./completion";
import { restoredPersonalInput } from "./personal-input";
import { initialiseStageFiles, setStageProjectFiles } from "./stage-files";
import { resolveOwnedEvidence } from "./owned-evidence";
import { bindEvidenceInput, evidenceManifestSchema, independentEvidenceIsFresh } from "./evidence-links";
import { verifyDemonstrationReceipt, readDemonstration } from "./demonstration-storage";
import { demonstrationAttachmentSchema } from "./demonstration-contract";
import { availableActivityDefinitions, developmentCurriculumQa } from "./development-qa";
import { bridgeWorkspaceKey, bridgeContext, readinessEntryYear, recordReadinessIfComplete, readinessBenchmark, type ReadinessPlan } from "./readiness";

const key = (activity: ActivityContent) => `curriculum:${activity.version}:${activity.id}`;
const revision = (row: CodingWorkspace) => createHash("sha256").update(`${row.id}\n${row.childId}\n${row.updatedAt.toISOString()}\n${row.programsJson}`).digest("hex");
function readState(row: CodingWorkspace, activity: ActivityContent): ActivityState {
  let value: ActivityState;
  try { value = JSON.parse(row.programsJson); } catch { throw new LearningError("The saved workspace needs recovery. Its original data has been retained.", 503); }
  if (value.schema !== 1 || value.activityId !== activity.id || value.version !== activity.version || !Array.isArray(value.completed) || !value.artifacts || !Array.isArray(value.tutorMessages)) throw new LearningError("The saved workspace uses a different format. Its original data has been retained.", 409);
  return value;
}
export async function activityPrerequisites(childId: string, activity: ActivityContent) {
  const required = activity.prerequisites.map((id) => {
    const definition = activityDefinition(id);
    if (!definition) throw new LearningError("A prerequisite is not available in this curriculum release. Your existing work has been retained.", 503);
    return definition;
  });
  // Introductory lesson titles are not evidence of prerequisite mastery. Any
  // future placement equivalence must carry its own verified practical record.
  if (!required.length) return [];
  const rows = await prisma.codingWorkspace.findMany({ where: { childId, lessonId: { in: required.map(key) }, skillStatus: "mastered" }, select: { lessonId: true } });
  const mastered = new Set(rows.map((row) => row.lessonId));
  const entryYear = await readinessEntryYear(childId);
  return required.filter((definition) => !mastered.has(key(definition)) && definition.year >= entryYear).map((definition) => definition.id);
}
async function getWorkspace(childId: string, activity: ActivityContent, yearGroup: string | null, placement?: ReadinessPlan) {
  if (placement && !readinessBenchmark(placement, activity.id)) throw new LearningError("Choose this bridge's own approved practical benchmark.", 404);
  const workspaceKey = placement ? bridgeWorkspaceKey(placement, activity.id) : key(activity);
  const existing = await prisma.codingWorkspace.findUnique({ where: { childId_lessonId: { childId, lessonId: workspaceKey } } });
  if (existing) return existing;
  const blocked = placement ? [] : await activityPrerequisites(childId, activity);
  if (blocked.length) throw new LearningError("Finish the prerequisite activities before opening this activity.", 403);
  const state = initialActivityState(activity, randomInt(activity.independent.length));
  try { return await prisma.codingWorkspace.create({ data: { childId, lessonId: workspaceKey, yearGroup, pathwayId: activity.pathwayId, programsJson: JSON.stringify(state), privateProject: true } }); }
  catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return prisma.codingWorkspace.findUniqueOrThrow({ where: { childId_lessonId: { childId, lessonId: workspaceKey } } }); throw error; }
}
async function published(id: string, childId: string) {
  const activity = activityDefinition(id);
  if (!activity || !activityReleased(activity.id) && !await developmentCurriculumQa(childId)) throw new LearningError("This activity has not completed curriculum release verification.", 404);
  return activity;
}
async function versions(workspaceId: string) {
  return prisma.codingProjectVersion.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, stage: true, label: true, createdAt: true } });
}
export async function loadActivityWorkspace(childId: string, id: string, yearGroup: string | null, placement?: ReadinessPlan, learnerAge: number | null = null) {
  const activity = await published(id, childId), row = await getWorkspace(childId, activity, yearGroup, placement), state = readState(row, activity);
  return { ...publicActivityView(activity, state, "learner", { kind: "learner", age: learnerAge, reviewContext: reviewOwnershipContext(childId, activity.id, state), reviewVariant: state.independentVariant }), teacherFeedback: row.teacherFeedback, revision: revision(row), versions: await versions(row.id) };
}

/** Run only the published teaching artifact. No action transition, workspace
 * update, assessment, version, reward, or AI request belongs to this preview. */
export async function runLessonExample(childId: string, id: string, yearGroup: string | null, placement?: ReadinessPlan) {
  const activity = await published(id, childId), row = await getWorkspace(childId, activity, yearGroup, placement), state = readState(row, activity);
  if (state.stage === "predict" && !state.prediction) throw new LearningError("Record your prediction before replaying the example.", 409);
  let input = activity.cases[0]!.input;
  if (activity.evidenceSlots) {
    const selected = state.evidenceBindings?.discover;
    if (!selected) throw new LearningError("Choose your saved creations in Discover before running this lesson example.", 409);
    const owned = await resolveOwnedEvidence(childId, selected.map(({ slot, versionId }) => ({ slot, versionId })), activity.id, activity.evidenceSlots);
    input = bindEvidenceInput(input, owned);
  }
  const artifact = stageArtifact(activity, { ...state, stage: "discover" }, "discover");
  return { artifact, input, execution: await executePractical(activity.workbench, artifact, input) };
}

async function awardActivity(tx: Prisma.TransactionClient, childId: string, activity: ActivityContent, state: ActivityState, artifactVersionId: string, yearGroup: string | null) {
  const syntheticQaFixture = !activityReleased(activity.id) && await developmentCurriculumQa(childId);
  const label = syntheticQaFixture ? "[Synthetic QA] " : "";
  const awardKey = `coding:${activity.version}:${activity.id}:${childId}`;
  const hash = createHash("sha256").update(awardKey).digest("hex");
  const coins = activity.kind === "project" ? 12 : activity.kind === "consolidation" ? 3 : 6;
  const xp = activity.kind === "project" ? 50 : activity.kind === "consolidation" ? 12 : 25;
  const stars = activity.kind === "project" ? 10 : activity.kind === "consolidation" ? 2 : 5;
  await applyWalletMutation(tx, { childId, type: "earn", amount: coins, source: "coding", reason: `${label}Independent ${activity.kind}: ${activity.title}`, starsDelta: stars, xpDelta: xp,
    metadata: { subject: "coding", activityName: `${label}${activity.title}`, curriculumVersion: activity.version, activityId: activity.id } });
  await tx.progressRecord.create({ data: { childId, activityType: "coding", activityName: activity.title, starsEarned: stars, xpEarned: xp, coinsEarned: coins, score: 1, correct: true,
    difficulty: Math.min(5, Math.ceil(activity.year / 2)), completed: true, accuracy: Math.round(100 * state.checksPassed / Math.max(1, state.attempts)),
    notes: JSON.stringify({ activityId: activity.id, inventoryId: activity.inventoryId, kind: activity.kind, curriculumVersion: activity.version, artifactVersionId, syntheticQaFixture }) } });
  await tx.skillMastery.upsert({ where: { childId_subject_skillFocus: { childId, subject: "coding", skillFocus: `${activity.version}:${activity.id}` } },
    create: { childId, subject: "coding", skillFocus: `${activity.version}:${activity.id}`, masteryLevel: "mastered", attemptCount: state.attempts, correctCount: state.checksPassed, lastAttemptAt: new Date(), lastMasteredAt: new Date() },
    update: { masteryLevel: "mastered", lastAttemptAt: new Date(), lastMasteredAt: new Date() } });
  await tx.certificate.upsert({ where: { idempotencyKey: awardKey }, create: { studentId: childId, certificateNumber: `SLC-${hash.slice(0, 10).toUpperCase()}`,
    verificationCode: hash.slice(10, 22).toUpperCase(), idempotencyKey: awardKey, certificateType: "subject_achievement", title: `${label}${activity.kind === "project" ? "Project achievement" : "Coding skill"}: ${activity.title}`,
    awardReason: `Verified independent ${activity.kind} in ${activity.title}. This certificate does not certify a complete pathway.`, subject: "coding", level: activity.pathwayId,
    yearGroup, issuedAt: new Date(), awardSourceType: "coding_activity", awardSourceId: activity.id,
    metadataJson: JSON.stringify({ curriculumVersion: activity.version, activityHash: activityContentHash(activity), activityId: activity.id, inventoryId: activity.inventoryId, artifactVersionId,
      pathwayId: activity.pathwayId, courseId: activity.courseId, moduleId: activity.moduleId, projectId: activity.projectId, kind: activity.kind, independent: true, explanationReview: state.explanationReview, syntheticQaFixture }) }, update: {} });
  if (activity.kind === "project") await awardCompletedGroups(tx, childId, activity.version, yearGroup, syntheticQaFixture);
}

async function awardCompletedGroups(tx: Prisma.TransactionClient, childId: string, version: string, yearGroup: string | null, syntheticQaFixture = false) {
  const definitions = await availableActivityDefinitions(childId);
  if (!definitions.length) return;
  const certificates = await tx.certificate.findMany({ where: { studentId: childId, subject: "coding", awardSourceType: "coding_activity", status: "issued" }, select: { metadataJson: true } });
  const verified = new Map<string, { activityHash: string; artifactVersionId: string }>();
  for (const certificate of certificates) {
    try {
      const metadata = JSON.parse(certificate.metadataJson ?? "null");
      if (!metadata || metadata.curriculumVersion !== version || metadata.independent !== true || typeof metadata.activityId !== "string" || typeof metadata.artifactVersionId !== "string") continue;
      const definition = activityDefinition(metadata.activityId);
      if (definition && metadata.activityHash === activityContentHash(definition)) verified.set(definition.id, { activityHash: metadata.activityHash, artifactVersionId: metadata.artifactVersionId });
    } catch { /* An older certificate format remains preserved and grants no new equivalence. */ }
  }
  for (const group of completedLearningGroups(new Set(verified.keys()), definitions)) {
    const awardKey = `coding:${version}:${group.kind}:${group.id}:${childId}`, hash = createHash("sha256").update(awardKey).digest("hex");
    await tx.certificate.upsert({ where: { idempotencyKey: awardKey }, create: { studentId: childId, certificateNumber: `SLC-${hash.slice(0, 10).toUpperCase()}`, verificationCode: hash.slice(10, 22).toUpperCase(), idempotencyKey: awardKey,
      certificateType: "subject_achievement", title: `${syntheticQaFixture ? "[Synthetic QA] " : ""}${group.title} completed`, awardReason: `All ${group.activityIds.length} required core lessons, consolidation sessions and portfolio projects have verified independent achievement records.`,
      subject: "coding", level: group.pathwayId, yearGroup, issuedAt: new Date(), awardSourceType: `coding_${group.kind}`, awardSourceId: group.id,
      metadataJson: JSON.stringify({ curriculumVersion: version, kind: group.kind, complete: true, syntheticQaFixture, activityCount: group.activityIds.length, activities: group.activityIds.map((id) => ({ id, ...verified.get(id)! })) }) }, update: {} });
  }
}

export async function actOnActivityWorkspace(childId: string, id: string, yearGroup: string | null, action: ActivityAction, billing: CodingFunding, learnerAge: number | null = null, placement?: ReadinessPlan) {
  const activity = await published(id, childId), row = await getWorkspace(childId, activity, yearGroup, placement);
  if (revision(row) !== action.revision) throw new LearningError("This workspace changed in another tab. Reload its saved revision before applying your edit.", 409);
  const state = readState(row, activity);
  if (action.demonstration !== undefined) {
    if (!activity.workflow?.originalDemonstration || action.action !== "save" || action.stage !== "create" || state.stage !== "create" || !action.artifact) throw new LearningError("Attach an original demonstration while saving this activity's independent creation.");
    const attached = verifyDemonstrationReceipt(action.demonstration, childId, activity.id);
    if (attached.metadata.artifactHash !== artifactHash(action.artifact) || attached.metadata.taskHash !== variantFingerprint(activity, state)) throw new LearningError("This recording belongs to an earlier source version or independent task. Record the current saved creation.", 409);
    await readDemonstration(childId, attached, activity.id);
    state.demonstrations ??= {}; state.demonstrations.create = attached;
  }
  if (action.evidenceBindings !== undefined) {
    if (!activity.evidenceSlots || action.action !== "open" || action.stage === "review") throw new LearningError("Select saved evidence while opening an evidence activity's practical stage.");
    const manifest = await resolveOwnedEvidence(childId, action.evidenceBindings, activity.id, activity.evidenceSlots);
    if (action.stage === "create" && !independentEvidenceIsFresh(manifest, state.evidenceBindings?.discover)) throw new LearningError("Choose different earlier creations for the independent task.");
    state.evidenceBindings ??= {}; state.evidenceBindings[action.stage] = manifest;
    state.lastExecution = null; state.lastChecks = [];
    action = { ...action, evidenceBindings: undefined };
  }
  if (activity.evidenceSlots && action.action === "open" && ["predict", "build", "practise", "debug"].includes(action.stage) && !state.evidenceBindings?.[action.stage] && state.evidenceBindings?.discover) state.evidenceBindings[action.stage] = structuredClone(state.evidenceBindings.discover);
  if (action.action === "support") {
    if (!await codingAssistanceEnabled()) throw new LearningError("Human assistance is disabled for Coding. Continue with your AI tutor.", 403);
    if (action.stage !== state.stage) throw new LearningError("Open the stage you want help with before requesting support.");
    const artifact = stageArtifact(activity, state, state.stage);
    // Queueing a person can disclose a solution. Mark the independent variation
    // before inviting anyone, so a racing assessment cannot inherit independence.
    if (["create", "review"].includes(state.stage) && (state.hints[state.stage] ?? 0) > 0 && (action.bookingId || action.daytimePeriodId)) {
      const fingerprint = variantFingerprint(activity, state);
      if (!state.assistedVariantIds.includes(fingerprint)) state.assistedVariantIds.push(fingerprint);
    }
    const handoff: CodingSupportHandoff = { subject: "coding", lessonId: activity.id, lessonTitle: activity.title,
      pathwayTitle: activity.pathwayId, moduleTitle: activity.moduleId, stage: state.stage, learningObjective: activity.objective,
      task: ["create", "review"].includes(state.stage) ? activity.independent[state.independentVariant % activity.independent.length]!.task : activity.objective,
      program: artifact, error: state.lastRunArtifactHash === artifactHash(artifact) ? state.lastExecution?.error ?? null : null, feedback: row.lastFeedback,
      hintsAttempted: state.tutorMessages.filter((turn) => turn.stage === state.stage).slice(-6).map((turn) => turn.message),
      hintCount: state.hints[state.stage] ?? 0, skillStatus: state.mastered ? "mastered" : "learning", privateProject: true };
    let saved: CodingWorkspace;
    try { saved = await prisma.codingWorkspace.update({ where: { id: row.id, updatedAt: row.updatedAt, programsJson: row.programsJson }, data: { programsJson: JSON.stringify(state), supportHandoffJson: JSON.stringify(handoff) } }); }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") throw new LearningError("Another tab changed this workspace. Reload before requesting support.", 409); throw error; }
    const support = await requestCodingAssistanceForHandoff({ childId, bookingId: action.bookingId, daytimePeriodId: action.daytimePeriodId }, handoff);
    if (!support.ok) throw new LearningError(support.error, support.status);
    return { ...publicActivityView(activity, state, "learner", { kind: "learner", age: learnerAge, reviewContext: reviewOwnershipContext(childId, activity.id, state), reviewVariant: state.independentVariant }), teacherFeedback: saved.teacherFeedback, revision: revision(saved), message: support.message, versions: await versions(row.id), support: { queued: support.queued, continueAi: support.continueAi } };
  }
  if (action.action === "version") {
    const version = await prisma.codingProjectVersion.findFirst({ where: { id: action.versionId ?? "", workspaceId: row.id }, select: { programJson: true } });
    if (!version) throw new LearningError("The selected version does not belong to this workspace.", 404);
    const saved = JSON.parse(version.programJson) as { artifact?: PracticalArtifact; version?: string; files?: Record<string, string>; personalInput?: unknown; evidenceBindings?: unknown; demonstration?: unknown };
    if (saved.version !== activity.version || !saved.artifact) throw new LearningError("That version uses another curriculum format. Its original data has been retained.", 409);
    action = { ...action, artifact: saved.artifact };
    initialiseStageFiles(state);
    setStageProjectFiles(state, action.stage, saved.files ?? {});
    const restoredDemonstration = demonstrationAttachmentSchema.safeParse(saved.demonstration);
    state.demonstrations ??= {};
    if (restoredDemonstration.success && restoredDemonstration.data.metadata.artifactHash === artifactHash(saved.artifact)) state.demonstrations[action.stage] = verifyDemonstrationReceipt(restoredDemonstration.data, childId, activity.id);
    else delete state.demonstrations[action.stage];
    state.personalInputs ??= {};
    const restored = restoredPersonalInput(saved.personalInput, artifactHash(saved.artifact));
    if (restored) state.personalInputs[action.stage] = restored;
    else delete state.personalInputs[action.stage];
    if (activity.evidenceSlots) {
      state.evidenceBindings ??= {};
      const storedBindings = evidenceManifestSchema.safeParse(saved.evidenceBindings);
      if (storedBindings.success) {
        const restoredBindings = await resolveOwnedEvidence(childId, storedBindings.data.map(({ slot, versionId }) => ({ slot, versionId })), activity.id, activity.evidenceSlots);
        if (JSON.stringify(restoredBindings) !== JSON.stringify(storedBindings.data)) throw new LearningError("That version's saved evidence changed. Its original data is retained.", 409);
        if (action.stage === "create" && !independentEvidenceIsFresh(restoredBindings, state.evidenceBindings.discover)) throw new LearningError("A worked-example version cannot supply the independent task's evidence. Choose different creations.");
        state.evidenceBindings[action.stage] = restoredBindings;
      } else delete state.evidenceBindings[action.stage];
      state.lastExecution = null; state.lastChecks = [];
    }
  }
  const scope = { kind: "learner" as const, age: learnerAge, reviewContext: reviewOwnershipContext(childId, activity.id, state), reviewVariant: state.independentVariant };
  const evidenceStage = action.stage === "review" ? "create" : action.stage;
  if (activity.workflow?.originalDemonstration && evidenceStage === "create" && ["check", "reflect"].includes(action.action) && state.demonstrations?.create) await readDemonstration(childId, state.demonstrations.create, activity.id);
  let manifest = state.evidenceBindings?.[evidenceStage];
  if (activity.evidenceSlots && ["run", "check", "reflect"].includes(action.action)) {
    if (!manifest) throw new LearningError("Choose your actual saved creations before running this evidence activity.", 409);
    const fresh = await resolveOwnedEvidence(childId, manifest.map(({ slot, versionId }) => ({ slot, versionId })), activity.id, activity.evidenceSlots);
    if (JSON.stringify(fresh) !== JSON.stringify(manifest)) throw new LearningError("The selected evidence changed. Reselect its frozen versions before running.", 409);
    manifest = fresh;
    if (evidenceStage === "create" && !independentEvidenceIsFresh(manifest, state.evidenceBindings?.discover)) throw new LearningError("Choose different earlier creations for the independent task.", 409);
  }
  const withEvidence = (input: import("./types").Json): import("./types").Json => activity.evidenceSlots ? bindEvidenceInput(input, manifest) : input;
  const transition = await transitionActivity(activity, state, action, { run: (engine, artifact, input) => executePractical(engine, artifact, withEvidence(input)),
    teach: (definition, saved, stage, artifact, question) => teachActivity(definition, saved, stage, artifact, question, scope),
    reflect: (definition, artifact, run, explanation) => reviewExplanation(definition, artifact, run, explanation, scope) });
  if (activity.evidenceSlots && manifest && ["run", "check", "reflect"].includes(action.action)) {
    if (transition.state.lastExecutionInput !== undefined) transition.state.lastExecutionInput = withEvidence(transition.state.lastExecutionInput);
    if (transition.newlyMastered && transition.state.masteredInput !== null) transition.state.masteredInput = withEvidence(transition.state.masteredInput);
  }
  let saved: CodingWorkspace;
  try {
    saved = await prisma.$transaction(async (tx) => {
      if (transition.newlyMastered && billing.kind === "trial") {
        const charged = await tx.user.updateMany({ where: { id: billing.parentId, trialSessionsUsed: { lt: getTrialSessionLimit() }, children: { some: { id: childId, archived: false } } }, data: { trialSessionsUsed: { increment: 1 } } });
        if (charged.count !== 1) throw new LearningError("Your trial allowance is used. Your work is retained; a subscription is required for another completed activity.", 402);
      }
      const updated = await tx.codingWorkspace.update({ where: { id: row.id, updatedAt: row.updatedAt, programsJson: row.programsJson }, data: {
        programsJson: JSON.stringify(transition.state), stage: transition.state.stage, skillStatus: transition.state.mastered ? "mastered" : transition.state.completed.length >= 3 ? "practising" : "learning",
        completedStagesJson: JSON.stringify(transition.state.completed), attemptCount: transition.state.attempts, checksPassed: transition.state.checksPassed,
        lastFeedback: transition.message, lastRunJson: transition.state.lastExecution ? JSON.stringify(transition.state.lastExecution) : null,
        evidenceJson: JSON.stringify({ prediction: transition.state.completed.includes("predict"), practical: transition.state.completed.includes("build"), debugging: transition.state.completed.includes("debug"), independent: transition.state.completed.includes("create"), explanation: transition.state.completed.includes("review") }),
      } });
      if (transition.versionLabel) {
        const artifact = transition.newlyMastered ? transition.state.masteredArtifact! : stageArtifact(activity, transition.state, action.stage);
        const snapshot = await tx.codingProjectVersion.create({ data: { workspaceId: row.id, stage: action.stage, label: transition.versionLabel,
          programJson: JSON.stringify({ schema: 1, version: activity.version, activityId: activity.id, activityHash: activityContentHash(activity), artifact, artifactHash: artifactHash(artifact),
            input: transition.newlyMastered ? transition.state.masteredInput : transition.state.lastRunArtifactHash === artifactHash(artifact) && transition.state.lastRunStage === action.stage ? transition.state.lastExecutionInput ?? null : null, files: transition.newlyMastered ? transition.state.masteredFiles ?? {} : snapshotProjectFiles(transition.state, action.stage, artifact, transition.versionLabel === "verified-stage"), explanation: transition.state.explanation,
            personalInput: transition.state.personalInputs?.[action.stage]?.artifactHash === artifactHash(artifact) ? transition.state.personalInputs[action.stage] : null,
            evidenceBindings: transition.state.evidenceBindings?.[evidenceStage] ?? null,
            demonstration: transition.state.demonstrations?.[evidenceStage] ?? null,
            placement: placement ? bridgeContext(placement) : null, explanationReview: transition.state.explanationReview ?? null,
            independentFingerprint: variantFingerprint(activity, transition.state),
            execution: transition.state.lastRunArtifactHash === artifactHash(artifact) && transition.state.lastRunStage === action.stage ? transition.state.lastExecution : null,
            checks: transition.state.lastChecks, tutorProvenance: transition.state.hints, independent: transition.newlyMastered }) } });
        if (transition.newlyMastered) {
          if (placement) await recordReadinessIfComplete(tx, childId, placement, yearGroup);
          else await awardActivity(tx, childId, activity, transition.state, snapshot.id, yearGroup);
        }
      }
      return updated;
    }, { timeout: 20000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) throw new LearningError("Another tab saved this activity first. Your editor is retained; reload the saved revision before retrying.", 409);
    throw error;
  }
  return { ...publicActivityView(activity, transition.state, "learner", { ...scope, reviewContext: reviewOwnershipContext(childId, activity.id, transition.state), reviewVariant: transition.state.independentVariant }), teacherFeedback: saved.teacherFeedback, revision: revision(saved), message: transition.message, passed: transition.passed, versions: await versions(row.id) };
}

export async function codingActivityProgress(childId: string) {
  const definitions = await availableActivityDefinitions(childId), keys = new Map(definitions.map((activity) => [key(activity), activity]));
  const rows = await prisma.codingWorkspace.findMany({ where: { childId, lessonId: { in: [...keys.keys()] } }, select: { lessonId: true, skillStatus: true, stage: true, updatedAt: true } });
  const status = new Map(rows.map((row) => [row.lessonId, row]));
  const entryYear = await readinessEntryYear(childId);
  return definitions.map((activity) => ({ id: activity.id, inventoryId: activity.inventoryId, kind: activity.kind, title: activity.title, year: activity.year, courseId: activity.courseId,
    moduleId: activity.moduleId, projectId: activity.projectId, pathwayId: activity.pathwayId, objective: activity.objective, engine: activity.engine,
    prerequisites: activity.prerequisites, unlocked: status.has(key(activity)) || activity.prerequisites.every((id) => { const prerequisite = activityDefinition(id); return prerequisite && (prerequisite.year < entryYear || status.get(key(prerequisite))?.skillStatus === "mastered"); }),
    status: status.get(key(activity))?.skillStatus ?? "not_started", stage: status.get(key(activity))?.stage ?? "discover", updatedAt: status.get(key(activity))?.updatedAt ?? null }));
}
