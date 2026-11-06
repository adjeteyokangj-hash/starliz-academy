import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Use the installed stable Edge browser in headless mode. No separate browser
// download or interactive browser window is required for these local checks.
export default defineConfig({ ...base, use: { ...base.use, channel: "msedge", headless: true, actionTimeout: 15000 } });
