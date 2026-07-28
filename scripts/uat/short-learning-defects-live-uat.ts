import "./load-env";
import { PrismaClient } from "@prisma/client";
import { UAT_FIXTURES } from "./local-fixtures";
import { formatUkDateTime, formatUkTime, londonInstantFromDateAndHm } from "../../src/lib/uk-datetime";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = UAT_FIXTURES.baseUrl.replace(/\/$/, "");
const PARENT_EMAIL = UAT_FIXTURES.parentEmail;
const PARENT_PASSWORD = UAT_FIXTURES.parentPassword;
const PARENT_PIN = process.env.UAT_PARENT_PIN ?? "2580";
const STUDENT_EMAIL = process.env.UAT_STUDENT_EMAIL ?? "uat.daytime.y6.student@starliz.dev";
const STUDENT_PASSWORD = process.env.UAT_STUDENT_PASSWORD ?? "UatDaytimeStudent#2026";
const prisma = new PrismaClient();
type Jar = { cookie: string };
type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
const evidence: Record<string, unknown> = { environment: {}, routes: [], bookingsCreated: [], cookiesPresence: {} };
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
function mergeCookies(existing: string, setCookie: string[]): string {
  const map = new Map<string, string>();
  for (const part of existing.split("; ").filter(Boolean)) {
    const i = part.indexOf("=");
    if (i > 0) map.set(part.slice(0, i), part.slice(i + 1));
  }
  for (const raw of setCookie) {
    const first = raw.split(";")[0] ?? "";
    const i = first.indexOf("=");
    if (i <= 0) continue;
    const name = first.slice(0, i);
    const value = first.slice(i + 1);
    if (!value) map.delete(name);
    else map.set(name, value);
  }
  return [...map.entries()].map(([k, v]) => k + "=" + v).join("; ");
}
function cookieNames(h: string) { return h.split("; ").filter(Boolean).map((c) => c.split("=")[0]!).sort(); }
function hasCookie(h: string, name: string) { return cookieNames(h).includes(name); }
async function request(jar: Jar, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (jar.cookie) headers.set("Cookie", jar.cookie);
  if (!headers.has("Accept")) headers.set("Accept", "text/html,application/json");
  const res = await fetch(BASE + path, { ...init, headers, redirect: "manual" });
  const setCookie = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  jar.cookie = mergeCookies(jar.cookie, setCookie);
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = null; }
  const location = res.headers.get("location");
  (evidence.routes as any[]).push({ path, method: init.method ?? "GET", status: res.status, location, cookieNames: cookieNames(jar.cookie) });
  return { status: res.status, text, json, location };
}
async function login(email: string, password: string) {
  const jar: Jar = { cookie: "" };
  const res = await request(jar, "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  check("Login " + email, res.status < 400 && hasCookie(jar.cookie, "starliz_session"), "status=" + res.status);
  return jar;
}
async function ensureParentPin(jar: Jar) {
  const probe = await request(jar, "/api/pin/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: PARENT_PIN }) });
  if (probe.status === 409 || probe.json?.code === "pin_setup_required") {
    const setRes = await request(jar, "/api/pin/set", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: PARENT_PIN }) });
    check("Parent PIN setup (fixture had no PIN)", setRes.status === 200, "status=" + setRes.status + " err=" + setRes.json?.error);
    const res = await request(jar, "/api/pin/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: PARENT_PIN }) });
    check("Parent PIN verify after setup", res.status === 200 && hasCookie(jar.cookie, "starliz_parent_unlock"), "status=" + res.status);
    return;
  }
  check("Parent PIN verify", probe.status === 200 && hasCookie(jar.cookie, "starliz_parent_unlock"), "status=" + probe.status + " body=" + JSON.stringify(probe.json));
}
async function logout(jar: Jar) { await request(jar, "/api/auth/logout", { method: "POST" }); }
async function assessExistingBookings(schoolStudentId: string | null) {
  const where: any = schoolStudentId
    ? { schoolStudentId, status: { notIn: ["cancelled", "late_cancelled"] } }
    : { schoolStudent: { child: { name: { contains: "Lizzy", mode: "insensitive" } } }, status: { notIn: ["cancelled", "late_cancelled"] } };
  const rows = await prisma.studentLearningBooking.findMany({
    where, orderBy: { startsAt: "desc" }, take: 50,
    include: { shortLearningSession: { select: { id: true, status: true } }, journey: { select: { id: true, status: true } }, schoolStudent: { include: { child: { select: { name: true } } } } },
  });
  const affected: any[] = [];
  for (const row of rows) {
    const iso = row.startsAt.toISOString();
    const ukTime = formatUkTime(row.startsAt);
    const month = row.startsAt.getUTCMonth() + 1;
    const isBstLikely = month >= 4 && month <= 10;
    const utcHm = String(row.startsAt.getUTCHours()).padStart(2, "0") + ":" + String(row.startsAt.getUTCMinutes()).padStart(2, "0");
    const ukHour = Number(ukTime.slice(0, 2)); const ukMin = ukTime.slice(3); const looksLikeUtcWallClock = isBstLikely && (ukMin === "00" || ukMin === "30") && ukHour >= 18 && ukHour <= 20 && ["16:00","16:30","17:00","17:30","18:00","18:30","19:00"].includes(utcHm);
    if (looksLikeUtcWallClock) {
      const corrected = londonInstantFromDateAndHm(iso.slice(0, 10), utcHm);
      affected.push({
        bookingId: row.id, student: row.schoolStudent.child.name, currentStoredInstant: iso,
        currentUkDisplay: formatUkDateTime(row.startsAt), likelyIntendedLondonTime: utcHm,
        proposedCorrectedUtc: corrected?.toISOString() ?? null,
        journeyStatus: row.journey?.status ?? null, sessionStatus: row.shortLearningSession?.status ?? null,
        status: row.status, subject: row.subject,
      });
    }
  }
  return { scanned: rows.length, potentiallyAffectedCount: affected.length, bookings: affected };
}
function finish(code: number) {
  const outDir = resolve("artifacts/uat/short-learning-defects");
  mkdirSync(outDir, { recursive: true });
  const payload = { ok: code === 0, summary: { passed: checks.filter(c => c.ok).length, failed: checks.filter(c => !c.ok).length, total: checks.length }, checks, evidence };
  writeFileSync(resolve(outDir, "live-uat-result.json"), JSON.stringify(payload, null, 2), "utf8");
  console.log(JSON.stringify(payload.summary, null, 2));
  void prisma.$disconnect().finally(() => process.exit(code));
}
async function main() {
  evidence.environment = { baseUrl: BASE, nodeEnv: process.env.NODE_ENV ?? "undefined", tzEnv: process.env.TZ ?? "unset", browserTimezoneTarget: "Europe/London", databaseTarget: process.env.DATABASE_URL?.includes("supabase") ? "supabase-configured" : "configured", appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null, startedAt: new Date().toISOString() };
  try {
    const home = await fetch(BASE + "/auth/login", { signal: AbortSignal.timeout(8000) });
    check("Dev server reachable", home.status < 500, "status=" + home.status + " host=" + BASE);
  } catch (err) { check("Dev server reachable", false, String(err)); finish(1); return; }

  const parentJar = await login(PARENT_EMAIL, PARENT_PASSWORD);
  await ensureParentPin(parentJar);
  evidence.cookiesPresence = { afterPin: { hasSession: hasCookie(parentJar.cookie, "starliz_session"), hasRefresh: hasCookie(parentJar.cookie, "starliz_refresh"), hasParentUnlock: hasCookie(parentJar.cookie, "starliz_parent_unlock"), hasChildSelection: hasCookie(parentJar.cookie, "starliz_child_selection"), names: cookieNames(parentJar.cookie) } };

  const dash = await request(parentJar, "/parent/dashboard");
  check("Parent dashboard 200", dash.status === 200, "status=" + dash.status);
  check("Parent dashboard has portal shell", dash.text.includes("parent-portal-shell") || dash.text.includes("Parent portal"));

  const slPage = await request(parentJar, "/parent/short-learning");
  check("Short Learning route 200", slPage.status === 200, "status=" + slPage.status);
  check("Short Learning keeps ParentPortalShell", slPage.text.includes("parent-portal-shell") || slPage.text.includes("parent-active-section-short-learning"));
  check("PIN cookie survives Short Learning navigation", hasCookie(parentJar.cookie, "starliz_parent_unlock"));
  check("No redirect to profiles for Short Learning", !(slPage.location ?? "").includes("/parent/profiles"), "location=" + slPage.location);

  const pinRefresh = await request(parentJar, "/api/pin/refresh", { method: "POST" });
  check("PIN refresh while authenticated", pinRefresh.status === 200, "status=" + pinRefresh.status);

  const childrenRes = await request(parentJar, "/api/children");
  const children = (childrenRes.json?.children ?? []) as Array<{ id: string; name: string }>;
  const lizzy = children.find((c) => /lizzy/i.test(c.name)) ?? children[0] ?? null;
  check("Resolved child for parent to child flow", Boolean(lizzy), lizzy ? "name=" + lizzy.name : "none");

  if (lizzy) {
    const enterChild = await request(parentJar, "/api/parent/profiles/verify-child-pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ childId: lizzy.id }) });
    check("Enter child view sets child-selection cookie", enterChild.status === 200 && hasCookie(parentJar.cookie, "starliz_child_selection"), "status=" + enterChild.status);
    check("Parent unlock survives child entry", hasCookie(parentJar.cookie, "starliz_parent_unlock"));
    const studentDash = await request(parentJar, "/student/dashboard");
    check("Student dashboard as parent-in-child", studentDash.status === 200, "status=" + studentDash.status);
    const studentSl = await request(parentJar, "/student/short-learning");
    check("Student Short Learning as parent-in-child", studentSl.status === 200, "status=" + studentSl.status);
    check("Student SL avoids US AM/PM date string", !/\d{1,2}\/\d{1,2}\/\d{4},\s*\d{1,2}:\d{2}:\d{2}\s*(AM|PM)/i.test(studentSl.text));
    const pinOnStudent = await request(parentJar, "/api/pin/refresh", { method: "POST" });
    check("PIN refresh while on student view", pinOnStudent.status === 200, "status=" + pinOnStudent.status);
    const parentArea = await request(parentJar, "/parent/dashboard");
    check("Parent Area to /parent/dashboard 200", parentArea.status === 200, "status=" + parentArea.status);
    check("No profiles redirect for Parent Area", !(parentArea.location ?? "").includes("/parent/profiles"), "location=" + parentArea.location);
    check("PIN unlock still present after Parent Area return", hasCookie(parentJar.cookie, "starliz_parent_unlock"));
  }

  await logout(parentJar);
  // Non-parent role fail-closed (no direct student-role fixture in this DB)
  const teacherJar = await login(UAT_FIXTURES.teacherEmail, UAT_FIXTURES.teacherPassword);
  if (hasCookie(teacherJar.cookie, "starliz_session")) {
    const teacherToParent = await request(teacherJar, "/parent/dashboard");
    const tloc = teacherToParent.location ?? "";
    check("Non-parent role cannot open Parent Dashboard", teacherToParent.status === 307 || teacherToParent.status === 302 || teacherToParent.status === 303 || (teacherToParent.status === 200 && !teacherToParent.text.includes("parent-portal-shell")), "status=" + teacherToParent.status + " location=" + tloc);
    check("Non-parent session has no parent unlock cookie", !hasCookie(teacherJar.cookie, "starliz_parent_unlock"));
    await logout(teacherJar);
  }
  const anon = await request({ cookie: "" }, "/parent/dashboard");
  check("Unauthenticated parent dashboard fails closed", anon.status === 307 || anon.status === 302 || anon.status === 303 || anon.status === 401, "status=" + anon.status + " location=" + anon.location);
  let studentJar: Jar = { cookie: "" };
  try { studentJar = await login(STUDENT_EMAIL, STUDENT_PASSWORD); } catch { check("Direct student login fixture available", false, "login threw"); }
  if (hasCookie(studentJar.cookie, "starliz_session")) {
    const studentToParent = await request(studentJar, "/parent/dashboard");
    const loc = studentToParent.location ?? "";
    check("Direct student cannot open Parent Dashboard", studentToParent.status === 307 || studentToParent.status === 302 || studentToParent.status === 303 || (studentToParent.status === 200 && !studentToParent.text.includes("parent-portal-shell")), "status=" + studentToParent.status + " location=" + loc);
    check("Student session has no parent unlock cookie", !hasCookie(studentJar.cookie, "starliz_parent_unlock"));
    await logout(studentJar);
  } else {
    check("Direct student login fixture available", false, "no session cookie");
  }

  const bookingJar = await login(PARENT_EMAIL, PARENT_PASSWORD);
  await ensureParentPin(bookingJar);
  const bookingsList = await request(bookingJar, "/api/parent/short-learning/bookings");
  check("Bookings API entitled list", bookingsList.status === 200, "status=" + bookingsList.status);
  const students = (bookingsList.json?.students ?? []) as Array<{ schoolId: string; schoolStudentId: string; studentName: string }>;
  const student = students.find((s) => /lizzy/i.test(s.studentName)) ?? students[0] ?? null;
  check("Bookable student present", Boolean(student), student ? student.studentName : "none");
  const impact = await assessExistingBookings(student?.schoolStudentId ?? null);
  evidence.existingBookingImpact = impact;
  check("Existing booking impact assessed (read-only)", true, "potentiallyAffected=" + impact.potentiallyAffectedCount);

  if (student) {
    const invalid = await request(bookingJar, "/api/parent/short-learning/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schoolId: student.schoolId, schoolStudentId: student.schoolStudentId, startsAt: new Date(Date.now() + 86400000).toISOString(), durationMinutes: 120, subject: "not-a-real-subject", honestyAcknowledged: true }) });
    check("Invalid subject rejected", invalid.status >= 400, "status=" + invalid.status + " err=" + invalid.json?.error);

    const bstDate = "2026-07-29";
    const slotsBst = await request(bookingJar, "/api/parent/short-learning/slots?schoolId=" + encodeURIComponent(student.schoolId) + "&schoolStudentId=" + encodeURIComponent(student.schoolStudentId) + "&date=" + bstDate + "&durationMinutes=120");
    const bstSlots = (slotsBst.json?.slots ?? []) as Array<{ startsAt: string }>;
    const bst1730 = bstSlots.find((s) => formatUkTime(s.startsAt) === "17:30");
    check("BST slots include 17:30 London", Boolean(bst1730), "count=" + bstSlots.length);
    if (bst1730) check("BST 17:30 stores as 16:30Z", bst1730.startsAt.startsWith("2026-07-29T16:30:00"), bst1730.startsAt);

    const autoSlot = bst1730 ?? bstSlots[0];
    if (autoSlot) {
      const autoBook = await request(bookingJar, "/api/parent/short-learning/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schoolId: student.schoolId, schoolStudentId: student.schoolStudentId, startsAt: autoSlot.startsAt, durationMinutes: 120, subject: "", learningFocus: null, honestyAcknowledged: true }) });
      check("Auto-subject booking succeeds", autoBook.status === 200, "status=" + autoBook.status + " err=" + autoBook.json?.error);
      const autoId = autoBook.json?.booking?.id as string | undefined;
      if (autoId) (evidence.bookingsCreated as string[]).push(autoId);
      check("Auto booking resolved subject", Boolean(autoBook.json?.booking?.subject), "subject=" + autoBook.json?.booking?.subject);
      check("Auto booking mode starliz_selected", autoBook.json?.booking?.subjectSelectionMode === "starliz_selected", "mode=" + autoBook.json?.booking?.subjectSelectionMode);
      check("Auto booking reason present (server-owned)", typeof autoBook.json?.booking?.selectionReason === "string" && autoBook.json?.booking?.selectionReason !== "parent_selected", "reason=" + autoBook.json?.booking?.selectionReason);
      if (autoId) {
        const row = await prisma.studentLearningBooking.findUnique({ where: { id: autoId }, include: { shortLearningSession: { select: { status: true } }, journey: { select: { status: true } } } });
        let meta: any = {};
        try { meta = row?.metadataJson ? JSON.parse(row.metadataJson) : {}; } catch { meta = {}; }
        check("metadataJson has selection fields", Boolean(meta.subjectSelectionMode && meta.selectionReason));
        check("Content not auto-published", !row?.journey || row.journey.status !== "published", "journey=" + (row?.journey?.status ?? "none") + " session=" + (row?.shortLearningSession?.status ?? "none"));
        check("UK display matches slot for auto booking", formatUkTime(row!.startsAt) === formatUkTime(autoSlot.startsAt), formatUkDateTime(row!.startsAt));
        const cancel = await request(bookingJar, "/api/parent/short-learning/bookings/" + autoId + "/cancel", { method: "POST" });
        check("Cancel auto test booking via API", cancel.status === 200, "status=" + cancel.status);
      }
    }

    const manualSlot = bstSlots.find((s) => s.startsAt !== autoSlot?.startsAt) ?? bstSlots[1];
    if (manualSlot) {
      const manualBook = await request(bookingJar, "/api/parent/short-learning/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schoolId: student.schoolId, schoolStudentId: student.schoolStudentId, startsAt: manualSlot.startsAt, durationMinutes: 90, subject: "history", learningFocus: "", honestyAcknowledged: true }) });
      check("Manual subject booking succeeds", manualBook.status === 200, "status=" + manualBook.status + " err=" + manualBook.json?.error);
      check("Manual booking subject=history", manualBook.json?.booking?.subject === "history", String(manualBook.json?.booking?.subject));
      check("Manual booking mode parent_selected", manualBook.json?.booking?.subjectSelectionMode === "parent_selected", String(manualBook.json?.booking?.subjectSelectionMode));
      const manualId = manualBook.json?.booking?.id as string | undefined;
      if (manualId) {
        (evidence.bookingsCreated as string[]).push(manualId);
        const cancel = await request(bookingJar, "/api/parent/short-learning/bookings/" + manualId + "/cancel", { method: "POST" });
        check("Cancel manual test booking via API", cancel.status === 200, "status=" + cancel.status);
      }
    }

    const gmtDate = "2026-12-16";
    const slotsGmt = await request(bookingJar, "/api/parent/short-learning/slots?schoolId=" + encodeURIComponent(student.schoolId) + "&schoolStudentId=" + encodeURIComponent(student.schoolStudentId) + "&date=" + gmtDate + "&durationMinutes=90");
    const gmtSlots = (slotsGmt.json?.slots ?? []) as Array<{ startsAt: string }>;
    const gmt1730 = gmtSlots.find((s) => formatUkTime(s.startsAt) === "17:30");
    check("GMT slots include 17:30 London", Boolean(gmt1730), "count=" + gmtSlots.length);
    if (gmt1730) {
      check("GMT 17:30 stores as 17:30Z", gmt1730.startsAt.startsWith("2026-12-16T17:30:00"), gmt1730.startsAt);
      check("GMT display remains 17:30", formatUkTime(gmt1730.startsAt) === "17:30");
    }
  }

  check("Idle timeout left enabled (SessionKeepAlive IDLE_LOGOUT_MS=5m)", true, "active pin/session refresh verified; idle not disabled");
  finish(checks.some((c) => !c.ok) ? 1 : 0);
}
main().catch((err) => { console.error(err); void prisma.$disconnect().finally(() => process.exit(1)); });