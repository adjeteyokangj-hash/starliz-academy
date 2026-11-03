import { authorLesson, visual, scenario, eq, containsText, read, calc, branch, set, change } from "../authoring";
import { learningGameSchema } from "../game-engine";
import type { Json } from "../types";

type Brief = { title: string; finding: string; repair: string; button: string; fault: "label" | "size" | "keyboard" };
const briefs: Brief[] = [
  { title: "Trail practice", finding: "The tester cannot tell what Go will do", repair: "Change Go to Check answer", button: "Check answer", fault: "label" },
  { title: "Museum practice", finding: "The tester cannot read the small instructions", repair: "Increase the instruction text size to 24", button: "Check answer", fault: "size" },
  { title: "Garden practice", finding: "The tester cannot reach Check answer with Tab", repair: "Include Check answer in the keyboard Tab order", button: "Check answer", fault: "keyboard" },
];
const scoreProgram = { variables: { score: 0 }, handlers: { start: [set("score", 0)], answer: [change("score", 1)], restart: [] } };
function audienceGame(spec: Brief, faulty = false, emptyNotes = false) {
  return learningGameSchema.parse({ title: spec.title, learningGoal: "Practise choosing an answer and reading the resulting score", instructions: "Choose Check answer to practise, inspect your score, then restart to try again.", audience: "private", fontSize: faulty && spec.fault === "size" ? 12 : 24, program: scoreProgram,
    controls: [{ id: "check", label: faulty && spec.fault === "label" ? "Go" : spec.button, event: "answer", value: 0, keyboard: !(faulty && spec.fault === "keyboard") }, { id: "restart", label: "Restart game", event: "restart", value: 0, keyboard: true }],
    testNotes: emptyNotes ? "" : `${spec.finding}. ${spec.repair}. Retest: Check answer adds one point and Restart returns the score to zero. Test the repaired control using Tab and Enter in the preview.` });
}
function audienceCases(spec: Brief, index: number) {
  const checks = [eq("controls.0.label", spec.button, "The action has the meaningful Check answer label"), eq("controlsAccessible", true, "Every declared control is in the keyboard Tab order"), eq("readable", true, "Instructions have readable text size and useful text"), eq("privacySafe", true, "The learning game remains private"), containsText("testNotes", spec.finding, "The notes cite the actual supplied observation"), containsText("testNotes", spec.repair, "The notes explain the repair relevant to the observation")];
  return [scenario(`audience-${index}-use`, { finding: spec.finding, events: [{ type: "click", target: "check" }] }, ...checks, eq("variables.score", 1, "The repaired control still runs the actual scoring action")), scenario(`audience-${index}-retest`, { finding: spec.finding, events: [{ type: "click", target: "check" }, { type: "click", target: "restart" }] }, ...checks, eq("variables.score", 0, "The actual restart retest restores score zero"))];
}
const testing = authorLesson({ id: "Y4.23", workbench: "game", concepts: ["user testing", "observation", "usability", "retest"],
  explanation: "A useful user test observes what a known reader struggles to do. Our fictional trail tester cannot tell what Go will do. Repair that specific label to Check answer rather than changing an unrelated colour. Keep the project private. Record the observation, the relevant repair and what you will retest in the notes. Run the preview, use Check answer to add one point, then Restart to return to zero. Use Tab to reach both controls and Enter to activate them. The executable checks verify the declared labels, text settings and actual program results; your own keyboard test and later browser verification are separate evidence. New tasks supply different observations, so choose the repair that addresses each one.",
  reasoning: ["A clear label addresses the observed uncertainty. A larger picture would not explain what the Go action means.", "A repair can accidentally break an action. Repeating the answer and restart sequence verifies that the control still changes the actual score correctly."],
  starter: visual(audienceGame(briefs[0]!, true, true)), reference: visual(audienceGame(briefs[0]!)), faulty: visual(audienceGame(briefs[0]!, true)), cases: audienceCases(briefs[0]!, 0),
  transfer: briefs.slice(1).map((spec, index) => ({ task: `Test ${spec.title}. Observation: ${spec.finding}. Apply this relevant repair: ${spec.repair}. Record observation and repair, keep the audience private, then verify scoring, restart, readable instructions and keyboard access.`, starter: visual(audienceGame(spec, true, true)), reference: visual(audienceGame(spec)), cases: audienceCases(spec, index + 1) })),
  prediction: { prompt: "A tester cannot understand the Go label. Which change addresses that finding?", choices: ["Change an unrelated background colour", "Rename the action Check answer and retest it", "Remove all instructions"], correct: 1 },
});

