import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPlannedVisualAssets,
  buildVisualAltText,
  executeVisualGeneration,
  isSafeEducationalVisualPrompt,
} from "../src/lib/ai/visual-generation";
import {
  resolveExamBoardRecommendation,
  resolveExamBoardSelection,
} from "../src/lib/ai/exam-board-resolver";

test("science planned visuals include experiment and labelled diagrams", () => {
  const visuals = buildPlannedVisualAssets({
    subject: "science",
    yearGroup: "Year 8",
    keyStage: "KS3",
    skillFocus: "Chemical reactions",
    topic: "Acids and alkalis",
    maxVisuals: 3,
  });

  assert.equal(visuals.length, 3);
  assert.equal(visuals.some((asset) => asset.type === "experiment_diagram"), true);
  assert.equal(visuals.every((asset) => asset.status === "planned"), true);
  assert.equal(visuals.every((asset) => asset.imageUrl === null && asset.r2Key === null), true);
});

test("maths planned visuals include charts or number-line style diagrams", () => {
  const visuals = buildPlannedVisualAssets({
    subject: "maths",
    yearGroup: "Year 5",
    keyStage: "KS2",
    skillFocus: "Fractions",
    topic: "Equivalent fractions",
    maxVisuals: 3,
  });

  assert.equal(visuals.length >= 2, true);
  assert.equal(visuals.some((asset) => asset.type === "chart" || asset.title.toLowerCase().includes("number line")), true);
});

test("visual prompt safety rejects unsafe content", () => {
  assert.equal(isSafeEducationalVisualPrompt("Create a school-safe phonics card"), true);
  assert.equal(isSafeEducationalVisualPrompt("Create a violent scene with blood and weapons"), false);
});

test("spelling visuals only appear when useful", () => {
  const useful = buildPlannedVisualAssets({
    subject: "spelling",
    yearGroup: "Year 3",
    keyStage: "KS2",
    skillFocus: "Homophones",
    topic: "there their they're",
    maxVisuals: 2,
  });
  const notUseful = buildPlannedVisualAssets({
    subject: "spelling",
    yearGroup: "Year 3",
    keyStage: "KS2",
    skillFocus: "Suffixes",
    topic: "-tion endings",
    maxVisuals: 2,
  });

  assert.equal(useful.length >= 1, true);
  assert.equal(notUseful.length, 0);
});

test("visual generation disabled mode returns no planned assets", () => {
  const visuals = buildPlannedVisualAssets({
    subject: "science",
    yearGroup: "Year 9",
    keyStage: "KS3",
    skillFocus: "Forces",
    topic: "Balanced and unbalanced forces",
    maxVisuals: 0,
  });
  assert.deepEqual(visuals, []);
});

test("alt text builder produces readable accessibility text", () => {
  const alt = buildVisualAltText({
    title: "Geometry diagram",
    subject: "Maths",
    yearGroup: "Year 6",
    topic: "Angles",
    skillFocus: "Interior angles",
  });
  assert.match(alt, /Geometry diagram/i);
  assert.match(alt, /Year 6/i);
});

test("KS2 defaults to National Curriculum England", () => {
  const recommendation = resolveExamBoardRecommendation({
    subject: "maths",
    yearGroup: "Year 5",
    keyStage: "KS2",
    countryRegion: "UK",
  });

  assert.equal(recommendation.recommendedExamBoard, "National Curriculum England");
  assert.match(recommendation.reason, /KS1-KS3|National Curriculum England/i);
});

test("GCSE maths recommends GCSE exam boards", () => {
  const recommendation = resolveExamBoardRecommendation({
    subject: "gcse-maths",
    yearGroup: "Year 10",
    keyStage: "KS4",
    countryRegion: "UK",
  });

  assert.equal(["Edexcel", "AQA", "OCR"].includes(String(recommendation.recommendedExamBoard)), true);
  assert.equal(recommendation.alternatives.includes("Edexcel"), true);
});

test("school default board wins over auto selection", () => {
  const recommendation = resolveExamBoardRecommendation({
    subject: "gcse-maths",
    yearGroup: "Year 10",
    keyStage: "KS4",
    schoolDefaults: {
      preferredGcseBoardsBySubject: { "gcse-maths": "AQA" },
    },
  });
  const selected = resolveExamBoardSelection({
    recommendation,
    manualExamBoard: null,
    manualOverrideAllowed: true,
  });

  assert.equal(recommendation.source, "school_default");
  assert.equal(selected.examBoard, "AQA");
  assert.equal(selected.examBoardSource, "school_default");
});

test("manual exam board override wins over auto recommendation", () => {
  const recommendation = resolveExamBoardRecommendation({
    subject: "gcse-english-language",
    yearGroup: "Year 11",
    keyStage: "KS4",
  });
  const selected = resolveExamBoardSelection({
    recommendation,
    manualExamBoard: "OCR",
    manualOverrideAllowed: true,
  });

  assert.equal(selected.examBoard, "OCR");
  assert.equal(selected.examBoardSource, "manual");
});

test("Ghana and Nigeria resolver placeholders return regional frameworks", () => {
  const ghana = resolveExamBoardRecommendation({
    subject: "science",
    yearGroup: "Year 9",
    keyStage: "KS3",
    countryRegion: "Ghana",
  });
  const nigeria = resolveExamBoardRecommendation({
    subject: "science",
    yearGroup: "Year 9",
    keyStage: "KS3",
    countryRegion: "Nigeria",
  });

  assert.equal(ghana.alternatives.includes("WAEC"), true);
  assert.equal(nigeria.alternatives.includes("NECO"), true);
});

test("visual execution attaches R2 metadata on successful generation/upload", async () => {
  const planned = buildPlannedVisualAssets({
    subject: "science",
    yearGroup: "Year 8",
    keyStage: "KS3",
    skillFocus: "Forces",
    topic: "Balanced forces",
    maxVisuals: 1,
  });

  const result = await executeVisualGeneration({
    assets: planned,
    enabled: true,
    mode: "generate_now",
    apiKey: "test-key",
    imageModel: "gpt-image-1",
    maxVisuals: 1,
    generateImage: async () => ({ bytes: Buffer.from("fake"), mimeType: "image/png" }),
    uploadImage: async () => ({ imageUrl: "https://cdn.example.com/visual.png", r2Key: "lessons/2026/05/25/demo.png" }),
  });

  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].status, "generated");
  assert.equal(result.assets[0].imageUrl, "https://cdn.example.com/visual.png");
  assert.equal(result.assets[0].r2Key, "lessons/2026/05/25/demo.png");
  assert.equal(result.diagnostics.visualsGenerated, 1);
  assert.equal(result.diagnostics.visualsUploaded, 1);
});

test("visual execution failure does not throw and marks asset failed", async () => {
  const planned = buildPlannedVisualAssets({
    subject: "maths",
    yearGroup: "Year 6",
    keyStage: "KS2",
    skillFocus: "Geometry",
    topic: "Angles",
    maxVisuals: 1,
  });

  const result = await executeVisualGeneration({
    assets: planned,
    enabled: true,
    mode: "generate_now",
    apiKey: "test-key",
    imageModel: "gpt-image-1",
    maxVisuals: 1,
    generateImage: async () => {
      throw new Error("simulated provider failure");
    },
  });

  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].status, "failed");
  assert.match(String(result.assets[0].error), /simulated provider failure/i);
  assert.equal(result.diagnostics.visualsFailed, 1);
});
