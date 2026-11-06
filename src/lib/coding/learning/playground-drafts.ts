import { beginnerTracks } from "./beginner-playground";
import { practicalArtifactSchema, type PracticalArtifact } from "./types";
import { htmlLanguage } from "@codemirror/lang-html";

export const playgroundStorageKey = "starliz-coding-playground-v2";
export type PlaygroundSession = { version: 2; trackId: string; stepIndex: number; drafts: Record<string, PracticalArtifact> };
export const emptyPlaygroundSession = (): PlaygroundSession => ({ version: 2, trackId: "python", stepIndex: 0, drafts: {} });

/** Never replace an existing downstream draft. New steps copy the most recent
 * earlier draft once. Returning to a step restores that independent snapshot. */
export function openPlaygroundStep(drafts: Record<string, PracticalArtifact>, id: string): PracticalArtifact {
  if (drafts[id]) return structuredClone(drafts[id]);
  const track = beginnerTracks.find(item => item.steps.some(step => step.id === id));
  const step = track?.steps.find(item => item.id === id);
  if (!step || !track) throw new Error("Unknown practice step");
  if (track.id !== "web" || id === "planet-html") return structuredClone(step.starter);
  const previous = openPlaygroundStep(drafts, id === "planet-css" ? "planet-html" : "planet-css");
  if (previous.type !== "source" || step.starter.type !== "source") return structuredClone(step.starter);
  if (id === "planet-css") return { ...previous, css: previous.css || step.starter.css };
  // Reserve distinct IDs instead of taking over a learner's existing elements.
  // This extension is inserted before </body> for full documents, or appended
  // for HTML fragments; the learner's original bytes are otherwise untouched.
  let suffix = 0, bodyEnd = -1;
  const originalHTML = previous.html ?? "", ids = new Set<string>();
  htmlLanguage.parser.parse(originalHTML).iterate({ enter(node) {
    if (node.name === "Attribute") {
      const name = node.node.getChild("AttributeName"), value = node.node.getChild("AttributeValue") ?? node.node.getChild("UnquotedAttributeValue");
      if (name && value && originalHTML.slice(name.from, name.to).toLowerCase() === "id") ids.add(originalHTML.slice(value.from, value.to).replace(/^["']|["']$/g, ""));
    }
    if (node.name === "CloseTag") { const tag = node.node.getChild("TagName"); if (tag && originalHTML.slice(tag.from, tag.to).toLowerCase() === "body") bodyEnd = node.from; }
  } });
  while (ids.has(`starliz-hello${suffix || ""}`) || ids.has(`starliz-message${suffix || ""}`)) suffix++;
  const button = `starliz-hello${suffix || ""}`, message = `starliz-message${suffix || ""}`;
  const scaffold = `\n<button id="${button}">Say hello</button>\n<p id="${message}">Click the button!</p>\n`;
  const html = bodyEnd < 0 ? originalHTML + scaffold : originalHTML.slice(0, bodyEnd) + scaffold + originalHTML.slice(bodyEnd);
  const script = `document.getElementById("${button}").addEventListener("click", () => {\n  document.getElementById("${message}").textContent = "Hello, explorer!";\n});`;
  return { ...previous, html, source: [previous.source, script].filter(Boolean).join("\n\n") };
}

export function restorePlaygroundSession(raw: string | null): PlaygroundSession {
  const session = emptyPlaygroundSession();
  if (!raw) return session;
  try {
    const value = JSON.parse(raw);
    // Accept the older drafts-only shape as well as the versioned envelope.
    const drafts = value.drafts ?? value;
    for (const track of beginnerTracks) for (const step of track.steps) {
      const parsed = practicalArtifactSchema.safeParse(drafts[step.id]);
      if (parsed.success && parsed.data.type === "source" && step.starter.type === "source" && parsed.data.language === step.starter.language && parsed.data.entry === step.starter.entry) session.drafts[step.id] = parsed.data;
    }
    const track = beginnerTracks.find(item => item.id === value.trackId);
    if (track) { session.trackId = track.id; session.stepIndex = Number.isInteger(value.stepIndex) ? Math.max(0, Math.min(track.steps.length - 1, value.stepIndex)) : 0; }
  } catch { /* Malformed storage cannot replace a valid practice starter. */ }
  return session;
}

export function samePlaygroundArtifact(left: PracticalArtifact, right: PracticalArtifact) { return JSON.stringify(left) === JSON.stringify(right); }

export function resetPlaygroundStep(id: string, current: PracticalArtifact): PracticalArtifact {
  const step = beginnerTracks.flatMap(track => track.steps).find(item => item.id === id)!;
  if (current.type !== "source" || step.starter.type !== "source") return structuredClone(step.starter);
  let value = step.starter[step.field] ?? "";
  if (id === "planet-js") {
    // The appended scaffold follows the learner's original content. Do not
    // mistake an earlier learner-owned ID for the scaffold after a reset.
    const button = [...(current.html ?? "").matchAll(/<button\s+id=["'](starliz-hello\d*)["']>Say hello<\/button>/g)].at(-1)?.[1] ?? "hello";
    const message = button === "hello" ? "message" : button.replace("starliz-hello", "starliz-message");
    value = value.replaceAll('"hello"', JSON.stringify(button)).replaceAll('"message"', JSON.stringify(message));
  }
  return { ...current, [step.field]: value };
}
