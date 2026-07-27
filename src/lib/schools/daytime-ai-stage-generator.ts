import { requestOpenAiJson, getDaytimeOpenAiModel } from "@/lib/ai/openai-json";
import type { DaytimeSubjectMode } from "@/lib/schools/daytime-subject-mode";
import { logDaytimeGenerationTelemetry } from "@/lib/schools/daytime-generation-telemetry";
import {
  failedStagePack,
  normalizeDaytimeStagePack,
  serializeDaytimeStageContentJson,
  validateDaytimeStagePack,
  type NormalizedDaytimeStagePack,
} from "@/lib/schools/daytime-stage-validators";
import {
  formatWeeklyMemoryForPrompt,
  validateAgainstWeeklyMemory,
  type WeeklyCurriculumMemory,
  type WeeklyReviewPolicy,
} from "@/lib/schools/weekly-curriculum-memory";
import { shortLearningDepthPromptGuidance } from "@/lib/schools/short-learning-instructional-depth";

const MAX_RETRIES = 2;
const SHORT_LEARNING_MAX_RETRIES = 3;

/** Shared British English contract for every Short Learning / Daytime generative prompt. */
export const DAYTIME_BRITISH_ENGLISH_RULES = `Language and locale (mandatory):
- British English only
- UK spelling (colour, favourite, organise, centre, analyse — never color/favorite/organize/center/analyze)
- UK grammar and punctuation
- For generic money examples use pounds (£) and pence
- Do not use US spelling or dollar amounts`;

export type DaytimeAiStageInput = {
  mode: DaytimeSubjectMode;
  stage: "warmup" | "core" | "stretch";
  stageLabel: string;
  lessonTitle: string;
  subject: string;
  skillFocus: string;
  yearGroup: string;
  keyStage: string;
  /** Optional explicit 1–5 challenge selected by an Admin. */
  difficulty?: number;
  targetMinutes: number;
  targetItems: number;
  /** Shared Guided Reading passage from earlier stage / lesson-level gen. */
  sharedPassage?: {
    title: string;
    text: string;
    paragraphs: string[];
    wordCount: number;
  } | null;
  sharedVocabulary?: Array<{ word: string; childFriendlyMeaning: string; example?: string }> | null;
  regenerateReason?: string | null;
  previousValidationErrors?: string[];
  /** Compact already-used content for this class/subject/week. */
  weeklyMemory?: WeeklyCurriculumMemory | null;
  weeklyReviewPolicy?: WeeklyReviewPolicy | null;
  /**
   * Short Learning enables additive instructional-depth validation + prompt contract.
   * Day School must leave this unset (or "day-school") so behaviour stays unchanged.
   */
  instructionalDepthProfile?: "day-school" | "short-learning";
};

export type DaytimeAiStageResult = {
  pack: NormalizedDaytimeStagePack;
  contentJson: string;
  model: string;
  openAiAttempted: boolean;
  openAiSucceeded: boolean;
  validationIssues: string[];
  usageTokens: number;
  retryCount: number;
  generationDurationMs: number;
  openAiLatencyMs: number;
  validatorDurationMs: number;
  /** Last non-null normalized attempt (even when validation failed) — for UAT diagnosis only. */
  lastAttemptPack?: NormalizedDaytimeStagePack | null;
};

const ACTIVITY_KIND_ENUM = `Allowed activity kind values ONLY (use these exact strings):
read-passage, teacher-explanation, worked-example, multiple-choice, short-answer, reasoning,
word-sort, dictation, proofreading, vocabulary, reflection, practical, challenge, fluency, prediction, scaffold, independent.
Do not invent free-text kinds such as "vocabulary preview" or "group game".`;

