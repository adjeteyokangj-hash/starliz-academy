import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveUkStudentYearFields,
  shouldLockYearGroupFromSave,
} from "../src/lib/uk-student-year";
import { suggestUkYearGroupFromDateOfBirth } from "../src/lib/registration/child-profile-options";

test("UK year group rolls forward after July", () => {
  const dob = "2011-03-15";
  assert.equal(suggestUkYearGroupFromDateOfBirth(dob, new Date("2026-07-31")), "Year 10");
  assert.equal(suggestUkYearGroupFromDateOfBirth(dob, new Date("2026-08-01")), "Year 11");
});

test("Age 15 in autumn maps to Year 11", () => {
  const resolved = resolveUkStudentYearFields({
    dateOfBirth: "2010-10-01",
    now: new Date("2026-09-21"),
  });
  assert.equal(resolved.ageYears, 15);
  assert.equal(resolved.yearGroup, "Year 11");
  assert.equal(resolved.keyStageLevel, "KS4");
});

test("Locked year group keeps admin override while age still updates", () => {
  const resolved = resolveUkStudentYearFields({
    dateOfBirth: "2010-10-01",
    currentYearGroup: "Year 9",
    yearGroupLocked: true,
    now: new Date("2026-09-21"),
  });
  assert.equal(resolved.ageYears, 15);
  assert.equal(resolved.yearGroup, "Year 9");
  assert.equal(resolved.derivedYearGroup, "Year 11");
  assert.equal(resolved.keyStageLevel, "KS3");
});

test("Saving a non-derived year group locks automatically", () => {
  assert.equal(
    shouldLockYearGroupFromSave({
      dateOfBirth: "2010-10-01",
      yearGroup: "Year 9",
      now: new Date("2026-09-21"),
    }),
    true,
  );
  assert.equal(
    shouldLockYearGroupFromSave({
      dateOfBirth: "2010-10-01",
      yearGroup: "Year 11",
      now: new Date("2026-09-21"),
    }),
    false,
  );
});