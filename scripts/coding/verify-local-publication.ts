import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import release from "../../src/lib/coding/learning/release-manifest.json";
import { releasedActivities } from "../../src/lib/coding/learning/catalogue";
import { verifyCurriculumRuntime } from "./verify-curriculum-runtime";

const recorded: string[] = [];
const writeLine = console.log;
console.log = (message?: unknown, ...rest: unknown[]) => {
  recorded.push([message, ...rest].map((part) => String(part)).join(" "));
};
try {
  verifyCurriculumRuntime();
} finally {
  console.log = writeLine;
}
if (recorded.length) console.error(recorded.join("\n"));
const activities = releasedActivities();
const environment = process.env.NODE_ENV;
const expected = release.publicationScope === "production" ? 440 : environment === "development" ? 440 : 0;
assert.equal(activities.length, expected);
const result = { environment: environment ?? "unspecified", released: activities.length, years: [...new Set(activities.map(activity => activity.year))].sort((a, b) => a - b), pathways: new Set(activities.map(activity => activity.pathwayId)).size, lessons: activities.filter(activity => activity.kind === "lesson").length, consolidations: activities.filter(activity => activity.kind === "consolidation").length, projects: activities.filter(activity => activity.kind === "project").length, initiallyEligible: activities.filter(activity => !activity.prerequisites.length).map(activity => ({ id: activity.id, title: activity.title, year: activity.year })) };
mkdirSync("artifacts/coding-local-publication-2026-11-04", { recursive: true });
writeFileSync(`artifacts/coding-local-publication-2026-11-04/${environment ?? "unspecified"}.json`, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