const quizSpecs = [
  { title: "Find the supplied target number", goal: "Match your answer to the supplied target number", values: [2, 3] },
  { title: "Find the supplied tile count", goal: "Match your answer to the supplied tile count", values: [4, 5] },
  { title: "Find the supplied robot distance", goal: "Match your answer to the supplied robot distance", values: [6, 7] },
];
function quiz(spec: typeof quizSpecs[number], faulty = false, starter = false) {
  const answer = branch(calc("equal", read("accepting"), true), [branch(calc("equal", read("event"), read("world.target")), [change("score", 1), set("feedback", "Correct: your answer matches the supplied target.")], [set("feedback", "Not yet: compare your answer with the supplied target.")]), set("accepting", false)]);
  return learningGameSchema.parse({ title: spec.title, learningGoal: spec.goal, instructions: "Read target in Starting data. Choose the matching answer button, inspect feedback, then restart for a new attempt.", audience: "private", fontSize: 24,
    program: { variables: { score: 0, accepting: true, feedback: "Choose the target number." }, handlers: { start: [set("score", 0), set("accepting", true), set("feedback", "Choose the target number.")], answer: starter ? [] : [answer], restart: [] } },
    controls: [...spec.values.map((value, index) => ({ id: `answer${index + 1}`, label: `Choose ${value}`, event: "answer", value, keyboard: !(faulty && index === 0) })), { id: "restart", label: "Restart game", event: "restart", value: 0, keyboard: true }],
    testNotes: starter ? "" : "Finding: the first answer control could not be reached using Tab. Repair: include every control in the keyboard Tab order. Retest the correct answer, wrong answer, repeated input and restart. Correct earns one point; wrong earns zero; repeated input cannot earn extra points; restart clears score and feedback. Use Tab and Enter in the playable preview." });
}
function quizCases(spec: typeof quizSpecs[number], index: number) {
  const checks = [eq("controlsAccessible", true, "All answers and restart support keyboard focus"), eq("readable", true, "The actual instructions meet the readable settings"), eq("audience", "private", "The game uses private sharing"), eq("privacySafe", true, "No detected identifying details appear"), eq("learningGoal", spec.goal, "The stated learning goal matches the supplied brief"), containsText("testNotes", "keyboard Tab order", "The notes identify the accessibility repair"), containsText("testNotes", "repeated input", "The notes document repeat-input testing")];
  return spec.values.flatMap((target, choice) => {
    const input = (targets: string[]) => ({ world: { target }, events: targets.map((target) => ({ type: "click", target })) }) as Json;
    return [scenario(`quiz-${index}-${choice}-correct`, input([`answer${choice + 1}`, `answer${choice + 1}`]), ...checks, eq("variables.score", 1, "A correct answer earns one point without repeated-input inflation"), eq("variables.accepting", false, "The completed attempt closes answer input"), containsText("variables.feedback", "Correct:", "Actual feedback explains the successful target match")), scenario(`quiz-${index}-${choice}-wrong`, input([`answer${2 - choice}`]), ...checks, eq("variables.score", 0, "The wrong answer does not earn a point"), containsText("variables.feedback", "Not yet:", "The actual incorrect-answer feedback prompts comparison")), scenario(`quiz-${index}-${choice}-restart`, input([`answer${choice + 1}`, "restart"]), ...checks, eq("variables.score", 0, "Restart clears the score"), eq("variables.accepting", true, "Restart opens a new attempt"))];
  });
}
const project = authorLesson({ id: "Y4.24", workbench: "game", concepts: ["learning goal", "accessible controls", "private sharing", "test evidence"],
  explanation: "Deliver a working number-matching learning game. The supplied game target is two or three. Read world.target in the visual program. Answer controls send their numeric value to the answer event. Compare event with target: a correct choice adds one to score and gives Correct feedback; a wrong choice keeps zero and gives Not yet feedback. Close accepting after the first choice so repeated inputs cannot inflate the score. Restart must clear score and open another attempt. Keep a clear learning goal, readable instructions, private sharing and every button in the keyboard Tab order. Record the observed keyboard fault, its repair and your correct, wrong, repeat-input and restart tests. Run both target values rather than memorising that the first button is always right. Save, retrieve and replay your independent game version.",
  reasoning: ["Comparing event with the supplied target makes the rule work for either target. Always crediting the first answer would fail the changed-target case.", "An accepting flag closes a completed attempt. Restart runs start again, clearing score, feedback and the flag for a fresh play."],
  starter: visual(quiz(quizSpecs[0]!, true, true)), reference: visual(quiz(quizSpecs[0]!)), faulty: visual(quiz(quizSpecs[0]!, true)), cases: quizCases(quizSpecs[0]!, 0),
  transfer: quizSpecs.slice(1).map((spec, index) => ({ task: `Build ${spec.title}. Compare the numeric answer event with supplied target ${spec.values.join(" or ")}; award one point only for the first correct input, give helpful feedback for either result and reset cleanly. Repair keyboard access, document the repeat-input and other tests, keep sharing private, then save, retrieve and replay this game.`, starter: visual(quiz(spec, true, true)), reference: visual(quiz(spec)), cases: quizCases(spec, index + 1) })),
  workflow: { saveAndReplay: true, restoreVersion: true },
  prediction: { prompt: "Why compare the answer event with target instead of always rewarding the first button?", choices: ["The supplied target can change", "Keyboard controls cannot send values", "Every answer should always receive a point"], correct: 0 },
});
export const audienceGameActivities = [testing, project];
export const audienceGameTools = { audienceGame, audienceCases, quiz, quizCases };
