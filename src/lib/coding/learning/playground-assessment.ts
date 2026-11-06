import { pythonLanguage } from "@codemirror/lang-python";
import type { SyntaxNode } from "@lezer/common";
import { beginnerTracks } from "./beginner-playground";
import { executePractical } from "./runtime";
import type { Execution, Json, PracticalArtifact } from "./types";

export type PlaygroundAssessment = { completed: boolean; message: string };
const feedback = (completed: boolean, message: string): PlaygroundAssessment => ({ completed, message });
const object = (value: Json | undefined): Record<string, Json> => value && typeof value === "object" && !Array.isArray(value) ? value : {};
function nodes(node: SyntaxNode, name: string): SyntaxNode[] {
  return [...(node.name === name ? [node] : []), ...Array.from(children(node)).flatMap(child => nodes(child, name))];
}
function* children(node: SyntaxNode): Generator<SyntaxNode> { for (let child = node.firstChild; child; child = child.nextSibling) yield child; }
function namedCall(node: SyntaxNode, source: string, name: string) { return node.firstChild?.name === "VariableName" && source.slice(node.firstChild.from, node.firstChild.to) === name; }
function pythonTree(source: string) { return pythonLanguage.parser.parse(source).topNode; }
const lines = (run: Execution) => run.stdout.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);

/** Results come only from the isolated executor. Parsing checks explicit
 * constructs, while fresh executions check behaviour; comments cannot pass. */
