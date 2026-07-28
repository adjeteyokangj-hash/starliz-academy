/**
 * School Dashboard & Operations v1 authenticated smoke.
 * No migrate reset / no commit / no deploy.
 */
import "./load-env";
import { UAT_FIXTURES } from "./local-fixtures";

const BASE = UAT_FIXTURES.baseUrl.replace(/\/$/, "");
type Jar = { cookie: string };
type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login(email: string, password: string): Promise<Jar> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  return { cookie: setCookie.map((c) => c.split(";")[0]).join("; ") };
}

async function api(jar: Jar, path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: jar.cookie, Accept: "text/html,application/json" },
    redirect: "manual",
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, json, text, headers: res.headers };
}

function hrefsUnderSchoolAdmin(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const href = (item as { href?: unknown }).href;
    return typeof href === "string" && href.startsWith("/school-admin/");
  });
}

async function smokeAs(label: string, email: string, password: string, expectOwnerAction: boolean) {
  const jar = await login(email, password);
  check(`${label} login cookie`, Boolean(jar.cookie), email);

  const page = await api(jar, "/school-admin");
  check(`${label} overview page loads`, page.status === 200, `status=${page.status}`);
  check(
    `${label} overview page renders ops shell`,
    page.text.includes("School operations overview") || page.text.includes("SchoolOpsDashboardClient") || page.text.includes("school-admin"),
    `len=${page.text.length}`,
  );

  const overview = await api(jar, "/api/school-admin/overview");
  check(`${label} overview API`, overview.ok, String(overview.status));
  const payload = overview.json as {
    overview?: {
      health?: Record<string, unknown>;
      alerts?: unknown[];
      activity?: unknown[];
      quickActions?: Array<{ label: string; href: string }>;
      limitations?: string[];
    };
  };
  const ov = payload.overview;
  check(`${label} health tiles present`, Boolean(ov?.health), JSON.stringify(ov?.health ?? null).slice(0, 120));
  check(`${label} alerts array`, Array.isArray(ov?.alerts), `count=${Array.isArray(ov?.alerts) ? ov?.alerts.length : "n/a"}`);
  check(`${label} activity array`, Array.isArray(ov?.activity), `count=${Array.isArray(ov?.activity) ? ov?.activity.length : "n/a"}`);
  check(`${label} quick actions in portal`, hrefsUnderSchoolAdmin(ov?.quickActions));
  const hasCreateAdmin = (ov?.quickActions ?? []).some((a) => a.label === "Create School Admin");
  check(`${label} Create School Admin owner-only`, hasCreateAdmin === expectOwnerAction, `present=${hasCreateAdmin}`);
  check(`${label} limitations listed`, Array.isArray(ov?.limitations) && (ov?.limitations?.length ?? 0) >= 3);
}

async function main() {
  try {
    await fetch(`${BASE}/auth/login`, { signal: AbortSignal.timeout(5000) });
  } catch {
    check("Dev server reachable", false, BASE);
    console.log(JSON.stringify({ checks }, null, 2));
    process.exit(1);
  }
  check("Dev server reachable", true, BASE);

  await smokeAs("Owner", UAT_FIXTURES.schoolOwnerEmail, UAT_FIXTURES.schoolOwnerPassword, true);
  await smokeAs("SchoolAdmin", UAT_FIXTURES.schoolAdminEmail, UAT_FIXTURES.schoolAdminPassword, false);

  const teacherJar = await login(UAT_FIXTURES.teacherEmail, UAT_FIXTURES.teacherPassword);
  const teacherOverview = await api(teacherJar, "/api/school-admin/overview");
  check("Teacher denied overview API", teacherOverview.status === 403, String(teacherOverview.status));

  const teacherPage = await api(teacherJar, "/school-admin");
  const loc = teacherPage.headers.get("location") ?? "";
  const deniedOrRedirected =
    teacherOverview.status === 403
    && (
      (teacherPage.status >= 300 && teacherPage.status < 400)
      || loc.includes("/teacher")
      || teacherPage.text.includes("/teacher")
      || !teacherPage.text.includes("School operations overview")
    );
  check(
    "Teacher denied or redirected as today",
    deniedOrRedirected,
    `status=${teacherPage.status} loc=${loc}`,
  );

  const failed = checks.filter((c) => !c.ok).length;
  console.log(JSON.stringify({ failed, checks }, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});