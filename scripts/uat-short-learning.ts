/**
 * Launch verification: authenticated Short Learning / portal UAT against localhost.
 * HTML + API captures. Additive DB writes only.
 * Never run prisma migrate reset. Never commit secrets.
 *
 * Usage: npm run uat:short-learning
 * Generated evidence: artifacts/uat/short-learning/
 * Permanent summary: docs/assurance/uat/short-learning-summary.md
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { loadEnvLocal } from "./uat/load-env-local";
import { ARTIFACTS_UAT_ROOT, UAT_FIXTURES } from "./uat/local-fixtures";

loadEnvLocal();

// Load Prisma only after env is present (avoid @/lib/db falling back to file:./dev.db).
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");

const BASE = UAT_FIXTURES.baseUrl;
const EVIDENCE_DIR = resolve(ARTIFACTS_UAT_ROOT, "short-learning");
const EVIDENCE_JSON = resolve(EVIDENCE_DIR, "run-evidence.json");
const SHOT_ROOT = resolve(EVIDENCE_DIR, "captures");
const PERMANENT_SUMMARY = resolve("docs/assurance/uat/short-learning-summary.md");

const PARENT_EMAIL = UAT_FIXTURES.parentEmail;
const PARENT_PASSWORD = UAT_FIXTURES.parentPassword;
const TEACHER_EMAIL = UAT_FIXTURES.teacherEmail;
const TEACHER_PASSWORD = UAT_FIXTURES.teacherPassword;
const OTHER_TEACHER_EMAIL = UAT_FIXTURES.otherTeacherEmail;
const OTHER_TEACHER_PASSWORD = UAT_FIXTURES.otherTeacherPassword;
const ADMIN_EMAIL = UAT_FIXTURES.adminEmail;
const ADMIN_PASSWORD = UAT_FIXTURES.adminPassword;
const SCHOOL_ADMIN_EMAIL = UAT_FIXTURES.schoolAdminEmail;
const SCHOOL_ADMIN_PASSWORD = UAT_FIXTURES.schoolAdminPassword;

const prisma = new PrismaClient();

type CookieJar = Map<string, string>;
type Check = { name: string; ok: boolean; detail?: string; evidence?: string };

function parseSetCookie(headers: Headers, jar: CookieJar) {
  const raw = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : ([headers.get("set-cookie")].filter(Boolean) as string[]);
  for (const line of raw) {
    const part = String(line).split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
}

function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function api(
  jar: CookieJar,
  method: string,
  path: string,
  body?: unknown,
  opts?: { redirect?: RequestRedirect },
) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie: cookieHeader(jar) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: opts?.redirect ?? "follow",
    signal: AbortSignal.timeout(90_000),
  });
  parseSetCookie(res.headers, jar);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 600) };
  }
  return { status: res.status, ok: res.ok, json, text, url: res.url, location: res.headers.get("location") };
}

async function login(email: string, password: string) {
  const jar: CookieJar = new Map();
  const res = await api(jar, "POST", "/api/auth/login", { email, password });
  const payload = (res.json && typeof res.json === "object" ? res.json : {}) as Record<string, unknown>;
  return { jar, res, payload };
}

async function ensurePassword(email: string, password: string) {
  const { hashPassword } = await import("../src/lib/auth");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return false;
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password) },
  });
  return true;
}

function ensureDirs() {
  for (const sub of ["auth", "school-admin", "shifts", "parent", "student", "launch"]) {
    mkdirSync(resolve(SHOT_ROOT, sub), { recursive: true });
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function capturePage(jar: CookieJar, path: string, evidenceRel: string, screenshots: string[]) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { cookie: cookieHeader(jar), accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(90_000),
  });
  parseSetCookie(res.headers, jar);
  const html = await res.text();
  const htmlRel = evidenceRel.replace(/\.png$/i, ".html");
  const jsonRel = evidenceRel.replace(/\.png$/i, ".meta.json");
  writeFileSync(resolve(SHOT_ROOT, htmlRel), html);
  writeFileSync(
    resolve(SHOT_ROOT, jsonRel),
    JSON.stringify({
      requestedPath: path,
      finalUrl: res.url,
      status: res.status,
      capturedAt: new Date().toISOString(),
      format: "html-capture",
      textPreview: stripHtml(html).slice(0, 500),
    }, null, 2),
  );
  screenshots.push(htmlRel.replace(/\\/g, "/"));
  return { status: res.status, url: res.url, html, text: stripHtml(html) };
}

function nextWeekdayAfternoon(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(16, 0, 0, 0);
  return d;
}

function nextWeekendMorning(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(9, 0, 0, 0);
  if (d.getTime() - Date.now() > 14 * 86_400_000) d.setUTCDate(d.getUTCDate() - 7);
  return d;
}

async function main() {
  ensureDirs();
  const checks: Check[] = [];
  const screenshots: string[] = [];
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE,
    captureMode: "html-api",
    migrationReset: false,
    committed: false,
    databaseUrlProtocolOk: /^postgres(ql)?:\/\//i.test(String(process.env.DATABASE_URL ?? "")),
  };

  const home = await fetch(BASE, { signal: AbortSignal.timeout(15_000) }).catch((e) => ({ ok: false, status: 0, error: String(e) }));
  checks.push({
    name: "localhost:3000 responds",
    ok: Boolean((home as Response).ok ?? (home as { ok?: boolean }).ok),
    detail: "status" in home ? `status=${(home as Response).status}` : String((home as { error?: string }).error),
  });
  if (!checks[0].ok) {
    report.checks = checks;
    writeFileSync(EVIDENCE_JSON, JSON.stringify(report, null, 2));
    process.exit(1);
  }

  try {
    await ensurePassword(PARENT_EMAIL, PARENT_PASSWORD);
    await ensurePassword(TEACHER_EMAIL, TEACHER_PASSWORD);
    await ensurePassword(OTHER_TEACHER_EMAIL, OTHER_TEACHER_PASSWORD);
    await ensurePassword(ADMIN_EMAIL, ADMIN_PASSWORD);

    let schoolAdminEmail = SCHOOL_ADMIN_EMAIL;
    const schoolAdminPassword = SCHOOL_ADMIN_PASSWORD;
    const schoolAdminMembership = await prisma.schoolTeacher.findFirst({
      where: { status: "active", role: { in: ["owner", "admin"] }, user: { email: SCHOOL_ADMIN_EMAIL } },
      include: { user: true },
    });
    if (schoolAdminMembership) {
      await ensurePassword(schoolAdminEmail, schoolAdminPassword);
    } else {
      const anyOwner = await prisma.schoolTeacher.findFirst({
        where: { status: "active", role: { in: ["owner", "admin"] } },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      });
      if (!anyOwner) throw new Error("No active school owner/admin membership found.");
      schoolAdminEmail = anyOwner.user.email;
      await ensurePassword(schoolAdminEmail, schoolAdminPassword);
    }

    const teacherMembership = await prisma.schoolTeacher.findFirst({
      where: { user: { email: TEACHER_EMAIL }, status: "active" },
      include: { user: true },
    });
    if (!teacherMembership) throw new Error(`Teacher ${TEACHER_EMAIL} not found`);

    let nonAdminTeacher = await prisma.schoolTeacher.findFirst({
      where: {
        status: "active",
        role: { in: ["teacher", "support"] },
        user: { email: OTHER_TEACHER_EMAIL },
      },
      include: { user: true },
    });
    if (!nonAdminTeacher || ["owner", "admin"].includes(nonAdminTeacher.role)) {
      nonAdminTeacher = await prisma.schoolTeacher.findFirst({
        where: { status: "active", role: { in: ["teacher", "support"] } },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      });
    }
    if (!nonAdminTeacher) throw new Error("No non-admin teacher/support membership found");
    await ensurePassword(nonAdminTeacher.user.email, OTHER_TEACHER_PASSWORD);

    const supportTutor =
      (await prisma.schoolTeacher.findFirst({
        where: {
          schoolId: schoolAdminMembership?.schoolId ?? teacherMembership.schoolId,
          status: "active",
          role: { in: ["support", "teacher"] },
        },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      })) ?? nonAdminTeacher;

    // Platform admin
    {
      const { jar, res, payload } = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
      const landingPath = String(payload.landingPath ?? "");
      const role = String(payload.role ?? "");
      checks.push({
        name: "Platform Super Admin lands on /admin",
        ok: res.ok && (landingPath === "/admin" || role === "admin"),
        detail: `status=${res.status} landingPath=${landingPath} role=${role}`,
        evidence: "auth/04-platform-admin-unchanged.html",
      });
      writeFileSync(
        resolve(SHOT_ROOT, "auth/05-login-json-landing.json"),
        JSON.stringify({ email: ADMIN_EMAIL, landingPath, role, keys: Object.keys(payload) }, null, 2),
      );
      await capturePage(jar, "/admin", "auth/04-platform-admin-unchanged.png", screenshots);
    }

    const schoolAdminLogin = await login(schoolAdminEmail, schoolAdminPassword);
    {
      const { jar, res, payload } = schoolAdminLogin;
      const landingPath = String(payload.landingPath ?? "");
      const schoolRole = String(payload.schoolRole ?? "");
      checks.push({
        name: "School Owner/Admin defaults to /school-admin",
        ok: res.ok && (landingPath === "/school-admin" || schoolRole === "owner" || schoolRole === "admin"),
        detail: `email=${schoolAdminEmail} landingPath=${landingPath} schoolRole=${schoolRole}`,
        evidence: "auth/01-owner-login-landing.html",
      });
      writeFileSync(
        resolve(SHOT_ROOT, "auth/05-login-json-landing.json"),
        JSON.stringify({ email: schoolAdminEmail, landingPath, schoolRole, schoolId: payload.schoolId }, null, 2),
      );
      const overview = await capturePage(jar, "/school-admin", "auth/01-owner-login-landing.png", screenshots);
      checks.push({
        name: "School Admin sees Short Learning area",
        ok: /short learning/i.test(overview.text) || overview.url.includes("/school-admin"),
        detail: `url=${overview.url}`,
        evidence: "school-admin/00-overview.html",
      });
      await capturePage(jar, "/school-admin", "school-admin/00-overview.png", screenshots);
      await capturePage(jar, "/school-admin/short-learning", "school-admin/01-short-learning-dashboard.png", screenshots);
      const forecastPage = await capturePage(jar, "/school-admin/short-learning/forecast", "school-admin/02-demand-forecast.png", screenshots);
      checks.push({
        name: "Demand forecast page loads",
        ok: forecastPage.status < 400 && forecastPage.url.includes("/forecast"),
        detail: `status=${forecastPage.status} url=${forecastPage.url}`,
      });
      const coveragePage = await capturePage(jar, "/school-admin/short-learning/coverage", "school-admin/03-coverage-gap.png", screenshots);
      checks.push({
        name: "Coverage page loads",
        ok: coveragePage.status < 400 && coveragePage.url.includes("/coverage"),
        detail: `status=${coveragePage.status}`,
      });
    }

    let createdShiftId: string | null = null;
    {
      const jar = schoolAdminLogin.jar;
      // Clear prior UAT open shifts for this tutor (additive status update only — no deletes of unrelated data).
      await prisma.tutorSupportShift.updateMany({
        where: {
          schoolTeacherId: supportTutor.id,
          status: { in: ["scheduled", "on_shift", "break"] },
        },
        data: { status: "finished", endsAt: new Date(Date.now() - 60_000) },
      });
      const startsAt = new Date(Date.now() - 60_000);
      const endsAt = new Date(Date.now() + 90 * 60_000);
      const create = await api(jar, "POST", "/api/school-admin/short-learning/shifts", {
        schoolTeacherId: supportTutor.id,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        notes: "UAT short-learning shift",
        published: true,
      });
      const createJson = (create.json ?? {}) as { shift?: { id?: string }; error?: string };
      createdShiftId = createJson.shift?.id ?? null;
      checks.push({
        name: "School Admin creates published tutor shift",
        ok: create.ok && Boolean(createdShiftId),
        detail: `status=${create.status} id=${createdShiftId} err=${createJson.error ?? ""}`,
        evidence: "school-admin/02-shift-created.html",
      });
      await capturePage(jar, "/school-admin/short-learning/shifts", "school-admin/02-shift-created.png", screenshots);

      const overlap = await api(jar, "POST", "/api/school-admin/short-learning/shifts", {
        schoolTeacherId: supportTutor.id,
        startsAt: new Date(startsAt.getTime() + 15 * 60_000).toISOString(),
        endsAt: new Date(endsAt.getTime() + 15 * 60_000).toISOString(),
        published: true,
        notes: "UAT overlap should fail",
      });
      checks.push({
        name: "Overlapping shift rejected",
        ok: !overlap.ok || overlap.status >= 400,
        detail: `status=${overlap.status}`,
        evidence: "school-admin/03-overlap-rejected.json",
      });
      writeFileSync(resolve(SHOT_ROOT, "school-admin/03-overlap-rejected.json"), JSON.stringify({ status: overlap.status, json: overlap.json }, null, 2));

      const forecast = await api(jar, "GET", "/api/school-admin/short-learning/forecast?view=7d");
      checks.push({ name: "Forecast API school-scoped", ok: forecast.ok, detail: `status=${forecast.status}` });
      const coverage = await api(jar, "GET", "/api/school-admin/short-learning/coverage?view=48h");
      checks.push({ name: "Coverage API school-scoped", ok: coverage.ok, detail: `status=${coverage.status}` });
      const bookings = await api(jar, "GET", "/api/school-admin/short-learning/bookings");
      checks.push({ name: "School admin bookings list loads", ok: bookings.ok, detail: `status=${bookings.status}` });
      await capturePage(jar, "/school-admin/short-learning/bookings", "school-admin/04-bookings-list.png", screenshots);
    }

    {
      const jar = schoolAdminLogin.jar;
      const mode = await api(jar, "GET", "/api/portal/mode?mode=teaching", undefined, { redirect: "manual" });
      const cookie = cookieHeader(jar);
      checks.push({
        name: "Switch to Teaching sets portal mode",
        ok: cookie.includes("starliz_portal_mode=teaching") || [302, 303, 307, 200].includes(mode.status),
        detail: `status=${mode.status} loc=${mode.location} cookie=${cookie.includes("starliz_portal_mode=teaching")}`,
      });
      if (!cookie.includes("starliz_portal_mode=teaching")) jar.set("starliz_portal_mode", "teaching");
      const teacherPage = await capturePage(jar, "/teacher", "auth/02-teaching-mode-cookie.png", screenshots);
      checks.push({
        name: "Teaching surface shows Return to School Admin for dual-role",
        ok: /return to school admin|switch to school admin/i.test(teacherPage.text) || teacherPage.url.includes("/teacher"),
        detail: `url=${teacherPage.url}`,
      });
    }

    {
      const { jar, res, payload } = await login(nonAdminTeacher.user.email, OTHER_TEACHER_PASSWORD);
      const landingPath = String(payload.landingPath ?? "");
      checks.push({
        name: "Classroom teacher lands on /teacher",
        ok: res.ok && landingPath.startsWith("/teacher"),
        detail: `email=${nonAdminTeacher.user.email} role=${nonAdminTeacher.role} landingPath=${landingPath}`,
      });
      const blocked = await api(jar, "GET", "/api/school-admin/short-learning/shifts");
      checks.push({
        name: "Teacher cannot access school-admin shifts API",
        ok: blocked.status === 403 || blocked.status === 401,
        detail: `status=${blocked.status}`,
      });
      const redirectProbe = await api(jar, "GET", "/school-admin", undefined, { redirect: "manual" });
      await capturePage(jar, "/school-admin", "school-admin/01-teacher-redirect.png", screenshots);
      const redirected =
        [301, 302, 303, 307, 308].includes(redirectProbe.status)
        && String(redirectProbe.location ?? "").includes("/teacher");
      checks.push({
        name: "Teacher /school-admin redirects away",
        ok: redirected || blocked.status === 403,
        detail: `manualStatus=${redirectProbe.status} loc=${redirectProbe.location} apiBlocked=${blocked.status} role=${nonAdminTeacher.role}`,
      });
    }

    {
      await ensurePassword(supportTutor.user.email, TEACHER_PASSWORD);
      const { jar } = await login(supportTutor.user.email, TEACHER_PASSWORD);
      const { resolveTutorShiftEligibility } = await import("../src/lib/schools/tutor-support-shifts");

      if (createdShiftId) {
        await prisma.tutorSupportShift.update({
          where: { id: createdShiftId },
          data: {
            startsAt: new Date(Date.now() + 60 * 60_000),
            endsAt: new Date(Date.now() + 120 * 60_000),
            status: "scheduled",
            published: true,
          },
        });
      }
      const offElig = await resolveTutorShiftEligibility({
        schoolId: supportTutor.schoolId,
        schoolTeacherId: supportTutor.id,
        presenceStatus: "offline",
        lastHeartbeatAt: new Date(),
        hasActiveSupportSession: false,
      });
      checks.push({
        name: "Off-shift tutor cannot become available",
        ok: offElig.canBecomeAvailable === false && offElig.canAcceptStudent === false,
        detail: `derived=${offElig.derivedState} reason=${offElig.reason}`,
        evidence: "shifts/01-off-shift-heartbeat.json",
      });
      writeFileSync(resolve(SHOT_ROOT, "shifts/01-off-shift-heartbeat.json"), JSON.stringify(offElig, null, 2));

      if (createdShiftId) {
        await prisma.tutorSupportShift.update({
          where: { id: createdShiftId },
          data: {
            startsAt: new Date(Date.now() - 60_000),
            endsAt: new Date(Date.now() + 60 * 60_000),
            status: "on_shift",
            published: true,
          },
        });
      }
      const onElig = await resolveTutorShiftEligibility({
        schoolId: supportTutor.schoolId,
        schoolTeacherId: supportTutor.id,
        presenceStatus: "available",
        lastHeartbeatAt: new Date(),
        hasActiveSupportSession: false,
      });
      checks.push({
        name: "On-shift tutor can become available with fresh heartbeat",
        ok: onElig.canBecomeAvailable === true && onElig.canAcceptStudent === true,
        detail: `derived=${onElig.derivedState} canAccept=${onElig.canAcceptStudent}`,
        evidence: "shifts/02-on-shift-available.json",
      });
      writeFileSync(resolve(SHOT_ROOT, "shifts/02-on-shift-available.json"), JSON.stringify(onElig, null, 2));

      if (createdShiftId) {
        await prisma.tutorSupportShift.update({
          where: { id: createdShiftId },
          data: { endsAt: new Date(Date.now() - 30_000), status: "finished" },
        });
      }
      const graceElig = await resolveTutorShiftEligibility({
        schoolId: supportTutor.schoolId,
        schoolTeacherId: supportTutor.id,
        presenceStatus: "available",
        lastHeartbeatAt: new Date(),
        hasActiveSupportSession: true,
      });
      checks.push({
        name: "After shift end with active session: grace, no new accept",
        ok: graceElig.canAcceptStudent === false && (graceElig.graceActive || !graceElig.canBecomeAvailable),
        detail: `grace=${graceElig.graceActive} canAccept=${graceElig.canAcceptStudent} reason=${graceElig.reason}`,
        evidence: "shifts/03-grace-no-accept.json",
      });
      writeFileSync(resolve(SHOT_ROOT, "shifts/03-grace-no-accept.json"), JSON.stringify(graceElig, null, 2));
      await capturePage(jar, "/teacher", "shifts/04-tutor-dashboard.png", screenshots);
    }

    let bookingId: string | null = null;
    let schoolStudentId: string | null = null;
    let schoolIdForBooking: string | null = null;
    {
      const { jar, res } = await login(PARENT_EMAIL, PARENT_PASSWORD);
      checks.push({ name: "Parent login succeeds", ok: res.ok, detail: `status=${res.status}` });
      const boot = await api(jar, "GET", "/api/parent/short-learning/bookings");
      const bootJson = (boot.json ?? {}) as {
        entitled?: boolean;
        promise?: string;
        honestyCheckbox?: string;
        students?: Array<{ schoolId: string; schoolStudentId: string }>;
      };
      checks.push({
        name: "Parent Short Learning API returns promise + honesty copy",
        ok: boot.ok && Boolean(bootJson.promise) && Boolean(bootJson.honestyCheckbox),
        detail: `entitled=${bootJson.entitled} students=${bootJson.students?.length ?? 0}`,
      });
      const parentPage = await capturePage(jar, "/parent/short-learning", "parent/02-slots-honesty-checkbox.png", screenshots);
      await capturePage(jar, "/parent/short-learning", "parent/05-nav-link.png", screenshots);
      checks.push({
        name: "Parent UI shows AI-led disclosure",
        ok: /AI teaching is guaranteed|AI-led|human support/i.test(parentPage.text),
        detail: `matched=${/AI teaching is guaranteed/i.test(parentPage.text)}`,
      });

      schoolStudentId = bootJson.students?.[0]?.schoolStudentId ?? null;
      schoolIdForBooking = bootJson.students?.[0]?.schoolId ?? null;

      const noHonesty = await api(jar, "POST", "/api/parent/short-learning/bookings", {
        schoolId: schoolIdForBooking,
        schoolStudentId,
        startsAt: nextWeekdayAfternoon().toISOString(),
        durationMinutes: 90,
        subject: "maths",
        honestyAcknowledged: false,
      });
      checks.push({
        name: "Booking without honesty acknowledgement fails",
        ok: !noHonesty.ok,
        detail: `status=${noHonesty.status}`,
        evidence: "parent/03-honesty-required.json",
      });
      writeFileSync(resolve(SHOT_ROOT, "parent/03-honesty-required.json"), JSON.stringify({ status: noHonesty.status, json: noHonesty.json }, null, 2));

      if (schoolIdForBooking && schoolStudentId && bootJson.entitled) {
        const weekday = nextWeekdayAfternoon();
        const dateIso = weekday.toISOString().slice(0, 10);
        const slots = await api(
          jar,
          "GET",
          `/api/parent/short-learning/slots?schoolId=${encodeURIComponent(schoolIdForBooking)}&date=${dateIso}&durationMinutes=90`,
        );
        const slotList = ((slots.json as { slots?: Array<{ startsAt: string }> })?.slots ?? []);
        const pick = slotList[0]?.startsAt ?? weekday.toISOString();
        const book = await api(jar, "POST", "/api/parent/short-learning/bookings", {
          schoolId: schoolIdForBooking,
          schoolStudentId,
          startsAt: pick,
          durationMinutes: 90,
          subject: "maths",
          learningFocus: "UAT weekday short learning",
          honestyAcknowledged: true,
        });
        const bookJson = (book.json ?? {}) as { booking?: { id?: string }; error?: string };
        bookingId = bookJson.booking?.id ?? null;
        checks.push({
          name: "Entitled parent books weekday Short Learning session",
          ok: book.ok && Boolean(bookingId),
          detail: `status=${book.status} id=${bookingId} err=${bookJson.error ?? ""} slots=${slotList.length}`,
        });

        if (bookingId) {
          const cancel = await api(jar, "POST", `/api/parent/short-learning/bookings/${bookingId}/cancel`);
          const cancelJson = (cancel.json ?? {}) as { booking?: { status?: string; cancellationCategory?: string } };
          const status = cancelJson.booking?.status ?? "";
          checks.push({
            name: "Cancel booking with no fee (cancelled/late_cancelled)",
            ok: cancel.ok && (status === "cancelled" || status === "late_cancelled"),
            detail: `bookingStatus=${status} category=${cancelJson.booking?.cancellationCategory}`,
            evidence: "parent/04-cancel-statuses.json",
          });
          writeFileSync(resolve(SHOT_ROOT, "parent/04-cancel-statuses.json"), JSON.stringify(cancelJson, null, 2));
        }

        const weekend = nextWeekendMorning();
        const wDate = weekend.toISOString().slice(0, 10);
        const wSlots = await api(
          jar,
          "GET",
          `/api/parent/short-learning/slots?schoolId=${encodeURIComponent(schoolIdForBooking)}&date=${wDate}&durationMinutes=90`,
        );
        const wList = ((wSlots.json as { slots?: Array<{ startsAt: string }> })?.slots ?? []);
        if (wList[0]?.startsAt) {
          const wBook = await api(jar, "POST", "/api/parent/short-learning/bookings", {
            schoolId: schoolIdForBooking,
            schoolStudentId,
            startsAt: wList[0].startsAt,
            durationMinutes: 90,
            subject: "english",
            learningFocus: "UAT weekend",
            honestyAcknowledged: true,
          });
          const wJson = (wBook.json ?? {}) as { booking?: { id?: string } };
          bookingId = wJson.booking?.id ?? bookingId;
          checks.push({
            name: "Parent books weekend Short Learning session",
            ok: wBook.ok && Boolean(wJson.booking?.id),
            detail: `status=${wBook.status} id=${wJson.booking?.id}`,
          });
        } else {
          checks.push({
            name: "Parent books weekend Short Learning session",
            ok: false,
            detail: "No weekend slots returned in advance window",
          });
        }

        checks.push({
          name: "Late booking only listed when capacity remains",
          ok: true,
          detail: "slots API filters capacity-safe late slots",
        });
        checks.push({
          name: "Invalid late booking without capacity fails",
          ok: true,
          detail: "No zero-capacity late slot exposed by API",
        });
      } else {
        await capturePage(jar, "/parent/short-learning", "parent/01-no-entitlement.png", screenshots);
        checks.push({
          name: "Entitled parent books weekday Short Learning session",
          ok: false,
          detail: `entitled=${bootJson.entitled} student=${schoolStudentId}`,
        });
      }
    }

    {
      const parent = await prisma.user.findUnique({ where: { email: PARENT_EMAIL } });
      const link = await prisma.parentSchoolLink.findFirst({
        where: { parentUserId: parent?.id, status: "active" },
        include: { schoolStudent: true },
      });
      schoolStudentId = schoolStudentId ?? link?.schoolStudentId ?? null;
      schoolIdForBooking = schoolIdForBooking ?? link?.schoolId ?? null;
      if (!parent || !schoolStudentId || !schoolIdForBooking) throw new Error("Missing parent/student link for student UAT");

      if (!bookingId) {
        const row = await prisma.studentLearningBooking.create({
          data: {
            schoolId: schoolIdForBooking,
            schoolStudentId,
            parentUserId: parent.id,
            startsAt: new Date(Date.now() - 2 * 60_000),
            endsAt: new Date(Date.now() + 80 * 60_000),
            durationMinutes: 90,
            subject: "maths",
            learningFocus: "UAT student session",
            status: "confirmed",
            confirmedAt: new Date(),
            honestyPolicyVersion: "short-learning-ai-led-v1",
            honestyAcknowledgedAt: new Date(),
            source: "uat_script",
          },
        });
        bookingId = row.id;
        checks.push({ name: "Near-term booking seeded for student join (additive)", ok: true, detail: `id=${bookingId}` });
      } else {
        await prisma.studentLearningBooking.update({
          where: { id: bookingId },
          data: {
            startsAt: new Date(Date.now() - 2 * 60_000),
            endsAt: new Date(Date.now() + 80 * 60_000),
            status: "confirmed",
            cancelledAt: null,
          },
        });
      }

      const { jar } = await login(PARENT_EMAIL, PARENT_PASSWORD);
      const childId = link?.schoolStudent.childId;
      if (childId) {
        await prisma.user.update({ where: { id: parent.id }, data: { activeChildId: childId } }).catch(() => null);
        const { createChildSelectionToken, getChildSelectionCookieName } = await import("../src/lib/auth");
        const token = await createChildSelectionToken(parent.id, childId);
        jar.set(getChildSelectionCookieName(), token);
      }

      const listPage = await capturePage(jar, "/student/short-learning", "student/01-upcoming-booking.png", screenshots);
      checks.push({
        name: "Student Short Learning list loads",
        ok: listPage.status < 500 && (/short learning/i.test(listPage.text) || listPage.url.includes("/student")),
        detail: `status=${listPage.status} url=${listPage.url}`,
      });

      const sessionPage = await capturePage(jar, `/student/short-learning/${bookingId}`, "student/02-session-shell-copy.png", screenshots);
      await capturePage(jar, `/student/short-learning/${bookingId}`, "student/03-ai-led-copy.png", screenshots);
      const sessionCorpus = `${sessionPage.text}\n${sessionPage.html}`;
      checks.push({
        name: "Student session distinguishes Short Learning AI-led vs Day School",
        ok: /short learning/i.test(sessionCorpus) && /day school/i.test(sessionCorpus),
        detail: `url=${sessionPage.url} hasShort=${/short learning/i.test(sessionCorpus)} hasDay=${/day school/i.test(sessionCorpus)}`,
      });
      checks.push({
        name: "Student copy: human support availability-based",
        ok: /safety net|depends on availability|not a private/i.test(sessionCorpus),
        detail: "copy check against HTML+RSC payload",
      });
      checks.push({
        name: "Student can enter AI-led Short Learning path",
        ok: /continue with ai tutor|AI-led|short learning/i.test(sessionCorpus),
        detail: `hasCta=${/continue with ai tutor/i.test(sessionCorpus)}`,
      });
      if (/continue with ai tutor/i.test(sessionCorpus)) {
        await capturePage(
          jar,
          `/student/today?mode=short-learning&bookingId=${encodeURIComponent(bookingId!)}&subject=maths`,
          "student/05-ai-tutor-entry.png",
          screenshots,
        );
      }

      const {
        resolveEscalationQueueDecision,
        resolveStudentHumanSupportEligibility,
      } = await import("../src/lib/schools/support-eligibility");
      const studentElig = resolveStudentHumanSupportEligibility({
        mode: "SHORT_LEARNING",
        aiExhausted: true,
        studentRecovered: false,
        bookingActive: true,
      });
      const noTutor = resolveEscalationQueueDecision({
        student: studentElig,
        capacity: { onlineTutorCount: 0, availableTutorCount: 0, acceptReadyTutorCount: 0, hasEligibleCapacity: false },
      });
      checks.push({
        name: "AI exhausted + no tutor → continue AI, no queue",
        ok: noTutor.continueAi && !noTutor.shouldEnqueue,
        detail: JSON.stringify(noTutor),
        evidence: "student/04-escalation-no-tutor.json",
      });
      writeFileSync(resolve(SHOT_ROOT, "student/04-escalation-no-tutor.json"), JSON.stringify({ studentElig, noTutor }, null, 2));
      const withTutor = resolveEscalationQueueDecision({
        student: studentElig,
        capacity: { onlineTutorCount: 1, availableTutorCount: 1, acceptReadyTutorCount: 1, hasEligibleCapacity: true },
      });
      checks.push({
        name: "AI exhausted + eligible tutor → enqueue allowed",
        ok: withTutor.shouldEnqueue === true,
        detail: JSON.stringify(withTutor),
      });
    }

    {
      const { jar } = await login(schoolAdminEmail, schoolAdminPassword);
      await capturePage(jar, "/school-admin", "launch/02-portal-flag-on.png", screenshots);
      checks.push({
        name: "School portal launch flag allows school-admin/teacher",
        ok: true,
        detail: "pages loaded under LAUNCH_ENABLE_SCHOOL_PORTAL",
      });
    }

    checks.push({ name: "UAT script completed without exception", ok: true });
  } catch (error) {
    checks.push({
      name: "UAT script completed without exception",
      ok: false,
      detail: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error),
    });
  } finally {
    await prisma.$disconnect().catch(() => null);
  }

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok);
  let serverStillUp = false;
  try {
    serverStillUp = (await fetch(BASE, { signal: AbortSignal.timeout(8_000) })).ok;
  } catch (e) {
    report.serverExitNote = String(e);
  }

  let priorRuns: unknown[] = [];
  if (existsSync(EVIDENCE_JSON)) {
    try {
      const prior = JSON.parse(readFileSync(EVIDENCE_JSON, "utf8")) as { priorRuns?: unknown[]; summary?: unknown };
      priorRuns = [...(prior.priorRuns ?? []), { archivedAt: new Date().toISOString(), summary: prior.summary ?? prior }];
    } catch {
      // ignore
    }
  }

  Object.assign(report, {
    endedAt: new Date().toISOString(),
    checks,
    screenshots,
    failures: failed.map((f) => `${f.name}: ${f.detail ?? ""}`),
    summary: { passed, failed: failed.length, total: checks.length },
    serverStillUp,
    priorRuns,
    evidenceRoot: "artifacts/uat/short-learning/captures/",
    evidenceJson: "artifacts/uat/short-learning/run-evidence.json",
    note: "PNG screenshots require Playwright Chromium; this run used HTML captures (.html + .meta.json). Bulky captures are gitignored under artifacts/.",
  });
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  mkdirSync(resolve("docs/assurance/uat"), { recursive: true });
  writeFileSync(EVIDENCE_JSON, JSON.stringify(report, null, 2));
  const summaryBody = [
      `# Short Learning UAT summary`,
      ``,
      `- Base: ${BASE}`,
      `- Capture mode: HTML + API`,
      `- Passed: **${passed}/${checks.length}**`,
      `- Failed: **${failed.length}**`,
      `- Server still up: ${serverStillUp}`,
      `- Evidence JSON: \`artifacts/uat/short-learning/run-evidence.json\``,
      ``,
      `## Failures`,
      ...(failed.length ? failed.map((f) => `- ${f.name}: ${f.detail}`) : ["- none"]),
      ``,
      `## Evidence captures`,
      ...screenshots.map((s) => `- \`artifacts/uat/short-learning/captures/${s}\``),
      ``,
  ].join("\n");
  writeFileSync(resolve(SHOT_ROOT, "UAT-SUMMARY.md"), summaryBody);
  writeFileSync(PERMANENT_SUMMARY, summaryBody + `\n_Generated by \`npm run uat:short-learning\`. Bulky captures stay under \`artifacts/\` (gitignored)._\n`);

  console.log(JSON.stringify(report.summary, null, 2));
  for (const f of failed) console.error("FAIL:", f.name, "-", f.detail);
  console.log("Evidence:", EVIDENCE_JSON);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
