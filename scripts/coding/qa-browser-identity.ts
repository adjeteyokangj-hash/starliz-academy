import { devices } from "@playwright/test";

// API and browser requests represent the same fictional QA device. Keep the
// application's IP/user-agent fingerprint checks and refresh policy intact.
export const qaBrowserUserAgent = devices["Desktop Edge"].userAgent;
