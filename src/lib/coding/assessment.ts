import { explanationShowsUnderstanding, PREDICT_CORRECT_CHOICE } from "@/lib/coding/answers";
import { stageBrief, type CodingLessonBrief } from "@/lib/coding/catalog";
import { runCodingProgram } from "@/lib/coding/runner";
import {
  CODING_STAGES,
  EMPTY_EVIDENCE,
  type CodingEvidence,
  type CodingProgram,
  type CodingRunResult,
  type CodingSkillStatus,
  type CodingStage,
} from "@/lib/coding/types";

export type StageAssessment = {
  passed: boolean;
  feedback: string;
  evidence: CodingEvidence;
  run: CodingRunResult | null;
};

function withEvidence(base: CodingEvidence, patch: Partial<CodingEvidence>): CodingEvidence {
  return { ...base, ...patch };
}

export function deriveSkillStatus(started: boolean, evidence: CodingEvidence): CodingSkillStatus {
  if (!started) return "not_started";
  if (
    evidence.prediction
    && evidence.practical
    && evidence.debugging
    && evidence.explanation
    && evidence.independent
  ) {
    return "mastered";
  }
  if (evidence.practical || evidence.debugging || evidence.independent) return "practising";
  return "learning";
}

export function stageUnlocked(stage: CodingStage, completed: CodingStage[]): boolean {
  const index = CODING_STAGES.indexOf(stage);
  if (index <= 0) return true;
  const previous = CODING_STAGES[index - 1];
  return previous ? completed.includes(previous) : false;
}

function loopRequiredFeedback(run: CodingRunResult, goalLabel: string): string | null {
  if (run.error) return run.error;
  if (!run.usedLoop && run.unrolledMoves > 1) {
    return `You reached the board by writing the move ${run.unrolledMoves} times. A loop should say the move once and repeat it.`;
  }
  if (!run.usedLoop) {
    return "Add a repeat block and put the move inside it.";
  }
  if (!run.reachedGoal) {
    return `The character stopped at (${run.final.x}, ${run.final.y}). ${goalLabel}`;
  }
  return null;
}

export function assessCodingStage(input: {
  lesson: CodingLessonBrief;
  stage: CodingStage;
  program: CodingProgram;
  evidence: CodingEvidence;
  predictionChoice?: string | null;
  explanation?: string | null;
  revealingHints: number;
}): StageAssessment {
  const brief = stageBrief(input.lesson, input.stage);
  const evidence = { ...input.evidence };

  if (input.stage === "discover") {
    return {
      passed: true,
      feedback: "You have seen the goal. Next, say what the example will do before it runs.",
      evidence,
      run: brief.goal ? runCodingProgram(input.program, brief.goal) : null,
    };
  }

  if (input.stage === "predict") {
    const choice = input.predictionChoice ?? "";
    if (!choice) {
      return {
        passed: false,
        feedback: "Choose what you think the program will do. You do not need to be right first time.",
        evidence,
        run: null,
      };
    }
    if (choice !== PREDICT_CORRECT_CHOICE) {
      return {
        passed: false,
        feedback: "Not quite. Look at the direction of the move and the number on the repeat block, then choose again.",
        evidence: withEvidence(evidence, { prediction: false }),
        run: null,
      };
    }
    return {
      passed: true,
      feedback: "Yes. The move is inside the repeat, so it happens three times to the right.",
      evidence: withEvidence(evidence, { prediction: true }),
      run: brief.example ? runCodingProgram(brief.example, brief.goal) : null,
    };
  }

  if (input.stage === "review") {
    const text = input.explanation ?? "";
    if (!explanationShowsUnderstanding(text)) {
      return {
        passed: false,
        feedback: "Tell StarLiz what your loop repeats, in a full sentence. Mention the loop, or how many times the move happens.",
        evidence: withEvidence(evidence, { explanation: false }),
        run: null,
      };
    }
    return {
      passed: true,
      feedback: "That explanation shows you know why the loop is there.",
      evidence: withEvidence(evidence, { explanation: true }),
      run: null,
    };
  }

  const run = runCodingProgram(input.program, brief.goal);
  const goalLabel = brief.goal
    ? `The star is at (${brief.goal.x}, ${brief.goal.y}).`
    : "Keep going towards the star.";
  const problem = loopRequiredFeedback(run, goalLabel);

  if (input.stage === "build" || input.stage === "practise") {
    if (problem) {
      return { passed: false, feedback: problem, evidence, run };
    }
    return {
      passed: true,
      feedback: input.stage === "build"
        ? "You and the tutor built a loop that lands on the star."
        : "You used a loop on your own to reach the star.",
      evidence: input.stage === "practise" ? withEvidence(evidence, { practical: true }) : evidence,
      run,
    };
  }

  if (input.stage === "debug") {
    const stillWrongWay = input.program.blocks.some((block) =>
      block.kind === "repeat" && block.body.some((child) => child.kind === "move" && child.direction === "left"),
    );
    if (problem || stillWrongWay) {
      return {
        passed: false,
        feedback: stillWrongWay && !run.error
          ? "The repeat still moves left. The star is to the right. Change the move inside the loop."
          : problem ?? "The bug is still there.",
        evidence,
        run,
      };
    }
    return {
      passed: true,
      feedback: "You found the mistake and repaired the direction inside the loop.",
      evidence: withEvidence(evidence, { debugging: true }),
      run,
    };
  }

  if (problem) {
    return { passed: false, feedback: problem, evidence, run };
  }
  const independent = input.revealingHints === 0;
  return {
    passed: true,
    feedback: independent
      ? "You reached a new star with a loop and without a full answer from the tutor."
      : "You reached the star. The tutor showed a full answer, so restore the starter and try this star again without that answer before it counts as independent.",
    evidence: withEvidence(evidence, { independent: evidence.independent || independent }),
    run,
  };
}

export function codingCertificateCopy(input: {
  pathwayTitle: string;
  skills: string[];
}): { title: string; body: string } {
  const skills = input.skills.length ? input.skills.join("; ") : "the published coding skills";
  return {
    title: `${input.pathwayTitle} certificate`,
    body: `Completed the ${input.pathwayTitle} pathway and demonstrated: ${skills}. Mastery included a prediction, a practical task, debugging, an explanation, and an independent challenge.`,
  };
}

export function evidenceLabels(evidence: CodingEvidence): Array<{ id: keyof CodingEvidence; label: string; met: boolean }> {
  return [
    { id: "prediction", label: "Prediction", met: evidence.prediction },
    { id: "practical", label: "Practical task", met: evidence.practical },
    { id: "debugging", label: "Debugging", met: evidence.debugging },
    { id: "explanation", label: "Explanation", met: evidence.explanation },
    { id: "independent", label: "Independent challenge", met: evidence.independent },
  ];
}

export function freshEvidence(): CodingEvidence {
  return { ...EMPTY_EVIDENCE };
}
