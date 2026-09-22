import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  defaultPromotionDateForNextYear,
  formatDateOnlyUtc,
  isAcademicYearStatus,
  nextAcademicYearLabel,
  parseDateOnlyUtc,
} from "../src/lib/schools/academic-year-labels";
import { nextPromotableYearGroup } from "../src/lib/schools/student-year-context";
import { currentAcademicYearLabel } from "../src/lib/schools/ensure-year-classes";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

test("academic year labels advance and default promotion is 1 September", () => {
  assert.equal(nextAcademicYearLabel("2025/26"), "2026/27");
  assert.equal(nextAcademicYearLabel("2025/2026"), "2026/27");
  assert.equal(formatDateOnlyUtc(defaultPromotionDateForNextYear("2026/27")), "2026-09-01");
  assert.equal(formatDateOnlyUtc(parseDateOnlyUtc("2026-09-01")), "2026-09-01");
  assert.equal(isAcademicYearStatus("ready"), true);
  assert.equal(isAcademicYearStatus("bogus"), false);
});

test("promotion ladder edges used by rollover", () => {
  assert.equal(nextPromotableYearGroup("Reception"), "Year 1");
  assert.equal(nextPromotableYearGroup("Year 4"), "Year 5");
  assert.equal(nextPromotableYearGroup("Year 11"), null);
});

test("school calendar helper uses August boundary (not September-only awards old path)", () => {
  // July 2026 → still prior label start year 2025
  assert.equal(currentAcademicYearLabel(new Date(2026, 6, 28)), "2025/26");
  // August 2026 → new label
  assert.equal(currentAcademicYearLabel(new Date(2026, 7, 1)), "2026/27");
});

test("rollover APIs, cron, settings panel, and student overrides are wired", () => {
  const panel = read("src/components/school-admin/AcademicYearRolloverPanel.tsx");
  const settings = read("src/app/school-admin/settings/page.tsx");
  const form = read("src/components/school-admin/SchoolStudentFormClient.tsx");
  const studentRoute = read("src/app/api/school/students/[id]/route.ts");
  const cron = read("src/app/api/cron/academic-year-rollover/route.ts");
  const vercel = read("vercel.json");
  const apply = read("src/lib/schools/academic-year-rollover.ts");
  const awards = read("src/app/api/admin/awards/nominations/route.ts");

  assert.match(settings, /AcademicYearRolloverPanel/);
  assert.match(panel, /Confirm &amp; apply rollover|Confirm & apply rollover/);
  assert.match(panel, /Ready to schedule automatic apply/);
  assert.match(form, /holdBackFromPromotion/);
  assert.match(form, /earlyPromote|Early promote/);
  assert.match(form, /Year-change history/);
  assert.match(studentRoute, /setHoldBack/);
  assert.match(studentRoute, /earlyPromote/);
  assert.match(studentRoute, /recordManualYearChange/);
  assert.match(cron, /applyDueAcademicYearRollovers/);
  assert.match(vercel, /academic-year-rollover/);
  assert.match(apply, /status: "ready"/);
  assert.match(apply, /reason: "rollover"/);
  assert.match(awards, /currentAcademicYearLabel/);
});

test("migration creates academic year config and year-change audit tables", () => {
  const sql = read("prisma/migrations/20260728210000_academic_year_lifecycle/migration.sql");
  assert.match(sql, /SchoolAcademicYearConfig/);
  assert.match(sql, /StudentYearChange/);
  assert.match(sql, /holdBackFromPromotion/);
});

test("early promotion locks year group; bulk rollover does not", () => {
  const apply = read("src/lib/schools/academic-year-rollover.ts");
  // Intentional mid-year early promote must stick (not get overwritten by DOB sync).
  assert.match(
    apply,
    /async function earlyPromoteStudent[\s\S]*?data:\s*\{\s*yearGroup:\s*to,\s*yearGroupLocked:\s*true\s*\}/,
  );
  assert.match(apply, /reason:\s*"early_promote"/);
  // Ordinary cohort rollover only advances yearGroup — do not lock the whole cohort.
  assert.match(apply, /data:\s*\{\s*yearGroup:\s*row\.toYearGroup\s*\}/);
  assert.match(apply, /reason:\s*"rollover"/);
  const lockWrites = apply.match(/yearGroupLocked:\s*true/g) ?? [];
  assert.equal(lockWrites.length, 1, "only early promotion should set yearGroupLocked");
});
