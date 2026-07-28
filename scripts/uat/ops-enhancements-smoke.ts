import "./load-env";
import { UAT_FIXTURES } from "./local-fixtures";

const BASE = UAT_FIXTURES.baseUrl.replace(/\/$/, "");

async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(15000),
  });
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  try {
    await fetch(`${BASE}/auth/login`, { signal: AbortSignal.timeout(5000) });
  } catch {
    console.log("DEV_SERVER_DOWN");
    process.exit(2);
  }

  const cookie = await login(UAT_FIXTURES.schoolOwnerEmail, UAT_FIXTURES.schoolOwnerPassword);
  const abs = await fetch(`${BASE}/api/school-admin/staff/absences`, {
    headers: { Cookie: cookie },
    signal: AbortSignal.timeout(30000),
  });
  const aj = await abs.json().catch(() => ({}));
  console.log("absences", abs.status, Array.isArray(aj.absences) ? `count=${aj.absences.length}` : JSON.stringify(aj).slice(0, 200));

  const teacherCookie = await login(UAT_FIXTURES.teacherEmail, UAT_FIXTURES.teacherPassword);
  const tAbs = await fetch(`${BASE}/api/school-admin/staff/absences`, {
    method: "POST",
    headers: { Cookie: teacherCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ schoolTeacherId: "x", startsOn: "2026-07-28", reason: "sick" }),
    signal: AbortSignal.timeout(15000),
  });
  console.log("teacher_denied", tAbs.status);

  // Overview can be slow; still attempt with longer timeout
  const ov = await fetch(`${BASE}/api/school-admin/overview`, {
    headers: { Cookie: cookie },
    signal: AbortSignal.timeout(120000),
  });
  const oj = await ov.json().catch(() => ({}));
  console.log("overview", ov.status, {
    absentToday: oj?.overview?.staff?.absentToday,
    live: oj?.overview?.staff?.liveTeachingHeartbeats,
    conflicts: oj?.overview?.daySchool?.conflictBlocking,
    roomWarnings: oj?.overview?.daySchool?.roomWarnings,
    limitations: oj?.overview?.limitations?.length,
    error: oj?.error,
  });
}

main().catch((err) => {
  console.error("SMOKE_FAIL", err?.message ?? err);
  process.exit(1);
});