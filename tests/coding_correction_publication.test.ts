import test from "node:test";
import assert from "node:assert/strict";
import { codingPublicationSummary } from "../src/lib/coding/learning/publication-summary";

test("portal totals distinguish authored content, local publication, prerequisites and the original experience", () => {
  const previous = process.env.NODE_ENV;
  try {
    Object.assign(process.env, { NODE_ENV: "development" });
    const local = codingPublicationSummary();
    assert.equal(local.authored, 440);
    assert.equal(local.lessons, 264); assert.equal(local.consolidations, 132); assert.equal(local.projects, 44);
    assert.equal(local.published, 440);
    assert(local.initiallyEligible > 0 && local.initiallyEligible < local.published);
    assert.equal(local.pathways.reduce((total, pathway) => total + pathway.authored, 0), 440);
    assert(local.legacy.some(lesson => lesson.id === "understanding-loops"));
    Object.assign(process.env, { NODE_ENV: "production" });
    const production = codingPublicationSummary();
    assert.equal(production.authored, 440); assert.equal(production.published, 0); assert.equal(production.initiallyEligible, 0);
    assert(production.pathways.every(pathway => pathway.published === 0));
    assert(production.legacy.some(lesson => lesson.id === "understanding-loops"));
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else Object.assign(process.env, { NODE_ENV: previous }); }
});
