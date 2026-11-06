import { authorLesson, visual, scenario, eq, range, includes } from "../authoring";
import type { Json, Predicate } from "../types";
import type { MediaDocument } from "../studio-engines";
import type { MediaLibraryProgram } from "../media-library";

const shape = (id: string, kind: "rectangle" | "circle", x: number, y: number, width: number, height: number, fill: string, alt: string): MediaDocument["shapes"][number] => ({ id, kind, x, y, width, height, fill, alt, text: "" });
function card(name: string, patch: Partial<MediaDocument> = {}): MediaDocument {
  return { name, tool: "combined", caption: "", narration: "An original picture made from editable shapes.", audience: "private", shapes: [], steps: [],
    fontSize: 20, foreground: "#111827", background: "#ffffff", assets: [{ creator: "Learner", licence: "original", credit: "", alt: "Original geometric artwork" }], ...patch };
}
const library = (media: MediaDocument, actions: MediaLibraryProgram["actions"] = [], files: MediaLibraryProgram["files"] = []) => visual({ media, actions, files });
const edit = (patch: Partial<MediaDocument>, reason = "Make the card clearer for its reader."): MediaLibraryProgram["actions"][number] => ({ op: "edit", patch, reason });
const save = (name: string): MediaLibraryProgram["actions"][number] => ({ op: "save", name });
const close: MediaLibraryProgram["actions"][number] = { op: "close" };
const open = (name: string): MediaLibraryProgram["actions"][number] => ({ op: "open", name });
function cases(id: string, checks: Predicate[], input: Record<string, Json> = {}) {
  return [600, 320].map((width) => scenario(`${id}-${width}`, { ...input, width }, ...checks));
}
const readable = [eq("accessible", true, "The caption and read-aloud description provide readable alternatives"), eq("fitsCanvas", true, "Every picture part fits on the card"), eq("privacySafe", true, "The card stays private and contains no detected contact details")];

const empty = card("My first card", { tool: "text" });
const sun = shape("sun", "circle", 220, 80, 140, 140, "#facc15", "The sun");
const first = authorLesson({ id: "Y1.07", concepts: ["tool", "mark"],
  explanation: "A tool helps you make a particular kind of mark. The picture tool can draw circles and rectangles. The text tool can add words to a caption. Choose the tool that fits what you want to make: a text tool cannot draw your sun. Your marks stay as separate editable parts, so you can move or paint them later. Start with one circle, then inspect the real card rather than only saying that you chose the right tool.",
  reasoning: ["To make a sun, choose Picture tool and draw one circle. You can change its colour without turning it into text.", "To write the word Stop, choose Text tool and enter it as a caption. The different purpose needs a different tool."],
  starter: library(empty), reference: library(empty, [edit({ tool: "picture", shapes: [sun] })]), faulty: library(empty, [edit({ tool: "text", shapes: [sun] })]),
  cases: cases("picture-tool", [eq("document.tool", "picture", "A drawing tool is selected for the picture mark"), eq("shapeCount", 1, "The card contains one editable picture mark"), eq("document.shapes.0.kind", "circle", "The requested sun uses a circle"), ...readable]),
  transfer: [
    { task: "Make a card named Stop card. Choose the text tool, add the caption Stop, and leave the drawing area free of picture marks.", starter: library(card("New card", { tool: "picture" })), reference: library(card("New card", { tool: "picture" }), [edit({ name: "Stop card", tool: "text", caption: "Stop", narration: "The card says Stop." })]),
      cases: cases("text-tool", [eq("document.name", "Stop card", "The card has the requested title"), eq("document.tool", "text", "A text tool is selected for the caption"), eq("caption", "Stop", "The real text mark says Stop"), eq("shapeCount", 0, "The task uses words rather than a drawing"), ...readable]) },
    { task: "Make a card named Robot card. Choose the picture tool and create one editable rectangle. Add a description so the mark has an accessible name.", starter: library(card("New card", { tool: "text" })), reference: library(card("New card", { tool: "text" }), [edit({ name: "Robot card", tool: "picture", shapes: [shape("body", "rectangle", 220, 100, 160, 180, "#2563eb", "Robot body")], narration: "A rectangle forms a robot body." })]),
      cases: cases("rectangle-tool", [eq("document.name", "Robot card", "The card has the requested title"), eq("document.tool", "picture", "The picture tool makes the mark"), eq("shapeCount", 1, "There is one editable part"), eq("document.shapes.0.kind", "rectangle", "The mark is a rectangle"), ...readable]) },
  ], prediction: { prompt: "Which tool can make the circle in the demonstrated sun card?", choices: ["Picture tool", "Text tool alone", "Closing the card"], correct: 0 },
  misconception: "Choose a tool that can perform the action; naming an impossible tool does not create the requested mark." });