export function systemPromptForMode(mode: DaytimeSubjectMode): string {
  const base = `You are an expert primary/secondary UK classroom lesson designer for StarLiz Academy.
Return STRICT JSON only (no markdown). Use child-friendly, age-appropriate language.
${DAYTIME_BRITISH_ENGLISH_RULES}
Never invent database IDs, cuid strings, or internal codes.
Never put lesson period IDs or stage seeds in pupil text.
Every closed-answer question MUST include: prompt, answer, explanation, hints (array of 2-3 progressive hints that do NOT reveal the full answer in hint 1), and breakdown { simplerQuestion, steps[], keyWords[{word,meaning}], startingPoint }.
Reflection / practical / dictation items may omit a single fixed answer but should still include prompt and guidance.
Activities MUST include kind and estimatedMinutes; activity minutes should approximately sum to targetMinutes.
${ACTIVITY_KIND_ENUM}
Include targetItems matching the number of pupil tasks/questions where relevant.`;

  switch (mode) {
    case "guided-reading":
      return `${base}
Subject mode: guided-reading.
Include passage { title, text, paragraphs[], wordCount } — a real age-appropriate reading passage (not meta commentary about the lesson).
Include vocabulary[{ word, childFriendlyMeaning, example }].
Vary question stems across the stage — do NOT repeat the same generic stems such as "What is the main idea of the passage?", "How do the characters feel…?", or "What lesson can we learn…?" more than once in a session stage.
Prefer a mix of: retrieval, inference, author's intent/purpose, prediction, summarising, vocabulary in context, evidence finding, comparison, and evaluation — each tied to THIS passage.
Warm-up: vocabulary, prediction, short-answer retrieval.
Core: read-passage, short-answer / multiple-choice comprehension, reasoning.
Stretch: deeper inference, author purpose, short justified response.`;
    case "spelling":
      return `${base}
Subject mode: spelling.
Include spellingFocus, targetWords[], ruleExplanation, examples[].
Activities must vary using kinds: teacher-explanation, fluency, vocabulary, word-sort, short-answer, dictation, proofreading, challenge — not fifteen identical "spell the word carefully" prompts.
Use the target pattern consistently. Dictation may be open/oral without a multiple-choice answer.`;
    case "maths":
      return `${base}
Subject mode: maths.
Include learningObjective, prerequisiteKnowledge[], explanation, workedExamples[{ question, steps[], answer }].
EVERY stage (including warm-up) MUST include a non-empty "explanation" string OR at least one workedExamples entry.
Warm-up: short explanation plus 1–2 retrieval or reasoning prompts; open "Explain why…" questions should use kind "reasoning".
Core MUST include ALL of:
1) a clear teaching explanation
2) at least one workedExamples entry with steps
3) at least one activity with kind "scaffold"
4) at least one activity with kind "reasoning" OR a question whose prompt requires explain/justify/compare strategies/identify an error/word problem
5) at least one independent practice activity (independent, short-answer, multiple-choice, or challenge)
6) model answers or solution steps on closed questions
Avoid repetitive number-substitution clones. Answers must be mathematically valid.`;
    case "science":
      return `${base}
Subject mode: science.
Required fields on EVERY stage:
- topic (string)
- learningObjective (string)
- explanation (string) — meaningful concept explanation for the topic (not empty)
- vocabulary (array of at least 3 items): [{ word, childFriendlyMeaning, example? }]
  (You may also send keyVocabulary with the same shape; vocabulary is preferred.)
- optional scenarioOrObservation
- activities + questions with model answers/explanations
Core must include an observation, scenario, practical, classification, comparison, prediction, or evidence task.
Every question prompt/answer/explanation MUST use real science vocabulary such as:
hypothesis, evidence, variable, observation, prediction, investigation, fair test, material, habitat,
force, energy, light, sound, plant, animal, solid, liquid, gas — pick terms that fit the topic.
Do NOT produce generic "According to the passage" quiz items unless you include a genuine scenario text.`;
    case "practical-pe":
      return `${base}
Subject mode: practical-pe.
This is PE — NOT reading comprehension. Do not invent reading passages.
Include explanation covering safety + skill focus (safe space, stop signal / freeze, teacher supervision, warm-up, cool-down).
Activities must use kinds practical, teacher-explanation, reflection, challenge and describe:
warm-up movement → skill practice → teamwork/game → cool-down.
Questions should be short checks about safety, skill cues, teamwork — not "according to the passage".
Practical/reflection items do not need a single fixed text answer.`;
    case "practical-arts":
    case "practical-music":
      return `${base}
Subject mode: ${mode}.
Focus on practical/creative process, technique, and reflection — not fake reading passages.`;
    default:
      return `${base}
Subject mode: ${mode}.
Produce topic-specific teaching explanation and varied questions with model answers. Avoid generic reusable templates.`;
  }
}

