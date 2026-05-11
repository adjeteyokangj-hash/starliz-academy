import { defineConfig } from "@playwright/test";
import * as os from "os";
import * as path from "path";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

// Store test artifacts outside the OneDrive workspace to avoid EPERM file-lock errors.
const artifactsDir = path.join(os.tmpdir(), "starliz-playwright");

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: artifactsDir,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL,
    headless: true,
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
        url: "http://127.0.0.1:3000",
        timeout: 180_000,
        reuseExistingServer: true,
      },
});
