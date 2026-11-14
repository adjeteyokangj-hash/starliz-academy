import { authorLesson, visual, scenario, eq, range } from "../authoring";
import { scenarioDocumentSchema } from "../scenario-engine";
import type { Json, Predicate } from "../types";

const blank = scenarioDocumentSchema.parse({ profile: { nickname: "Fox" }, audience: "private", reuse: "original", deviceBindings: [], actions: [], chosenVersion: "", explanation: "", story: [] });
type Document = typeof blank;
const artifact = (patch: Partial<Document> = {}) => visual({ ...blank, ...patch });
const decision = (action: Document["actions"][number]["action"], text = "", target = ""): Document["actions"][number] => ({ action, text, target });
const safe = [eq("privacySafe", true, "Private details and unsafe replies are absent"), eq("practiceOnly", true, "Only fictional practice choices run"), eq("realReportSent", false, "No real report or message is sent")];
const help = [eq("contactStopped", true, "Contact has been stopped"), eq("trustedHelp", true, "Trusted adult help has been chosen")];
const pair = (id: string, input: Record<string, Json>, checks: Predicate[]) => [0, 1].map((index) => scenario(`${id}-${index}`, { ...input, deviceInput: index ? "Fictional owl visitors" : "Fictional fox visitors", sensorPosition: index, objectPosition: index + 4 }, ...checks));
const story = (title: string, caption: string, picture: Document["story"][number]["picture"] = "fox", moves: Document["story"][number]["moves"] = ["right", "down"]) => ({ title, caption, picture, moves });

const libraryBindings: Document["deviceBindings"] = [{ device: "keyboard", action: "enter-text" }, { device: "printer", action: "print-card" }];
const gardenBindings: Document["deviceBindings"] = [{ device: "sensor", action: "measure-distance" }, { device: "speaker", action: "play-sound" }];
const museumBindings: Document["deviceBindings"] = [{ device: "scanner", action: "read-picture" }, { device: "speaker", action: "play-sound" }];
const deviceChecks = (bindings: Document["deviceBindings"]) => [...safe, eq("devicesCorrect", true, "Inputs and outputs use supported device actions"), range("deviceCount", bindings.length, bindings.length, "Each requested device runs"), ...bindings.map((binding, index) => eq(`deviceOutputs.${index}.device`, binding.device, `Device ${index + 1} matches the brief`))];
const devices = authorLesson({ id: "Y2.19", concepts: ["input", "output", "device"],
  explanation: "A community computer takes an input, follows instructions and produces an output. In our fictional library, a keyboard enters visitor words and a printer puts those words on a card. A printer does not enter keyboard text. Choose each useful device action, run it and inspect the actual returned words, picture pixels or measured distance. These are working models of inputs and outputs; they do not access real cameras, printers or sensors. Explain which information goes in and which result comes out.",
  reasoning: ["Pair the keyboard with enter-text and the printer with print-card. Compare their returned words with the fictional input.", "A garden distance sensor returns the distance between two supplied positions. A speaker produces the supplied words as its output."],
  starter: artifact(), reference: artifact({ deviceBindings: libraryBindings, explanation: "The keyboard enters visitor words and the printer outputs a visitor card." }),
  faulty: artifact({ deviceBindings: [{ device: "keyboard", action: "print-card" }, libraryBindings[1]!] }),
  cases: pair("library-input-output", { message: "Make a library visitor card: enter words with a keyboard, then print the card." }, deviceChecks(libraryBindings)),
  transfer: [
    { task: "Build a fictional garden helper: use a sensor to measure the distance and a speaker to play the visitor words. Explain the input and output.", reference: artifact({ deviceBindings: gardenBindings, explanation: "The sensor takes positions as input. It returns a distance of four squares; the speaker outputs the visitor words." }), cases: pair("garden-devices", { message: "Garden helper: sensor first, speaker second." }, [...deviceChecks(gardenBindings), eq("deviceOutputs.0.output.distance", 4, "The distance is calculated from the supplied positions"), eq("deviceOutputs.0.output.unit", "squares", "The measured output has a unit")]) },
    { task: "Build a fictional museum helper: a scanner reads the supplied picture and a speaker plays the visitor words. Explain how these jobs differ.", reference: artifact({ deviceBindings: museumBindings, explanation: "The scanner reads picture pixels as input and the speaker plays visitor words as output." }), cases: pair("museum-devices", { message: "Museum helper: scanner first, speaker second." }, [...deviceChecks(museumBindings), eq("deviceOutputs.0.output.pixels", ["#166534", "#86efac", "#86efac", "#166534"], "The scanner returns the supplied picture pixels")]) },
  ], prediction: { prompt: "Which action can a printer perform in this model?", choices: ["Enter keyboard words", "Print the supplied card", "Measure distance"], correct: 1 },
});

