import { authorLesson, visual, scenario, eq, containsText } from "../authoring";
import { engineeringDocumentSchema } from "../engineering-contract";
import type { Json } from "../types";

const briefs = [
  { title: "Material", factor: 3, author: "Fictional Maple contributor", note: "The centimetre conversion multiplies by 100; restore v1 so it divides by 100." },
  { title: "Ribbon", factor: 4, author: "Fictional River contributor", note: "The ribbon conversion multiplies by 100; restore v1 so it divides by 100." },
  { title: "Border", factor: 5, author: "Fictional Meadow contributor", note: "The border conversion multiplies by 100; restore v1 so it divides by 100." },
];
function files(factor: number, broken = false) { return { "calculator.py": `def solve(data):\n    return data['cm'] ${broken ? "*" : "/"} 100 * ${factor}` }; }
function history(spec: typeof briefs[number]) { return [{ id: "v1", author: spec.author, files: files(spec.factor) }, { id: "v2", author: "Fictional mistaken edit", files: files(spec.factor, true) }]; }
function document(spec: typeof briefs[number], wrong = false, empty = false) {
  return visual(engineeringDocumentSchema.parse({ purpose: `${spec.title} calculator recovery`, audience: "Private fictional review team", language: "python", files: files(spec.factor, true), versions: history(spec), selectedVersion: wrong ? "v2" : "v1",
    actions: empty ? [] : [{ op: "restore", target: wrong ? "v2" : "v1", content: "", author: "Fictional editor" }, { op: "snapshot", target: "v3", content: "", author: "Fictional editor" }],
    tasks: [], permissions: { editors: ["owner", "editor"], viewers: ["owner", "editor", "viewer"] }, tests: [{ name: "125 cm conversion", input: { cm: 125 }, expected: 1.25 * spec.factor }, { name: "zero remains zero", input: { cm: 0 }, expected: 0 }], run: true, entryFile: "calculator.py", notes: spec.note, sources: [], handover: { setup: "", test: "", rollback: "", limitation: "", nextLearning: "" } }));
}
function cases(spec: typeof briefs[number], index: number) {
  return [125, 240].map((cm, position) => scenario(`recover-calculator-${index}-${position}`, { role: "editor", claimedRole: "owner", initialFiles: files(spec.factor, true), initialVersions: history(spec), expectedVersion: "v1", input: { cm } } as Json,
    eq("restoredCorrectVersion", true, "The actual current files come from the selected correct version"), eq("files", files(spec.factor), "The restored source divides centimetres by one hundred"), eq("historyCount", 3, "The recovery is saved as a third revision without removing either earlier revision"),
    eq("history.0.author", spec.author, "The original contributor remains attributed"), eq("history.1.files", files(spec.factor, true), "The mistaken revision remains available for investigation"), eq("history.2.author", "Fictional editor", "The recovery snapshot records its contributor"), eq("originalPreserved", true, "Original history records remain unchanged"),
    eq("execution.result", cm / 100 * spec.factor, "The restored source executes correctly with the supplied independent input"), eq("allTestsPass", true, "Actual normal and zero tests pass after recovery"), containsText("notes", spec.note, "The review identifies the code-level cause and a concrete repair without blaming the contributor"), eq("privacySafe", true, "The practice files remain restricted to named private roles")));
}
const recovery = authorLesson({ id: "Y6.22", workbench: "engineering", concepts: ["version history", "restore", "attribution", "review"],
  explanation: "Recover a working calculator in an actual private practice file history. The supplied v1 divides centimetres by one hundred, while the later v2 mistakenly multiplies. Inspect both source revisions, select v1, queue Restore v1, then Snapshot v3 attributed to Fictional editor. Preserve the original contributor and both earlier revisions. Enable execution and test 125 cm plus zero using the displayed expected results. The review note should identify the conversion operation and specific repair: The centimetre conversion multiplies by 100; restore v1 so it divides by 100. This bounded feedback example addresses the work without blaming its author. Inspect the actual resulting source, third snapshot and executed tests. These fictional team roles and private files are practice data; they do not grant access to another child's live projects.",
  reasoning: ["The newest revision is not necessarily correct. Run the different conversion on 125 cm to distinguish v1 from v2 before restoring.", "Deleting v2 would lose useful investigation evidence. A new recovery snapshot retains both the original contribution and the later mistake."],
  starter: document(briefs[0]!, false, true), reference: document(briefs[0]!), faulty: document(briefs[0]!, true), cases: cases(briefs[0]!, 0),
  transfer: briefs.slice(1).map((spec, index) => ({ task: `Recover the ${spec.title} calculator using its actual supplied history. Select and restore v1, snapshot v3 as Fictional editor, retain both earlier revisions and ${spec.author}'s attribution. Run normal and zero tests. Record this specific respectful review: ${spec.note}`, starter: document(spec, false, true), reference: document(spec), cases: cases(spec, index + 1) })),
  prediction: { prompt: "A later edit breaks the conversion. Which recovery preserves useful evidence?", choices: ["Erase the whole history", "Restore the verified earlier source and save a new attributed revision", "Change the original author's name"], correct: 1 },
});
export const calculatorRecoveryActivities = [recovery];
