#!/usr/bin/env tsx

import { auditLaunchEnvironment } from "../src/lib/release/launch-env-audit";

const result = auditLaunchEnvironment(process.env);

console.log("Launch environment audit");
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