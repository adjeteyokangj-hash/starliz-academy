import { defineConfig } from "@playwright/test";
import * as dotenv from "dotenv";
import * as os from "os";
import * as path from "path";

// Load .env.local so Prisma clients in test workers have DATABASE_URL / DIRECT_URL
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

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
