import test from "node:test";
import assert from "node:assert/strict";
import { beginnerTracks } from "../src/lib/coding/learning/beginner-playground";
import { openPlaygroundStep, resetPlaygroundStep, restorePlaygroundSession, samePlaygroundArtifact } from "../src/lib/coding/learning/playground-drafts";
import { assessPlaygroundTask } from "../src/lib/coding/learning/playground-assessment";
import { activityDefinition, authoredActivities } from "../src/lib/coding/learning/catalogue";
import { hasPythonFunctionsGuide, syntaxGuidance } from "../src/lib/coding/learning/code-guidance";
import { executePractical } from "../src/lib/coding/learning/runtime";
import { hasVisualReview, usesVisualReview, visualReview, checkVisualReview } from "../src/lib/coding/learning/visual-review";
import { initialActivityState, transitionActivity, variantFingerprint } from "../src/lib/coding/learning/state-machine";
import { publicActivityView } from "../src/lib/coding/learning/public-view";
import { isDevelopmentCodingPlayground } from "../src/lib/coding/development-surface";
import { toExpandedCodingDashboardLessons } from "../src/lib/coding/dashboard-lessons";
import type { Execution, PracticalArtifact } from "../src/lib/coding/learning/types";

const step = (id: string) => beginnerTracks.flatMap(track => track.steps).find(item => item.id === id)!;
const python = (source: string): Extract<PracticalArtifact, { type: "source" }> => ({ type: "source", language: "python", entry: "console", source });
const run = (stdout: string, output: Execution["output"] = {}): Execution => ({ ok: true, stdout, output, stderr: "", trace: [], runtime: "isolated-result-fixture", steps: 1 });