const tree = card("Tree card", { tool: "picture", narration: "A tree with a trunk and leaves.", shapes: [shape("trunk", "rectangle", 260, 160, 50, 160, "#92400e", "Tree trunk"), shape("leaves", "circle", 210, 60, 150, 150, "#166534", "Tree leaves")] });
const house = card("House card", { tool: "picture", narration: "A flat-roofed house with walls and a roof.", shapes: [shape("wall", "rectangle", 220, 150, 160, 160, "#b91c1c", "House walls"), shape("roof", "rectangle", 200, 120, 200, 45, "#2563eb", "Flat roof")] });
const robot = card("Robot card", { tool: "picture", narration: "A robot with a head and a body.", shapes: [shape("body", "rectangle", 240, 180, 120, 150, "#2563eb", "Robot body"), shape("head", "circle", 250, 90, 100, 110, "#166534", "Robot head")] });
const outlines = (document: MediaDocument): MediaDocument => ({ ...document, shapes: document.shapes.map((part) => ({ ...part, fill: "#ffffff" })) });
const connections = (top: string, bottom: string): Json[] => ["above", "aligned", "touching"].map((relation) => ({ first: top, second: bottom, relation }));
function pictureChecks(first: string, second: string, name: string): Predicate[] {
  return [eq(`visibleById.${first}`, true, "The upper picture part is actually visible"), eq(`visibleById.${second}`, true, "The lower picture part is actually visible"),
    ...[0, 1, 2].map((index) => eq(`relationships.${index}.satisfied`, true, "The parts have the requested order, alignment and physical connection")),
    eq("drawingChanged", true, "The editable drawing changes from the supplied outlines"), range("saves", 1, 32, "The original picture is saved"), includes("savedNames", name, "The picture can be found under its meaningful name"), ...readable];
}
const coveredTree: MediaDocument = { ...tree, shapes: [...tree.shapes, shape("cover", "rectangle", 180, 40, 240, 300, "#dbeafe", "A cover hiding the tree")] };
const second = authorLesson({ id: "Y1.08", concepts: ["layer", "original"],
  explanation: "Build an original picture from separate shapes and your own colour choices. A tree needs a trunk and leaves that you can see. Paint the supplied outlines, put the leaves above the trunk, and keep the parts touching. Layers are painted from back to front. A large shape placed last can hide the parts below it. Use the layer controls to bring a hidden part forward or send a covering part backward, then save your original drawing.",
  reasoning: ["The trunk is a rectangle and the leaves are a circle. Changing their colours changes the actual drawing, not a flattened screenshot.", "A covering rectangle can make a required part disappear. Inspect the visible picture and the layer order, repair the overlap, then save Tree card."],
  starter: library(outlines(tree)), reference: library(outlines(tree), [edit({ shapes: tree.shapes }), save("Tree card")]),
  faulty: library(outlines(tree), [edit({ shapes: coveredTree.shapes }), save("Tree card")]),
  debugReference: library(outlines(tree), [edit({ shapes: [coveredTree.shapes[2]!, ...tree.shapes] }), save("Tree card")]),
  cases: cases("tree-parts", pictureChecks("leaves", "trunk", "Tree card"), { constraints: connections("leaves", "trunk") }),
  transfer: [
    { task: "Create an original flat-roofed house from the wall and roof outlines. Paint both parts, put the roof above the walls so they touch, and save House card.", starter: library(outlines(house)), reference: library(outlines(house), [edit({ shapes: house.shapes }), save("House card")]), cases: cases("house-parts", pictureChecks("roof", "wall", "House card"), { constraints: connections("roof", "wall") }) },
    { task: "Create an original robot from the supplied head and body outlines. Paint both, put the head above the body so they touch, and save Robot card.", starter: library(outlines(robot)), reference: library(outlines(robot), [edit({ shapes: robot.shapes }), save("Robot card")]), cases: cases("robot-parts", pictureChecks("head", "body", "Robot card"), { constraints: connections("head", "body") }) },
  ], prediction: { prompt: "A large filled rectangle is placed in front of the whole tree. What happens to the tree?", choices: ["Its hidden parts are still visible", "The rectangle covers the tree", "The tree is saved automatically"], correct: 1, artifact: library(outlines(tree), [edit({ shapes: coveredTree.shapes })]) },
  misconception: "A part existing in the layer list does not prove that it is visible in the rendered picture." });

