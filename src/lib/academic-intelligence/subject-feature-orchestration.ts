import { ENGLISH_STRANDS } from "@/lib/subject-selection";
import { GENERATION_CONTENT_TYPE_BY_SUBJECT, type Subject } from "@/lib/curriculum";

export type BodyOrchestrationPhaseStatus = "ready" | "partial" | "blocked";

export type BodyOrchestrationSurfaceStatus = "connected" | "partial" | "missing";

export type BodyOrchestrationSurface = {
  key:
    | "subject_selection"
    | "progression"
    | "qlf"
    | "ai_generator_url"
    | "ai_generator_ui"
    | "ai_generation_api"
    | "assignments"
    | "homework"
    | "recovery"
    | "student_learning_brain"
    | "parent_portal"
    | "brain_centre"
    | "academic_intelligence";
  label: string;
  status: BodyOrchestrationSurfaceStatus;
  summary: string;
};

export type BodyOrchestrationWarning = {
  severity: "warning" | "critical";
  title: string;
  summary: string;
  affectedSurfaces: BodyOrchestrationSurface["key"][];
};

export type BodyOrchestrationPhase = {
  phase: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  name: string;
  status: BodyOrchestrationPhaseStatus;
  summary: string;
};

export type BodyOrchestrationReport = {
  generatedAt: string;
  canShipWithoutSchemaChanges: boolean;
  verdict: "healthy" | "warning" | "blocked";
  heartBeatWarning: string;
  registry: {
    subjectCount: number;
    englishStrands: string[];
    supportedSubjects: Subject[];
    inputSource: string;
  };
  phases: BodyOrchestrationPhase[];
  surfaces: BodyOrchestrationSurface[];
  warnings: BodyOrchestrationWarning[];
  recommendedPhase1: string[];
};

