import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isExternalApiRoute } from "../src/lib/api-management/external-path";
import {
  capabilitiesMap,
  endpointsMap,
  listEnabledCapabilities,
} from "../src/lib/external-monitoring/capability-registry";
import { buildDiscoveryDocument } from "../src/lib/external-monitoring/discovery";
import { buildDeploymentsReport } from "../src/lib/external-monitoring/deployments";
import { evaluateApiKeyAuth } from "../src/lib/api-management/auth";

function read(rel: string): string {
  return readFileSync(rel, "utf8");
}

test("discovery requires api:read - missing key decision is 401", () => {
  // Route uses authenticateExternalApiKey; missing bearer is 401 by contract.
  const src = read("src/app/api/external/v1/discovery/route.ts");
  assert.match(src, /authenticateExternalApiKey/);
  assert.match(src, /requiredScopes:\s*\["api:read"\]/);
});

test("wrong scope evaluates to 403", () => {
  const result = evaluateApiKeyAuth({
    keyPrefix: "sl_test_x",
    status: "active",
    expiresAt: null,
    scopes: ["api:write"],
    requiredScopes: ["api:read"],
    rateLimitAllowed: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "insufficient_scope");
    assert.equal(result.httpStatus, 403);
  }
});

test("valid api:read key decision succeeds", () => {
  const result = evaluateApiKeyAuth({
    keyPrefix: "sl_test_ok",
    status: "active",
    expiresAt: null,
    scopes: ["api:read"],
    requiredScopes: ["api:read"],
    rateLimitAllowed: true,
  });
  assert.deepEqual(result, { ok: true });
});

test("only implemented capabilities are advertised as enabled with endpoints", () => {
  const enabled = listEnabledCapabilities();
  assert.ok(enabled.length >= 5);
  for (const capability of enabled) {
    assert.equal(capability.enabled, true);
    assert.ok(capability.endpoint?.startsWith("/api/external/v1/"));
  }
  const caps = capabilitiesMap();
  assert.equal(caps.health, true);
  assert.equal(caps.services, true);
  assert.equal(caps.integrations, true);
  assert.equal(caps.deployments, true);
  assert.equal(caps.storage, false);
  assert.equal(caps.queues, false);
  const endpoints = endpointsMap();
  assert.equal(endpoints.health, "/api/external/v1/health");
  assert.equal(endpoints.storage, undefined);
  assert.equal(endpoints.queues, undefined);
});

test("discovery document is api-discovered and lists only real endpoints", () => {
  const doc = buildDiscoveryDocument();
  assert.equal(doc.schemaVersion, "1.0");
  assert.equal(doc.monitoringMode, "api-discovered");
  assert.equal(doc.application.name, "StarLiz Academy");
  assert.equal(doc.authentication.type, "bearer");
  for (const [key, endpoint] of Object.entries(doc.endpoints)) {
    assert.equal(doc.capabilities[key], true);
    assert.match(endpoint, /^\/api\/external\/v1\//);
  }
  assert.equal(doc.capabilities.storage, false);
  assert.equal(doc.capabilities.queues, false);
  assert.equal(doc.opswatchTopology.application.key, "starliz-academy");
  assert.equal(doc.opswatchTopology.modules.length, 16);
  const serialized = JSON.stringify(doc);
  assert.deepEqual(
    doc.opswatchTopology.modules.map((entry) => entry.name),
    [
      "Public Website",
      "Parent Portal",
      "Student Portal",
      "Teacher Portal",
      "School Portal",
      "Admin Portal",
      "Day School",
      "Short Learning",
      "AI Tutor",
      "Content Library",
      "Payments",
      "Communications",
      "Reporting",
      "Knowledge Centre",
      "API Management",
      "Authentication"
    ]
  );
  for (const entry of doc.opswatchTopology.modules) {
    assert.ok(entry.key);
    assert.ok(entry.category);
    assert.ok(["HIGH", "MEDIUM"].includes(entry.criticality));
    assert.ok(entry.routePrefixes.length > 0);
  }
  const capabilityKeys = new Set(Object.keys(doc.capabilities));
  for (const entry of doc.opswatchTopology.modules) {
    assert.equal(capabilityKeys.has(entry.key), false);
  }
  assert.doesNotMatch(serialized, /"password"\s*:|"cookie"\s*:|apiKey|credential|DATABASE_URL/i);
  assert.equal(serialized.includes("DATABASE_URL"), false);
});

test("health report normalises statuses without secrets", async () => {
  const { buildExternalHealthReport } = await import("../src/lib/external-monitoring/health");
  const report = await buildExternalHealthReport();
  assert.ok(["healthy", "degraded", "unhealthy", "unknown"].includes(report.status));
  assert.equal(report.service, "StarLiz Academy");
  assert.ok(report.checks.application);
  assert.ok(report.checks.database);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /password|DATABASE_URL|stack|student|parent|cookie|Bearer/i);
});

test("deployments report uses api-discovered mode", () => {
  const report = buildDeploymentsReport();
  assert.equal(report.monitoringMode, "api-discovered");
  assert.equal(report.application, "StarLiz Academy");
  assert.ok(report.version);
  assert.ok(report.instanceId.startsWith("starliz-"));
});

test("external discovery and monitoring routes bypass browser-session middleware", () => {
  assert.equal(isExternalApiRoute("/api/external/v1/discovery"), true);
  assert.equal(isExternalApiRoute("/api/external/v1/health"), true);
  assert.equal(isExternalApiRoute("/api/external/v1/services"), true);
  assert.equal(isExternalApiRoute("/api/external/v1/integrations"), true);
  assert.equal(isExternalApiRoute("/api/external/v1/deployments"), true);
  assert.equal(isExternalApiRoute("/api/admin/settings"), false);

  const mw = read("middleware.ts");
  assert.match(mw, /isExternalApiRoute\(pathname\)/);
});

test("all advertised endpoints have route handlers", () => {
  for (const endpoint of Object.values(endpointsMap())) {
    const rel = `src/app${endpoint}/route.ts`;
    assert.ok(readFileSync(rel, "utf8").includes("authenticateExternalApiKey"), rel);
  }
});
