import test from "node:test";
import assert from "node:assert/strict";
import { subjectGlyph } from "../src/components/student/school-day/subjectGlyph";
import {
  greetingForHour,
  resolvePeriodUiStatus,
  schoolDayProgress,
} from "../src/components/student/school-day/periodStatus";
import {
  buildStudentAttendanceDashboard,
  computeAttendanceStreakDays,
  supportPreviewLabel,
} from "../src/lib/schools/student-attendance-dashboard";

test("subjectGlyph maps common school subjects", () => {
  assert.equal(subjectGlyph({ subject: "Guided Reading", lessonType: "lesson" }).glyph, "📖");
  assert.equal(subjectGlyph({ subject: "Spelling", lessonType: "lesson" }).shortLabel, "Spelling");
  assert.equal(subjectGlyph({ subject: "Maths", lessonType: "lesson" }).glyph, "➗");
  assert.equal(subjectGlyph({ subject: "Science", lessonType: "lesson" }).glyph, "🧪");
  assert.equal(subjectGlyph({ subject: "PE", lessonType: "pe" }).glyph, "🏃");
  assert.equal(subjectGlyph({ lessonType: "break", subject: "Break" }).shortLabel, "Break");
  assert.equal(subjectGlyph({ lessonType: "registration", title: "Morning register" }).glyph, "📋");
});

test("resolvePeriodUiStatus uses Now/Next/Completed/Locked schedule chips", () => {
  assert.equal(
    resolvePeriodUiStatus({
      clockState: "now",
      lessonType: "lesson",
      isCurrent: true,
      isNext: false,
    }).label,
    "Now",
  );
  assert.equal(
    resolvePeriodUiStatus({
      clockState: "upcoming",
      lessonType: "lesson",
      isCurrent: false,
      isNext: true,
    }).status,
    "next",
  );
  assert.equal(
    resolvePeriodUiStatus({
      clockState: "past",
      lessonType: "lesson",
      isCurrent: false,
      isNext: false,
    }).label,
    "Completed",
  );
  assert.equal(
    resolvePeriodUiStatus({
      clockState: "upcoming",
      lessonType: "lesson",
      isCurrent: false,
      isNext: false,
    }).label,
    "Locked",
  );
  assert.equal(
    resolvePeriodUiStatus({
      clockState: "now",
      lessonType: "break",
      isCurrent: true,
      isNext: false,
    }).label,
    "Now",
  );
});

test("schoolDayProgress counts ended playable lessons", () => {
  const progress = schoolDayProgress({
    periods: [
      { id: "1", lessonType: "lesson", startsAt: "09:00", endsAt: "09:50" },
      { id: "2", lessonType: "break", startsAt: "09:50", endsAt: "10:10" },
      { id: "3", lessonType: "lesson", startsAt: "10:10", endsAt: "11:00" },
    ],
    nowMinutes: 10 * 60,
    resolveClock: (startsAt, endsAt, now) => {
      const [sh, sm] = startsAt.split(":").map(Number);
      const [eh, em] = endsAt.split(":").map(Number);
      const start = sh * 60 + sm;
      const end = eh * 60 + em;
      if (now >= start && now < end) return "now";
      if (now >= end) return "past";
      return "upcoming";
    },
  });
  assert.equal(progress.total, 2);
  assert.equal(progress.ended, 1);
});

test("greetingForHour buckets morning afternoon evening", () => {
  assert.equal(greetingForHour(8), "Good morning");
  assert.equal(greetingForHour(14), "Good afternoon");
  assert.equal(greetingForHour(19), "Good evening");
});

test("attendance streak and dashboard summary", () => {
  const items = [
    {
      sessionDate: "2026-07-23",
      status: "present" as const,
      periodTitle: "Morning registration",
      subject: "Registration",
      startsAt: "08:45",
      endsAt: "09:00",
    },
    {
      sessionDate: "2026-07-24",
      status: "late" as const,
      periodTitle: "Morning registration",
      subject: "Registration",
      startsAt: "08:45",
      endsAt: "09:00",
    },
    {
      sessionDate: "2026-07-24",
      status: "present" as const,
      periodTitle: "Afternoon registration",
      subject: "Registration",
      startsAt: "13:00",
      endsAt: "13:15",
    },
  ];
  assert.equal(computeAttendanceStreakDays(items, "2026-07-24"), 2);
  const dashboard = buildStudentAttendanceDashboard({
    items,
    windowDays: 30,
    todayIso: "2026-07-24",
  });
  assert.equal(dashboard.summary.recordedMarks, 3);
  assert.equal(dashboard.summary.presentRatePct, 100);
  assert.equal(dashboard.today.morning.status, "late");
  assert.equal(dashboard.today.afternoon.status, "present");
  assert.equal(dashboard.streakDays, 2);
});

test("supportPreviewLabel stays student-safe with AI and human lines", () => {
  const offline = supportPreviewLabel({ onlineTutorCount: 0, availableTutorCount: 0 });
  assert.match(offline.label, /AI Tutor ready/);
  assert.match(offline.aiLabel, /Ready to help/);
  assert.match(offline.humanLabel, /No human tutors are online/);
  const online = supportPreviewLabel({ onlineTutorCount: 2, availableTutorCount: 2 });
  assert.match(online.label, /2 tutors available/);
  assert.match(online.humanLabel, /Available if AI cannot solve/);
});