export function repairHintForIssues(issues: string[]): string {
  const joined = issues.join(" | ").toLowerCase();
  const hints: string[] = [];
  if (joined.includes("missing_reasoning")) {
    hints.push(
      "Your previous output did not include a valid reasoning activity. Add at least one age-appropriate question requiring the pupil to explain, justify, compare strategies, identify an error, or solve a word problem. Also include an activity with kind \"reasoning\".",
    );
  }
  if (joined.includes("missing_science_explanation")) {
    hints.push("Add a non-empty top-level explanation field with a meaningful concept explanation for this science topic.");
  }
  if (joined.includes("missing_science_vocab")) {
    hints.push("Add vocabulary: at least 3 topic-specific terms as [{ word, childFriendlyMeaning }]. Do not leave vocabulary empty.");
  }
  if (joined.includes("unsupported_activity_kind")) {
    hints.push(`Replace free-text activity kinds with the allowed enum only. ${ACTIVITY_KIND_ENUM}`);
  }
  if (joined.includes("missing_worked_example")) {
    hints.push("Add at least one workedExamples entry with question, steps[], and answer.");
  }
  if (joined.includes("missing_maths_explanation")) {
    hints.push(
      "Add a non-empty top-level explanation string OR at least one workedExamples entry. Warm-up still needs a short teaching hook.",
    );
  }
  if (joined.includes("pe_missing_safety") || joined.includes("pe_missing_cooldown") || joined.includes("pe_missing_warmup")) {
    hints.push(
      "Add a top-level explanation that includes safe space, stop/freeze signal, teacher supervision, warm-up, and cool-down. Put cool-down in core activity titles or explanation text.",
    );
  }
  if (joined.includes("missing_vocabulary") || joined.includes("questions_not_about_passage")) {
    hints.push(
      "Include vocabulary[{word,childFriendlyMeaning}] (reuse shared lesson vocabulary if provided) and make every question clearly about the shared passage (use character names, setting details, or phrases like according to the passage / evidence from the text). Model answers MUST reuse words that appear in the passage.",
    );
  }
  if (joined.includes("missing_answer")) {
    hints.push(
      "Closed questions need model answers. Open reflection/reasoning/dictation may omit a fixed answer but must still include prompt, hints, and guidance.",
    );
  }
  if (joined.includes("american_english")) {
    hints.push(
      "Rewrite all pupil-facing text in British English. Replace US spellings (color→colour, favorite→favourite, organize→organise, center→centre, analyze→analyse). Use £/pence for money — never $ or dollars.",
    );
  }
  if (joined.includes("weekly_duplicate_passage")) {
    hints.push(
      "Weekly uniqueness failed: create a completely different passage (new setting, characters, and plot). Do not rename or lightly paraphrase an earlier story.",
    );
  }
  if (joined.includes("weekly_duplicate_vocabulary") || joined.includes("weekly_duplicate_question")) {
    hints.push(
      "Weekly uniqueness failed: choose different vocabulary/target words and rewrite question stems with a new structure — changing only names or numbers is not enough.",
    );
  }
  if (joined.includes("weekly_duplicate_worked_example")) {
    hints.push(
      "Weekly uniqueness failed: invent a new worked-example structure (different operation story / representation), not the same steps with swapped numbers.",
    );
  }
  if (joined.includes("weekly_duplicate_scenario") || joined.includes("weekly_duplicate_activity_pattern")) {
    hints.push(
      "Weekly uniqueness failed: invent a new scenario/observation and vary activity kinds and order versus earlier this week.",
    );
  }
  if (joined.includes("sl_thin_teaching") || joined.includes("sl_missing_") || joined.includes("sl_excessive_repetition") || joined.includes("sl_insufficient_practice_depth")) {
    hints.push(
      "Short Learning depth failed: rebuild as a full teaching cycle for the allocated minutes — prior warm-up, substantial explanation, ≥2 worked examples (lesson), guided + independent practice, misconceptions[], reflectionCheck, transitionNote, and varied (non-clone) practice. Do not pad with repetitive number substitutions.",
    );
  }
  if (joined.includes("sl_challenge_")) {
    hints.push(
      "Challenge depth failed: add real-world/application context, deeper reasoning, method explanation or compare-approaches, and an extension — not only harder numbers.",
    );
  }
  if (joined.includes("sl_recap_")) {
    hints.push(
      "Recap depth failed: restate the method, include one worked example, 2–3 focused checks, and a misconception — do not introduce a new topic.",
    );
  }
  if (joined.includes("sl_review_")) {
    hints.push(
      "Final review depth failed: summarise objectives, mix retrieval, add reasoning, reflection, misconception check, and a next-step recommendation.",
    );
  }
  return hints.join("\n");
}