const versionSet = (name: string, picture: Document["story"][number]["picture"]): Record<string, Json> => ({
  [`${name}-draft`]: { profile: { nickname: "Fox" }, story: [story(`${name} draft`, "Move right to the entrance.", picture, ["right"])] },
  [`${name}-ready`]: { profile: { nickname: "Owl" }, story: [story(`${name} visitor guide`, "Move right then down to the welcome desk.", picture)] },
});
const retrieval = (name: string) => artifact({ actions: [decision("restore-version", "", `${name}-ready`)] });
const retrieveCases = (name: string, picture: Document["story"][number]["picture"]) => pair(`${name}-versions`, { versions: versionSet(name, picture), expectedVersion: `${name}-ready`, message: `Retrieve ${name}-ready. Keep the named draft source available.` }, [...safe, eq("restored", true, "The intended saved content was actually retrieved"), eq("restoredVersion", `${name}-ready`, "The readable ready-version name matches"), eq("profile.nickname", "Owl", "The saved character is retrieved"), eq("story.0.title", `${name} visitor guide`, "The saved story replaces the current draft"), eq("story.0.directions", ["right", "down"], "The saved route replays in order"), eq("availableVersions", [`${name}-draft`, `${name}-ready`], "The original named sources remain available")]);
const versions = authorLesson({ id: "Y2.20", concepts: ["version", "retrieve", "save"],
  explanation: "A useful file name tells us which creation and which version it contains. Open the saved source cards and compare the draft with the ready guide. Retrieve library-ready using its name; typing a name without retrieving content does not change a story. Run and inspect the retrieved caption and route. Then save your own workspace version, restore that saved work using Your saved versions, and replay it. Restoring makes a working copy and keeps earlier versions. These are two separate operations: selecting supplied source content and saving your own work.",
  reasoning: ["The library draft has a one-step route. The ready guide has right then down. Run after retrieval and check the actual moves, not just its label.", "Save version records your working artifact. Restore it from Your saved versions, then run again to prove that the saved work can be replayed."],
  starter: artifact({ story: [story("Unsaved draft", "Move right.", "fox", ["right"])] }), reference: retrieval("library"), faulty: artifact({ chosenVersion: "library-ready", actions: [decision("restore-version", "", "library-draft")] }),
  cases: retrieveCases("library", "owl"), workflow: { saveAndReplay: true, restoreVersion: true },
  transfer: [
    { task: "Retrieve garden-ready, check its caption and two-step route, then save, restore and replay your own working copy without removing the draft source.", reference: retrieval("garden"), cases: retrieveCases("garden", "flower") },
    { task: "Find museum-ready rather than museum-draft. Inspect its actual restored content, then save, restore and replay your working copy.", reference: retrieval("museum"), cases: retrieveCases("museum", "robot") },
  ], prediction: { prompt: "What proves that the ready version was retrieved?", choices: ["Typing its name in a label", "Deleting every draft", "Inspecting the saved content and replaying its route"], correct: 2 },
});

const credit = (creator: string) => artifact({ reuse: "provided", actions: [decision("credit-creator", `Picture by ${creator}`, creator)] });
const creditCases = (name: string, granted: boolean) => pair(`${name}-credit`, { expectedCreator: name, permissionRequired: true, permissionGranted: granted, message: granted ? `The fictional creator ${name} has allowed this picture to be used with a credit.` : `The fictional creator ${name} has not given permission. Choose your own original picture instead.` }, [...safe, eq("creditValid", true, "The reuse decision respects credit and actual permission"), eq("permissionGranted", granted, "A request cannot change the creator's permission"), eq("reuseDecision", granted ? "provided" : "original", "The picture choice follows this brief")]);
const respect = authorLesson({ id: "Y2.21", concepts: ["creator", "permission", "credit"],
  explanation: "A picture belongs to its creator even when it is easy to copy. Read the fictional creator's permission note. If reuse is allowed, choose the provided picture and add a clear credit naming its creator. Asking for permission is different from receiving permission. If permission has not been given, use your own original picture or leave the provided picture out; do not pretend that a request grants permission. Our original character pictures are available for practice. The supplied creator's picture and permission record are kept unchanged.",
  reasoning: ["Rowan has already allowed reuse with a credit. Add Picture by Rowan and put Rowan in the credit's target field.", "If Willow has not agreed, adding Ask for permission still leaves permission ungranted. Choose an original picture rather than copying Willow's work."],
  starter: artifact({ reuse: "provided" }), reference: credit("Rowan"), faulty: artifact({ reuse: "provided", actions: [decision("copy-without-credit")] }), cases: creditCases("Rowan", true),
  transfer: [
    { task: "Ash has allowed the provided picture to be used with a credit. Choose it and acknowledge Ash as its creator.", reference: credit("Ash"), cases: creditCases("Ash", true) },
    { task: "Willow has not given permission. Choose your own original picture and add a short original robot scene. A request alone is not permission.", reference: artifact({ reuse: "original", story: [story("My original robot", "Robot moves right then down.", "robot")] }), cases: creditCases("Willow", false).map((item) => ({ ...item, assertions: [...item.assertions, eq("storyRuns", true, "The new original picture has its own replayable scene"), eq("story.0.picture", "robot", "The original robot picture is used")] })) },
  ], prediction: { prompt: "You asked to copy a picture but have no answer. What is true?", choices: ["Permission has automatically been granted", "Credit means permission is never needed", "You can make your own picture while permission is ungranted"], correct: 2 },
});

