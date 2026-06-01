import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { getLoginDisabledReason } from "../src/app/auth/login/page";
import ChildManagementForm, {
  getChildFormDisabledReason,
  getChildFormValidationErrors,
} from "../src/components/parent/ChildManagementForm";

test("login form explains why submit stays disabled", () => {
  assert.equal(getLoginDisabledReason("", ""), "Enter your email address to continue.");
  assert.equal(getLoginDisabledReason("parent@example.com", ""), "Enter your password to continue.");
  assert.equal(getLoginDisabledReason("parent@example.com", "strong-password"), null);
});

test("child management helper reports the first blocking validation error", () => {
  const reason = getChildFormDisabledReason(
    {
      name: "",
      dateOfBirth: "",
      schoolYear: "",
      yearGroup: "",
      keyStageLevel: "",
      subjectLevel: "",
      learningGoals: "",
      supportNeeds: "",
      selectedSubjects: ["english", "maths"],
      ageYears: "",
      startLevelChoice: "Beginner",
      avatar: "star",
    },
    {
      minSubjects: 2,
      maxSubjects: 4,
      requiredSubjectKeys: ["english", "maths"],
    },
  );

  assert.equal(reason, "Child name is required.");
});

test("child management form exposes disabled-submit help text on initial render", () => {
  const html = renderToStaticMarkup(
    <ChildManagementForm mode="add" onSuccess={() => undefined} onCancel={() => undefined} />,
  );

  assert.match(html, /id="child-form-submit-help"/i);
  assert.match(html, /Child name is required\./i);
  assert.match(html, /<button[^>]*disabled[^>]*>Add child<\/button>/i);
  assert.match(html, /for="child-name"/i);
  assert.match(html, /for="child-year-group"/i);
});

test("child management validation keeps subject policy enforcement intact", () => {
  const errors = getChildFormValidationErrors(
    {
      name: "Ava",
      dateOfBirth: "2018-02-10",
      schoolYear: "Year 2",
      yearGroup: "Year 2",
      keyStageLevel: "KS1",
      subjectLevel: "Core",
      learningGoals: "",
      supportNeeds: "",
      selectedSubjects: ["english"],
      ageYears: 7,
      startLevelChoice: "Beginner",
      avatar: "star",
    },
    {
      minSubjects: 2,
      maxSubjects: 4,
      requiredSubjectKeys: ["english", "maths"],
    },
  );

  assert.equal(errors.subjectLevel, "English and Maths are required.");
});