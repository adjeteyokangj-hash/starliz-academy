import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";

const pagePath = join(process.cwd(), "src", "app", "admin", "ai-generator", "page.tsx");
const generateRoutePath = join(process.cwd(), "src", "app", "api", "admin", "ai", "generate", "route.ts");
const automationRoutePath = join(process.cwd(), "src", "app", "api", "admin", "ai", "automation", "route.ts");
const generateContentPath = join(process.cwd(), "src", "lib", "ai", "generate-content.ts");

function readPage(): string {
  return readFileSync(pagePath, "utf8");
}

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

test("AI Generator intervention buttons use honest weak-area labels", () => {
  const source = readPage();

  assert.equal(source.includes("Generate Missing Content"), false);
  assert.equal(source.includes("Auto-fill Low Library"), false);
  assert.equal(source.includes("Auto-fill Starter Library"), true);
  assert.equal(source.includes("Review / Generate Weak-Area Support"), true);
  assert.equal(source.includes("Generate Weak-Area Support"), true);
  assert.equal(source.includes("Detected Weak-Area Actions"), true);
});

test("weak-area review button does not run starter-library autofill", () => {
  const source = readPage();
  const reviewButtonStart = source.indexOf("Review / Generate Weak-Area Support");
  assert.notEqual(reviewButtonStart, -1);

  const buttonBlockStart = source.lastIndexOf("<button", reviewButtonStart);
  const buttonBlockEnd = source.indexOf("</button>", reviewButtonStart);
  assert.notEqual(buttonBlockStart, -1);
  assert.notEqual(buttonBlockEnd, -1);

  const buttonBlock = source.slice(buttonBlockStart, buttonBlockEnd);

  assert.equal(buttonBlock.includes('runAutomation("autofill")'), false);
  assert.equal(buttonBlock.includes("reviewDetectedWeakAreas"), true);
});

test("weak-area cards still expose direct support generation", () => {
  const source = readPage();

  assert.equal(source.includes("generateInterventionFromWeakArea(area)"), true);
  assert.equal(source.includes("Load into generator"), true);
  assert.equal(source.includes("Each generation updates the preview only; save it after review."), true);
});

test("default AI Generator mode hides student intervention cards", () => {
  const source = readPage();

  assert.equal(source.includes("Student weak-area interventions are available from a student profile or intervention dashboard."), true);
  assert.equal(source.includes("Content Library Tools"), true);
  assert.equal(source.includes("General content mode"), true);
  assert.equal(source.includes("Lizzy"), false);
  assert.equal(source.includes("isStudentInterventionMode && weakAreas.length"), true);
});

test("student intervention mode still exposes weak-area workflow", () => {
  const source = readPage();

  assert.equal(source.includes("Student intervention mode"), true);
  assert.equal(source.includes("AI Intervention Engine"), true);
  assert.equal(source.includes("Detect Weak Areas"), true);
  assert.equal(source.includes("Review / Generate Weak-Area Support"), true);
  assert.equal(source.includes('onClick={() => void generateInterventionFromWeakArea(area)}'), true);
});

test("preview quality does not use fake static percentage fallback", () => {
  const pageSource = readPage();
  const generateRouteSource = readSource(generateRoutePath);

  assert.equal(pageSource.includes("qualityScore: content?.qualityScore ?? 80"), false);
  assert.equal(generateRouteSource.includes("82 + Math.min"), false);
  assert.equal(generateRouteSource.includes("qualityScore: null"), true);
  assert.equal(generateRouteSource.includes('qualityStatus: "pending_review"'), true);
  assert.equal(pageSource.includes("Pending review"), true);
  assert.equal(pageSource.includes("Not scored yet"), true);
});

test("Detect Library Gaps is general library-only and does not call weak-area detection", () => {
  const pageSource = readPage();
  const routeSource = readSource(automationRoutePath);
  const librarySource = readSource(generateContentPath);

  assert.equal(pageSource.includes('runAutomation("library-gaps")'), true);
  assert.equal(routeSource.includes("detectStarterLibraryGaps"), true);
  assert.equal(librarySource.includes("export async function detectStarterLibraryGaps"), true);

  const libraryGapBlockStart = routeSource.indexOf('body.mode === "library-gaps"');
  const libraryGapBlockEnd = routeSource.indexOf('body.mode === "weaknesses"', libraryGapBlockStart);
  assert.notEqual(libraryGapBlockStart, -1);
  assert.notEqual(libraryGapBlockEnd, -1);
  const libraryGapBlock = routeSource.slice(libraryGapBlockStart, libraryGapBlockEnd);
  assert.equal(libraryGapBlock.includes("detectWeakAreas"), false);
  assert.equal(libraryGapBlock.includes("autoFillLowContentLibrary"), false);
});