const safeContact = artifact({ actions: [decision("stop-contact"), decision("ask-adult")] });
const contactCases = (id: string, message: string) => pair(id, { concern: "contact", message }, [...safe, ...help, eq("appropriateReport", true, "Trusted help is an appropriate route")]);
const contact = authorLesson({ id: "Y2.22", concepts: ["private", "contact", "trusted adult"],
  explanation: "An unknown message may ask for private details or ask a child to keep contact secret. In these fictional situations, do not send a reply with details. Remove any unsafe reply, stop the conversation and choose trusted adult help. A friendly-looking message does not prove that a person is safe. Keep the fictional profile private and use a nickname rather than a school name or location. The practice choices record your reasoning; they do not block a real account or send an adult a message. In real life, tell a trusted adult about the concern.",
  reasoning: ["A character asking for a school name does not need that detail to enjoy a game. Remove the reply instead of editing it to another private detail.", "Stop the conversation and Ask a trusted adult are separate decisions. Keeping only one does not show the complete safe response."],
  starter: artifact({ actions: [decision("reply-with-details", "Fictional unsafe school reply")] }), reference: safeContact, faulty: artifact({ actions: [decision("reply-with-details", "Fictional unsafe reply"), decision("ask-adult")] }),
  cases: contactCases("unknown-game-message", "Fictional game message: Tell me your school and do not tell an adult."),
  transfer: [
    { task: "A fictional picture message asks where a character lives. Withhold private details, stop contact and ask a trusted adult.", starter: artifact({ profile: { nickname: "Owl", homeLocation: "Fictional private location" }, actions: [decision("reply-with-details", "Fictional location reply")] }), reference: safeContact, cases: contactCases("picture-message", "Fictional picture message: Where do you live? Keep this chat secret.") },
    { task: "An unfamiliar fictional club message asks for a password to award a prize. Remove the unsafe response and choose stopping contact and trusted adult help.", starter: artifact({ audience: "public", actions: [decision("reply-with-details", "Fictional unsafe password reply")] }), reference: safeContact, cases: contactCases("club-message", "Fictional club message: Send your password to collect a prize.") },
  ], prediction: { prompt: "What should the character do with a secret request for private details?", choices: ["Stop contact and tell a trusted adult", "Reply with just one private detail", "Keep the conversation secret"], correct: 0 },
});

const report = (concern: "content" | "contact" | "conduct", words: string) => artifact({ actions: [decision("stop-contact"), decision("ask-adult"), decision(`report-${concern}`, words)] });
const reportCases = (concern: "content" | "contact" | "conduct", words: string, message: string) => pair(`report-${concern}`, { concern, message, reportDescriptions: [words, "I do not know what happened."] }, [...safe, ...help, eq("reportRoute", concern, "The practice report category matches the concern"), eq("reportDescription", words, "The report clearly describes the fictional concern without identifying details")]);
const contentWords = "A fictional picture is upsetting. Please help me check it.";
const contactWords = "An unknown fictional message asks for private details.";
const conductWords = "A fictional player repeatedly sends unkind messages.";
const concerns = authorLesson({ id: "Y2.23", concepts: ["report", "concern", "private"],
  explanation: "A useful report explains the concern without adding a child's name, address or contact details. Content means something seen or heard; contact means someone approaching you; conduct means how people behave. Choose the matching practice report and use the clear description from the word bank. Stop the contact and ask a trusted adult as well. Here the report is a local practice record, not a message to a real service. Inspect the actual report category and words after running; a report button by itself does not explain the concern.",
  reasoning: ["An upsetting fictional picture is a content concern. Describe the picture concern without an email address or private location.", "Repeated unkind messages are a conduct concern. A request for private details from an unknown person is a contact concern."],
  starter: artifact(), reference: report("content", contentWords), faulty: report("content", `${contentWords} Contact fictional@example.com.`),
  cases: reportCases("content", contentWords, "A fictional picture makes the character uncomfortable."),
  transfer: [
    { task: "Use the matching report category and the clear word-bank description for an unknown fictional message asking for details. Include stopping contact and trusted adult help.", reference: report("contact", contactWords), cases: reportCases("contact", contactWords, "An unknown fictional sender asks for the character's private details.") },
    { task: "Describe repeated unkind behaviour by a fictional player using the matching report category. Keep identifying details out and choose trusted adult help.", reference: report("conduct", conductWords), cases: reportCases("conduct", conductWords, "A fictional player repeatedly sends unkind messages.") },
  ], prediction: { prompt: "Which description is useful without adding private details?", choices: ["Here is my email and home address", "A fictional picture is upsetting. Please help me check it.", "Something happened somewhere"], correct: 1 },
});

