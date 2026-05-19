import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCoachSupportMessage,
  buildFinalRevealMessage,
  buildProgressiveSupportMessage,
  buildQuestionFormulaScaffold,
  buildTutorPanelPrompt,
  buildWorkedSuccessMessage,
  classifyQuestionIntent,
  computeAttemptWeightedScore,
  scoreForResolvedQuestion,
  type QuestionAttemptSummary,
} from "../src/lib/starliz-question-formula";

test("scoreForResolvedQuestion weights attempts", () => {
  assert.equal(scoreForResolvedQuestion(1, true), 100);
  assert.equal(scoreForResolvedQuestion(2, true), 70);
  assert.equal(scoreForResolvedQuestion(3, true), 50);
  assert.equal(scoreForResolvedQuestion(3, false), 0);
});

test("computeAttemptWeightedScore averages resolved question scores", () => {
  const progress: Record<string, QuestionAttemptSummary> = {
    q1: { attempts: 1, outcome: "correct", score: 100, usedHints: false },
    q2: { attempts: 2, outcome: "correct", score: 70, usedHints: true },
    q3: { attempts: 3, outcome: "final_wrong", score: 0, usedHints: true },
  };

  assert.equal(computeAttemptWeightedScore(progress), 57);
});

test("buildTutorPanelPrompt only mentions microphone when it is visible", () => {
  assert.equal(
    buildTutorPanelPrompt({ voiceEnabled: false, microphoneVisible: false, hasAnswerOptions: true }),
    "Need help? Click Coach me to break the question down.",
  );
  assert.equal(
    buildTutorPanelPrompt({ voiceEnabled: false, microphoneVisible: false, feedbackMode: "continue", correctAnswerVisible: true }),
    "Great work. Read the explanation, then click Continue for the next question.",
  );
  assert.equal(
    buildTutorPanelPrompt({ voiceEnabled: false, microphoneVisible: false, feedbackMode: "retry" }),
    "Try the steps again. Use the hint and have another go.",
  );
  assert.equal(
    buildTutorPanelPrompt({ voiceEnabled: true, microphoneVisible: true, speechListening: false }),
    "Tap the microphone and say your answer.",
  );
});

test("coach support message guides without revealing the answer", () => {
  const message = buildCoachSupportMessage({
    section: "math",
    item: {
      prompt: "What happens to the total resistance in a parallel circuit if one resistor is removed?",
      skillFocus: "circuits",
    },
    prompt: "What happens to the total resistance in a parallel circuit if one resistor is removed?",
  });

  assert.ok(message.includes("key words".toLowerCase()) || message.includes("Key words"));
  assert.ok(message.includes("compare what is happening before and after") || message.includes("Compare what is happening before and after"));
  assert.ok(!message.includes("The total resistance increases"));
});

test("science parallel circuit explanation is concept-led", () => {
  const explanation = buildFinalRevealMessage({
    section: "math",
    item: {
      prompt: "What happens to the total resistance in a parallel circuit if one resistor is removed?",
    },
    prompt: "What happens to the total resistance in a parallel circuit if one resistor is removed?",
    expected: "The total resistance increases.",
  });

  assert.ok(explanation.includes("The correct answer is The total resistance increases."));
  assert.ok(explanation.includes("fewer paths"));
});

test("science circuit questions get scaffolded visual, key information, and hint", () => {
  const scaffold = buildQuestionFormulaScaffold({
    item: {
      prompt: "A circuit has a 12V battery and a 4 ohm resistor. Calculate the current flowing through the circuit.",
      skillFocus: "Ohm's Law",
    },
    section: "math",
    subjectLabel: "Science",
  });

  assert.equal(scaffold.learningFocus, "Let's practise using Ohm's Law. Look for the voltage and the resistance.");
  assert.deepEqual(scaffold.keyInformation, ["Voltage = 12V", "Resistance = 4Ω", "Find: Current = ?"]);
  assert.equal(scaffold.hint, "Use Ohm's Law: Current = Voltage ÷ Resistance");
  assert.equal(scaffold.unitLabel, "A");
  assert.ok(scaffold.visual);
  assert.ok(scaffold.visual?.body.join(" ").includes("12V Battery"));
});