const seed = card("Seed card", { tool: "picture", narration: "A seed in a plant pot.", shapes: [shape("pot", "rectangle", 230, 180, 140, 110, "#92400e", "Plant pot"), shape("seed", "circle", 275, 155, 50, 50, "#166534", "Seed")] });
function captionCases(id: string, caption: string, filename: string, captions: string[]) {
  return cases(id, [eq("caption", caption, "The caption matches the supplied picture and task"), eq("hasPicture", true, "The editable picture remains on the card"), range("saves", 1, 32, "The captioned card is saved"), includes("savedNames", filename, "The captioned card has the requested file name"), ...readable], { captions });
}
const third = authorLesson({ id: "Y1.09", concepts: ["caption", "readable"],
  explanation: "A caption adds words that help someone understand a picture. Look at the seed and pot, then choose Water the seed. The caption Open the door belongs to a different picture. Switch to the text tool before adding words; your drawing stays on the card. Use large dark text on a light background and keep a read-aloud description. The caption, picture and accessible description should support the same meaning before you save the card.",
  reasoning: ["Water the seed describes an action that fits the seed picture. A readable caption is useful only when its meaning matches.", "The picture remains as editable shapes while the text tool changes the caption. Saving keeps both in the same private card."],
  starter: library(seed), reference: library(seed, [edit({ tool: "text", caption: "Water the seed.", narration: "A seed in a pot. Water the seed gently." }), save("Seed card")]),
  faulty: library(seed, [edit({ tool: "text", caption: "Open the door." }), save("Seed card")]),
  cases: captionCases("seed-caption", "Water the seed.", "Seed card", ["Open the door.", "Water the seed.", "Play the drum."]),
  transfer: [
    { task: "Caption the supplied house picture with Open the door. Choose a text tool, keep the picture readable, and save House card.", starter: library(house), reference: library(house, [edit({ tool: "text", caption: "Open the door.", narration: "A house. Open the door." }), save("House card")]), cases: captionCases("house-caption", "Open the door.", "House card", ["Play the drum.", "Open the door.", "Water the seed."]) },
    { task: "Caption the supplied robot picture with Move the robot. Keep its picture, add readable text and a description, and save Robot card.", starter: library(robot), reference: library(robot, [edit({ tool: "text", caption: "Move the robot.", narration: "A robot. Move the robot." }), save("Robot card")]), cases: captionCases("robot-caption", "Move the robot.", "Robot card", ["Water the seed.", "Move the robot.", "Open the door."]) },
  ], prediction: { prompt: "Which caption fits the demonstrated picture of a seed in a pot?", choices: ["Play the drum.", "Open the door.", "Water the seed."], correct: 2 },
  misconception: "A caption must match its picture; readable words about a different object do not communicate the intended instruction." });