export function buildSubjectFeatureOrchestrationReport(): BodyOrchestrationReport {
  const supportedSubjects = Object.keys(GENERATION_CONTENT_TYPE_BY_SUBJECT) as Subject[];
  const englishStrands = [...ENGLISH_STRANDS];
  const canonicalInputSource = "src/lib/subject-selection.ts";
  const generatorUrlStrands = new Set(["phonics", "spelling", "reading", "grammar", "punctuation", "writing", "vocabulary", "comprehension"]);
  const generatorUiStrands = new Set(["phonics", "spelling", "reading", "grammar", "punctuation", "writing", "vocabulary", "comprehension"]);
  const generatorApiStrands = new Set(["phonics", "spelling", "reading", "grammar", "punctuation", "writing", "vocabulary", "comprehension"]);

  const surfaces: BodyOrchestrationSurface[] = [
    {
      key: "subject_selection",
      label: "Subject Selection",
      status: "connected",
      summary: `Canonical parent subject registry with ${englishStrands.length} English strands and core subject policy.`,
    },
    {
      key: "progression",
      label: "Progression",
      status: "connected",
      summary: "Progression scope parsing already understands English strands, maths, and science family routing.",
    },
    {
      key: "qlf",
      label: "QLF",
      status: "connected",
      summary: "Quick Level Finder baseline and assignment parsing can carry target learning evidence into the brain.",
    },
    {
      key: "ai_generator_url",
      label: "AI Generator URL",
      status: generatorUrlStrands.has("speaking-listening") ? "connected" : "partial",
      summary: "Handoff URL normalisation carries most English strands, but Speaking/Listening is not part of the current strand set.",
    },
    {
      key: "ai_generator_ui",
      label: "AI Generator UI",
      status: generatorUiStrands.has("speaking-listening") ? "connected" : "partial",
      summary: "The admin generator UI exposes Reading, Writing, Grammar, Spelling, Vocabulary, Comprehension, and Phonics, but not Speaking/Listening.",
    },
    {
      key: "ai_generation_api",
      label: "AI Generation API",
      status: generatorApiStrands.has("speaking-listening") ? "connected" : "partial",
      summary: "The generation API accepts the same strand set as the UI, so Speaking/Listening is currently dropped at the API boundary.",
    },
    {
      key: "assignments",
      label: "Assignments",
      status: "connected",
      summary: "Assignments already preserve target learning year/key stage and subject-level evidence.",
    },
    {
      key: "homework",
      label: "Homework",
      status: "connected",
      summary: "Homework generation carries targetLearningYearGroup and targetLearningKeyStage forward.",
    },
    {
      key: "recovery",
      label: "Recovery",
      status: "connected",
      summary: "Recovery orchestration persists curriculum target metadata for downstream routing.",
    },
    {
      key: "student_learning_brain",
      label: "Student Learning Brain",
      status: "connected",
      summary: "The brain read model already consumes progression, qlf, assignments, and homework evidence.",
    },
    {
      key: "parent_portal",
      label: "Parent Portal",
      status: "connected",
      summary: "Parent-facing dashboards can consume canonical learning and progression signals through the brain layer.",
    },
    {
      key: "brain_centre",
      label: "Brain Centre",
      status: "connected",
      summary: "Brain Centre already surfaces HEART BEAT, QLF, and recommendation alignment issues.",
    },
    {
      key: "academic_intelligence",
      label: "Academic Intelligence",
      status: "connected",
      summary: "Academic Intelligence already provides the orchestration and heartbeat layers this engine should inspect.",
    },
  ];

  const warnings: BodyOrchestrationWarning[] = [
    {
      severity: "critical",
      title: "Speaking/Listening is missing from the generator handoff path",
      summary: "Speaking/Listening exists in subject-selection and progression, but it is absent from the AI Generator URL, UI, and API strand lists.",
      affectedSurfaces: ["subject_selection", "progression", "ai_generator_url", "ai_generator_ui", "ai_generation_api"],
    },
    {
      severity: "critical",
      title: "Future/generated subjects are not safely open-ended",
      summary: "normalizeSubject and the generation-content map are closed, so new subjects need explicit registry expansion before they can flow through the body.",
      affectedSurfaces: ["subject_selection", "ai_generator_ui", "ai_generation_api", "academic_intelligence"],
    },
    {
      severity: "warning",
      title: "Grammar, Maths, and Reading are hard-routed at several boundaries",
      summary: "Those routes are intentionally canonical today, but they are still hardcoded enough that any new variation should be added through the registry first.",
      affectedSurfaces: ["progression", "ai_generator_url", "ai_generator_ui", "ai_generation_api", "assignments", "homework", "recovery"],
    },
  ];

  const blockedCount = warnings.filter((warning) => warning.severity === "critical").length;
  const partialCount = surfaces.filter((surface) => surface.status === "partial").length;

  const phases: BodyOrchestrationPhase[] = [
    {
      phase: 1,
      name: "Canonical Registry",
      status: "partial",
      summary: `Subject selection already provides the registry input source (${canonicalInputSource}), but the broader subject universe is still closed through curriculum maps.`,
    },
    {
      phase: 2,
      name: "Stomach",
      status: "partial",
      summary: "Ingestion and normalisation exist, but the generator strand set is not yet universal.",
    },
    {
      phase: 3,
      name: "Blood",
      status: "partial",
      summary: "Target-learning metadata does move through the pipelines, but not every surface shares the same strand vocabulary.",
    },
    {
      phase: 4,
      name: "Spinal Cord",
      status: "partial",
      summary: "Routing exists across brain, recovery, homework, assignments, and parent-facing surfaces, but it is not fully canonicalised.",
    },
    {
      phase: 5,
      name: "HEART BEAT",
      status: blockedCount > 0 ? "blocked" : "ready",
      summary: blockedCount > 0 ? "At least one body-system connection is missing or duplicated. Review before changing behaviour." : "No blocking body-system warnings were found.",
    },
    {
      phase: 6,
      name: "Anus / Guardrail",
      status: blockedCount > 0 ? "blocked" : "ready",
      summary: blockedCount > 0 ? "The guardrail should block incomplete subject/feature rollouts until the registry is expanded." : "Guardrail can stay passive.",
    },
    {
      phase: 7,
      name: "Admin Body Diagram UI",
      status: "partial",
      summary: "The diagram can be rendered in the HEART BEAT admin page now, but it should remain read-only in phase 1.",
    },
  ];

  const verdict: BodyOrchestrationReport["verdict"] = blockedCount > 0 ? "blocked" : partialCount > 0 ? "warning" : "healthy";

  return {
    generatedAt: new Date().toISOString(),
    canShipWithoutSchemaChanges: true,
    verdict,
    heartBeatWarning: "Speaking/Listening exists in Progression and Subject Selection, but it is missing from the AI Generator URL/UI/API handoff path.",
    registry: {
      subjectCount: supportedSubjects.length,
      englishStrands,
      supportedSubjects,
      inputSource: canonicalInputSource,
    },
    phases,
    surfaces,
    warnings,
    recommendedPhase1: [
      "Use subject-selection.ts as the canonical input source.",
      "Keep the audit read-only and route warnings into admin/HEART BEAT only.",
      "Add Speaking/Listening to the generator handoff path before auto-changing generation.",
      "Keep schema and migrations untouched for phase 1.",
    ],
  };
}
