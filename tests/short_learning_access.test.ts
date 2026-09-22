import test from "node:test";
import assert from "node:assert/strict";
import {
  isSchoolAdminRole,
  passesSchoolAdminLayoutGuard,
} from "../src/lib/schools/portal-routing";
import { resolveLaunchScopeRedirect } from "../src/lib/launch-scope";
import { isAllowedShortLearningDuration, selectAliasedShortLearningSchoolStudentIds, shortLearningFirstNameLikelyMatch, shortLearningSiblingNameMatches } from "../src/lib/schools/short-learning-bookings";

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

test("school-admin API guard pattern rejects teacher/support roles", () => {
  assert.equal(passesSchoolAdminLayoutGuard("owner"), true);
  assert.equal(passesSchoolAdminLayoutGuard("admin"), true);
  assert.equal(isSchoolAdminRole("teacher"), false);
  assert.equal(passesSchoolAdminLayoutGuard("support"), false);
});

test("/school-admin is launch-scoped like other school portal routes", () => {
  withEnv("LAUNCH_SCOPE_STRICT", "true", () => {
    withEnv("LAUNCH_ENABLE_SCHOOL_PORTAL", "false", () => {
      assert.equal(
        resolveLaunchScopeRedirect({
          pathname: "/school-admin/short-learning",
          authenticated: true,
          role: "teacher",
        }),
        "/school-portal-unavailable",
      );

      assert.equal(
        resolveLaunchScopeRedirect({
          pathname: "/school-admin",
          authenticated: true,
          role: "admin",
        }),
        null,
      );
    });
  });
});

test("short learning booking durations are restricted to 90 and 120 minutes", () => {
  assert.equal(isAllowedShortLearningDuration(90), true);
  assert.equal(isAllowedShortLearningDuration(120), true);
  assert.equal(isAllowedShortLearningDuration(60), false);
  assert.equal(isAllowedShortLearningDuration(30), false);
});

test("credential-login alias matches sibling names and nicknames", () => {
  assert.equal(shortLearningSiblingNameMatches("Lizzy", "lizzy"), true);
  assert.equal(shortLearningFirstNameLikelyMatch("Ephi", "Ephraim Adjetey"), true);
  assert.deepEqual(
    selectAliasedShortLearningSchoolStudentIds({
      loginChild: {
        id: "login-lizzy",
        name: "Lizzy",
        userId: "student-user-1",
        schoolStudentIds: [],
      },
      siblings: [
        { id: "school-lizzy", name: "Lizzy", userId: null, schoolStudentIds: ["ss-lizzy"] },
        { id: "school-ephi", name: "Ephi", userId: null, schoolStudentIds: ["ss-ephi"] },
      ],
    }).sort(),
    ["ss-lizzy"],
  );
  assert.deepEqual(
    selectAliasedShortLearningSchoolStudentIds({
      loginChild: {
        id: "login-ephraim",
        name: "Ephraim Adjetey",
        userId: "student-user-2",
        schoolStudentIds: [],
      },
      siblings: [
        { id: "school-ephi", name: "Ephi", userId: null, schoolStudentIds: ["ss-ephi"] },
        { id: "school-lizzy", name: "Lizzy", userId: null, schoolStudentIds: ["ss-lizzy"] },
      ],
    }),
    ["ss-ephi"],
  );
});
