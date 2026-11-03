import { authorModuleActivity, visual, scenario, eq } from "../authoring";
import { scenarioDocumentSchema } from "../scenario-engine";
import type { Predicate } from "../types";
type Document = ReturnType<typeof scenarioDocumentSchema.parse>;
type Brief = { nickname: string; pictures: Array<"fox" | "owl" | "robot">; devices: Document["deviceBindings"]; help: boolean; feedback: string };
const routes = { fox: ["right", "right", "down"], owl: ["down", "down", "right"], robot: ["right", "down", "down"] } as const;
const captions = { fox: "Fox moves right twice then down once.", owl: "Owl moves down twice then right once.", robot: "Robot moves right once then down twice." };
const usefulDevices: Document["deviceBindings"] = [{ device: "keyboard", action: "enter-text" }, { device: "camera", action: "capture-picture" }, { device: "printer", action: "print-card" }];
function document(brief: Brief, mode: "starter" | "reference" | "faulty"): Document {
  const correct = mode === "reference";
  return { profile: { nickname: brief.nickname, ...(!correct ? { address: "Example House in a fictional town" } : {}) }, audience: correct ? "private" : "public", reuse: "original", deviceBindings: mode === "starter" ? [] : brief.devices,
    chosenVersion: "", explanation: "A fictional private learning guide.",
    actions: correct ? [
      ...(brief.help ? [{ action: "stop-contact" as const, text: "", target: "" }, { action: "ask-adult" as const, text: "", target: "" }] : []),
      { action: "give-feedback", text: brief.feedback, target: "fictional picture" },
    ] : [{ action: "reply-with-details", text: "An unsafe fictional reply", target: "unknown contact" }],
    story: brief.pictures.map((picture) => ({ title: `${brief.nickname}'s ${picture} scene`, picture, caption: captions[picture], moves: correct || mode === "faulty" ? [...routes[picture]] : [] })),
  };
}
function cases(id: string, brief: Brief) {
  return [0, 1].map((shift) => {
    const assertions: Predicate[] = [eq("privacySafe", true, "The actual profile and story remain private without identifying fields"), eq("profile.nickname", brief.nickname, "A fictional nickname remains"), eq("sceneCount", brief.pictures.length, "The requested scenes are present"), eq("storyRuns", true, "Every captioned scene has a runnable bounded route"),
      eq("deviceCount", brief.devices.length, "Every requested device is demonstrated"), eq("devicesCorrect", true, "The demonstrated devices perform supported actions"), eq("respectfulFeedback", true, "Feedback is respectful"), eq("actionableFeedback", true, "Feedback gives a useful next step"), eq("realReportSent", false, "The simulated actions send no real report")];
    brief.devices.forEach((device, index) => assertions.push(eq(`deviceOutputs.${index}.device`, device.device, "The correct device is demonstrated in order")));
    brief.pictures.forEach((picture, index) => assertions.push(eq(`story.${index}.picture`, picture, "The requested picture is included"), eq(`story.${index}.directions`, [...routes[picture]], "The executable route follows the instructions"), eq(`story.${index}.caption`, captions[picture], "The caption matches the route")));
    if (brief.help) assertions.push(eq("contactStopped", true, "Unwanted contact is stopped"), eq("trustedHelp", true, "A trusted adult is asked for help"));
    return scenario(`${id}-${shift}`, { storyStart: { x: shift, y: shift }, concern: brief.help ? "contact" : "none", deviceInput: shift ? "Fictional second guide" : "Fictional first guide", sensorPosition: shift, objectPosition: shift + 4 }, ...assertions);
  });
}
const words = (brief: Brief) => `Use fictional nickname ${brief.nickname}. Include these scenes in order: ${brief.pictures.map((picture) => `${picture}: ${captions[picture]}`).join(" ")} Demonstrate ${brief.devices.map((device) => device.device + " → " + device.action).join(", ")}. Give this helpful feedback: ${brief.feedback}${brief.help ? " Stop contact and ask a trusted adult; remove unsafe replies." : ""} Remove identifying fields and keep the audience private.`;
const brief = (nickname: string, pictures: Brief["pictures"], devices: Document["deviceBindings"], help = false): Brief => ({ nickname, pictures, devices, help, feedback: "Try a larger caption because the words are hard to read." });
function activity(spec: { slot?: 1 | 2 | 3; kind?: "project"; title: string; objective: string; teaching: string; reasoning: [string, string]; brief: Brief; transfers: [Brief, Brief] }) {
  return authorModuleActivity({ moduleId: "first-instructions/safe-creators", kind: spec.kind ?? "consolidation", slot: spec.slot, title: spec.title, objective: spec.objective,
    concepts: ["private", "scene", "device", "trusted adult"], essentialChecks: ["Private details and unsafe replies are removed", "Every caption, picture and executable route agrees", "Device demonstrations produce actual fixture outputs", "A helpful response and appropriate help choice are recorded"],
    faultDescription: "Working scenes conceal an identifying profile field, a public audience and an unsafe reply. Repair the saved safety decisions while keeping the requested scenes and useful device demonstrations.",
    explanation: `${spec.teaching} ${words(spec.brief)} These are fictional practice choices; no message is sent and no real camera or printer is accessed. Run the complete guide and replay every scene before explaining your choices.`,
    reasoning: spec.reasoning, starter: visual(document(spec.brief, "starter")), reference: visual(document(spec.brief, "reference")), faulty: visual(document(spec.brief, "faulty")), cases: cases("safe-guide", spec.brief),
    transfer: spec.transfers.map((fresh, index) => ({ task: words(fresh), starter: visual(document(fresh, "starter")), reference: visual(document(fresh, "reference")), cases: cases(`unfamiliar-guide-${index + 1}`, fresh) })),
    prediction: { prompt: "A story runs correctly but its profile still contains an address. Is it ready to share with the family portfolio?", choices: ["Yes, a working route removes the address", "No, remove the identifying field and verify the private version", "Yes, if the title says private"], correct: 1 },
    ...(spec.kind ? { workflow: { saveAndReplay: true, restoreVersion: true } } : {}),
  });
}
const recall = activity({ slot: 1, title: "Recall safe choices in a new story", objective: "Retrieve privacy, device and story-making knowledge in one unfamiliar practical task.",
  teaching: "Remember the difference between a fictional nickname and a detail that identifies a real child. Removing a private field changes the saved content; changing only the audience does not remove the words. Combine a safe profile with a matching picture, caption and route, then demonstrate a device that performs a useful action.",
  reasoning: ["A made-up nickname and a running Fox scene meet different needs: one keeps the character fictional and the other demonstrates the story instructions.", "A keyboard enters the supplied fictional words. It cannot capture a picture, even if the guide has a good privacy choice."], brief: brief("Cedar", ["fox"], [usefulDevices[0]!]), transfers: [brief("Willow", ["owl"], [usefulDevices[1]!]), brief("Hazel", ["robot"], [usefulDevices[2]!])] });