test("web drafts copy forward once, preserve existing downstream drafts and survive reload/legacy storage", () => {
  const html = { ...step("planet-html").starter, html: '<main><h1 id="planet">Planet Aurora</h1><p>My special place</p></main>' } as PracticalArtifact;
  const drafts = { "planet-html": html };
  const css = openPlaygroundStep(drafts, "planet-css"); assert.equal(css.type, "source"); if (css.type !== "source" || html.type !== "source") return;
  assert.equal(css.html, html.html); css.css = "#planet { color: blue; padding: 12px; }";
  const js = openPlaygroundStep({ ...drafts, "planet-css": css }, "planet-js"); assert.equal(js.type, "source"); if (js.type !== "source") return;
  assert(js.html!.includes(html.html!)); assert.equal(js.css, css.css); assert.match(js.source, /starliz-hello/);
  const complete = { ...drafts, "planet-css": css, "planet-js": js };
  const edited = { ...complete, "planet-html": { ...html, html: "<h1>Changed earlier</h1>" } };
  assert.deepEqual(openPlaygroundStep(edited, "planet-css"), css, "Earlier changes must not overwrite a downstream draft");
  for (const serialized of [complete, { version: 1, trackId: "web", stepIndex: 2, drafts: complete }, { version: 2, trackId: "web", stepIndex: 2, drafts: complete }]) assert.deepEqual(restorePlaygroundSession(JSON.stringify(serialized)).drafts, complete);
  const reset = resetPlaygroundStep("planet-js", { ...js, source: 'console.log("edited")' });
  assert.equal(reset.type === "source" && reset.html, js.html); assert.equal(reset.type === "source" && reset.css, js.css); assert.match(reset.type === "source" ? reset.source : "", /starliz-hello/);
  assert.deepEqual(openPlaygroundStep({ "planet-js": step("planet-js").starter }, "planet-js"), step("planet-js").starter, "An old standalone JS draft is retained exactly");
});
test("full HTML documents receive scaffolding inside the body without reusing learner IDs", () => {
  const prior = { ...step("planet-css").starter, html: '<html><head><title>Moon</title></head><body><h1>Moon</h1><p id="starliz-hello">Keep me</p></body></html>' } as PracticalArtifact;
  const next = openPlaygroundStep({ "planet-css": prior }, "planet-js"); assert.equal(next.type, "source"); if (next.type !== "source") return;
  assert.match(next.html!, /id="starliz-hello">Keep me/); assert.match(next.source, /starliz-hello1/); assert(next.html!.indexOf("Say hello") < next.html!.indexOf("</body>"));
  const reset = resetPlaygroundStep("planet-js", next);
  assert.match(reset.type === "source" ? reset.source : "", /starliz-hello1/);
});
test("playground distinguishes successful execution from requested output and current source", async () => {
  assert.equal((await assessPlaygroundTask("robot-name", step("robot-name").starter, run("Hello! I am Spark.\n"))).completed, false);
  assert.equal((await assessPlaygroundTask("robot-name", python('print(2 + 3)'), run("5\n"))).completed, false);
  const alternate = python('robot = "Aurora"\nprint("Hello! I am " + robot + ".")');
  assert.equal((await assessPlaygroundTask("robot-name", alternate, run("Hello! I am Aurora.\n"))).completed, true);
  assert.equal(samePlaygroundArtifact(alternate, { ...alternate, source: 'print("not the task")' }), false);
  assert.equal((await assessPlaygroundTask("robot-message", step("robot-message").starter, run("Hello! I am Spark.\nI like exploring planets!\n"))).completed, false);
  assert.equal((await assessPlaygroundTask("robot-create", step("robot-create").starter, run("My name is Spark.\nI like stars.\nI like moon rocks.\n"))).completed, false);
  assert.equal((await assessPlaygroundTask("robot-create", python('print("My name is Ada.")\nprint("I like gardens.")\nprint("I like games.")'), run("My name is Ada.\nI like gardens.\nI like games.\n"))).completed, true);
});
test("Functions tasks check definitions, parameters, execution, calls and personalised output", async () => {
  assert.equal((await assessPlaygroundTask("function-explore", step("function-explore").starter, run("Hello, Spark\n"))).completed, true);
  assert.equal((await assessPlaygroundTask("function-change", step("function-change").starter, run("Hello, Spark\nHello, Nova\n"))).completed, false);
  const greeting = python('def greet(name):\n    print("Hello, " + name)\ngreet("Spark")\ngreet("Orion")');
  assert.equal((await assessPlaygroundTask("function-change", greeting, run("Hello, Spark\nHello, Orion"), [], async () => ({ ...run("Hello, Spark\nHello, Orion"), trace: [{ line: 2, variables: { name: "Spark" } }, { line: 2, variables: { name: "Orion" } }] }))).completed, true);
  assert.equal((await assessPlaygroundTask("function-change", greeting, run("Hello, Spark\nHello, Orion"), [], async () => run("Hello, Spark\nHello, Orion"))).completed, false, "Matching top-level output cannot replace executed function calls");
  assert.equal((await assessPlaygroundTask("function-create", step("function-create").starter, run("Hello, Spark\n"))).completed, false);
  assert.equal((await assessPlaygroundTask("function-create", python('# def cheer(name):\nprint("Go Nova!")'), run("Go Nova!\n"))).completed, false);
  const source = 'def cheer(name):\n    print(f"Go, {name}!")\ncheer("Nova")';
  const executed = async (_engine: unknown, artifact: PracticalArtifact) => artifact.type === "source" && artifact.entry === "variables" ? { ...run("Go, Nova!"), trace: [{ line: 2, variables: { name: "Nova" } }] } : run("Go, Orion!\nGo, Luna!\n");
  assert.equal((await assessPlaygroundTask("function-create", python(source), run("Go, Nova!\n"), [], executed)).completed, true);
  assert.equal((await assessPlaygroundTask("function-create", python(source), run("Go, Nova!\n"), [], async () => run("Go, robot!\nGo, robot!\n"))).completed, false);
  assert.equal((await assessPlaygroundTask("function-create", python(source.replace('cheer("Nova")', 'if False:\n    cheer("Nova")\nprint("Go Nova!")')), run("Go Nova!\n"), [], async (_engine, artifact) => artifact.type === "source" && artifact.entry === "variables" ? run("Go Nova!") : run("Go, Orion!\nGo, Luna!"))).completed, false);
});
test("web tasks inspect the actual heading, cascade and click behaviour, including equivalent syntax", async () => {
  const html = step("planet-html").starter;
  assert.equal((await assessPlaygroundTask("planet-html", html, run("", { result: { elements: [{ tag: "h1", text: "Planet Spark" }] } }))).completed, false);
  assert.equal((await assessPlaygroundTask("planet-html", html, run("", { result: { elements: [{ tag: "h1", text: "Planet Willow" }] } }))).completed, true);
  const css = { ...step("planet-css").starter, html: '<h1 id="mine">My planet</h1>', css: "#mine { color: #0000ff }" } as PracticalArtifact;
  const inspected = run("", { result: { elements: [{ tag: "h1", id: "mine" }] } });
  assert.equal((await assessPlaygroundTask("planet-css", css, inspected, [], async (_engine, artifact) => { assert.equal(artifact.type === "source" && artifact.html, '<h1 id="mine">My planet</h1>'); return run("", { result: { styleInspection: { stylesById: { mine: { properties: { color: "#0000ff" } } } } } }); })).completed, true);
  assert.equal((await assessPlaygroundTask("planet-css", css, inspected, [], async () => run("", { result: { styleInspection: { stylesById: { mine: { properties: { color: "purple" } } } } } }))).completed, false);
  const js = step("planet-js").starter, clicked = run("", { result: { elements: [{ tag: "button", id: "hello", text: "Say hello" }], textsById: { message: "Welcome to Willow!" } } });
  assert.equal((await assessPlaygroundTask("planet-js", js, clicked)).completed, false);
  assert.equal((await assessPlaygroundTask("planet-js", js, clicked, [{ type: "click", target: "hello" }], async () => run("", { result: { textsById: { message: "Click the button!" } } }))).completed, true);
  assert.equal((await assessPlaygroundTask("planet-js", js, clicked, [{ type: "click", target: "hello" }], async () => clicked)).completed, false, "A message already present before clicking is not event behaviour");
});