const savedSeed = { ...seed, tool: "combined" as const, caption: "Water the seed." };
const decoys = [{ name: "Seed card old", document: { ...savedSeed, caption: "An earlier seed picture." } }, { name: "Tree card", document: tree }];
const retrieveChecks = (name: string): Predicate[] => [eq("retrievedCorrectly", true, "The requested saved card is reopened"), eq("contentUnchangedSinceSave", true, "Opening retrieves the saved content without replacing it"), eq("openFile", name, "The complete file name is matched"), range("opens", 1, 32, "A real open operation retrieves the card"), ...readable];
function retrievalVariant(name: string, document: MediaDocument, other: MediaDocument) {
  const initial = card("Closed work area"), starter = library(initial), reference = library(initial, [open(name)]);
  const checks = [...retrieveChecks(name), eq("originalRequestedContent", true, "The reopened content is the original requested file, not a substituted copy")];
  const files = (caption: string) => [{ name, document: { ...document, caption } }, { name: `${name} old`, document: { ...document, caption: "An old draft." } }, { name: other.name, document: other }];
  return { starter, reference, cases: [scenario("requested-card-wide", { width: 600, requestedFile: name, files: files("The current saved card.") } as unknown as Json, ...checks), scenario("requested-card-changed", { width: 320, requestedFile: name, files: files("Updated instructions already saved in this card.") } as unknown as Json, ...checks)] };
}
const fourth = authorLesson({ id: "Y1.10", concepts: ["save", "retrieve"],
  explanation: "Saving puts your card in its named library file. Closing clears the work area; it does not remove the saved file. To retrieve the card, choose its whole name and open it. Seed card and Seed card old are different names, so do not guess from the first word. Save the seed card, close it, then reopen Seed card and check that its picture and caption have stayed the same. The file actions are recorded and executed against the actual card library.",
  reasoning: ["Save creates a stored version of the current card. Close removes only the current view.", "Open retrieves the last saved content under the selected full name. A similarly named old draft can contain different instructions."],
  starter: library(savedSeed, [], decoys), reference: library(savedSeed, [save("Seed card"), close, open("Seed card")], decoys), faulty: library(savedSeed, [save("Seed card"), close, open("Seed card old")], decoys),
  cases: cases("save-close-reopen", [...retrieveChecks("Seed card"), range("saves", 1, 32, "The working card is saved before it is reopened"), range("closes", 1, 32, "The work area is closed before retrieval"), eq("caption", "Water the seed.", "The saved caption is preserved")], { requestedFile: "Seed card" }),
  transfer: [
    { task: "Find House card among three saved files, including House card old. Open the current requested file without changing its saved content.", ...retrievalVariant("House card", { ...house, tool: "combined" }, robot) },
    { task: "Find Robot card among three saved files, including Robot card old. Open its actual saved contents rather than recreating a card with the same name.", ...retrievalVariant("Robot card", { ...robot, tool: "combined" }, house) },
  ], prediction: { prompt: "After saving Seed card, you close the work area. What retrieves the saved picture and caption?", choices: ["Open Seed card", "Open Seed card old because the first word matches", "Type a new card with the same title"], correct: 0 },
  misconception: "A title or similar-looking name is not the saved file. Retrieve the exact named content." });

const steps = ["Fill the pot with soil.", "Put the seed in the soil.", "Water the soil gently."];
const smallCard = { ...savedSeed, caption: "Plant a seed.", steps, fontSize: 12 };
function improveCases(name: string, original: MediaDocument) {
  return cases("improve-with-history", [eq("originalRetained", true, "The original card remains in its saved version history"), eq("changedFromOriginal", true, "The revised card differs from the original"), range(`versionCounts.${name}`, 2, 32, "Both the original and revised file versions are retained"),
    range("justifiedChangeCount", 1, 32, "A reason is recorded for a real change"), eq("steps", original.steps, "Useful instructions are retained during the revision"), ...readable], { initialDocument: original as unknown as Json });
}
const fifth = authorLesson({ id: "Y1.11", concepts: ["feedback", "version"],
  explanation: "Feedback helps you improve a creation for its reader. This card's instructions are useful, but its text is too small. Save the original first, then increase the text size and explain why. Save the revision under the same library name; its earlier version remains available. Do not make space by removing a useful step. Compare the actual card before and after the change, and keep the meaning of all three instructions.",
  reasoning: ["Saving before editing retains an original that you can compare with the revision.", "Increasing 12-pixel text to 22 pixels makes the caption and instruction list larger. Removing a step would change the task rather than solve the reading problem."],
  starter: library(smallCard), reference: library(smallCard, [save("Seed card"), edit({ fontSize: 22 }, "Larger text helps the reader keep every instruction."), save("Seed card")]),
  faulty: library(smallCard, [save("Seed card"), edit({ fontSize: 22, steps: steps.slice(1) }, "Larger text should help the reader."), save("Seed card")]),
  cases: improveCases("Seed card", smallCard),
  transfer: [
    { task: "Improve the small text on House card. Retain its two useful steps, save an original and a readable revision, and explain why your change helps.", starter: library({ ...house, tool: "combined", caption: "Open the door.", fontSize: 12, steps: ["Find the door.", "Open the door gently."] }),
      reference: library({ ...house, tool: "combined", caption: "Open the door.", fontSize: 12, steps: ["Find the door.", "Open the door gently."] }, [save("House card"), edit({ fontSize: 22 }, "Larger text makes both steps easier to read."), save("House card")]),
      cases: improveCases("House card", { ...house, tool: "combined", caption: "Open the door.", fontSize: 12, steps: ["Find the door.", "Open the door gently."] }) },
    { task: "Improve the small text on Robot card without losing its two instructions. Save both versions and record a reason for a useful readable change.", starter: library({ ...robot, tool: "combined", caption: "Move the robot.", fontSize: 10, steps: ["Choose the robot.", "Move it to the star."] }),
      reference: library({ ...robot, tool: "combined", caption: "Move the robot.", fontSize: 10, steps: ["Choose the robot.", "Move it to the star."] }, [save("Robot card"), edit({ fontSize: 24 }, "Larger text keeps each instruction easy to read."), save("Robot card")]),
      cases: improveCases("Robot card", { ...robot, tool: "combined", caption: "Move the robot.", fontSize: 10, steps: ["Choose the robot.", "Move it to the star."] }) },
  ], prediction: { prompt: "You save an original card, increase its text size and save again under the same name. What should remain?", choices: ["Only the revised card", "Both saved versions", "No saved card"], correct: 1 },
  misconception: "A revision should solve the feedback problem while retaining useful content and the original version." });

