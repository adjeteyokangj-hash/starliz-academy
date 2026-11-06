import { pythonLanguage } from "@codemirror/lang-python";
import type { ActivityContent, PracticalArtifact } from "./types";

export type SyntaxPiece = { id: string; title: string; code: string; explanation: string };
export function hasPythonFunctionsGuide(activity: Pick<ActivityContent, "concepts" | "workbench">, artifact: PracticalArtifact): boolean {
  if (artifact.type !== "source" || artifact.language !== "python" || !["python", "dual"].includes(activity.workbench)) return false;
  if (!activity.concepts.some(concept => ["function", "functions", "parameter", "parameters", "argument", "arguments", "return", "scope", "component"].includes(concept.toLowerCase()))) return false;
  let definition = false;
  pythonLanguage.parser.parse(artifact.source).iterate({ enter(node) { if (node.name === "FunctionDefinition") definition = true; } });
  return definition;
}

/** Select small explanations using syntax actually present in the visible
 * example/starter. These are teaching aids, never assessment predicates. */
export function syntaxGuidance(artifact: PracticalArtifact, field?: "source" | "html" | "css"): SyntaxPiece[] {
  if (artifact.type !== "source") return [];
  const pieces: SyntaxPiece[] = [];
  const add = (id: string, title: string, code: string | undefined, explanation: string) => { if (code) pieces.push({ id, title, code: code.trim().slice(0, 220), explanation }); };
  const source = artifact.source;
  if ((!field || field === "source") && artifact.language === "python") {
    add("python-text", "Text lives inside quotes", source.match(/(?:"[^"\n]*"|'[^'\n]*')/)?.[0], 'A matching pair of quotes makes a string: text. Change the words inside, keeping both quotes. "4" is text; 4 without quotes is a number you can calculate with.');
    add("python-call", "Ask an instruction to run", source.match(/print\([^\n]*/)?.[0], "print is a function that displays a value. The opening ( and closing ) hold what you give it. This is a call: it asks the function to run. Quotes are for text; a variable name goes without quotes.");
    add("python-assignment", "Remember a value", source.split("\n").find(line => /^\s*[A-Za-z_]\w*\s*=(?!=)/.test(line)), "The name on the left is a variable. = stores the value from the right in that name. Read the right side first. Later, the name uses the stored value. Assignment is different from ==, which compares two values.");
    add("python-block", "Keep instructions together", source.split("\n").find(line => /^\s*(def |if |elif |else:|for |while )/.test(line)), "A colon : starts a block of instructions. Indent each line inside by four spaces. A line back at the earlier indentation is outside the block. Keep related instructions lined up.");
    add("python-function", "Define, then call", source.split("\n").find(line => /^\s*def /.test(line)), "def introduces a function name. Names in its parentheses are parameters: places for inputs. A call supplies arguments, the actual values. Defining the function remembers its instructions; calling it runs them.");
    add("python-return", "Send a value back", source.split("\n").find(line => /^\s*return\b/.test(line)), "return sends a value back to the caller and ends this function call. Store it with = or use it in another expression. print shows a message instead; printing does not return that message.");
  }
  if ((!field || field === "html") && artifact.html) {
    const html = artifact.html;
    add("html-element", "Wrap content in an element", html.match(/<([a-z][\w-]*)\b[^>]*>[^<]+<\/\1>/i)?.[0] ?? html.split("\n")[0], "An opening tag such as <h1> starts an element. Its content comes next. The matching closing tag </h1> ends it; notice the slash. h1 is the main heading and p is a paragraph.");
    add("html-nesting", "Put elements inside elements", html.match(/<(?:main|section|article|div|ul|ol|form)\b[^>]*>/i)?.[0], "Nesting means placing one element inside another. Close the inside element before its parent. For example, <ul><li>A planet</li></ul> puts a list item inside a list.");
    add("html-attribute", "Give an element extra information", html.match(/<[a-z][\w-]*\b[^>]*\s[\w-]+\s*=\s*["'][^>]*>/i)?.[0], 'An attribute sits in the opening tag: name="value". The = links the name and value; quotes surround the value. id gives one element a unique name so CSS or JavaScript can find it. Keep IDs unique.');
    add("html-void", "Some elements have no closing tag", html.match(/<(?:input|img|br|hr|meta|link)\b[^>]*>/i)?.[0], "This is a void element. It has attributes but no content inside it and no closing tag. An input is a control; img uses src for the image and alt for a text description.");
  }
  if ((!field || field === "css") && artifact.css) {
    const css = artifact.css;
    add("css-rule", "Choose what to style", css.match(/[^{}]+\{[^}]*\}/)?.[0], "The selector before { chooses elements. h1 selects headings, .name selects a class and #name selects one ID. The braces { } hold the declarations that style those elements.");
    add("css-declaration", "Choose a property and value", css.match(/[\w-]+\s*:\s*[^;}]+;?/)?.[0], "A declaration has a property, a colon, a value, then a semicolon: color: green;. The colon separates what you change from its new value. A semicolon separates one declaration from the next.");
    add("css-units", "Give sizes a unit", css.match(/[\w-]+\s*:\s*[^;}]*\d(?:px|rem|em|%|vh|vw)[^;}]*;?/)?.[0], "Sizes need units: px means pixels, rem relates to the page’s base text size, and % is a share of the available size. Keep the unit beside the number. A colour name such as blue does not need a size unit.");
  }
  if ((!field || field === "source") && artifact.language === "javascript" && source) {
    add("js-text", "Text and stored values", source.match(/(?:const|let)\s+[^\n;]+;?/)?.[0] ?? source.match(/(?:"[^"\n]*"|'[^'\n]*')/)?.[0], 'Quotes mark strings such as "Hello". const gives a value a name; let allows later assignment. = assigns a value. Numbers without quotes can be calculated with: 4 + 2 is 6, while "4" + "2" joins text.');
    add("js-dom", "Find an element on your page", source.match(/document\.(?:getElementById|querySelector)\([^)]*\)/)?.[0], "document is your HTML page. The dot selects a method on it. Parentheses call that method with an argument. getElementById finds the exact HTML id; querySelector uses a CSS selector such as #message.");
    add("js-output", "Change what the visitor sees", source.split("\n").find(line => /\.(?:textContent|innerText|value)\s*=/.test(line)) ?? source.split("\n").find(line => /console\.log\(/.test(line)), /(?:textContent|innerText|\.value)/.test(source) ? "The dot selects a property of the element. Assigning textContent changes its visible text; assigning value changes a form control’s value. This is how this page shows its result." : "console.log(...) calls the console’s log method. It writes to the run’s log, rather than adding text to the HTML page.");
    add("js-event", "Wait for an event", source.split("\n").find(line => /addEventListener\(/.test(line)), 'addEventListener connects an event such as "click" to a function, called a callback. The callback runs when that event happens. Registering it does not run the click instructions yet.');
    add("js-arrow", "Read a small callback", source.split("\n").find(line => /=>/.test(line)), "() => { ... } is an arrow function. The parentheses hold parameters (empty means none); => begins the function; braces hold its instructions. The closing }); ends the block and the surrounding method call. Keep each opening mark paired with its closing mark.");
  }
  return pieces;
}
