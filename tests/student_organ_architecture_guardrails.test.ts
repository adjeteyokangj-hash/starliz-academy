import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = path.resolve(__dirname, "..");
const REQUIRED_MESSAGE = "Respect StarLiz organ boundaries: Brain thinks, Blood transports, Stomach digests, Anus manages lifecycle.";

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8");
}

test("organ architecture docs include required boundaries and flow contract", () => {
  const violations: string[] = [];

  const organDoc = readProjectFile("docs/STUDENT_ORGAN_ARCHITECTURE.md");
  const bloodDoc = readProjectFile("docs/STUDENT_BLOOD_TRANSPORT_ARCHITECTURE.md");
  const brainDoc = readProjectFile("docs/STUDENT_LEARNING_BRAIN_ARCHITECTURE.md");
  const stomachDoc = readProjectFile("docs/STUDENT_STOMACH_ARCHITECTURE.md");
  const anusDoc = readProjectFile("docs/STUDENT_ANUS_ARCHITECTURE.md");

  if (!organDoc.includes(REQUIRED_MESSAGE)) {
    violations.push("docs/STUDENT_ORGAN_ARCHITECTURE.md: missing required guardrail statement");
  }
  if (!brainDoc.toLowerCase().includes("canonical read layer")) {
    violations.push("docs/STUDENT_LEARNING_BRAIN_ARCHITECTURE.md: missing canonical read layer boundary");
  }
  if (!bloodDoc.toLowerCase().includes("transport-only")) {
    violations.push("docs/STUDENT_BLOOD_TRANSPORT_ARCHITECTURE.md: missing transport-only boundary");
  }
  if (!stomachDoc.toLowerCase().includes("digests") && !stomachDoc.toLowerCase().includes("digestion")) {
    violations.push("docs/STUDENT_STOMACH_ARCHITECTURE.md: missing digestion boundary");
  }
  if (!anusDoc.toLowerCase().includes("lifecycle")) {
    violations.push("docs/STUDENT_ANUS_ARCHITECTURE.md: missing lifecycle boundary");
  }

  assert.equal(
    violations.length,
    0,
    `${REQUIRED_MESSAGE}\n${violations.join("\n")}`,
  );
});

test("stomach and anus expose clean index exports", () => {
  const violations: string[] = [];

  const stomachIndex = readProjectFile("src/lib/stomach/index.ts");
  const anusIndex = readProjectFile("src/lib/anus/index.ts");

  const requiredStomachExports = [
    "evidenceTypes",
    "digestionContracts",
    "digestionOutputs",
    "digestionEngine",
  ];
  const requiredAnusExports = [
    "lifecycleContracts",
    "retentionPolicies",
    "archivePolicies",
    "disposalPolicies",
  ];

  for (const expected of requiredStomachExports) {
    if (!stomachIndex.includes(expected)) {
      violations.push(`src/lib/stomach/index.ts: missing export ${expected}`);
    }
  }

  for (const expected of requiredAnusExports) {
    if (!anusIndex.includes(expected)) {
      violations.push(`src/lib/anus/index.ts: missing export ${expected}`);
    }
  }

  assert.equal(
    violations.length,
    0,
    `${REQUIRED_MESSAGE}\n${violations.join("\n")}`,
  );
});