function stageIntentGuidance(input: DaytimeAiStageInput): string {
  const depth =
    input.instructionalDepthProfile === "short-learning"
      ? shortLearningDepthPromptGuidance({
          mode: input.mode,
          stageLabel: input.stageLabel,
          targetMinutes: input.targetMinutes,
        })
      : "";
  const emitOrder =
    input.instructionalDepthProfile === "short-learning"
      ? `OUTPUT ORDER (mandatory for Short Learning): emit teaching fields BEFORE long question lists:
1) learningObjective, priorLearningWarmup, explanation (substantial), workedExamples (≥2 for lesson blocks)
2) misconceptions[], reflectionCheck, transitionNote
3) activities[] covering scaffold + independent + reasoning/reflection
4) questions[] with varied stems (guided then independent then reasoning) — never near-identical number substitutions
Keep JSON complete within the token budget; prefer fewer high-quality items over truncated empty shells.`
      : "";

  const label = input.stageLabel.toLowerCase();
  let intent = "";
  if (label.includes("recap")) {
    if (input.mode === "maths") {
      intent = `Recap intent (mandatory): This is a genuine review of earlier learning in the SAME skill focus (${input.skillFocus}), not filler.
- Restate the key method/idea in explanation
- Include at least one mini workedExamples entry revisiting that method
- Include 2–3 questions that check prior objectives (retrieval + one slightly harder check)
- Do NOT introduce a new topic or stretch into unrelated skills
- Stay within targetMinutes — deepen review quality, do not expand duration`;
    } else if (input.mode === "guided-reading") {
      intent = `Recap intent (mandatory): Review earlier reading learning for this skill focus — not a new unrelated story quiz.
- Keep continuity with the session theme/skill
- Use varied stems (retrieval, evidence, vocabulary in context) — avoid repeating generic main-idea/feeling/lesson stems
- Stay within targetMinutes`;
    } else {
      intent = `Recap intent: genuinely review earlier learning for skill focus "${input.skillFocus}". Do not pad with unrelated new content. Stay within targetMinutes.`;
    }
  } else if (input.mode === "guided-reading") {
    intent = `Comprehension variety: across questions, cover different thinking types (retrieval, inference, author's intent, prediction, summarising, vocabulary in context, evidence, comparison, evaluation). Avoid near-identical stems.`;
  }

  return [intent, depth, emitOrder].filter(Boolean).join("\n\n");
}

