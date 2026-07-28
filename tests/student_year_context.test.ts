import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SAFE_YEAR_GROUP_FALLBACK,
  formatYearClassDisplay,
  isUkSummerTransition,
  nextPromotableYearGroup,
  resolveStudentYearContext,
  toShortLearningYearGuidance,
} from "../src/lib/schools/student-year-context";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const lateJuly2026 = new Date(2026, 6, 28); // 28 July 2026 local
const midMarch2026 = new Date(2026, 2, 15);
const earlyJuly2026 = new Date(2026, 6, 10);

test("Atswei-like Year 4 in late July gets incoming Year 5; official stays Year 4", () => {
  const ctx = resolveStudentYearContext({
    officialYearGroup: "Year 4",
    classroomYearGroup: "Year 4",
    classroomName: "Year 4",
    classroomAcademicYear: "2025/26",
    now: lateJuly2026,
    surface: "dashboard",
  });
  assert.equal(ctx.officialYearGroup, "Year 4");
  assert.equal(ctx.incomingYearGroup, "Year 5");
  assert.equal(ctx.isSummerTransition, true);
  assert.equal(ctx.targetLearningYearGroup, "Year 4");
  assert.equal(ctx.yearDisplayLabel, "Year 4");
  assert.equal(ctx.summerPreparationLabel, "Preparing for Year 5");
  assert.match(ctx.summerTeachingIntent ?? "", /Year 4/);
  assert.match(ctx.summerTeachingIntent ?? "", /Year 5/);
});

test("summer message disappears outside transition window", () => {
  const ctx = resolveStudentYearContext({
    officialYearGroup: "Year 4",
    classroomYearGroup: "Year 4",
    classroomName: "Year 4",
    now: midMarch2026,
  });
  assert.equal(ctx.isSummerTransition, false);
  assert.equal(ctx.incomingYearGroup, null);
  assert.equal(ctx.summerPreparationLabel, null);
  assert.equal(isUkSummerTransition(earlyJuly2026), false);
  assert.equal(isUkSummerTransition(lateJuly2026), true);
});

test("duplicate year class labels collapse; distinct class names remain", () => {
  const mid = String.fromCharCode(183);
  assert.equal(formatYearClassDisplay({ yearGroup: "Year 4", classroomName: "Year 4" }), "Year 4");
  assert.equal(formatYearClassDisplay({ yearGroup: "Year 4", classroomName: "year 4" }), "Year 4");
  assert.equal(formatYearClassDisplay({ yearGroup: " Year 4 ", classroomName: "Year 4" }), "Year 4");
  assert.equal(formatYearClassDisplay({ yearGroup: "Year 4", classroomName: "Class 4A" }), `Year 4 ${mid} Class 4A`);
});

test("Reception progresses to Year 1; Year 6 to Year 7; Year 11 has no incoming", () => {
  assert.equal(nextPromotableYearGroup("Reception"), "Year 1");
  assert.equal(nextPromotableYearGroup("Year 6"), "Year 7");
  assert.equal(nextPromotableYearGroup("Year 11"), null);
  const y11 = resolveStudentYearContext({
    officialYearGroup: "Year 11",
    now: lateJuly2026,
  });
  assert.equal(y11.incomingYearGroup, null);
  assert.equal(y11.isSummerTransition, false);
});

test("missing official year uses shared fallback; working year Secure is not a year", () => {
  const ctx = resolveStudentYearContext({
    officialYearGroup: null,
    classroomYearGroup: null,
    now: lateJuly2026,
  });
  assert.equal(ctx.targetLearningYearGroup, SAFE_YEAR_GROUP_FALLBACK);
  assert.equal(ctx.source, "safe-fallback");
});

test("Day School and Short Learning share resolver; Day School stays official", () => {
  const day = resolveStudentYearContext({
    officialYearGroup: "Year 4",
    classroomYearGroup: "Year 4",
    now: lateJuly2026,
    surface: "day-school",
  });
  const sl = resolveStudentYearContext({
    officialYearGroup: "Year 4",
    classroomYearGroup: "Year 4",
    now: lateJuly2026,
    surface: "short-learning",
  });
  assert.equal(day.targetLearningYearGroup, "Year 4");
  assert.equal(sl.targetLearningYearGroup, "Year 4");
  assert.equal(day.incomingYearGroup, "Year 5");
  assert.equal(sl.incomingYearGroup, "Year 5");
  const guidance = toShortLearningYearGuidance(sl);
  assert.equal(guidance.mode, "summer-transition");
  assert.equal(guidance.officialYearGroup, "Year 4");
  assert.equal(guidance.incomingYearGroup, "Year 5");
  assert.equal(guidance.yearGroup, "Year 4");
});

test("engines import shared resolver and drop divergent hard-coded Year 4/Year 5 fallbacks", () => {
  const sl = read("src/lib/schools/short-learning-session-content.ts");
  const day = read("src/lib/schools/generate-daytime-lesson-content.ts");
  const support = read("src/lib/schools/short-learning-support-context.ts");
  const dash = read("src/app/api/student/dashboard-summary/route.ts");
  assert.match(sl, /resolveStudentYearContext|toShortLearningYearGuidance/);
  assert.match(day, /resolveStudentYearContext/);
  assert.match(support, /resolveStudentYearContext/);
  assert.match(dash, /resolveStudentYearContext/);
  assert.match(dash, /yearDisplayLabel/);
  assert.match(dash, /summerPreparationLabel/);
  assert.doesNotMatch(sl, /return "Year 4";/);
  assert.doesNotMatch(day, /\?\? "Year 5"/);
  assert.doesNotMatch(support, /\|\| "Year 4"/);
});

test("student dashboard uses yearDisplayLabel and summer preparation copy", () => {
  const page = read("src/app/student/dashboard/page.tsx");
  assert.match(page, /yearDisplayLabel/);
  assert.match(page, /summerPreparationLabel/);
  assert.match(page, /summer learning will review/);
  assert.match(page, /isSummerTransition/);
  assert.doesNotMatch(page, /schoolEnrolment\.classroomName \? ` · \$\{schoolEnrolment\.classroomName\}`/);
});

test("admin review/publish path still demotes generated content to awaiting_review", () => {
  const sl = read("src/lib/schools/short-learning-session-content.ts");
  assert.match(sl, /awaiting_review/);
  assert.match(sl, /studentPlayable: false/);
  assert.match(sl, /Admin review/);
});