function projectCases(name: string, caption: string, instructionSteps: string[], choices: string[]) {
  return cases("usable-instruction-card", [eq("hasPicture", true, "An editable original picture supports the instruction"), eq("caption", caption, "The caption names the intended task"), eq("steps", instructionSteps, "All usable steps appear in the intended order"), eq("retrievedCorrectly", true, "The completed card is saved, closed and retrieved"),
    eq("openFile", name, "The completed card uses its meaningful file name"), ...readable], { requestedFile: name, captions: [caption, "A different task."], stepChoices: choices });
}
const sixth = authorLesson({ id: "Y1.12", concepts: ["instruction", "project"],
  explanation: "Create a complete instruction card that someone else can use. Combine the original seed picture, the caption Plant a seed, and three steps: fill the pot with soil, put in the seed, then water gently. The word tiles let you build the steps without typing every sentence. Keep the picture and text readable, add a description, save Seed card, close it and retrieve it. A card is useful when its saved instructions can actually be read and followed in order.",
  reasoning: ["Check the whole outcome: the seed picture, matching caption and all three ordered steps belong to the same task.", "Reopening the saved file checks the finished artifact rather than an unsaved screen. A missing or reordered step changes what the reader would do."],
  starter: library({ ...seed, tool: "combined" }), reference: library({ ...seed, tool: "combined" }, [edit({ caption: "Plant a seed.", steps, narration: "Plant a seed: fill the pot, add the seed, and water gently." }), save("Seed card"), close, open("Seed card")]),
  faulty: library({ ...seed, tool: "combined" }, [edit({ caption: "Plant a seed.", steps: [steps[1]!, steps[0]!, steps[2]!] }), save("Seed card"), close, open("Seed card")]),
  cases: projectCases("Seed card", "Plant a seed.", steps, [steps[1]!, steps[2]!, "Close the bag.", steps[0]!]),
  transfer: [
    { task: "Create House card with its supplied house picture, the caption Open the door., and the steps Find the door. then Open the door gently. Save, close and retrieve the usable card.", starter: library({ ...house, tool: "combined" }), reference: library({ ...house, tool: "combined" }, [edit({ caption: "Open the door.", steps: ["Find the door.", "Open the door gently."] }), save("House card"), close, open("House card")]),
      cases: projectCases("House card", "Open the door.", ["Find the door.", "Open the door gently."], ["Open the door gently.", "Water the seed.", "Find the door."]) },
    { task: "Create Robot card with its supplied robot picture, the caption Move the robot., and the steps Choose the robot. then Move it to the star. Save, close and retrieve the final card.", starter: library({ ...robot, tool: "combined" }), reference: library({ ...robot, tool: "combined" }, [edit({ caption: "Move the robot.", steps: ["Choose the robot.", "Move it to the star."] }), save("Robot card"), close, open("Robot card")]),
      cases: projectCases("Robot card", "Move the robot.", ["Choose the robot.", "Move it to the star."], ["Move it to the star.", "Choose the robot.", "Fill the pot with soil."]) },
  ], prediction: { prompt: "Which step must come before putting a seed in the pot?", choices: ["Water the seed first", "Fill the pot with soil", "Close the card without saving"], correct: 1 },
  misconception: "A finished-looking picture does not replace complete, ordered, saved instructions that can be retrieved." });

export const mediaCardActivities = [first, second, third, fourth, fifth, sixth];
