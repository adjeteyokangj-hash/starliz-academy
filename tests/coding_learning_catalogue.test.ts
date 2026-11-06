import test from "node:test";
import assert from "node:assert/strict";
import { authoredActivities, activityDefinition, releasedActivities } from "../src/lib/coding/learning/catalogue";
import { completedLearningGroups } from "../src/lib/coding/learning/completion";

for (const year of [6, 7, 8, 9, 10, 11]) test(`Year ${year} contains the approved forty activities and closes every prerequisite through earlier courses`, () => {
  const activities = authoredActivities.filter(activity => activity.year === year);
  assert.equal(activities.length, 40);
  assert.deepEqual(["lesson", "consolidation", "project"].map(kind => activities.filter(activity => activity.kind === kind).length), [24, 12, 4]);
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string) => {
    assert.equal(visiting.has(id), false, `A cycle reaches ${id}`); if (visited.has(id)) return;
    const activity = activityDefinition(id); assert.ok(activity, `Missing prerequisite ${id}`);
    assert.ok(activity.year <= year, "A course cannot require a future-year activity");
    visiting.add(id); activity.prerequisites.forEach(visit); visiting.delete(id); visited.add(id);
  };
  activities.forEach(activity => visit(activity.id)); assert.equal(visited.size, year * 40);
  assert.deepEqual(releasedActivities(), [], "Authored coverage cannot release an unverified curriculum");
});

test("Year 5 has all forty activities with a closed prerequisite graph through the visual-to-text bridge", () => {
  const activities = authoredActivities.filter((activity) => activity.year === 5);
  assert.equal(activities.length, 40);
  assert.equal(activities.filter((activity) => activity.kind === "lesson").length, 24);
  assert.equal(activities.filter((activity) => activity.kind === "consolidation").length, 12);
  assert.equal(activities.filter((activity) => activity.kind === "project").length, 4);
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(id: string) {
    assert.equal(visiting.has(id), false, `A cycle reaches ${id}`);
    if (visited.has(id)) return;
    const activity = activityDefinition(id); assert.ok(activity, `Missing prerequisite ${id}`);
    visiting.add(id); activity.prerequisites.forEach(visit); visiting.delete(id); visited.add(id);
  }
  activities.forEach((activity) => visit(activity.id));
  assert.equal(visited.size, 200);
  assert.deepEqual(releasedActivities(), [], "Reference execution and authoring coverage do not substitute for release verification");
});

test("Year 4 contains every approved activity with prerequisites closed through Years 1–4", () => {
  const activities = authoredActivities.filter((activity) => activity.year === 4);
  assert.equal(activities.length, 40);
  assert.equal(activities.filter((activity) => activity.kind === "lesson").length, 24);
  assert.equal(activities.filter((activity) => activity.kind === "consolidation").length, 12);
  assert.equal(activities.filter((activity) => activity.kind === "project").length, 4);
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(id: string) {
    assert.equal(visiting.has(id), false, `A cycle reaches ${id}`);
    if (visited.has(id)) return;
    const activity = activityDefinition(id); assert.ok(activity, `Missing prerequisite ${id}`);
    visiting.add(id); activity.prerequisites.forEach(visit); visiting.delete(id); visited.add(id);
  }
  activities.forEach((activity) => visit(activity.id));
  assert.equal(visited.size, 160);
  assert.deepEqual(releasedActivities(), [], "Authoring and model execution alone do not constitute release verification");
});

test("the first course contains forty distinct activities and a closed, acyclic prerequisite graph", () => {
  const activities = authoredActivities.filter((activity) => activity.year === 1);
  assert.equal(activities.length, 40);
  assert.equal(activities.filter((activity) => activity.kind === "lesson").length, 24);
  assert.equal(activities.filter((activity) => activity.kind === "consolidation").length, 12);
  assert.equal(activities.filter((activity) => activity.kind === "project").length, 4);
  assert.equal(new Set(activities.map((activity) => activity.id)).size, 40);
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(id: string) {
    assert.equal(visiting.has(id), false, `A cycle reaches ${id}`);
    if (visited.has(id)) return;
    const activity = activityDefinition(id);
    assert.ok(activity, `Missing prerequisite ${id}`);
    visiting.add(id);
    activity.prerequisites.forEach(visit);
    visiting.delete(id); visited.add(id);
  }
  activities.forEach((activity) => visit(activity.id));
  assert.equal(visited.size, 40);
});
test("module progression includes consolidation and portfolio mastery without publishing partial curriculum", () => {
  assert.ok(activityDefinition("Y1.07")!.prerequisites.includes("p-y1-1"));
  assert.ok(activityDefinition("Y1.13")!.prerequisites.includes("p-y1-2"));
  assert.ok(activityDefinition("Y1.19")!.prerequisites.includes("p-y1-3"));
  assert.ok(activityDefinition("P-Y1-4")!.prerequisites.includes("c-y1-4-3"));
  assert.ok(activityDefinition("C-Y1-4-3")!.prerequisites.includes("c-y1-4-2"));
  assert.deepEqual(releasedActivities(), [], "A partially authored inventory cannot publish the approved 440-activity curriculum");
});

