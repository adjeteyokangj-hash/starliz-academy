import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  calculateAgeFromDateOfBirth,
  getStageForYearGroup,
  getSubjectOptionsForYearGroup,
  INTERNAL_STRANDS_BY_PARENT_SUBJECT,
  mapLearningFocusToLegacyMainFocus,
  suggestUkYearGroupFromDateOfBirth,
  UK_YEAR_GROUP_OPTIONS,
  validateRequiredConsents,
} from "../src/lib/registration/child-profile-options";

test("UK year groups include Reception-Year 11 only", () => {
  assert.equal(UK_YEAR_GROUP_OPTIONS[0], "Reception");
  assert.equal(UK_YEAR_GROUP_OPTIONS[UK_YEAR_GROUP_OPTIONS.length - 1], "Year 11");
  assert.ok(!UK_YEAR_GROUP_OPTIONS.includes("Year 12" as never));
  assert.ok(!UK_YEAR_GROUP_OPTIONS.includes("Year 13" as never));
});

test("DOB calculates age", () => {
  const age = calculateAgeFromDateOfBirth("2018-05-20", new Date("2026-05-28"));
  assert.equal(age, 8);
});

test("DOB suggestion uses 31 August cut-off", () => {
  const referenceDate = new Date("2026-09-10");
  const aug31 = suggestUkYearGroupFromDateOfBirth("2020-08-31", referenceDate);
  const sep1 = suggestUkYearGroupFromDateOfBirth("2020-09-01", referenceDate);

  assert.equal(aug31, "Year 2");
  assert.equal(sep1, "Year 1");
});

test("Age 15 equivalent DOB does not suggest Year 1", () => {
  const suggestion = suggestUkYearGroupFromDateOfBirth("2010-10-01", new Date("2026-05-01"));
  assert.notEqual(suggestion, "Year 1");
});

test("Year-group to stage mapping is correct", () => {
  assert.equal(getStageForYearGroup("Reception"), "EYFS");
  assert.equal(getStageForYearGroup("Year 1"), "KS1");
  assert.equal(getStageForYearGroup("Year 2"), "KS1");
  assert.equal(getStageForYearGroup("Year 3"), "KS2");
  assert.equal(getStageForYearGroup("Year 6"), "KS2");
  assert.equal(getStageForYearGroup("Year 7"), "KS3");
  assert.equal(getStageForYearGroup("Year 9"), "KS3");
  assert.equal(getStageForYearGroup("Year 10"), "KS4 / GCSE");
  assert.equal(getStageForYearGroup("Year 11"), "KS4 / GCSE");
});

test("KS1 subjects do not include Languages and KS2 does", () => {
  const ks1Subjects = getSubjectOptionsForYearGroup("Year 2");
  const ks2Subjects = getSubjectOptionsForYearGroup("Year 5");

  assert.ok(!ks1Subjects.includes("Languages"));
  assert.ok(ks2Subjects.includes("Languages"));
});

test("English appears once for parent selection while strands stay internal", () => {
  const ks1Subjects = getSubjectOptionsForYearGroup("Year 1");
  assert.ok(ks1Subjects.includes("English"));

  const hiddenAsStandalone = ["Reading", "Spelling", "Phonics", "Grammar", "Writing"];
  for (const strand of hiddenAsStandalone) {
    assert.ok(!ks1Subjects.includes(strand));
  }

  assert.ok(INTERNAL_STRANDS_BY_PARENT_SUBJECT.English.includes("Reading"));
  assert.ok(INTERNAL_STRANDS_BY_PARENT_SUBJECT.English.includes("Spelling"));
  assert.ok(INTERNAL_STRANDS_BY_PARENT_SUBJECT.English.includes("Phonics"));
  assert.ok(INTERNAL_STRANDS_BY_PARENT_SUBJECT.English.includes("Grammar"));
  assert.ok(INTERNAL_STRANDS_BY_PARENT_SUBJECT.English.includes("Writing"));
});

test("Consent is required before final submission", () => {
  assert.equal(
    validateRequiredConsents({
      isGuardianConfirmed: true,
      learningProfileConsent: true,
      termsPrivacyConsent: true,
    }),
    true,
  );

  assert.equal(
    validateRequiredConsents({
      isGuardianConfirmed: true,
      learningProfileConsent: false,
      termsPrivacyConsent: true,
    }),
    false,
  );
});

test("Legacy /auth/signup route redirects to /signup", () => {
  const signupPagePath = path.join(process.cwd(), "src", "app", "auth", "signup", "page.tsx");
  const source = fs.readFileSync(signupPagePath, "utf8");
  assert.match(source, /redirect\("\/signup"\)/);
});

test("Learning focus maintains legacy payload compatibility", () => {
  assert.equal(mapLearningFocusToLegacyMainFocus("Maths support"), "Maths");
  assert.equal(mapLearningFocusToLegacyMainFocus("English support"), "Reading");
  assert.equal(mapLearningFocusToLegacyMainFocus("Catch-up support"), "Spelling");
  assert.equal(mapLearningFocusToLegacyMainFocus("GCSE readiness"), "All subjects");
});
