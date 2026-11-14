import { z } from "zod";
import type { Execution, Json } from "./types";
import { privacyIssues } from "./studio-engines";

const text = z.string().max(1000);
const storyScene = z.object({ title: text, caption: text, picture: z.enum(["fox", "owl", "tree", "robot", "flower"]).optional(), moves: z.array(z.enum(["right", "left", "up", "down"])).max(20) }).strict();
const revisionSchema = z.object({ profile: z.record(z.string().max(40), text), story: z.array(storyScene).max(6) }).strict();
export const scenarioDocumentSchema = z.object({
  profile: z.record(z.string().max(40), text), audience: z.enum(["private", "classroom", "public"]),
  reuse: z.enum(["provided", "original", "omit"]).default("provided"),
  deviceBindings: z.array(z.object({ device: z.enum(["camera", "keyboard", "printer", "speaker", "scanner", "sensor"]), action: z.enum(["capture-picture", "enter-text", "print-card", "play-sound", "read-picture", "measure-distance"]) }).strict()).max(12),
  actions: z.array(z.object({ action: z.enum(["stop-contact", "reply-with-details", "ask-adult", "report-content", "report-contact", "report-conduct", "credit-creator", "request-permission", "copy-without-credit", "save-private", "share-public", "give-feedback", "revise", "restore-version"]), text, target: text }).strict()).max(30),
  chosenVersion: text, explanation: text,
  sourceChoice: z.string().max(80).optional(),
  story: z.array(storyScene).max(6),
}).strict();
export const scenarioInputSchema = z.object({
  concern: z.enum(["content", "contact", "conduct", "none"]).default("none"),
  permissionRequired: z.boolean().default(false), expectedVersion: text.default("v2"),
  permissionGranted: z.boolean().default(false), expectedCreator: text.default(""),
  message: text.default(""), reportDescriptions: z.array(text).max(8).default([]),
  sources: z.array(z.object({ id: z.string().max(80), title: text, creator: text, date: text, evidence: text, relevant: z.boolean(), supported: z.boolean(), permitted: z.boolean() }).strict()).max(8).default([]),
  versions: z.record(z.string().max(40), revisionSchema).default({}),
  deviceInput: text.default("A fictional instruction card"),
  deviceImage: z.object({ width: z.number().int().min(1).max(16), height: z.number().int().min(1).max(16), pixels: z.array(z.string().regex(/^#[a-f\d]{6}$/i)).max(256) }).strict()
    .refine((image) => image.pixels.length === image.width * image.height, "Supply one colour for each picture pixel")
    .default({ width: 2, height: 2, pixels: ["#166534", "#86efac", "#86efac", "#166534"] }),
  sensorPosition: z.number().finite().min(-100).max(100).default(0), objectPosition: z.number().finite().min(-100).max(100).default(3),
  storyStart: z.object({ x: z.number().int().min(0).max(5), y: z.number().int().min(0).max(5) }).strict().default({ x: 0, y: 0 }),
}).strict();
const capabilities = { camera: "capture-picture", keyboard: "enter-text", printer: "print-card", speaker: "play-sound", scanner: "read-picture", sensor: "measure-distance" } as const;
export function executeScenario(artifact: unknown, input: unknown): Execution {
  const runtime = "starliz-practice-scenario-1.0.0", trace: Json[] = [];
  try {
    const document = scenarioDocumentSchema.parse(artifact), fixture = scenarioInputSchema.parse(input);
    let profile = structuredClone(document.profile), scenes = structuredClone(document.story), restoredVersion = "", revisions = 0;
    let contactStopped = false, trustedHelp = false, reportRoute = "none", reportDescription = "", credited = false, permissionRequested = false, sharedPublicly = document.audience === "public", feedback = "", restored = false;
    for (const [index, action] of document.actions.entries()) {
      switch (action.action) {
        case "stop-contact": contactStopped = true; break;
        case "ask-adult": trustedHelp = true; break;
        case "report-content": case "report-contact": case "report-conduct": reportRoute = action.action.slice(7); reportDescription = action.text.trim(); break;
        case "credit-creator": credited = Boolean(action.text.trim() && action.target.trim()) && (!fixture.expectedCreator || action.target.trim() === fixture.expectedCreator); break;
        case "request-permission": permissionRequested = Boolean(action.target.trim()); break;
        case "copy-without-credit": credited = false; break;
        case "save-private": sharedPublicly = false; break;
        case "share-public": sharedPublicly = true; break;
        case "give-feedback": feedback = action.text; break;
        case "revise": {
          const match = /^scene:(\d+):caption$/.exec(action.target);
          if (match && scenes[Number(match[1])]) { scenes[Number(match[1])]!.caption = action.text; revisions++; }
          else if (/^profile:(nickname|favouriteColour|favouriteAnimal)$/.test(action.target)) { profile[action.target.slice(8)] = action.text; revisions++; }
          break;
        }
        case "restore-version": {
          const version = Object.hasOwn(fixture.versions, action.target) ? fixture.versions[action.target] : undefined;
          if (version) { profile = structuredClone(version.profile); scenes = structuredClone(version.story); restoredVersion = action.target; restored = action.target === fixture.expectedVersion; }
          break;
        }
      }
      trace.push({ step: index + 1, action: action.action, contactStopped, trustedHelp, reportRoute, credited, permissionRequested, sharedPublicly, restored });
    }
    const deviceOutputs = document.deviceBindings.map((binding) => ({ device: binding.device, action: binding.action,
      correct: capabilities[binding.device] === binding.action,
      output: capabilities[binding.device] !== binding.action ? "Unsupported action"
        : binding.device === "sensor" ? { distance: Math.abs(fixture.objectPosition - fixture.sensorPosition), unit: "squares" }
          : binding.device === "camera" || binding.device === "scanner" ? structuredClone(fixture.deviceImage)
            : fixture.deviceInput,
    }));
    const story = scenes.map((scene) => {
      let x = fixture.storyStart.x, y = fixture.storyStart.y;
      const positions: Json[] = [{ x, y }];
      for (const move of scene.moves) { x += move === "right" ? 1 : move === "left" ? -1 : 0; y += move === "down" ? 1 : move === "up" ? -1 : 0; positions.push({ x, y }); }
      return { title: scene.title, caption: scene.caption, picture: scene.picture ?? null, directions: scene.moves, positions, moves: scene.moves.length, inBounds: positions.every((point) => { const p = point as { x: number; y: number }; return p.x >= 0 && p.y >= 0 && p.x < 6 && p.y < 6; }) };
    });
    const sensitiveFields = Object.keys(profile).filter((field) => !["nickname", "favouriteColour", "favouriteAnimal"].includes(field) && Boolean(profile[field]?.trim()));
    const unsafeReply = document.actions.some((action) => action.action === "reply-with-details");
    const feedbackMessages = document.actions.filter((action) => action.action === "give-feedback").map((action) => action.text);
    const respectful = feedback.length > 10 && feedbackMessages.every((message) => !message.toLowerCase().split(/\W+/).some((word) => ["stupid", "idiot", "hate", "rubbish"].includes(word)));
    if (new Set(fixture.sources.map((source) => source.id)).size !== fixture.sources.length) throw new Error("Supplied source identifiers must be unique.");
    const source = fixture.sources.find((candidate) => candidate.id === document.sourceChoice);
    return { ok: true, output: { practiceOnly: true, realReportSent: false, profile, decisions: document.actions, deviceOutputs, devicesCorrect: deviceOutputs.every((device) => device.correct), deviceCount: deviceOutputs.length,
      privacySafe: sensitiveFields.length === 0 && privacyIssues({ ...document, profile, story: scenes }).length === 0 && !unsafeReply && !sharedPublicly,
      privateFields: sensitiveFields, contactStopped, trustedHelp, reportRoute,
      appropriateReport: fixture.concern === "none" || reportRoute === fixture.concern || trustedHelp, reportDescription,
      creditValid: document.reuse !== "provided" || credited && (!fixture.permissionRequired || fixture.permissionGranted), reuseDecision: document.reuse, permissionRequested, permissionGranted: fixture.permissionGranted,
      respectfulFeedback: respectful, actionableFeedback: respectful && /\b(change|add|try|make|use|move|increase|reduce|replace|remove|keep)\b/i.test(feedback) && /\b(read|button|colour|color|label|caption|step|words|picture|size|text)\b/i.test(feedback),
      restored, restoredVersion, availableVersions: Object.keys(fixture.versions), revisions, story, sceneCount: story.length,
      sourceReview: fixture.sources.length ? { selected: source?.id ?? null, creator: source?.creator ?? null, credited: Boolean(source && document.actions.some((action) => action.action === "credit-creator" && action.target.trim() === source.creator && action.text.trim())), relevant: source?.relevant ?? false, supported: source?.supported ?? false, permitted: source?.permitted ?? false, suitable: Boolean(source?.relevant && source.supported && source.permitted) } : null,
      storyRuns: story.length > 0 && story.every((scene) => scene.inBounds && Boolean(scene.title.trim() && scene.caption.trim())), explanation: document.explanation,
    }, trace, stdout: "Practice scenario completed. No real message or report was sent.", stderr: "", runtime, steps: trace.length };
  } catch (error) { return { ok: false, output: null, trace, stdout: "", stderr: "", error: error instanceof z.ZodError ? "Check the practice scenario's actions and fields." : error instanceof Error ? error.message : "The practice scenario could not run.", runtime, steps: trace.length }; }
}
