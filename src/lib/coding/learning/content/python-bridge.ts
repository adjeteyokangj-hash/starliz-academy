import { authorLesson, python, visual, scenario, eq, change, set, read, calc } from "../authoring";
import type { PracticalCase } from "../types";

const code = (source: string) => python(source, "variables");
function scoreCase(id: string, start: number, final: number, extra: ReturnType<typeof eq>[] = []): PracticalCase {
  return scenario(id, { variables: { score: start } }, eq("variables.score", final, "The score is updated from the supplied starting value"),
    eq("trace.0.variables.score", start, "The first trace frame contains the actual starting score"), eq("stdout", String(final), "The actual printed output matches the final score"), ...extra);
}
function dual(source: string, commands: unknown[]) {
  return visual({ dual: { visual: { variables: {}, handlers: { start: commands } }, python: code(source) } });
}
const scoreBlocks = (bonus: number, factor: number) => [change("score", bonus), set("score", calc("multiply", read("score"), factor)), { op: "say", value: read("score") }];
const scoreText = (bonus: number, factor: number) => `score = score + ${bonus}\nscore = score * ${factor}\nprint(score)`;
function dualCase(id: string, start: number, final: number, restart = false) {
  return scenario(id, { variables: { score: start }, restart }, eq("equivalent", true, "The visual and Python programs produce the same values and output"),
    eq("visual.variables.score", final, "The visual scoring rule is correct"), eq("python.variables.score", final, "The Python scoring rule is correct"),
    eq("python.stdout", String(final), "The interpreter prints the expected score"), eq("resetChecked", restart, "The requested fresh or restarted play was tested"));
}

const first = authorLesson({ id: "Y5.01", concepts: ["variable", "update"],
  explanation: "A variable is a name attached to a value that can change while a program runs. This workspace supplies a starting score in the Starting data panel. In Python, score = score + 2 reads the old score on the right, adds two, then stores the result under score on the left. It does not mean that a number equals itself plus two. The trace records the values before each real Python line; print(score) shows the value after the update.",
  reasoning: ["With starting score 3, the right side calculates 3 + 2. Assignment stores 5, which is then printed.", "With starting score 7, the same statement stores 9. Setting score = 2 would replace the input instead of adding a bonus."],
  starter: code("print(score)"), reference: code("score = score + 2\nprint(score)"), faulty: code("score = 2\nprint(score)"),
  cases: [scoreCase("usual-score", 3, 5), scoreCase("changed-start", 7, 9)],
  transfer: [
    { task: "Update the supplied score by adding 4, then print it. Your program must work for different starting scores; do not replace score with a fixed answer.", reference: code("score = score + 4\nprint(score)"), cases: [scoreCase("bonus-four", 2, 6), scoreCase("bonus-four-changed", 8, 12)] },
    { task: "Deduct 1 from the supplied score, store the updated score, then print it. Trace the old value before the assignment.", reference: code("score = score - 1\nprint(score)"), cases: [scoreCase("deduction", 5, 4), scoreCase("deduction-changed", 10, 9)] },
  ], prediction: { prompt: "The supplied score is 3. After score = score + 2, what does print(score) display?", choices: ["2", "3", "5"], correct: 2 },
  misconception: "Assignment replaces the stored value. To increase an existing score, the right side must use its old value." });

function expressionCase(id: string, number: number, text: string, total: number) {
  return scenario(id, { variables: { number } }, eq("variables.text", text, "The text expression joins characters"), eq("variables.total", total, "The numeric expression adds numbers"), eq("stdout", `${text}\n${total}`, "Both expressions produce the correct actual output"));
}
const second = authorLesson({ id: "Y5.02", concepts: ["type", "expression"],
  explanation: "Python treats the number 3 and the text '3' as different types of value. Adding numbers calculates a total; joining text keeps the characters in order. str(number) makes a text version of a number. In this example, str(number) + '2' joins a final digit, while number + 2 adds a bonus. Trying to add a number directly to text raises a real TypeError. Read the error, identify the two types, and choose the operation that fits your purpose.",
  reasoning: ["When number is 3, the text expression gives '32' and the numeric expression gives 5. Quotation marks in source show text, not addition.", "Change the supplied number to 8. The same program should give '82' and 10, so a fixed pair of outputs is not a general solution."],
  starter: code("text = str(number)\ntotal = number\nprint(text)\nprint(total)"), reference: code("text = str(number) + '2'\ntotal = number + 2\nprint(text)\nprint(total)"), faulty: code("text = number + '2'\ntotal = number + 2\nprint(text)\nprint(total)"),
  cases: [expressionCase("three", 3, "32", 5), expressionCase("eight", 8, "82", 10)],
  transfer: [
    { task: "Create text by joining the supplied number with the digit '4'. Separately add the number 4 to make total. Print text and then total.", reference: code("text = str(number) + '4'\ntotal = number + 4\nprint(text)\nprint(total)"), cases: [expressionCase("join-four", 2, "24", 6), expressionCase("join-four-changed", 9, "94", 13)] },
    { task: "Create text by putting '7' before the supplied number. Separately subtract 1 from number to make total. Print text and then total.", reference: code("text = '7' + str(number)\ntotal = number - 1\nprint(text)\nprint(total)"), cases: [expressionCase("prefix", 2, "72", 1), expressionCase("prefix-changed", 6, "76", 5)] },
  ], prediction: { prompt: "With number = 3, what do the text expression and numeric expression print, in order?", choices: ["5, then 5", "32, then 5", "32, then 32"], correct: 1 },
  misconception: "Text digits do not become a numeric sum unless you deliberately convert and add numbers." });