const guide = (place: string, picture: Document["story"][number]["picture"], bindings: Document["deviceBindings"]) => artifact({
  deviceBindings: bindings, actions: [decision("stop-contact"), decision("ask-adult"), decision("save-private")], reuse: "original",
  explanation: `Our fictional ${place} guide uses useful device inputs and outputs. Stop unknown contact and ask a trusted adult; do not reply with private details.`,
  story: [story(`${place} welcome`, "Move right then down to the welcome desk.", picture), story(`${place} help point`, "Move down then right to the trusted adult help point.", "tree", ["down", "right"])],
});
const guideCases = (place: string, picture: Document["story"][number]["picture"], bindings: Document["deviceBindings"]) => pair(`${place}-guide`, { concern: "contact", message: `Create a private ${place} guide with a welcome picture and a help-point picture. Welcome: right then down. Help point: down then right. Demonstrate ${bindings.map((item) => item.device).join(" and ")}.` }, [...deviceChecks(bindings), ...help, eq("storyRuns", true, "Both illustrated scenes replay on the board"), range("sceneCount", 2, 2, "The guide contains a welcome and a help scene"), eq("story.0.title", `${place} welcome`, "The welcome scene is clearly named"), eq("story.0.picture", picture!, "The welcome picture matches the brief"), eq("story.0.directions", ["right", "down"], "The welcome route follows its caption"), eq("story.1.title", `${place} help point`, "The help-point scene is clearly named"), eq("story.1.picture", "tree", "The help point includes its picture"), eq("story.1.directions", ["down", "right"], "The help-point route follows its caption")]);
const faultyGuide = guide("Library", "owl", libraryBindings);
if (faultyGuide.type === "visual") (faultyGuide.document as unknown as Document).actions = [decision("reply-with-details", "Fictional unsafe advice"), decision("ask-adult")];
const communityGuide = authorLesson({ id: "Y2.24", concepts: ["guide", "input", "output", "trusted adult"],
  explanation: "Bring the module's skills together in a private guide for a fictional community place. Create two clearly named illustrated scenes: welcome and help point. Give each scene a caption and a route that follows its words. Demonstrate the requested device actions and inspect their actual outputs. Choose stopping unknown contact and asking a trusted adult; never include a reply with private details. Use your own original practice pictures. Save your working guide, restore its saved version and replay both scenes and the devices to check that someone else could use it.",
  reasoning: ["The welcome caption says right then down, so its route must follow that order. The help-point caption uses the reverse order even though both end at the same square.", "A complete guide needs useful devices and safe help decisions as well as pictures. Saving a version cannot replace running and checking those parts."],
  starter: artifact(), reference: guide("Library", "owl", libraryBindings), faulty: faultyGuide,
  cases: guideCases("Library", "owl", libraryBindings), workflow: { saveAndReplay: true, restoreVersion: true },
  transfer: [
    { task: "Build a private Garden guide: flower welcome picture, tree help-point picture, sensor then speaker demonstration. Follow both route captions and add safe trusted-adult help. Save, restore and replay it.", reference: guide("Garden", "flower", gardenBindings), cases: guideCases("Garden", "flower", gardenBindings) },
    { task: "Build a private Museum guide: robot welcome picture, tree help-point picture, scanner then speaker demonstration. Check the scene names, routes and safe help choices, then save, restore and replay.", reference: guide("Museum", "robot", museumBindings), cases: guideCases("Museum", "robot", museumBindings) },
  ], prediction: { prompt: "Which checks belong in the finished community guide?", choices: ["Only that a picture exists", "Only that a version was saved", "Device outputs, both scene routes, safe help and saved-work replay"], correct: 2 },
});

export const communityCreatorActivities = [devices, versions, respect, contact, concerns, communityGuide];
