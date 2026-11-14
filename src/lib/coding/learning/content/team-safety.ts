import { authorLesson, visual, scenario, eq, containsText } from "../authoring";
import { scenarioDocumentSchema } from "../scenario-engine";
import type { Json, Predicate } from "../types";

const blank = scenarioDocumentSchema.parse({ profile: { nickname: "Fictional creator" }, audience: "private", reuse: "original", deviceBindings: [], actions: [], chosenVersion: "", explanation: "", story: [] });
type Action = typeof blank.actions[number];
const action = (name: Action["action"], text = "", target = ""): Action => ({ action: name, text, target });
const artifact = (patch: Partial<typeof blank>) => visual({ ...blank, ...patch });
const safe = [eq("privacySafe", true, "No detected private details, unsafe replies or public sharing remain"), eq("practiceOnly", true, "Only a fictional practice scenario runs"), eq("realReportSent", false, "No real message or report is sent")];
const examples = [
  { name: "Trail instructions", finding: "The label says Go but does not name the next action.", feedback: "The button label says Go. Replace the button label with Check answer so readers know the next action.", evidence: "label says Go", change: "Check answer" },
  { name: "Museum instructions", finding: "The caption has no instruction telling the player to choose one object.", feedback: "The caption omits the choice instruction. Add the words Choose one object to the caption before the Check button.", evidence: "caption omits", change: "Choose one object" },
  { name: "Garden instructions", finding: "The steps say Check before the player has made a choice.", feedback: "The steps place Check before a choice. Move the Choose one tool step before Check so the player can answer first.", evidence: "steps place Check", change: "Choose one tool" },
];
function feedbackCases(spec: typeof examples[number], index: number) {
  const checks = [...safe, eq("respectfulFeedback", true, "Feedback addresses the work without the listed insulting terms"), eq("actionableFeedback", true, "Feedback names an actionable change to the creation"), containsText("decisions.0.text", spec.evidence, "The comment cites the observed finding"), containsText("decisions.0.text", spec.change, "The comment names the relevant concrete repair")];
  return [0, 1].map((variant) => scenario(`specific-feedback-${index}-${variant}`, { message: `${spec.name}: ${spec.finding}${variant ? " The fictional tester repeats the same difficulty." : ""}` }, ...checks));
}
const feedback = authorLesson({ id: "Y4.20", workbench: "scenario", concepts: ["feedback", "evidence", "respect", "actionable"],
  explanation: "Useful feedback describes an observable part of a creation and suggests a relevant change. The fictional trail tester sees a button labelled Go and cannot tell what happens next. Give feedback about that button: cite that its label says Go and suggest replacing it with Check answer. Avoid comments about the creator's intelligence or ability. Enter one Give feedback action and try it. Inspect the actual decision text, compare it with the supplied finding and explain why the suggested change helps that reader. Automated checks here look for the stated finding, repair and listed language rules; your saved explanation still needs review. They cannot prove that every possible sentence is respectful.",
  reasoning: ["A comment such as nice work gives no evidence or next step. Naming the ambiguous button and replacement label gives the creator a repair they can test.", "Calling the creator stupid targets a person. Describe the button's wording and its effect on a reader instead."],
  starter: artifact({}), reference: artifact({ actions: [action("give-feedback", examples[0]!.feedback)] }), faulty: artifact({ actions: [action("give-feedback", "You are stupid and your work is rubbish.")] }), cases: feedbackCases(examples[0]!, 0),
  transfer: examples.slice(1).map((spec, index) => ({ task: `Review ${spec.name}. Finding: ${spec.finding} Give one respectful feedback action citing the finding and a concrete repair: ${spec.change}. Address the creation and explain how the change helps.`, starter: artifact({}), reference: artifact({ actions: [action("give-feedback", spec.feedback)] }), cases: feedbackCases(spec, index + 1) })),
  prediction: { prompt: "Which comment gives useful feedback about the creation?", choices: ["You are bad at this", "The button says Go; replace its label with Check answer", "Everything is nice"], correct: 1 },
});