test("circuit wrong-answer flow stays progressive before final reveal", () => {
  const firstHint = buildProgressiveSupportMessage({
    section: "math",
    item: {
      prompt: "A circuit has a 12V battery and a 4Ω resistor. Calculate the current flowing through the circuit.",
    },
    prompt: "A circuit has a 12V battery and a 4Ω resistor. Calculate the current flowing through the circuit.",
    expected: "3A",
    attempt: 1,
    inReviewRound: false,
  });
  const secondHint = buildProgressiveSupportMessage({
    section: "math",
    item: {
      prompt: "A circuit has a 12V battery and a 4Ω resistor. Calculate the current flowing through the circuit.",
    },
    prompt: "A circuit has a 12V battery and a 4Ω resistor. Calculate the current flowing through the circuit.",
    expected: "3A",
    attempt: 2,
    inReviewRound: false,
  });
  const finalReveal = buildFinalRevealMessage({
    section: "math",
    item: {
      prompt: "A circuit has a 12V battery and a 4Ω resistor. Calculate the current flowing through the circuit.",
    },
    prompt: "A circuit has a 12V battery and a 4Ω resistor. Calculate the current flowing through the circuit.",
    expected: "3A",
  });

  assert.ok(!firstHint.includes("The correct answer is 3A"));
  assert.ok(!secondHint.includes("The correct answer is 3A"));
  assert.ok(secondHint.includes("Current = 12 ÷ 4"));
  assert.ok(finalReveal.includes("The correct answer is 3A."));
});

test("circuit correct-answer flow includes worked explanation", () => {
  const explanation = buildWorkedSuccessMessage({
    section: "math",
    item: {
      prompt: "A circuit has a 12V battery and a 4Ω resistor. Calculate the current flowing through the circuit.",
    },
    prompt: "A circuit has a 12V battery and a 4Ω resistor. Calculate the current flowing through the circuit.",
    expected: "3A",
  });

  assert.ok(explanation.includes("Great! The answer is 3A."));
  assert.ok(explanation.includes("Current = Voltage ÷ Resistance"));
  assert.ok(explanation.includes("12 ÷ 4 = 3"));
});

// ── Additional formula coverage ───────────────────────────────────────────────

test("final failed answer includes 'The correct answer is' and worked explanation", () => {
  const reveal = buildFinalRevealMessage({
    section: "math",
    item: {
      prompt: "A circuit has a 12V battery and a 4Ω resistor. Calculate the current flowing through the circuit.",
    },
    prompt: "A circuit has a 12V battery and a 4Ω resistor. Calculate the current flowing through the circuit.",
    expected: "3A",
  });

  assert.ok(reveal.includes("The correct answer is 3A."), "Must state correct answer on final fail");
  assert.ok(
    reveal.includes("Current = Voltage ÷ Resistance"),
    "Must include worked explanation on final fail",
  );
});

test("correct answer always shows an explanation after submission", () => {
  const successMsg = buildWorkedSuccessMessage({
    section: "spelling",
    item: { word: "light" },
    prompt: "light",
    expected: "light",
  });

  assert.ok(
    successMsg.includes("Great!") && successMsg.includes("light"),
    "Correct answer must include confirmation and the word",
  );
  assert.ok(
    successMsg.length > 20,
    "Worked success message must include meaningful explanation",
  );
});