for (const activity of authoredActivities.filter(activity => hasVisualReview(activity) && activity.year === 1)) test(`${activity.inventoryId}: choices use actual independent evidence and reject wrong/stale/empty answers`, async () => {
  for (const variant of activity.independent) {
    const execution = await executePractical(activity.workbench, variant.reference, variant.cases[0]!.input);
    const review = visualReview(activity, variant.reference, execution); assert(review, activity.inventoryId);
    const submission = (answers: Record<string, string>, binding = review.public.binding) => JSON.stringify({ type: "visual-review-v1", binding, answers });
    assert.equal(checkVisualReview(activity, variant.reference, execution, submission(review.correct)).passed, true);
    const first = review.public.questions[0]!;
    const wrong = { ...review.correct, [first.id]: first.choices.find(choice => choice.id !== review.correct[first.id])!.id };
    assert.equal(checkVisualReview(activity, variant.reference, execution, submission(wrong)).passed, false);
    assert.equal(checkVisualReview(activity, variant.reference, execution, submission({})).passed, false);
    assert.equal(checkVisualReview(activity, variant.reference, execution, submission(review.correct, "old")).passed, false);
    assert.equal(checkVisualReview(activity, variant.reference, execution, "it works").passed, false);
    assert.equal("correct" in review.public, false);
  }
});
test("local Review remains separate from practical success and assistance eligibility", async () => {
  const activity = activityDefinition("Y1.14")!, state = initialActivityState(activity);
  state.stage = "review"; state.completed = ["discover", "predict", "build", "practise", "debug", "create"]; state.artifacts.create = activity.independent[0]!.reference;
  const execution = await executePractical(activity.workbench, state.artifacts.create, activity.independent[0]!.cases[0]!.input), review = visualReview(activity, state.artifacts.create, execution)!;
  const action = { stage: "review" as const, action: "reflect" as const, revision: "fixture", explanation: JSON.stringify({ type: "visual-review-v1", binding: review.public.binding, answers: review.correct }) };
  const deps = { run: executePractical, teach: async () => ({ message: "unused", source: "fallback" as const, revealing: false }), reflect: async (...args: Parameters<typeof checkVisualReview>) => checkVisualReview(...args) };
  assert.equal((await transitionActivity(activity, state, action, deps)).newlyMastered, true);
  const assisted = structuredClone(state); assisted.assistedVariantIds = [variantFingerprint(activity, assisted)];
  await assert.rejects(transitionActivity(activity, assisted, action, deps), /received an answer/);
  const bad = structuredClone(state); bad.artifacts.create = activity.starter;
  assert.equal((await transitionActivity(activity, bad, action, deps)).newlyMastered, false);
  assert.deepEqual(state.artifacts.create, activity.independent[0]!.reference);
});
test("private choice review selection does not infer adulthood or replace permitted older-learner review", () => {
  const previous = process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED; delete process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED;
  try {
    const activity = activityDefinition("Y6.01")!;
    for (const age of [null, 7, 12]) assert.equal(usesVisualReview(activity, { kind: "learner", age }), true);
    assert.equal(usesVisualReview(activity, { kind: "learner", age: 13 }), false);
    assert.equal(usesVisualReview(activity, "author"), false);
    assert.equal(publicActivityView(activity, initialActivityState(activity), "learner", { kind: "learner", age: 15 }).visualReviewSupported, false);
    assert.equal(usesVisualReview(activityDefinition("Y11.13")!, { kind: "learner", age: null }), true);
  } finally { if (previous === undefined) delete process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED; else process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED = previous; }
});
test("teaching uses actual syntax before Build and Functions excludes the confirmed scope false positive", () => {
  for (const id of ["Y6.01", "Y6.02", "Y6.06"]) { const activity = activityDefinition(id)!; assert.equal(hasPythonFunctionsGuide(activity, activity.example), true); assert.equal(publicActivityView(activity, initialActivityState(activity)).functionGuide, true); }
  const unrelated = activityDefinition("Y11.13")!; assert.equal(hasPythonFunctionsGuide(unrelated, unrelated.example), false);
  const ids = new Set(beginnerTracks.flatMap(track => track.steps.flatMap(step => syntaxGuidance(step.starter, step.field).map(piece => piece.id))));
  for (const id of ["python-text", "python-call", "python-function", "python-block", "html-element", "css-rule", "css-declaration", "js-dom", "js-output", "js-event", "js-arrow"]) assert(ids.has(id), id);
  for (const id of ["Y5.01", "Y6.01", "Y6.07", "Y6.08"]) { const activity = activityDefinition(id)!, state = initialActivityState(activity), view = publicActivityView(activity, state); assert(view.syntaxGuide.length > 0); assert.equal(view.stage, "discover"); assert.deepEqual(view.artifact, activity.example); }
});
test("development bootstrap and expanded dashboard cards keep exact route, environment, year and prerequisite boundaries", () => {
  assert.equal(isDevelopmentCodingPlayground("/dev/coding", "development"), true);
  for (const path of ["/student/coding", "/dev/coding/other", "/dev/anything"]) assert.equal(isDevelopmentCodingPlayground(path, "development"), false);
  assert.equal(isDevelopmentCodingPlayground("/dev/coding", "production"), false);
  const rows = [{ id: "eligible", title: "Ready", year: 5, unlocked: true, status: "learning" }, { id: "locked", title: "Locked", year: 5, unlocked: false, status: "not_started" }, { id: "future", title: "Later", year: 7, unlocked: true, status: "learning" }];
  assert.deepEqual(toExpandedCodingDashboardLessons(rows, "Year 5").map(item => item.href), ["/student/coding/activities/eligible"]);
  assert.deepEqual(toExpandedCodingDashboardLessons(rows, null), []);
});