const third = authorLesson({ id: "Y5.03", concepts: ["sequence", "translation"], workbench: "dual",
  explanation: "Visual blocks and Python can describe the same sequence. A change score by 2 block becomes score = score + 2. Multiplying the updated score by 3 becomes score = score * 3. The order matters: adding before multiplying produces a different result from multiplying before adding. Both views here receive the same supplied starting score. Edit each representation yourself, run both, then compare their actual values and printed output.",
  reasoning: ["Starting at 3, the change block makes 5 and the multiplication makes 15. The Python statements must perform those same two steps.", "Starting at 7, the corresponding values are 9 and 27. A translation that multiplies first produces a different trace."],
  starter: dual("print(score)", []), reference: dual(scoreText(2, 3), scoreBlocks(2, 3)), faulty: dual("score = score * 3\nscore = score + 2\nprint(score)", scoreBlocks(2, 3)),
  cases: [dualCase("same-sequence", 3, 15), dualCase("changed-start", 7, 27)],
  transfer: [
    { task: "Translate a new rule in both views: add 1 to score, multiply the updated value by 2, then display it. Preserve the order.", reference: dual(scoreText(1, 2), scoreBlocks(1, 2)), cases: [dualCase("new-order", 4, 10), dualCase("new-order-changed", 9, 20)] },
    { task: "Translate a different rule in both views: add 4 to score, multiply by 2, then display it. Both programs must respond to a changed starting score.", reference: dual(scoreText(4, 2), scoreBlocks(4, 2)), cases: [dualCase("larger-bonus", 2, 12), dualCase("larger-bonus-changed", 6, 20)] },
  ], prediction: { prompt: "Starting at 3, both views add 2 and then multiply by 3. What do both display?", choices: ["11", "15", "27"], correct: 1 },
  misconception: "A correct set of statements in the wrong order is not an equivalent translation." });

function starsCase(id: string, bonus: number, result: number) {
  return scenario(id, { variables: { bonus } }, eq("variables.stars", result, "The two-step stars program uses the supplied bonus"), eq("stdout", String(result), "Real Python prints the correct star count"));
}
const fourth = authorLesson({ id: "Y5.04", concepts: ["syntax", "program"],
  explanation: "Write Python as a sequence of statements, one per line. stars = 2 creates your starting value, and stars = stars + bonus updates it using the supplied bonus. print(stars) displays the result. Python needs matching parentheses and exact names: a missing closing parenthesis prevents the program from running at all. An error is useful evidence, not a mark to hide. Repair its cause, rerun, then compare the actual output with your plan.",
  reasoning: ["The first statement creates 2 stars; the second adds the input bonus. A bonus of 1 gives 3, while a bonus of 4 gives 6.", "If print(stars is incomplete, fix its closing parenthesis. Do not replace the program with a fixed printed answer."],
  starter: code("stars = 2\nprint(stars)"), reference: code("stars = 2\nstars = stars + bonus\nprint(stars)"), faulty: code("stars = 2\nstars = stars + bonus\nprint(stars"), cases: [starsCase("small-bonus", 1, 3), starsCase("large-bonus", 4, 6)],
  transfer: [
    { task: "Write a program that creates 4 stars, adds the supplied bonus, and prints the new count. Use a stored stars value.", reference: code("stars = 4\nstars = stars + bonus\nprint(stars)"), cases: [starsCase("four-start", 2, 6), starsCase("four-start-changed", 5, 9)] },
    { task: "Write a program that creates 3 stars, adds twice the supplied bonus, and prints the updated stars value.", reference: code("stars = 3\nstars = stars + 2 * bonus\nprint(stars)"), cases: [starsCase("double-bonus", 2, 7), starsCase("double-bonus-changed", 5, 13)] },
  ], prediction: { prompt: "The demonstration creates 2 stars and adds bonus = 1. What does it print?", choices: ["1", "2", "3"], correct: 2 },
  misconception: "Python must parse valid syntax before any statements execute; a syntax error is different from a wrong numeric answer." });