export function userPromptForStage(input: DaytimeAiStageInput): string {
  const shared = input.sharedPassage
    ? `Use this shared passage for the lesson (you may lightly continue or focus a section for this stage, but keep continuity):\n${JSON.stringify(input.sharedPassage)}`
    : input.mode === "guided-reading"
      ? "Create a new original passage suitable for the year group and skill focus."
      : "";

  const intent = stageIntentGuidance(input);

  return `Create one daytime school stage pack as JSON.

Lesson title: ${input.lessonTitle}
School subject: ${input.subject}
Skill focus: ${input.skillFocus}
Year group: ${input.yearGroup}
Key stage: ${input.keyStage}
Difficulty level: ${input.difficulty ?? "age-appropriate default"} / 5
Stage: ${input.stage} (${input.stageLabel})
Target minutes: ${input.targetMinutes}
Target items (compat): ${input.targetItems}
subjectType: ${input.mode}

${DAYTIME_BRITISH_ENGLISH_RULES}

Required top-level fields:
subjectType, title, estimatedMinutes, targetItems, activities[], questions[]
Plus mode-specific fields described in the system prompt.

${intent}

${shared}

${formatWeeklyMemoryForPrompt(input.weeklyMemory)}

${input.weeklyReviewPolicy?.allowWeeklyReview
    ? `Intentional review lesson (${input.weeklyReviewPolicy.reviewReason ?? "review"}): consolidation is allowed, but do not copy exact passages, exact questions, or identical worked examples.`
    : ""}

${input.regenerateReason ? `Teacher regenerate reason: ${input.regenerateReason}` : ""}
${input.previousValidationErrors?.length
    ? `Fix these validation errors from the previous attempt:\n- ${input.previousValidationErrors.join("\n- ")}\n${repairHintForIssues(input.previousValidationErrors)}`
    : ""}

Return JSON object only.`;
}

