#!/usr/bin/env tsx

import { auditLaunchEnvironment } from "../src/lib/release/launch-env-audit";

const strict = process.argv.includes("--strict");
const result = auditLaunchEnvironment(process.env, { strict });

console.log("Launch environment audit");
console.log(`Strict mode: ${strict ? "enabled" : "disabled"}`);
for (const category of result.categories) {
  console.log(`- ${category.name}`);
  console.log(`  present: ${category.present.length ? category.present.join(", ") : "none"}`);
  console.log(`  missing required: ${category.missingRequired.length ? category.missingRequired.join(", ") : "none"}`);
  console.log(`  missing optional: ${category.missingOptional.length ? category.missingOptional.join(", ") : "none"}`);
}

if (!result.ok) {
  console.error(`Launch environment audit failed. Missing required keys: ${result.missingRequired.join(", ")}`);
  process.exit(1);
}

console.log("Launch environment audit passed.");