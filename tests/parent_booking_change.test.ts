import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const parentPage = readFileSync(
  resolve(process.cwd(), "src/app/parent/short-learning/page.tsx"),
  "utf8",
);
const detailPage = resolve(process.cwd(), "src/app/parent/short-learning/bookings/[id]/page.tsx");
const patchRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/parent/short-learning/bookings/[id]/route.ts"),
  "utf8",
);
const changeService = readFileSync(
  resolve(process.cwd(), "src/lib/schools/short-learning-bookings.ts"),
  "utf8",
);

test("parent bookings list links to booking detail for change flow", () => {
  assert.match(parentPage, /Open booking/);
  assert.match(parentPage, /\/parent\/short-learning\/bookings\/\$\{booking\.id\}/);
  assert.match(parentPage, /Cancel/);
  assert.equal(existsSync(detailPage), true);
});

test("parent booking detail implements change review confirm journey", () => {
  const source = readFileSync(detailPage, "utf8");
  assert.match(source, /Change booking/);
  assert.match(source, /Cancel booking/);
  assert.match(source, /Review change/);
  assert.match(source, /Confirm change/);
  assert.match(source, /method: "PATCH"/);
  assert.match(source, /Current/);
  assert.match(source, /New/);
  assert.match(source, /booking reference stays the same/i);
});

test("PATCH booking API supports parent in-place updates", () => {
  assert.match(patchRoute, /export async function PATCH/);
  assert.match(patchRoute, /export async function GET/);
  assert.match(patchRoute, /changeStudentLearningBooking/);
  assert.match(patchRoute, /startsAt/);
  assert.match(patchRoute, /durationMinutes/);
  assert.match(patchRoute, /subject/);
  assert.match(patchRoute, /learningFocus/);
});

test("changeStudentLearningBooking updates the same row in place", () => {
  assert.match(changeService, /export async function changeStudentLearningBooking/);
  assert.match(changeService, /prisma\.studentLearningBooking\.update/);
  assert.match(changeService, /short_learning_booking_changed/);
  assert.match(changeService, /Only upcoming bookings can be changed/);
  assert.match(changeService, /Selected slot is not available/);
  assert.doesNotMatch(
    changeService.slice(changeService.indexOf("changeStudentLearningBooking")),
    /createStudentLearningBooking/,
  );
});

test("school portal surfaces parent booking change audits", () => {
  const bookingsPage = readFileSync(
    resolve(process.cwd(), "src/app/school-admin/short-learning/bookings/page.tsx"),
    "utf8",
  );
  const detail = readFileSync(
    resolve(process.cwd(), "src/app/school-admin/short-learning/bookings/[id]/page.tsx"),
    "utf8",
  );
  const overview = readFileSync(
    resolve(process.cwd(), "src/components/school-admin/ShortLearningOverviewMetrics.tsx"),
    "utf8",
  );
  assert.match(bookingsPage, /changeIndicator|Changed by/);
  assert.match(detail, /history/);
  assert.match(overview, /recentChanges|Recent booking changes/i);
  assert.match(
    readFileSync(resolve(process.cwd(), "src/lib/schools/short-learning-booking-audit.ts"), "utf8"),
    /Changed by parent/,
  );
});
