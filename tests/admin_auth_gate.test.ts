import test from "node:test";
import assert from "node:assert/strict";
import {
  adminGateBlocksUnauthorizedUi,
  buildAdminLoginUrl,
  resolvePlatformAdminGate,
  safeAdminNextPath,
} from "../src/lib/admin-auth-gate";

test("1. anonymous /admin → /admin/login", () => {
  const decision = resolvePlatformAdminGate({ pathname: "/admin", session: null });
  assert.equal(decision.action, "redirect");
  if (decision.action !== "redirect") return;
  assert.equal(decision.status, 307);
  assert.match(decision.to, /^\/admin\/login\?/);
  assert.match(decision.to, /next=%2Fadmin/);
  assert.equal(adminGateBlocksUnauthorizedUi(decision), true);
});

test("2. anonymous /admin/schools → /admin/login", () => {
  const decision = resolvePlatformAdminGate({ pathname: "/admin/schools", session: null });
  assert.equal(decision.action, "redirect");
  if (decision.action !== "redirect") return;
  assert.match(decision.to, /next=%2Fadmin%2Fschools/);
  assert.equal(adminGateBlocksUnauthorizedUi(decision), true);
});

test("3. /admin/login loads without a loop", () => {
  const anonymous = resolvePlatformAdminGate({ pathname: "/admin/login", session: null });
  assert.equal(anonymous.action, "allow");

  const parentOnLogin = resolvePlatformAdminGate({
    pathname: "/admin/login",
    session: { role: "parent" },
  });
  assert.equal(parentOnLogin.action, "allow");

  // Login must never redirect back to itself.
  const loginUrl = buildAdminLoginUrl("/admin");
  assert.equal(loginUrl.startsWith("/admin/login"), true);
  assert.equal(safeAdminNextPath("/admin/login"), "/admin");
});

test("4. authenticated admin → /admin (login redirects into console)", () => {
  const onConsole = resolvePlatformAdminGate({
    pathname: "/admin",
    session: { role: "admin" },
  });
  assert.equal(onConsole.action, "allow");

  const onLogin = resolvePlatformAdminGate({
    pathname: "/admin/login",
    search: "?next=%2Fadmin%2Fschools",
    session: { role: "admin" },
  });
  assert.equal(onLogin.action, "redirect");
  if (onLogin.action !== "redirect") return;
  assert.equal(onLogin.to, "/admin/schools");
});

test("5. authenticated non-admin cannot access platform admin", () => {
  for (const role of ["parent", "student", "teacher"] as const) {
    const decision = resolvePlatformAdminGate({
      pathname: "/admin",
      session: { role },
    });
    assert.equal(decision.action, "redirect");
    if (decision.action !== "redirect") continue;
    assert.match(decision.to, /reason=switch/);
    assert.match(decision.to, /^\/admin\/login\?/);
  }

  const schools = resolvePlatformAdminGate({
    pathname: "/admin/schools",
    session: { role: "parent" },
  });
  assert.equal(schools.action, "redirect");
  if (schools.action === "redirect") {
    assert.match(schools.to, /reason=switch/);
  }
});

test("6. no Unauthorized page path during anonymous redirect", () => {
  const decision = resolvePlatformAdminGate({ pathname: "/admin", session: null });
  assert.equal(adminGateBlocksUnauthorizedUi(decision), true);
  if (decision.action === "redirect") {
    assert.doesNotMatch(decision.to, /unauthorized/i);
    assert.match(decision.to, /^\/admin\/login/);
  }
});

test("non-admin paths are ignored by the platform admin gate", () => {
  assert.equal(
    resolvePlatformAdminGate({ pathname: "/teacher", session: null }).action,
    "allow",
  );
  assert.equal(
    resolvePlatformAdminGate({ pathname: "/parent/dashboard", session: { role: "parent" } }).action,
    "allow",
  );
  assert.equal(
    resolvePlatformAdminGate({ pathname: "/school-admin", session: { role: "teacher" } }).action,
    "allow",
  );
});
