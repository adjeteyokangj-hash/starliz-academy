import { authorModuleActivity, visual, scenario, eq, range, includes } from "../authoring";
import type { MediaDocument } from "../studio-engines";
import type { MediaLibraryProgram } from "../media-library";

type CardBrief = { name: string; caption: string; steps: string[]; parts: MediaDocument["shapes"] };
const part = (id: string, kind: "circle" | "rectangle", x: number, y: number, width: number, height: number, fill: string, alt: string): MediaDocument["shapes"][number] => ({ id, kind, x, y, width, height, fill, alt, text: "" });
const boat: CardBrief = { name: "Boat crossing guide", caption: "A blue boat travels across the pond", steps: ["Board the boat", "Cross the pond", "Step onto the bank"], parts: [part("hull", "rectangle", 150, 230, 280, 70, "#2563eb", "Blue boat hull"), part("sail", "rectangle", 270, 80, 30, 150, "#166534", "Green mast and furled sail")] };
const balloon: CardBrief = { name: "Balloon journey guide", caption: "A red balloon lifts a basket", steps: ["Climb into the basket", "Lift above the field", "Land in the field"], parts: [part("balloon", "circle", 200, 40, 180, 200, "#b91c1c", "Red balloon"), part("basket", "rectangle", 250, 240, 80, 65, "#92400e", "Brown balloon basket")] };
const robot: CardBrief = { name: "Robot garden guide", caption: "A green robot waters the garden", steps: ["Fill the water tank", "Visit the garden", "Water the plants"], parts: [part("body", "rectangle", 220, 160, 140, 160, "#166534", "Green robot body"), part("head", "circle", 230, 60, 120, 110, "#0369a1", "Blue robot head")] };
const flower: CardBrief = { name: "Flower planting guide", caption: "A pink flower grows above its stem", steps: ["Make a small hole", "Plant the flower", "Water the soil"], parts: [part("stem", "rectangle", 280, 140, 25, 190, "#166534", "Green flower stem"), part("bloom", "circle", 220, 40, 145, 145, "#be185d", "Pink flower bloom")] };
const house: CardBrief = { name: "House welcome guide", caption: "A red house has a blue flat roof", steps: ["Follow the path", "Find the door", "Knock and wait"], parts: [part("walls", "rectangle", 180, 170, 220, 170, "#b91c1c", "Red house walls"), part("roof", "rectangle", 160, 120, 260, 50, "#2563eb", "Blue flat roof")] };
const tree: CardBrief = { name: "Tree care guide", caption: "Green leaves grow above a brown trunk", steps: ["Find the roots", "Water the soil", "Leave room to grow"], parts: [part("trunk", "rectangle", 270, 180, 50, 160, "#92400e", "Brown trunk"), part("leaves", "circle", 190, 40, 210, 200, "#166534", "Green tree leaves")] };
function document(brief: CardBrief, outlines = false): MediaDocument { return { name: brief.name, tool: outlines ? "text" : "combined", caption: outlines ? "" : brief.caption, narration: "Original geometric picture: " + brief.caption,
  audience: "private", shapes: brief.parts.map((shape) => ({ ...shape, ...(outlines ? { fill: "#ffffff" } : {}) })), steps: outlines ? [] : brief.steps,
  fontSize: outlines ? 12 : 24, foreground: "#111827", background: "#ffffff", assets: [{ creator: "Learner", licence: "original", credit: "", alt: brief.caption }] }; }
