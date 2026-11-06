import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Component-only fixture: requests are intercepted by the test; no app server.
// Keep the authentication suite's real-server configuration unchanged.
export default defineConfig({
  ...base,
  testMatch: "coding-legacy-layout-component.spec.ts",
  webServer: undefined,
  use: { ...base.use, baseURL: "http://127.0.0.1:3177" },
});
