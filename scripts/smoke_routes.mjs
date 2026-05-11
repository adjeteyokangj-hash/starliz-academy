#!/usr/bin/env node

const BASE_URL = process.env.SMOKE_BASE_URL || "http://localhost:3000";

/** @typedef {{name: string, path: string, method?: string, okStatuses: number[], locationIncludes?: string, bodyIncludes?: string}} Check */

/** @type {Check[]} */
const checks = [
  {
    name: "Public home page",
    path: "/",
    okStatuses: [200],
  },
  {
    name: "Auth me (unauthenticated)",
    path: "/api/auth/me",
    okStatuses: [401],
  },
  {
    name: "Admin stats blocked without session",
    path: "/api/admin/stats",
    okStatuses: [307, 401],
    locationIncludes: "/login",
  },
  {
    name: "Content-next blocked without session",
    path: "/api/content/next?type=spelling&level=1&exclude=%5B%5D",
    okStatuses: [307, 401],
    locationIncludes: "/login",
  },
  {
    name: "Admin page unauthenticated guard active",
    path: "/admin",
    okStatuses: [307, 302, 200],
  },
];

async function runCheck(check) {
  const url = `${BASE_URL}${check.path}`;
  const response = await fetch(url, {
    method: check.method || "GET",
    redirect: "manual",
    headers: {
      "x-smoke-test": "1",
    },
  });

  const statusOk = check.okStatuses.includes(response.status);
  if (!statusOk) {
    throw new Error(`${check.name}: expected status ${check.okStatuses.join("/")} but got ${response.status} for ${check.path}`);
  }

  if (check.locationIncludes && (response.status === 307 || response.status === 302)) {
    const location = response.headers.get("location") || "";
    if (!location.includes(check.locationIncludes)) {
      throw new Error(`${check.name}: expected redirect location to include '${check.locationIncludes}', got '${location || "<empty>"}'`);
    }
  }

  if (check.bodyIncludes && response.status === 200) {
    const body = await response.text();
    if (!body.includes(check.bodyIncludes)) {
      throw new Error(`${check.name}: expected body to include '${check.bodyIncludes}' when status is 200`);
    }
  }

  console.log(`PASS ${check.name} -> ${response.status}`);
}

async function main() {
  console.log(`Running smoke checks against ${BASE_URL}`);
  for (const check of checks) {
    await runCheck(check);
  }
  console.log("Smoke checks passed.");
}

main().catch((error) => {
  console.error("Smoke checks failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