export async function assessPlaygroundTask(id: string, artifact: PracticalArtifact, run: Execution, events: Json[] = [], execute: typeof executePractical = executePractical): Promise<PlaygroundAssessment> {
  const step = beginnerTracks.flatMap(track => track.steps).find(item => item.id === id);
  if (!step || artifact.type !== "source" || step.starter.type !== "source" || artifact.language !== step.starter.language || artifact.entry !== step.starter.entry) return feedback(false, "Use this activity’s language and workspace, then try again.");
  if (!run.ok) return feedback(false, "Fix the code so it can run, then try the task again.");
  const output = lines(run);
  if (id.startsWith("robot-")) {
    const expectedLines = id === "robot-name" ? 1 : id === "robot-message" ? 2 : 3;
    const tree = pythonTree(artifact.source);
    if (!nodes(tree, "CallExpression").some(call => namedCall(call, artifact.source, "print"))) return feedback(false, "Use print to show your robot’s message.");
    if (output.length !== expectedLines) return feedback(false, `Show ${expectedLines === 1 ? "one message" : `${expectedLines} messages on separate lines`} for your robot.`);
    if (id === "robot-name") return feedback(/^Hello! I am (.+)\.$/u.test(output[0]!) && !/^Hello! I am Spark\.$/i.test(output[0]!), "Keep “Hello! I am ….” and give the robot a name of your own.");
    if (id === "robot-message") return feedback(/^Hello! I am .+\.$/u.test(output[0]!) && output[1] !== "I like exploring planets!" && output[1]!.length >= 3, "Keep your robot’s greeting and write a new message on the second line.");
    const name = /^My name is (.+)\.$/u.exec(output[0]!);
    const likes = output.slice(1).map(line => /^I like (.+)\.$/u.exec(line)?.[1]?.toLowerCase());
    return feedback(Boolean(name && name[1]!.toLowerCase() !== "spark" && likes.every(Boolean) && likes[0] !== likes[1] && !likes.includes("stars") && !likes.includes("moon rocks")), "Give your robot a new name and two different things it likes. Change the words in all three messages.");
  }
  if (id.startsWith("function-")) {
    const tree = pythonTree(artifact.source), functions = nodes(tree, "FunctionDefinition");
    const functionName = id === "function-create" ? "cheer" : "greet";
    const definition = functions.find(node => { const name = node.getChild("VariableName"); return name && artifact.source.slice(name.from, name.to) === functionName; });
    const parameters = definition?.getChild("ParamList")?.getChildren("VariableName") ?? [];
    const body = definition?.getChild("Body");
    const calls = nodes(tree, "CallExpression").filter(call => namedCall(call, artifact.source, functionName) && !functions.some(fn => call.from >= fn.from && call.to <= fn.to));
    if (!definition || parameters.length !== 1 || artifact.source.slice(parameters[0]!.from, parameters[0]!.to) !== "name" || !body || !nodes(body, "CallExpression").some(call => namedCall(call, artifact.source, "print")) || calls.length < (id === "function-change" ? 2 : 1)) return feedback(false, `Define ${functionName}(name), put a print instruction inside it, and call it ${id === "function-change" ? "twice" : "below the function"}.`);
    if (id === "function-explore") return feedback(output.length === 1 && output[0] === "Hello, Spark", "Run the greeting example and look for Hello, Spark.");
    if (id === "function-change") {
      const changed = output.length === 2 && output[0] === "Hello, Spark" && /^Hello, .+/.test(output[1]!) && !["Hello, Spark", "Hello, Nova"].includes(output[1]!);
      const traced = changed ? await execute("python", { ...artifact, entry: "variables" }, { variables: {} }) : null;
      const firstLine = artifact.source.slice(0, body.from).split("\n").length + 1;
      const lastLine = artifact.source.slice(0, body.to).trimEnd().split("\n").length;
      const calledNames = new Set(traced?.trace.flatMap(frame => { const value = object(frame); return typeof value.line === "number" && value.line >= firstLine && value.line <= lastLine ? [object(value.variables).name] : []; }));
      return feedback(Boolean(changed && traced?.ok && calledNames.has("Spark") && calledNames.has(output[1]!.slice("Hello, ".length))), "Keep Spark’s greeting. Change Nova in the second call to a different robot name, and run both calls.");
    }
    // Test the learner-authored function with two independent names. Only the
    // function definition is used, so unrelated top-level output cannot pass.
    const probe = { ...artifact, source: `${artifact.source.slice(definition.from, definition.to)}\ncheer("Orion")\ncheer("Luna")` };
    const checked = await execute("python", probe, {});
    const messages = lines(checked);
    const called = await execute("python", { ...artifact, entry: "variables" }, { variables: {} });
    const firstBodyLine = artifact.source.slice(0, body.from).split("\n").length + 1;
    const lastBodyLine = artifact.source.slice(0, body.to).trimEnd().split("\n").length;
    const actualCheer = called.ok && called.trace.some(frame => { const value = object(frame); return typeof value.line === "number" && value.line >= firstBodyLine && value.line <= lastBodyLine && typeof object(value.variables).name === "string"; });
    return feedback(checked.ok && actualCheer && messages.length === 2 && messages[0]!.includes("Orion") && !messages[0]!.includes("Luna") && messages[1]!.includes("Luna") && !messages[1]!.includes("Orion") && messages[0]!.replace("Orion", "").trim().length >= 2 && messages[1]!.replace("Luna", "").trim().length >= 2, "Make cheer print a message using its name parameter, then call cheer with your robot’s name. Try “Go, ” plus name!");
  }
  const result = object(object(run.output).result);
  const elements = Array.isArray(result.elements) ? result.elements.map(object) : [];
  if (id === "planet-html") return feedback(elements.some(element => element.tag === "h1" && typeof element.text === "string" && element.text.trim().length >= 2 && element.text.trim().toLowerCase() !== "planet spark"), "Give your h1 heading a new planet name. Keep its opening and closing tags.");
  if (id === "planet-css") {
    // An ID is added only to the *inspection copy*, allowing the existing
    // cascade inspector to verify the heading even in an older draft without IDs.
    const existingId = elements.find(element => element.tag === "h1")?.id;
    const probeId = typeof existingId === "string" && existingId ? existingId : "starliz-colour-probe";
    const inspection = await execute("web", { ...artifact, source: "", html: probeId === existingId ? artifact.html : (artifact.html ?? "").replace(/<h1\b([^>]*)>/i, (_match, attrs: string) => `<h1${attrs} id="${probeId}">`) }, {});
    const style = object(object(object(object(inspection.output).result).styleInspection).stylesById);
    const heading = object(style[probeId]);
    const colour = String(object(heading.properties).color ?? heading.color ?? "").toLowerCase().replace(/\s/g, "");
    return feedback(inspection.ok && ["green", "blue", "orange", "#008000", "#00f", "#0000ff", "#ffa500", "rgb(0,128,0)", "rgb(0,0,255)", "rgb(255,165,0)"].includes(colour), "Use CSS to make your heading green, blue or orange. Change the colour value in the heading’s rule.");
  }
  if (id === "planet-js") {
    const clicks = events.map(object).filter(event => event.type === "click");
    if (!clicks.length) return feedback(false, "Your page is ready. Click Say hello in the preview to test your message.");
    if (!clicks.some(click => elements.some(element => element.id === click.target && element.tag === "button" && element.text === "Say hello"))) return feedback(false, "Click the Say hello button to test its message.");
    const before = await execute("web", artifact, { events: [] });
    const initial = object(object(before.output).result);
    const initialTexts = object(initial.textsById), texts = object(result.textsById);
    const targets = Object.keys(texts).filter(key => key === "message" || /^starliz-message\d*$/.test(key));
    return feedback(before.ok && targets.some(key => typeof texts[key] === "string" && String(texts[key]).trim().length >= 3 && texts[key] !== "Hello, explorer!" && texts[key] !== initialTexts[key]), "Write your own welcome message inside the click instructions, then click Say hello to see it change.");
  }
  return feedback(false, "Read the task and try your change again.");
}
