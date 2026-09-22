import test from "node:test";
import assert from "node:assert/strict";
import { decideStudentStoreBootstrap } from "../src/lib/student-store-bootstrap";

test("student bootstrap never sends learners to /profiles", () => {
  assert.deepEqual(decideStudentStoreBootstrap("/profiles"), {
    action: "replace",
    path: "/student/dashboard",
  });
  assert.deepEqual(decideStudentStoreBootstrap("/parent/profiles"), {
    action: "replace",
    path: "/student/dashboard",
  });
  assert.deepEqual(decideStudentStoreBootstrap("/consent"), {
    action: "replace",
    path: "/student/dashboard",
  });
});

test("student bootstrap leaves student dashboard ready", () => {
  assert.deepEqual(decideStudentStoreBootstrap("/student/dashboard"), { action: "ready" });
  assert.deepEqual(decideStudentStoreBootstrap("/student/today"), { action: "ready" });
});

test("StoreBootstrap wires student path to active-profile hydrate and no /profiles bounce", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync("src/components/layout/StoreBootstrap.tsx", "utf8");
  assert.match(source, /role === "student"/);
  assert.match(source, /hydrateActiveProfileFromServer/);
  assert.match(source, /decideStudentStoreBootstrap/);
  assert.match(source, /Never bounce them through the parent profile picker/);
});