const repair = activity({ slot: 2, title: "Repair a story's hidden safety fault", objective: "Repair unsafe profile, sharing and reply choices without breaking working scenes.",
  teaching: "A story may look finished while its saved profile still reveals details or its decisions include an unsafe reply. Inspect the profile, audience and decision list as well as the route. Remove the unsafe reply, stop contact and ask a trusted adult. Keep the two working scenes and test them again after the repair.",
  reasoning: ["The seeded story already moves. Its safety fault needs a change to actual fields and decisions, not extra arrows.", "A trusted adult choice does not cancel a previous reply with details. Remove that unsafe action from the recorded decisions."], brief: brief("Maple", ["fox", "owl"], [usefulDevices[0]!], true), transfers: [brief("Rowan", ["robot", "fox"], [usefulDevices[2]!], true), brief("Birch", ["owl", "robot"], [usefulDevices[1]!], true)] });
const review = activity({ slot: 3, title: "Independent first-course practical review", objective: "Combine safe practical creation, device knowledge and respectful feedback in an independent transfer task.",
  teaching: "Use the skills from the first course together. Build the requested scenes, demonstrate the named devices and choose helpful feedback for a fictional maker. Check the whole guide rather than only the easiest part. A working device does not prove privacy, and a private profile does not prove the story route matches its caption.",
  reasoning: ["Two different device outputs show different useful jobs. Read the fictional text and inspect the picture pixels when checking them.", "Helpful feedback suggests a change to the work. A polite sentence with no useful next step does not complete that part of the brief."], brief: brief("Aspen", ["owl", "fox"], [usefulDevices[1]!, usefulDevices[2]!]), transfers: [brief("Juniper", ["robot", "owl"], [usefulDevices[0]!, usefulDevices[1]!]), brief("Holly", ["fox", "robot"], [usefulDevices[2]!, usefulDevices[0]!])] });
const portfolio = activity({ kind: "project", title: "Portfolio: the safe creator's story guide", objective: "Create, save, retrieve and defend a complete private guide with scenes, device demonstrations and safe help choices.",
  teaching: "Create a private guide that shows what you can make and how you choose safe actions. Include both requested scenes, three useful device demonstrations, helpful feedback and a stop-and-help response to fictional unwanted contact. Save the complete artifact, retrieve that version and replay it before explaining a choice using its actual output.",
  reasoning: ["Each scene needs its own picture, caption and ordered arrows. Each of the three devices must demonstrate a different supported action.", "The saved guide must retain both its working creation and its safety decisions. Retrieve the version, check every part and explain why the character needs a fictional nickname instead of an address."], brief: brief("Acorn", ["fox", "owl"], usefulDevices, true), transfers: [brief("Chestnut", ["robot", "fox"], [usefulDevices[2]!, usefulDevices[0]!, usefulDevices[1]!], true), brief("Oak", ["owl", "robot"], [usefulDevices[1]!, usefulDevices[2]!, usefulDevices[0]!], true)] });

export const safeCreatorRetrievalActivities = [recall, repair, review, portfolio];
