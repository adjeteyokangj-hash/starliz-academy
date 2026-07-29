import test from "node:test";
import assert from "node:assert/strict";

import {
  getAdminLaunchTag,
  isLaunchScopeStrictEnabled,
  isPublicTrialCtaEnabled,
  isRoadmapPublicEnabled,
  isSchoolPortalLaunchEnabled,
  isStudentCertificateCenterEnabled,
  resolveLaunchScopeRedirect,
} from "../src/lib/launch-scope";

function withEnv(name: string, value: string | undefined, run: () => void) {
  const previous = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }

  try {
    run();
  } finally {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  }
}

test("beta labels are applied to selected admin navigation items", () => {
  assert.equal(getAdminLaunchTag("/admin/knowledge-graph"), "beta");
  assert.equal(getAdminLaunchTag("/admin/recovery-governance"), "beta");
  assert.equal(getAdminLaunchTag("/admin/integrations/truenumeris"), "beta");
  assert.equal(getAdminLaunchTag("/admin/students"), null);
});

test("feature flags default to launch-safe values when not configured", () => {
  withEnv("LAUNCH_SCOPE_STRICT", undefined, () => {
    withEnv("LAUNCH_ENABLE_SCHOOL_PORTAL", undefined, () => {
      withEnv("NEXT_PUBLIC_LAUNCH_ENABLE_ROADMAP", undefined, () => {
        withEnv("NEXT_PUBLIC_LAUNCH_ENABLE_PUBLIC_TRIAL_CTA", undefined, () => {
          withEnv("NEXT_PUBLIC_LAUNCH_ENABLE_STUDENT_CERTIFICATES", undefined, () => {
            assert.equal(isLaunchScopeStrictEnabled(), true);
            assert.equal(isSchoolPortalLaunchEnabled(), false);
            assert.equal(isRoadmapPublicEnabled(), false);
            assert.equal(isPublicTrialCtaEnabled(), false);
            assert.equal(isStudentCertificateCenterEnabled(), false);
          });
        });
      });
    });
  });
});

test("school/teacher routes are blocked for non-admin roles when school portal launch flag is off", () => {
  withEnv("LAUNCH_SCOPE_STRICT", "true", () => {
    withEnv("LAUNCH_ENABLE_SCHOOL_PORTAL", "false", () => {
      assert.equal(
        resolveLaunchScopeRedirect({
          pathname: "/teacher",
          authenticated: true,
          role: "student",
        }),
        "/student/dashboard",
      );

      assert.equal(
        resolveLaunchScopeRedirect({
          pathname: "/teacher",
          authenticated: true,
          role: "teacher",
        }),
        "/school-portal-unavailable",
      );

      assert.equal(
        resolveLaunchScopeRedirect({
          pathname: "/teacher/classrooms",
          authenticated: true,
          role: "parent",
        }),
        "/parent/dashboard",
      );

      assert.equal(
        resolveLaunchScopeRedirect({
          pathname: "/teacher/progress",
          authenticated: true,
          role: "admin",
        }),
        null,
      );

      assert.equal(
        resolveLaunchScopeRedirect({
          pathname: "/school",
          authenticated: false,
          role: null,
        }),
        "/auth/login",
      );
    });
  });
});

test("school/teacher routes are available when school portal launch flag is on", () => {
  withEnv("LAUNCH_SCOPE_STRICT", "true", () => {
    withEnv("LAUNCH_ENABLE_SCHOOL_PORTAL", "true", () => {
      assert.equal(
        resolveLaunchScopeRedirect({
          pathname: "/teacher",
          authenticated: true,
          role: "student",
        }),
        null,
      );
    });
  });
});
