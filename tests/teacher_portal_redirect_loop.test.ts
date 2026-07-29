import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveLaunchScopeRedirect,
  resolveTeacherPortalBounce,
} from "../src/lib/launch-scope";

function withEnv(name: string, value: string | undefined, run: () => void) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

function decide(role: string | null, pathname: string) {
  const launch = resolveLaunchScopeRedirect({
    pathname,
    authenticated: role !== null,
    role,
  });
  if (launch) return launch;
  const bounce = resolveTeacherPortalBounce({ pathname, role });
  if (bounce) return bounce;
  return null;
}

function follow(role: string | null, start: string, max = 8) {
  const chain: string[] = [start];
  let path = start;
  const seen = new Set<string>([start]);
  for (let i = 0; i < max; i++) {
    const next = decide(role, path);
    if (!next) return { chain, loop: false, terminal: path };
    if (seen.has(next)) {
      chain.push(next);
      return { chain, loop: true, terminal: next };
    }
    seen.add(next);
    chain.push(next);
    path = next;
  }
  return { chain, loop: true, terminal: path };
}

test("Teacher + School Portal enabled: /teacher passes; /student/dashboard → /teacher → pass", () => {
  withEnv("LAUNCH_SCOPE_STRICT", "true", () => {
    withEnv("LAUNCH_ENABLE_SCHOOL_PORTAL", "true", () => {
      const a = follow("teacher", "/teacher");
      assert.equal(a.loop, false);
      assert.deepEqual(a.chain, ["/teacher"]);

      const b = follow("teacher", "/student/dashboard");
      assert.equal(b.loop, false);
      assert.deepEqual(b.chain, ["/student/dashboard", "/teacher"]);
    });
  });
});

test("Teacher + School Portal disabled: stable unavailable, no /teacher ↔ /student loop", () => {
  withEnv("LAUNCH_SCOPE_STRICT", "true", () => {
    withEnv("LAUNCH_ENABLE_SCHOOL_PORTAL", "false", () => {
      const a = follow("teacher", "/teacher");
      assert.equal(a.loop, false);
      assert.deepEqual(a.chain, ["/teacher", "/school-portal-unavailable"]);

      const b = follow("teacher", "/student/dashboard");
      assert.equal(b.loop, false);
      assert.deepEqual(b.chain, ["/student/dashboard", "/school-portal-unavailable"]);

      assert.equal(a.chain.includes("/student/dashboard") && a.chain.includes("/teacher") && a.loop, false);
    });
  });
});

test("Student + School Portal disabled: /teacher → /student/dashboard → pass", () => {
  withEnv("LAUNCH_SCOPE_STRICT", "true", () => {
    withEnv("LAUNCH_ENABLE_SCHOOL_PORTAL", "false", () => {
      const a = follow("student", "/teacher");
      assert.equal(a.loop, false);
      assert.deepEqual(a.chain, ["/teacher", "/student/dashboard"]);

      const b = follow("student", "/student/dashboard");
      assert.equal(b.loop, false);
      assert.deepEqual(b.chain, ["/student/dashboard"]);
    });
  });
});

test("Admin remains unchanged on /admin and /teacher when portal disabled", () => {
  withEnv("LAUNCH_SCOPE_STRICT", "true", () => {
    withEnv("LAUNCH_ENABLE_SCHOOL_PORTAL", "false", () => {
      const adminHome = follow("admin", "/admin");
      assert.equal(adminHome.loop, false);
      assert.deepEqual(adminHome.chain, ["/admin"]);

      const adminTeacher = follow("admin", "/teacher");
      assert.equal(adminTeacher.loop, false);
      assert.deepEqual(adminTeacher.chain, ["/teacher"]);
    });
  });
});
