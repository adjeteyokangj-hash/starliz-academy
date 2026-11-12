import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

// Isolated real-component acceptance. All HTTP requests are intercepted by the
// test, so this configuration intentionally starts no app server or database.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "coding-world.spec.ts",
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  outputDir: path.join(os.tmpdir(), "starliz-coding-world-playwright"),
  use: { headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) },
});