test("Year 2 has forty distinct activities and requires the completed Year 1 project before entry", () => {
  const activities = authoredActivities.filter((activity) => activity.year === 2);
  assert.equal(activities.length, 40);
  assert.equal(activities.filter((activity) => activity.kind === "lesson").length, 24);
  assert.equal(activities.filter((activity) => activity.kind === "consolidation").length, 12);
  assert.equal(activities.filter((activity) => activity.kind === "project").length, 4);
  assert.equal(new Set(activities.map((activity) => activity.inventoryId)).size, 40);
  assert.ok(activityDefinition("Y2.01")!.prerequisites.includes("p-y1-4"));
  const visited = new Set<string>(), visiting = new Set<string>();
  const visit = (id: string) => {
    assert.equal(visiting.has(id), false, `A cycle reaches ${id}`);
    if (visited.has(id)) return;
    const activity = activityDefinition(id); assert.ok(activity, `Missing prerequisite ${id}`);
    visiting.add(id); activity.prerequisites.forEach(visit); visiting.delete(id); visited.add(id);
  };
  activities.forEach((activity) => visit(activity.id));
  assert.equal(visited.size, 80, "The two-year progression includes every core, consolidation and portfolio requirement");
  const foundational = authoredActivities.filter((activity) => activity.year <= 2);
  const mastered = new Set(foundational.map((activity) => activity.id));
  const complete = completedLearningGroups(mastered, foundational);
  assert.equal(complete.filter((group) => group.kind === "course").length, 2);
  assert.equal(complete.filter((group) => group.kind === "pathway").length, 1);
  assert.equal(complete.find((group) => group.kind === "pathway")!.activityIds.length, 80);
  mastered.delete("p-y2-4");
  assert.equal(completedLearningGroups(mastered, foundational).some((group) => group.kind === "pathway"), false);
});
test("course and pathway completion cannot be inferred from core lessons alone or a partial catalogue", () => {
  const firstYear = authoredActivities.filter((activity) => activity.year === 1);
  const core = new Set(firstYear.filter((activity) => activity.kind === "lesson").map((activity) => activity.id));
  assert.deepEqual(completedLearningGroups(core, firstYear), []);
  const all = new Set(firstYear.map((activity) => activity.id));
  const complete = completedLearningGroups(all, firstYear);
  assert.equal(complete.length, 1);
  assert.equal(complete[0]!.kind, "course");
  assert.equal(complete[0]!.activityIds.length, 40);
  assert.equal(complete[0]!.id, "first-instructions");
  assert.deepEqual(completedLearningGroups(all, firstYear.slice(1)), [], "Missing a definition does not reduce the required scope");
  const missingPortfolio = new Set(all); missingPortfolio.delete("p-y1-4");
  assert.deepEqual(completedLearningGroups(missingPortfolio, firstYear), []);
});

test("Year 3 includes every approved activity and closes its prerequisites through both earlier years", () => {
  const year = authoredActivities.filter((activity) => activity.year === 3);
  assert.equal(year.length, 40);
  assert.equal(year.filter((activity) => activity.kind === "lesson").length, 24);
  assert.equal(year.filter((activity) => activity.kind === "consolidation").length, 12);
  assert.equal(year.filter((activity) => activity.kind === "project").length, 4);
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string) => {
    assert.equal(visiting.has(id), false, `A cycle reaches ${id}`);
    if (visited.has(id)) return;
    const activity = activityDefinition(id); assert.ok(activity, `Missing prerequisite ${id}`);
    visiting.add(id); activity.prerequisites.forEach(visit); visiting.delete(id); visited.add(id);
  };
  year.forEach((activity) => visit(activity.id));
  assert.equal(visited.size, 120);
  assert.ok(activityDefinition("Y3.01")!.prerequisites.includes("p-y2-4"));
  const early = authoredActivities.filter((activity) => activity.year <= 3), mastered = new Set(early.map((activity) => activity.id));
  const complete = completedLearningGroups(mastered, early);
  assert.equal(complete.filter((group) => group.kind === "course").length, 3);
  assert.equal(complete.filter((group) => group.kind === "pathway").length, 1, "The Years 3–4 pathway cannot be awarded from Year 3 alone");
  assert.deepEqual(releasedActivities(), [], "Authored course coverage does not bypass the full curriculum release gate");
});