test("Auto-fill Starter Library still calls starter-library autofill", () => {
  const pageSource = readPage();
  const routeSource = readSource(automationRoutePath);

  assert.equal(pageSource.includes('runAutomation("autofill")'), true);
  assert.equal(routeSource.includes("autoFillLowContentLibrary()"), true);
  assert.equal(pageSource.includes("Starter library check complete"), true);
  assert.equal(pageSource.includes("Starter library already meets the minimum content target."), true);
  assert.equal(pageSource.includes("No new starter content was needed."), true);
  assert.equal(pageSource.includes("Use Detect Library Gaps to review starter coverage."), true);
});

test("selected difficulty is sent and stamped onto generated preview items", () => {
  const pageSource = readPage();
  const generateRouteSource = readSource(generateRoutePath);

  assert.equal(pageSource.includes("difficulty: context.difficulty"), true);
  assert.equal(generateRouteSource.includes("const requestedLevel = body.difficulty ?? body.level"), true);
  assert.equal(generateRouteSource.includes("difficulty: safeLevel"), true);
  assert.equal(generateRouteSource.includes("difficultyLevel: difficultyProfile"), false);
  assert.equal(generateRouteSource.includes("difficultyLabel: difficultyProfile.difficultyLabel"), true);
});

test("difficulty 5 maths prompt requires challenge problem solving, not bare times facts", () => {
  const generateRouteSource = readSource(generateRoutePath);

  assert.equal(generateRouteSource.includes("Strict difficulty ladder:"), true);
  assert.equal(generateRouteSource.includes("Level 5: challenge/problem solving with mixed context, reasoning, distractors, and justification."), true);
  assert.equal(generateRouteSource.includes('do not generate only simple prompts like "What is 6 times 4?"'), true);
  assert.equal(generateRouteSource.includes("Evaluate which inverse operation checks the final total and justify your method."), true);
});

test("difficulty 5 English prompt forbids recall-only prefix and identification tasks", () => {
  const generateRouteSource = readSource(generateRoutePath);

  assert.equal(generateRouteSource.includes("English Difficulty 5 calibration:"), true);
  assert.equal(generateRouteSource.includes("Simple definition recall is forbidden."), true);
  assert.equal(generateRouteSource.includes('Simple "what does prefix mean" or "what does suffix mean" questions are forbidden.'), true);
  assert.equal(generateRouteSource.includes("Single-step identification questions are forbidden"), true);
  assert.equal(generateRouteSource.includes("make students apply the affix in context, correct an error, transform a root word, compare two plausible affixes, and justify how the affix changes meaning"), true);
  assert.equal(generateRouteSource.includes("the answer must exactly match one full option sentence"), true);
});

test("difficulty 1 English prompt keeps early content simple and direct", () => {
  const generateRouteSource = readSource(generateRoutePath);

  assert.equal(generateRouteSource.includes("English Difficulty 1 calibration:"), true);
  assert.equal(generateRouteSource.includes("Keep each item simple, direct, and single-skill."), true);
  assert.equal(generateRouteSource.includes("Avoid multi-step reasoning, dense distractors, long passages, and abstract analysis."), true);
});

test("preview surfaces Black Box difficulty warnings before saving", () => {
  const pageSource = readPage();

  assert.equal(pageSource.includes("Black Box difficulty warning"), true);
  assert.equal(pageSource.includes("Black Box estimated this as Level"), true);
  assert.equal(pageSource.includes("Regenerate or apply recommendation before saving."), true);
});

test("item regeneration keeps the mapped topic instead of appending replacement suffix", () => {
  const pageSource = readPage();

  assert.equal(pageSource.includes("topic: selectedTopicTheme || skillFocus"), true);
  assert.equal(pageSource.includes("topic: `${selectedTopicTheme || skillFocus} replacement item`"), false);
});

test("item regeneration blocks duplicate preview question templates", () => {
  const pageSource = readPage();
  const generateRouteSource = readSource(generateRoutePath);

  assert.equal(pageSource.includes("previewItemPromptDuplicateKey"), true);
  assert.equal(pageSource.includes("previewItemMathsScenarioFamilyKey"), true);
  assert.equal(pageSource.includes("maths_division_packaging"), true);
  assert.equal(pageSource.includes("avoidPrompts:"), true);
  assert.equal(pageSource.includes("replacementCandidates.find"), true);
  assert.equal(pageSource.includes("numberOfItems: Math.max(3, Math.min(5, preview?.items.length ?? 3))"), true);
  assert.equal(pageSource.includes("OpenAI only returned replacement items that matched existing preview items"), true);
  assert.equal(generateRouteSource.includes("AVOID REPEATING THESE EXISTING PREVIEW QUESTIONS"), true);
  assert.equal(generateRouteSource.includes("avoidPrompts.length === 0"), true);
  assert.equal(generateRouteSource.includes("Do not reuse the same story, object, or question template with only number changes."), true);
});