test("microphone prompt is absent when mic is unavailable", () => {
  const promptNoMic = buildTutorPanelPrompt({ voiceEnabled: false, microphoneVisible: false });
  assert.ok(
    !promptNoMic.toLowerCase().includes("microphone"),
    "Must not mention microphone when mic is not visible",
  );

  const promptMicHidden = buildTutorPanelPrompt({ voiceEnabled: true, microphoneVisible: false });
  assert.ok(
    !promptMicHidden.toLowerCase().includes("microphone"),
    "Must not mention microphone when mic is enabled but not visible",
  );
});

test("attempt-weighted score is calculated correctly across mixed results", () => {
  const progress: Record<string, QuestionAttemptSummary> = {
    q1: { attempts: 1, outcome: "correct", score: 100, usedHints: false },
    q2: { attempts: 1, outcome: "correct", score: 100, usedHints: false },
    q3: { attempts: 2, outcome: "correct", score: 70, usedHints: true },
    q4: { attempts: 3, outcome: "final_wrong", score: 0, usedHints: true },
  };
  // (100 + 100 + 70 + 0) / 4 = 67.5 → rounds to 68
  assert.equal(computeAttemptWeightedScore(progress), 68);
});

test("science Ohm's Law visual scaffold is present and correct", () => {
  const scaffold = buildQuestionFormulaScaffold({
    item: {
      prompt: "A circuit has a 9V battery and a 3Ω resistor. Find the current.",
      skillFocus: "Ohm's Law",
    },
    section: "math",
    subjectLabel: "Science",
  });

  assert.ok(scaffold.visual, "Science circuit question must include a visual scaffold");
  assert.equal(scaffold.visual?.type, "diagram");
  assert.ok(
    scaffold.visual?.body.some((line) => line.includes("9V")),
    "Diagram body must reference the voltage value",
  );
  assert.ok(scaffold.hint, "Ohm's Law question must include a hint");
  assert.ok(
    scaffold.hint?.includes("Current = Voltage ÷ Resistance"),
    "Hint must name Ohm's Law formula",
  );
});

test("progressive support messages do not reveal answer before final attempt", () => {
  const attempt1 = buildProgressiveSupportMessage({
    section: "math",
    item: { prompt: "A circuit has a 6V battery and a 2Ω resistor. Calculate the current." },
    prompt: "A circuit has a 6V battery and a 2Ω resistor. Calculate the current.",
    expected: "3A",
    attempt: 1,
    inReviewRound: false,
  });

  const attempt2 = buildProgressiveSupportMessage({
    section: "math",
    item: { prompt: "A circuit has a 6V battery and a 2Ω resistor. Calculate the current." },
    prompt: "A circuit has a 6V battery and a 2Ω resistor. Calculate the current.",
    expected: "3A",
    attempt: 2,
    inReviewRound: false,
  });

  assert.ok(!attempt1.includes("3A"), "Attempt 1 hint must not reveal the answer");
  assert.ok(!attempt2.includes("The correct answer is 3A"), "Attempt 2 hint must not use reveal phrasing");
  assert.ok(attempt2.includes("6 ÷ 2"), "Attempt 2 hint should show worked calculation steps");
});

test("series resistance coaching gives additive formula steps", () => {
  const coach = buildCoachSupportMessage({
    section: "math",
    item: {
      prompt: "In a series circuit, the resistors are 3 ohms and 5 ohms. Find the total resistance.",
    },
    prompt: "In a series circuit, the resistors are 3 ohms and 5 ohms. Find the total resistance.",
  });

  assert.ok(coach.includes("series circuit"));
  assert.ok(coach.includes("R_total = 3 + 5"));
  assert.ok(!coach.includes("Compare what is happening before and after"));
});

test("question intent classification detects formula application", () => {
  const intent = classifyQuestionIntent({
    section: "math",
    item: {
      prompt: "In a series circuit, the resistors are 3 ohms and 5 ohms. Find the total resistance.",
    },
    prompt: "In a series circuit, the resistors are 3 ohms and 5 ohms. Find the total resistance.",
  });

  assert.equal(intent, "formula_application");
});
