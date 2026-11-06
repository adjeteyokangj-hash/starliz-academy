import { web, scenario, eq, containsText, includes } from "../authoring";
import { fluidCSS } from "./semantic-interface-tools";

export const plannerContexts = [
  { title: "Model club supply planner", user: "a fictional model-club organiser", benefit: "prepare enough paper pieces without collecting member names", factor: 3, max: 10, unit: "paper pieces" },
  { title: "Museum card planner", user: "a fictional museum workshop organiser", benefit: "prepare enough display cards without collecting visitor details", factor: 4, max: 8, unit: "display cards" },
  { title: "Garden label planner", user: "a fictional garden-club organiser", benefit: "prepare enough plant labels without collecting gardener details", factor: 2, max: 12, unit: "plant labels" },
];
export function plannerPage(index: number, fault: "brief" | "keyboard" | null = null) {
  const c = plannerContexts[index]!;
  return `<main id="layout"><h1>${c.title}</h1><section aria-labelledby="brief-heading"><h2 id="brief-heading">User-centred brief</h2><p id="need">${fault === "brief" ? "Add a number box and a colourful button." : `Help ${c.user} ${c.benefit}.`}</p><p id="constraints">Private fictional counts only; no names, accounts or external requests. Native keyboard controls and readable narrow-screen feedback.</p><p id="acceptance">Accept whole counts 0 to ${c.max} inclusive; calculate count × ${c.factor} ${c.unit}; blank or out-of-range input clears the old result and explains the bounds.</p></section><section aria-labelledby="tool-heading"><h2 id="tool-heading">Working private tool</h2><label for="quantity">Fictional participant count (0 to ${c.max})</label><input id="quantity" type="text" inputmode="numeric" aria-describedby="feedback"><${fault === "keyboard" ? 'div role="button" tabindex="-1"' : 'button type="button"'} id="calculate">Calculate supplies</${fault === "keyboard" ? "div" : "button"}><p id="feedback" role="status" aria-live="polite"></p><output id="result" aria-live="polite"></output></section><section><h2>Retest plan</h2><p id="retest">At 320, 768 and 1024 CSS pixels: Tab to the count then Calculate, activate with Enter, verify zero and upper boundary, then replace valid input with blank. Confirm no horizontal page overflow, no covered action and persistent readable feedback. These are required checks, not a claim that an earlier test passed.</p></section></main>`;
}
export function plannerSource(index: number, rejectZero = false) { const c = plannerContexts[index]!; return `const quantity = document.getElementById('quantity');
const feedback = document.getElementById('feedback');
const result = document.getElementById('result');
document.getElementById('calculate').addEventListener('click', () => {
  const raw = quantity.value.trim();
  const count = Number(raw);
  const valid = /^[0-9]+$/.test(raw) && count >= ${rejectZero ? 1 : 0} && count <= ${c.max};
  quantity.setAttribute('aria-invalid', valid ? 'false' : 'true');
  if (!valid) { result.textContent = ''; feedback.textContent = 'Enter a whole count from 0 to ${c.max}.'; return; }
  result.textContent = String(count * ${c.factor}) + ' ${c.unit}';
  feedback.textContent = 'Calculated from the current fictional count.';
});`; }
export function plannerArtifact(index: number, fault: "brief" | "keyboard" | null = null) { return web(plannerPage(index, fault), plannerSource(index), fluidCSS); }
export function plannerCases(id: string, index: number, purpose = true) { const c = plannerContexts[index]!; return ["0", String(c.max), "", String(c.max + 1), "2.5"].map((raw, variant) => {
  const valid = /^[0-9]+$/.test(raw) && Number(raw) <= c.max;
  return scenario(`${id}-${variant}`, { events: [{ target: "quantity", type: "change", value: "2" }, { target: "calculate", type: "click" }, { target: "quantity", type: "change", value: raw }, { target: "calculate", type: "click" }] },
    ...(purpose ? [containsText("result.textsById.need", c.user, "The saved brief identifies the actual intended fictional user"), containsText("result.textsById.need", c.benefit, "The brief connects the tool to a concrete user benefit rather than listing features")] : []),
    containsText("result.textsById.constraints", "no names, accounts or external requests", "The explicit data minimisation constraint remains in the actual brief"),
    containsText("result.textsById.acceptance", `count × ${c.factor}`, "The measurable acceptance contract states the actual calculation"),
    eq("result.labelsValid", true, "The actual input is named"), eq("result.focusOrder", ["quantity", "calculate"], "Both native input and action are in their natural keyboard sequence"),
    includes("result.elements", { tag: "button", id: "calculate", text: "Calculate supplies", value: null, role: null, label: null, for: null, href: null, alt: null }, "Calculate is a real native button with built-in keyboard activation"),
    eq("result.textsById.result", valid ? `${Number(raw) * c.factor} ${c.unit}` : "", "Actual click execution computes the specified result including zero, or clears stale success on invalid input"),
    eq("result.textsById.feedback", valid ? "Calculated from the current fictional count." : `Enter a whole count from 0 to ${c.max}.`, "Persistent status describes the actual current entry"));
}); }