function program(brief: CardBrief, mode: "starter" | "reference" | "faulty") {
  const original = document(brief, true), goal = document(brief);
  const actions: MediaLibraryProgram["actions"] = mode === "starter" ? [] : [
    { op: "save", name: brief.name },
    { op: "edit", patch: { ...goal, ...(mode === "faulty" ? { shapes: [...goal.shapes, part("cover", "rectangle", 100, 0, 400, 380, "#ffffff", "A layer that hides the picture")] } : {}) }, reason: "Paint visible parts and make the matching instructions easier to read." },
    { op: "save", name: brief.name }, { op: "close" }, { op: "open", name: brief.name },
  ];
  return visual({ media: original, files: [], actions });
}
function cases(brief: CardBrief, id: string) {
  return [600, 320].map((width) => scenario(`${id}-${width}`, { width, requestedFile: brief.name, captions: [brief.caption, "A different picture with no matching instructions"], stepChoices: brief.steps },
    eq("document.name", brief.name, "The saved guide has its meaningful name"), eq("caption", brief.caption, "The caption matches the original picture"), eq("document.steps", brief.steps, "Instructions describe the picture's task in order"),
    ...brief.parts.map((shape) => eq(`visibleById.${shape.id}`, true, `The actual ${shape.alt.toLowerCase()} remains visible`)),
    eq("accessible", true, "Words and picture descriptions remain readable"), eq("privacySafe", true, "The guide stays private"), eq("permitted", true, "The original geometric artwork is permitted"),
    includes("savedNames", brief.name, "The intended card can be found"), eq("retrievedCorrectly", true, "The real saved guide reopens without losing edits"), eq("originalRetained", true, "The original version remains available"),
    range(`versionCounts.${brief.name}`, 2, 32, "Both original and improved versions are retained"), range("justifiedChangeCount", 1, 32, "The improvement has a recorded reason")));
}
function studio(spec: { slot?: 1 | 2 | 3; kind?: "project"; title: string; objective: string; teaching: string; reasoning: [string, string]; brief: CardBrief; transfers: [CardBrief, CardBrief] }) {
  return authorModuleActivity({ moduleId: "first-instructions/digital-making", kind: spec.kind ?? "consolidation", slot: spec.slot, title: spec.title, objective: spec.objective,
    concepts: ["tool", "layer", "caption", "retrieve"], essentialChecks: ["Original picture parts are visible", "Readable caption and ordered instructions match the task", "Original and improved versions remain saved", "The intended saved card reopens correctly"],
    faultDescription: "A large white covering layer hides the actual picture parts in the saved guide. Repair the visible layer order without losing the matching caption or instructions.",
    explanation: `${spec.teaching} Make ${spec.brief.name}. Use the combined tool to paint the separate picture parts and add the matching caption. Put these instructions in order: ${spec.brief.steps.join("; ")}. Save the original before changing it, record a reason for the improvement, save again, close the card, then open its exact name.`,
    reasoning: spec.reasoning, starter: program(spec.brief, "starter"), reference: program(spec.brief, "reference"), faulty: program(spec.brief, "faulty"), cases: cases(spec.brief, "guide"),
    transfer: spec.transfers.map((brief, index) => ({ task: `Make ${brief.name} from its supplied outlines. The caption is: ${brief.caption}. Put these steps in order: ${brief.steps.join("; ")}. Keep both picture parts visible, retain the original version, justify your improvement, then save, close and reopen the improved guide.`, starter: program(brief, "starter"), reference: program(brief, "reference"), cases: cases(brief, `new-guide-${index + 1}`) })),
    prediction: { prompt: "A white covering layer hides the picture, but the file is saved. Is the guide ready?", choices: ["Yes, a filename proves the picture is visible", "No, inspect the layers and make the picture visible before saving the improved version", "Yes, captions replace every picture part"], correct: 1 },
    ...(spec.kind ? { workflow: { saveAndReplay: true, restoreVersion: true } } : {}),
  });
}
const recall = studio({ slot: 1, title: "Retrieve the tools for a new instruction card", objective: "Recall picture, text, layout and file operations in a new card-making task.",
  teaching: "Recall what each tool can change before editing. The text-only tool cannot paint a shape. Switch to the combined tool when your card needs both drawing and words. Use a readable caption, preserve separate editable parts and test the actual saved card rather than relying on its title.",
  reasoning: ["The boat needs a visible hull and mast. Painting the white outlines changes the original editable drawing.", "The three steps tell the reader how to cross the pond. Reopening the saved name checks whether those words and picture parts were retained."], brief: boat, transfers: [balloon, robot] });
const repair = studio({ slot: 2, title: "Repair a hidden picture and preserve the original", objective: "Repair layer and readability faults while retaining original and improved versions.",
  teaching: "A file can contain the right shape names while a later layer hides the actual drawing. Inspect what the reader can see. Remove or move the covering layer, make the caption readable and explain the improvement. Keep the first version so you can compare it with the repaired guide.",
  reasoning: ["The balloon and basket are separate parts. A large white shape in front can hide both even when their names remain in the layer list.", "Save the original, improve the visible card and save again. Close and reopen it to inspect the repaired result."], brief: balloon, transfers: [house, tree] });
const transfer = studio({ slot: 3, title: "Transfer card-making skills to a practical guide", objective: "Combine readable media and ordered instructions for an unfamiliar audience task.",
  teaching: "A practical guide must help its reader do something. Match the picture, caption and steps to one task instead of collecting unrelated decorations. Use the supplied words to build an ordered explanation, check that both picture parts stay visible on a narrow screen, then retrieve the improved version by its exact name.",
  reasoning: ["The flower guide starts with a hole, then planting, then watering. Reversing those steps changes the practical instructions.", "An accessible description names the stem and bloom so the original picture has meaning beyond its colours."], brief: flower, transfers: [robot, boat] });
const portfolio = studio({ kind: "project", title: "Portfolio: a private welcome guide", objective: "Create, version, retrieve and explain an original accessible guide with a meaningful picture and instructions.",
  teaching: "Make an original welcome guide for a fictional visitor. Your geometric house, matching caption and three ordered steps must work together. Improve the supplied outline drawing, preserve its original version, and give a reason for your changes. Save the whole project to your workspace, retrieve that version and preview the real card before explaining your design.",
  reasoning: ["The house has visible walls and a roof. Its reader follows the path, finds the door and waits after knocking.", "A saved filename does not prove the card is useful. Retrieve the saved project, check the readable words and visible picture, then explain one improvement using the actual result."], brief: house, transfers: [flower, tree] });

export const cardRetrievalActivities = [recall, repair, transfer, portfolio];