export async function generateDaytimeStageWithOpenAi(
  input: DaytimeAiStageInput,
): Promise<DaytimeAiStageResult> {
  const generationStarted = Date.now();
  let lastIssues: string[] = input.previousValidationErrors ?? [];
  let openAiAttempted = false;
  let usageTokens = 0;
  let model = getDaytimeOpenAiModel();
  let openAiLatencyMs = 0;
  let validatorDurationMs = 0;
  let retryCount = 0;
  let lastAttemptPack: NormalizedDaytimeStagePack | null = null;
  const maxRetries =
    input.instructionalDepthProfile === "short-learning" ? SHORT_LEARNING_MAX_RETRIES : MAX_RETRIES;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    openAiAttempted = true;
    retryCount = attempt;
    try {
      const openAiStarted = Date.now();
      const result = await requestOpenAiJson({
        systemPrompt: systemPromptForMode(input.mode),
        userPrompt: userPromptForStage({
          ...input,
          previousValidationErrors: lastIssues,
        }),
        temperature: attempt === 0 ? 0.45 : 0.3,
        maxTokens: input.instructionalDepthProfile === "short-learning" ? 12_000 : 4000,
        timeoutMs: input.instructionalDepthProfile === "short-learning" ? 120_000 : 75_000,
      });
      openAiLatencyMs += Date.now() - openAiStarted;
      model = result.model;
      usageTokens += result.usage?.totalTokens ?? 0;

      const normalized = normalizeDaytimeStagePack(result.parsed, input.mode);
      if (!normalized) {
        lastIssues = ["Model output was not a valid stage object."];
        continue;
      }
      lastAttemptPack = normalized;

      // Prefer shared passage/vocab continuity for guided reading before validation.
      if (input.mode === "guided-reading") {
        if (input.sharedPassage && !normalized.passage?.text) {
          normalized.passage = input.sharedPassage;
        }
        if (input.sharedVocabulary?.length && !normalized.vocabulary?.length) {
          normalized.vocabulary = input.sharedVocabulary;
        }
      }
      // Maths stages sometimes omit structured teaching fields even when questions exist.
      // Seed minimal hooks from objective / first answered question so Day School validation can pass.
      // Short Learning depth profile must NOT receive these thin seeds — it must earn a real teaching cycle.
      if (input.mode === "maths" && input.instructionalDepthProfile !== "short-learning") {
        if (!normalized.explanation?.trim()) {
          normalized.explanation =
            normalized.learningObjective?.trim()
            || `Focus on ${input.skillFocus}: use a clear written method and check each place value.`;
        }
        if (
          (input.stage === "core" || input.stage === "warmup")
          && !(normalized.workedExamples?.length)
        ) {
          const q = normalized.questions.find((row) => String(row.answer ?? "").trim() !== "");
          if (q) {
            normalized.workedExamples = [
              {
                question: q.breakdown?.simplerQuestion?.trim() || q.prompt,
                steps:
                  q.breakdown?.steps?.length
                    ? q.breakdown.steps
                    : ["Read the question carefully", "Choose a written method", "Check the answer"],
                answer: String(q.answer),
              },
            ];
          }
        }
      }
      if (!normalized.title) normalized.title = `${input.lessonTitle} · ${input.stageLabel}`;
      normalized.estimatedMinutes = normalized.estimatedMinutes || input.targetMinutes;
      normalized.targetItems = normalized.targetItems || input.targetItems;

      const validatorStarted = Date.now();
      const issues = validateDaytimeStagePack({
        pack: normalized,
        mode: input.mode,
        stage: input.stage,
        targetMinutes: input.targetMinutes,
        lessonTitle: input.lessonTitle,
        instructionalDepthProfile: input.instructionalDepthProfile,
        stageLabel: input.stageLabel,
      });
      const weeklyIssues = validateAgainstWeeklyMemory({
        pack: normalized,
        memory: input.weeklyMemory,
        mode: input.mode,
        policy: input.weeklyReviewPolicy,
      });
      validatorDurationMs += Date.now() - validatorStarted;

      if (issues.length) {
        lastIssues = issues.map((issue) => `${issue.code}: ${issue.message}`);
        continue;
      }
      if (weeklyIssues.length) {
        lastIssues = weeklyIssues.map((issue) => `${issue.code}: ${issue.message}`);
        continue;
      }

      const generationDurationMs = Date.now() - generationStarted;
      logDaytimeGenerationTelemetry({
        event: "daytime_stage_generation",
        mode: input.mode,
        stage: input.stage,
        stageLabel: input.stageLabel,
        subject: input.subject,
        yearGroup: input.yearGroup,
        model,
        openAiSucceeded: true,
        retryCount,
        generationDurationMs,
        openAiLatencyMs,
        validatorDurationMs,
        usageTokens,
      });

      return {
        pack: normalized,
        contentJson: serializeDaytimeStageContentJson(normalized),
        model,
        openAiAttempted: true,
        openAiSucceeded: true,
        validationIssues: [],
        usageTokens,
        retryCount,
        generationDurationMs,
        openAiLatencyMs,
        validatorDurationMs,
        lastAttemptPack: normalized,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "OpenAI request failed.";
      lastIssues = [message];
      // Do not retry endlessly on missing key.
      if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "OPENAI_KEY_MISSING") {
        break;
      }
    }
  }

  const failed = failedStagePack({
    mode: input.mode,
    title: `${input.lessonTitle} · ${input.stageLabel}`,
    targetMinutes: input.targetMinutes,
    targetItems: input.targetItems,
    reason: lastIssues[0] || "OpenAI stage generation failed after retries.",
  });

  const generationDurationMs = Date.now() - generationStarted;
  logDaytimeGenerationTelemetry({
    event: "daytime_stage_generation",
    mode: input.mode,
    stage: input.stage,
    stageLabel: input.stageLabel,
    subject: input.subject,
    yearGroup: input.yearGroup,
    model,
    openAiSucceeded: false,
    retryCount,
    generationDurationMs,
    openAiLatencyMs,
    validatorDurationMs,
    usageTokens,
  });

  return {
    pack: failed,
    contentJson: serializeDaytimeStageContentJson(failed),
    model,
    openAiAttempted,
    openAiSucceeded: false,
    validationIssues: lastIssues,
    usageTokens,
    retryCount,
    generationDurationMs,
    openAiLatencyMs,
    validatorDurationMs,
    lastAttemptPack,
  };
}