const traceText = (bonus: number, factor: number) => `before = score\nscore = score + ${bonus}\nafter = score\nscore = score * ${factor}\nprint(before)\nprint(after)\nprint(score)`;
function traceCase(id: string, start: number, after: number, final: number) {
  return scenario(id, { variables: { score: start } }, eq("variables.before", start, "The before snapshot preserves the initial value"), eq("variables.after", after, "The after snapshot contains the value after addition"), eq("variables.score", final, "The later multiplication updates score without rewriting earlier snapshots"),
    eq("trace.0.variables.score", start, "The trace begins before the first statement"), eq("trace.2.variables.score", after, "The trace records the updated value before the third statement"), eq("stdout", `${start}\n${after}\n${final}`, "The three printed snapshots appear in their actual order"));
}
const fifth = authorLesson({ id: "Y5.05", concepts: ["trace", "assignment"],
  explanation: "A trace records the state as each statement runs. Before an assignment, its right side still sees the old value. Here before = score saves the initial number, score = score + 3 changes score, and after = score saves that new number. A later multiplication changes score again; it does not go back and change before or after. The real interpreter trace shows values before each numbered line, so read the next frame to see an assignment's effect.",
  reasoning: ["With score starting at 2, before is 2, after the addition is 5, and the final score is 10. The three printed values are different snapshots.", "With score starting at 6, the snapshots are 6, 9 and 18. Copying score only after its update would lose the initial value."],
  starter: code("before = score\nafter = score\nprint(score)"), reference: code(traceText(3, 2)), faulty: code("score = score + 3\nbefore = score\nafter = score\nscore = score * 2\nprint(before)\nprint(after)\nprint(score)"),
  cases: [traceCase("first-trace", 2, 5, 10), traceCase("changed-trace", 6, 9, 18)],
  transfer: [
    { task: "Save the initial score as before, add 2, save that result as after, then multiply score by 3. Print before, after and score in that order.", reference: code(traceText(2, 3)), cases: [traceCase("new-snapshots", 4, 6, 18), traceCase("new-snapshots-changed", 9, 11, 33)] },
    { task: "Save before, add 1 to score, save after, then multiply score by 4. Print all three snapshots without replacing the earlier saved values.", reference: code(traceText(1, 4)), cases: [traceCase("four-times", 3, 4, 16), traceCase("four-times-changed", 7, 8, 32)] },
  ], prediction: { prompt: "Starting at 2, save before, add 3, save after, then multiply score by 2. Which three values print?", choices: ["5, 5, 10", "2, 5, 10", "2, 10, 10"], correct: 1 },
  misconception: "A trace frame belongs to a particular moment. Do not use a value from a later assignment to explain an earlier frame." });

const sixth = authorLesson({ id: "Y5.06", concepts: ["equivalent", "reset"], workbench: "dual",
  explanation: "Build a score program in two representations and prove that they agree. The rule is: take the supplied starting score, add 2, multiply the updated value by 2, then display it. Keep both programs editable; one view is not a picture of the other. Test a fresh play and a restarted play. Restart must restore the original starting score before applying the rule, rather than giving a second bonus to the old result. Save a working version before changing your design.",
  reasoning: ["Starting at 3, both programs should calculate 10. A second fresh or restarted play should still give 10, not continue from 10.", "For a different starting score of 8, the correct result is 20. Agreement alone is insufficient if both views implement the wrong rule; the expected result must also pass."],
  starter: dual("print(score)", []), reference: dual(scoreText(2, 2), scoreBlocks(2, 2)), faulty: dual("score = score + 2\nscore = score + 2\nscore = score * 2\nprint(score)", scoreBlocks(2, 2)),
  cases: [dualCase("fresh-play", 3, 10), dualCase("restarted-play", 8, 20, true)],
  transfer: [
    { task: "Create both representations of a new rule: add 3 to the starting score, multiply by 2, and display it. Test both a fresh play and Restart.", reference: dual(scoreText(3, 2), scoreBlocks(3, 2)), cases: [dualCase("new-rule-fresh", 4, 14), dualCase("new-rule-restart", 9, 24, true)] },
    { task: "Create a different dual-view rule: add 1, multiply by 3, and display the score. Both views must reset to their supplied starting value before each play.", reference: dual(scoreText(1, 3), scoreBlocks(1, 3)), cases: [dualCase("triple-fresh", 2, 9), dualCase("triple-restart", 7, 24, true)] },
  ], prediction: { prompt: "The starting score is 3. Both views add 2 and multiply by 2. What should a fresh play display?", choices: ["7", "10", "14"], correct: 1 },
  misconception: "Equivalent programs must implement the requested scoring rule, and Restart must reset their input state rather than reuse the previous result." });

export const pythonBridgeActivities = [first, second, third, fourth, fifth, sixth];
export const pythonBridgeTools = { dual, dualCase, scoreText, scoreBlocks };