const sharing = [
  { name: "Trail team", field: "password", fake: "FICTIONAL-NOT-A-REAL-PASSWORD" },
  { name: "Museum team", field: "recoveryCode", fake: "FICTIONAL-NOT-A-REAL-RECOVERY-CODE" },
  { name: "Garden team", field: "accessToken", fake: "FICTIONAL-NOT-A-REAL-ACCESS-TOKEN" },
];
const privateDocument = () => artifact({ profile: { nickname: "Fictional team creator" }, actions: [action("save-private"), action("ask-adult", "Ask a trusted adult using the school's known help route.")], explanation: "Keep sign-in secrets out of project notes, restrict the audience and ask a trusted adult if a secret was shared." });
function sharingCases(spec: typeof sharing[number], index: number) {
  return ["A fictional note was shared with a viewer.", "The fictional note might have been copied."].map((message, variant) => scenario(`protect-file-${index}-${variant}`, { message: `${spec.name}: ${message} Remove the ${spec.field} from the profile and use trusted help.` }, ...safe, eq("privateFields", [], "No sign-in or recovery fields are retained in the profile"), eq("trustedHelp", true, "A trusted adult help route is selected"), containsText("explanation", "secret", "The saved explanation identifies why sign-in information needs protection")));
}
const accounts = authorLesson({ id: "Y4.21", workbench: "scenario", concepts: ["secret", "audience", "trusted help", "account"],
  explanation: "Passwords, recovery codes and access tokens are sign-in secrets. Do not enter a real one in this lesson. The starter uses a clearly fictional marker in a shared profile to demonstrate the problem. Remove that entire secret field, retain only a fictional nickname and choose the private audience. Queue Save private and Ask adult through the school's known help route. If a real secret was exposed, a trusted adult can help secure the account; simply deleting a note does not undo copies. Explain why the secret must stay outside projects. Preview checks the actual profile, audience and chosen help action, without signing into or modifying a real account.",
  reasoning: ["A nickname can identify the fictional character without revealing a credential. A password field remains a sign-in field even when its value looks harmless.", "Changing a shared note to private cannot recall copies. Trusted adult help is still needed if an actual secret was exposed."],
  starter: artifact({ audience: "public", profile: { nickname: "Fictional creator", password: sharing[0]!.fake } }), reference: privateDocument(), faulty: artifact({ audience: "private", profile: { nickname: "Fictional creator", password: sharing[0]!.fake }, actions: [action("ask-adult")] }), cases: sharingCases(sharing[0]!, 0),
  transfer: sharing.slice(1).map((spec, index) => ({ task: `Repair ${spec.name}'s sharing plan. Remove the fictional ${spec.field} field, retain only a fictional nickname, limit the audience to private, save privately and choose trusted adult help. Explain the secret-protection decision; never enter an actual credential.`, starter: artifact({ audience: "public", profile: { nickname: "Fictional creator", [spec.field]: spec.fake } }), reference: privateDocument(), cases: sharingCases(spec, index + 1) })),
  prediction: { prompt: "A sign-in secret was placed in a shared project. What should you do?", choices: ["Copy it into the public caption", "Ask other viewers to try it", "Remove it, limit sharing and ask a trusted adult for help"], correct: 2 },
});

const concerns = [
  { concern: "contact", message: "A fictional unknown sender asks for a sign-in secret.", description: "Unknown sender requested sign-in information." },
  { concern: "content", message: "A fictional page contains an unsuitable picture.", description: "Unsuitable picture on the fictional page." },
  { concern: "conduct", message: "A fictional game player repeatedly sends unkind messages.", description: "Repeated unkind messages in the fictional game." },
] as const;
const response = (spec: typeof concerns[number]) => artifact({ actions: [action("stop-contact"), action(`report-${spec.concern}`, spec.description), action("ask-adult", "Use the known trusted adult help route.")], explanation: "Stop interacting, use the appropriate reporting route and share only a short non-identifying description with a trusted adult." });
function concernCases(spec: typeof concerns[number], index: number) {
  const checks: Predicate[] = [...safe, eq("contactStopped", true, "Interaction with the concerning source is stopped"), eq("trustedHelp", true, "Trusted adult help is chosen"), eq("reportRoute", spec.concern, "The report matches content, contact or conduct"), eq("reportDescription", spec.description, "Only the stated short fictional description is supplied")];
  return [0, 1].map((variant) => scenario(`concern-${index}-${variant}`, { concern: spec.concern, message: `${spec.message}${variant ? " The source asks the learner to investigate further." : ""}`, reportDescriptions: [spec.description] } as Json, ...checks));
}
const reporting = authorLesson({ id: "Y4.22", workbench: "scenario", concepts: ["content", "contact", "conduct", "minimal evidence"],
  explanation: "You do not need to investigate an unknown contact or collect more upsetting material to ask for help. In the fictional unknown-sender example, stop contact, choose Report contact and use only the short description Unknown sender requested sign-in information. Ask a trusted adult using a known help route. Do not reply, click an unfamiliar link or add a name, address, password or screenshot. Content concerns describe material; contact concerns describe someone approaching you; conduct concerns describe behaviour. Choose the route that matches each new fictional situation. This is a bounded practice model: no real report is sent, so an actual concern still needs the real school's or service's reporting process and trusted help.",
  reasoning: ["A stranger requesting a secret is a contact concern. An unsuitable picture is content, while repeated unkind player messages are conduct.", "A short description is enough for this practice. Investigating further or copying private details creates additional exposure."],
  starter: artifact({}), reference: response(concerns[0]), faulty: artifact({ actions: [action("reply-with-details", "I will investigate the unknown sender."), action("report-content", concerns[0].description)] }), cases: concernCases(concerns[0], 0),
  transfer: concerns.slice(1).map((spec, index) => ({ task: `${spec.message} Stop interaction, select the matching ${spec.concern} report route, use only “${spec.description}” and ask a trusted adult. Do not investigate or add identifying information.`, starter: artifact({}), reference: response(spec), cases: concernCases(spec, index + 1) })),
  prediction: { prompt: "An unknown sender asks for a secret. Which is the appropriate practice response?", choices: ["Investigate their account yourself", "Stop contact, report contact and ask a trusted adult", "Send a secret to check whether they are trustworthy"], correct: 1 },
});
export const teamSafetyActivities = [feedback, accounts, reporting];