/** Lesson-level shared passage for Guided Reading (generated once, reused by stages). */
export async function generateGuidedReadingSharedPassage(input: {
  lessonTitle: string;
  skillFocus: string;
  yearGroup: string;
  keyStage: string;
  weeklyMemory?: WeeklyCurriculumMemory | null;
  weeklyReviewPolicy?: WeeklyReviewPolicy | null;
}): Promise<{
  passage: { title: string; text: string; paragraphs: string[]; wordCount: number };
  vocabulary: Array<{ word: string; childFriendlyMeaning: string; example?: string }>;
  openAiSucceeded: boolean;
  failureReason?: string;
}> {
  try {
    let lastIssues: string[] = [];
    let normalized: NormalizedDaytimeStagePack | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const result = await requestOpenAiJson({
        systemPrompt: `You write age-appropriate UK classroom reading passages for Guided Reading.
${DAYTIME_BRITISH_ENGLISH_RULES}
Return JSON: { passage: { title, text, paragraphs[], wordCount }, vocabulary: [{ word, childFriendlyMeaning, example }] }.
Passage should be 120–220 words for primary, longer for secondary, with clear paragraphs.
No internal IDs. No meta commentary about lessons.
Generate materially different content from any passages already used this week.`,
        userPrompt: `Lesson: ${input.lessonTitle}
Skill focus: ${input.skillFocus}
Year group: ${input.yearGroup}
Key stage: ${input.keyStage}
Create an engaging original passage pupils can actually read.
${DAYTIME_BRITISH_ENGLISH_RULES}

${formatWeeklyMemoryForPrompt(input.weeklyMemory)}
${lastIssues.length
  ? `Fix these issues:\n- ${lastIssues.join("\n- ")}\n${repairHintForIssues(lastIssues)}`
  : ""}`,
        maxTokens: 2000,
        temperature: attempt === 0 ? 0.5 : 0.35,
      });
      const row = result.parsed as Record<string, unknown>;
      normalized = normalizeDaytimeStagePack(
        {
          subjectType: "guided-reading",
          title: input.lessonTitle,
          estimatedMinutes: 5,
          targetItems: 1,
          activities: [{ kind: "read-passage", estimatedMinutes: 5 }],
          questions: [],
          passage: row.passage,
          vocabulary: row.vocabulary,
        },
        "guided-reading",
      );
      if (!normalized?.passage?.text || normalized.passage.wordCount < 40) {
        lastIssues = ["Shared passage generation returned empty/short text."];
        continue;
      }
      const weeklyIssues = validateAgainstWeeklyMemory({
        pack: normalized,
        memory: input.weeklyMemory,
        mode: "guided-reading",
        policy: input.weeklyReviewPolicy,
      });
      if (weeklyIssues.length) {
        lastIssues = weeklyIssues.map((issue) => `${issue.code}: ${issue.message}`);
        continue;
      }
      break;
    }
    if (!normalized?.passage?.text || normalized.passage.wordCount < 40) {
      return {
        passage: { title: input.lessonTitle, text: "", paragraphs: [], wordCount: 0 },
        vocabulary: [],
        openAiSucceeded: false,
        failureReason: lastIssues[0] || "Shared passage generation returned empty/short text.",
      };
    }
    const finalWeekly = validateAgainstWeeklyMemory({
      pack: normalized,
      memory: input.weeklyMemory,
      mode: "guided-reading",
      policy: input.weeklyReviewPolicy,
    });
    if (finalWeekly.length) {
      return {
        passage: { title: input.lessonTitle, text: "", paragraphs: [], wordCount: 0 },
        vocabulary: [],
        openAiSucceeded: false,
        failureReason: finalWeekly.map((issue) => `${issue.code}: ${issue.message}`).join(" | "),
      };
    }
    return {
      passage: normalized.passage,
      vocabulary: normalized.vocabulary ?? [],
      openAiSucceeded: true,
    };
  } catch (error) {
    return {
      passage: { title: input.lessonTitle, text: "", paragraphs: [], wordCount: 0 },
      vocabulary: [],
      openAiSucceeded: false,
      failureReason: error instanceof Error ? error.message : "Passage generation failed.",
    };
  }
}
