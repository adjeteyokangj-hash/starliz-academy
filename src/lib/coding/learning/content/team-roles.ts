import { authorLesson, visual, scenario, eq, range } from "../authoring";
import { engineeringDocumentSchema } from "../engineering-contract";
import type { Json } from "../types";

const teams = [
  { file: "guide.txt", original: "Choose a trail picture.", revised: "Choose a trail picture, then press Check.", title: "Trail learning team" },
  { file: "museum.txt", original: "Choose a museum object.", revised: "Choose a museum object, then press Check.", title: "Museum learning team" },
  { file: "garden.txt", original: "Choose a garden tool.", revised: "Choose a garden tool, then press Check.", title: "Garden learning team" },
];
function document(team: typeof teams[number], unsafe = false, empty = false) {
  return engineeringDocumentSchema.parse({ purpose: `Improve the instructions for ${team.title}`, audience: "Private fictional team", language: "javascript", files: { [team.file]: team.original }, versions: [], selectedVersion: "v1",
    actions: empty ? [] : [{ op: "edit", target: team.file, content: team.revised, author: "Fictional editor" }, { op: "snapshot", target: "v2", content: "", author: "Fictional editor" }], tasks: [],
    permissions: { editors: unsafe ? ["owner", "editor", "viewer"] : ["owner", "editor"], viewers: ["owner", "editor", "viewer"] }, tests: [], run: false, entryFile: team.file,
    notes: "The viewer can read the private guide; only an owner or editor may change it. Retain the original version.", sources: [], handover: { setup: "", test: "", rollback: "", limitation: "", nextLearning: "" } });
}
function cases(team: typeof teams[number], index: number) {
  const initialFiles = { [team.file]: team.original }, initialVersions = [{ id: "v1", author: "Fictional owner", files: initialFiles }];
  return [scenario(`team-${index}-viewer`, { role: "viewer", claimedRole: "owner", initialFiles, initialVersions } as Json,
    eq("canView", true, "The viewer can inspect the private project"), eq("canEdit", false, "The supplied viewer role cannot edit, even if it claims to be owner"), range("denied", 2, 30, "Both queued change and snapshot are refused for a viewer"), eq("files", initialFiles, "The viewer leaves the original file unchanged"), eq("historyCount", 1, "The viewer cannot append a project version")),
  scenario(`team-${index}-editor`, { role: "editor", initialFiles, initialVersions } as Json,
    eq("canView", true, "The editor can inspect the starting project"), eq("canEdit", true, "The supplied editor role can make the authorised change"), eq("files", { [team.file]: team.revised }, "The actual guide includes the missing Check instruction"), eq("historyCount", 2, "A new snapshot retains the original"), eq("history.0.files", initialFiles, "Version one remains unchanged"), eq("history.1.author", "Fictional editor", "The saved change names its fictional contributor"), eq("originalPreserved", true, "The authoritative starting history is preserved"))];
}
export const teamRoleActivities = [authorLesson({ id: "Y4.19", workbench: "engineering", concepts: ["role", "permission", "attribution", "version history"],
  explanation: "A shared creation needs explicit roles. A viewer may read the private guide but must not overwrite it or save a changed snapshot. An editor may improve it while retaining the earlier version and recording who made the change. In this fictional team, allow owner and editor to edit; let owner, editor and viewer read. Queue an edit to guide.txt adding the missing Check instruction, then queue snapshot v2. Preview applies those exact actions using the supplied role. Assessment repeats them as viewer and editor: the viewer must be refused, while the editor's actual file and attributed snapshot must be correct. A claimed owner label cannot replace the supplied role. These practice roles do not grant access to another child's real work.",
  reasoning: ["The same queued edit must have different results for a supplied viewer and editor. Check the denied count and actual returned file rather than a permission label alone.", "Saving v2 keeps the original guide in v1 and records Fictional editor as contributor. Overwriting the original history would lose evidence of the change."],
  starter: visual(document(teams[0]!, true, true)), reference: visual(document(teams[0]!)), faulty: visual(document(teams[0]!, true)), cases: cases(teams[0]!, 0),
  transfer: teams.slice(1).map((team, index) => ({ task: `Configure ${team.title} so viewers can read but cannot edit or create snapshots. Queue the exact improved instruction “${team.revised}” in ${team.file}, then save v2 with the supplied fictional editor attribution. Verify both supplied roles and preserve v1.`, starter: visual(document(team, true, true)), reference: visual(document(team)), cases: cases(team, index + 1) })),
  prediction: { prompt: "A supplied viewer claims to be the owner. Which permission should apply?", choices: ["The supplied viewer role", "The claimed owner label", "Whichever role permits more changes"], correct: 0 },
})];
export const teamRoleTools = { document, cases };
