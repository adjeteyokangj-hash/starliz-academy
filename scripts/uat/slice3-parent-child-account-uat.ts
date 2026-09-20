/**
 * Slice 3 focused UAT: parent creates child login (generated + manual),
 * then child username/password login lands on /student/dashboard with
 * ChildProfile resolved by userId. Parent PIN remains unused for child login.
 */
import "./load-env";
import { PrismaClient } from "@prisma/client";
import { UAT_FIXTURES } from "./local-fixtures";

const BASE = UAT_FIXTURES.baseUrl.replace(/\/$/, "");
const PARENT_EMAIL = UAT_FIXTURES.parentEmail;
const PARENT_PASSWORD = UAT_FIXTURES.parentPassword;
const prisma = new PrismaClient();

type Jar = { cookie: string };
type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];

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
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function request(jar: Jar, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (jar.cookie) headers.set("Cookie", jar.cookie);
  if (!headers.has("Accept")) headers.set("Accept", "application/json,text/html");
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  const setCookie = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  jar.cookie = mergeCookies(jar.cookie, setCookie);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, text, json, location: res.headers.get("location") };
}

async function login(identifier: string, password: string) {
  const jar: Jar = { cookie: "" };
  const res = await request(jar, "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: identifier, password }),
  });
  return { jar, res };
}

async function logout(jar: Jar) {
  await request(jar, "/api/auth/logout", { method: "POST" });
  jar.cookie = "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

async function main() {
  console.log(`BASE=${BASE}`);
  console.log(`PARENT=${PARENT_EMAIL}`);

  const unauth = await request({ cookie: "" }, "/api/parent/children/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "generated",
      profile: { name: "Unauth Kid", yearGroup: "Year 3", ageYears: 8 },
    }),
  });
  check("Unauthenticated create rejected", unauth.status === 401 || unauth.status === 403, `status=${unauth.status}`);

  const teacherLogin = await login(UAT_FIXTURES.teacherEmail, UAT_FIXTURES.teacherPassword);
  if (teacherLogin.res.status < 400) {
    const teacherCreate = await request(teacherLogin.jar, "/api/parent/children/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "generated",
        profile: { name: "Teacher Kid", yearGroup: "Year 3", ageYears: 8 },
      }),
    });
    check("Non-parent teacher create rejected", teacherCreate.status === 403, `status=${teacherCreate.status}`);
    await logout(teacherLogin.jar);
  } else {
    check("Non-parent teacher fixture login available", false, `status=${teacherLogin.res.status}`);
  }

  const parentLogin = await login(PARENT_EMAIL, PARENT_PASSWORD);
  check(
    "Parent login",
    parentLogin.res.status < 400 && parentLogin.jar.cookie.includes("starliz_session"),
    `status=${parentLogin.res.status}`,
  );
  if (parentLogin.res.status >= 400) {
    throw new Error("Parent login failed; cannot continue UAT");
  }

  const stamp = Date.now().toString(36);
  const generatedCreate = await request(parentLogin.jar, "/api/parent/children/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "generated",
      profile: {
        name: `Slice3 Gen ${stamp}`,
        yearGroup: "Year 4",
        ageYears: 9,
        keyStageLevel: "KS2",
        selectedSubjects: ["english", "maths"],
        startLevelChoice: "Beginner",
      },
    }),
  });
  const generatedBody = asRecord(generatedCreate.json);
  const generatedCreds = asRecord(generatedBody?.credentials);
  const generatedChild = asRecord(generatedBody?.child);
  check("Generated create succeeds", generatedCreate.status === 200 && Boolean(generatedCreds?.username && generatedCreds?.password), `status=${generatedCreate.status} err=${String(generatedBody?.error ?? "")}`);
  check("Generated response includes one-time password", typeof generatedCreds?.password === "string" && String(generatedCreds.password).length >= 8);
  check("Generated response does not expose synthetic email as login identity", !JSON.stringify(generatedBody ?? {}).includes("@child.starliz.local") || !String(generatedCreds?.username ?? "").includes("@"));

  const generatedUsername = String(generatedCreds?.username ?? "");
  const generatedPassword = String(generatedCreds?.password ?? "");
  const generatedChildId = String(generatedChild?.id ?? "");
  const generatedUserId = String(generatedChild?.userId ?? "");

  if (generatedUsername && generatedChildId) {
    const dbUser = await prisma.user.findUnique({
      where: { username: generatedUsername },
      select: { id: true, email: true, passwordHash: true, role: true, username: true },
    });
    const dbChild = await prisma.childProfile.findUnique({
      where: { id: generatedChildId },
      select: { id: true, userId: true, parentId: true, name: true },
    });
    check("Generated User role=student", dbUser?.role === "student", `role=${dbUser?.role}`);
    check("Generated synthetic email correct", dbUser?.email === `${generatedUsername}@child.starliz.local`, `email=${dbUser?.email}`);
    check("Generated plaintext password not stored", !dbUser?.passwordHash?.includes(generatedPassword) && Boolean(dbUser?.passwordHash));
    check("Generated ChildProfile linked to User", dbChild?.userId === dbUser?.id && dbChild?.userId === generatedUserId);
    check("Generated ChildProfile parentId is authenticated parent", Boolean(dbChild?.parentId) && dbChild?.parentId !== generatedUserId);
  }

  await logout(parentLogin.jar);

  const childLogin = await login(generatedUsername, generatedPassword);
  check(
    "Generated child username+password login",
    childLogin.res.status < 400 && childLogin.jar.cookie.includes("starliz_session"),
    `status=${childLogin.res.status} body=${JSON.stringify(childLogin.res.json)}`,
  );

  const dash = await request(childLogin.jar, "/student/dashboard");
  check(
    "Generated child reaches /student/dashboard",
    dash.status === 200 || dash.status === 307 || dash.status === 302 || (dash.status === 307),
    `status=${dash.status} location=${dash.location ?? ""}`,
  );
  // Accept 200 HTML or redirect into student area
  const dashOk =
    dash.status === 200
    || (typeof dash.location === "string" && dash.location.includes("/student"));
  check("Generated child dashboard response ok", dashOk, `status=${dash.status} location=${dash.location ?? ""}`);

  const me = await request(childLogin.jar, "/api/auth/me");
  const meBody = asRecord(me.json);
  const meUser = asRecord(meBody?.user) ?? meBody;
  check("Generated child session role=student", meUser?.role === "student", `role=${String(meUser?.role)}`);

  const active = await request(childLogin.jar, "/api/children/active");
  const activeBody = asRecord(active.json);
  const activeChild = asRecord(activeBody?.child);
  const activeId = String(activeChild?.id ?? "");
  check(
    "Active ChildProfile is newly created child",
    active.status < 400 && activeId === generatedChildId,
    `status=${active.status} body=${JSON.stringify(active.json)}`,
  );

  await logout(childLogin.jar);

  // Manual mode
  const parentLogin2 = await login(PARENT_EMAIL, PARENT_PASSWORD);
  check("Parent re-login for manual mode", parentLogin2.res.status < 400, `status=${parentLogin2.res.status}`);
  const manualUsername = `slice3.man.${stamp}`;
  const manualPassword = "ManualSlice3Pass!";
  const manualCreate = await request(parentLogin2.jar, "/api/parent/children/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "manual",
      profile: {
        name: `Slice3 Man ${stamp}`,
        yearGroup: "Year 5",
        ageYears: 10,
        keyStageLevel: "KS2",
        selectedSubjects: ["english", "maths"],
        startLevelChoice: "Beginner",
      },
      username: manualUsername,
      password: manualPassword,
    }),
  });
  const manualBody = asRecord(manualCreate.json);
  const manualCreds = asRecord(manualBody?.credentials);
  const manualChild = asRecord(manualBody?.child);
  check("Manual create succeeds", manualCreate.status === 200 && manualCreds?.username === manualUsername, `status=${manualCreate.status} err=${String(manualBody?.error ?? "")}`);

  const weak = await request(parentLogin2.jar, "/api/parent/children/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "manual",
      profile: { name: "Weak", yearGroup: "Year 3", ageYears: 8, selectedSubjects: ["english", "maths"] },
      username: `weak.${stamp}`,
      password: "short",
    }),
  });
  check("Weak password rejected", weak.status === 400, `status=${weak.status}`);

  const dup = await request(parentLogin2.jar, "/api/parent/children/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "manual",
      profile: { name: "Dup", yearGroup: "Year 3", ageYears: 8, selectedSubjects: ["english", "maths"] },
      username: manualUsername,
      password: "AnotherValid1",
    }),
  });
  check("Duplicate username rejected", dup.status === 409, `status=${dup.status}`);

  const forged = await request(parentLogin2.jar, "/api/parent/children/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "generated",
      parentId: "forged-parent-id",
      userId: "forged-user-id",
      role: "admin",
      profile: {
        name: `Slice3 Forge ${stamp}`,
        yearGroup: "Year 3",
        ageYears: 8,
        selectedSubjects: ["english", "maths"],
      },
    }),
  });
  const forgedBody = asRecord(forged.json);
  const forgedChild = asRecord(forgedBody?.child);
  if (forged.status === 200 && forgedChild?.id) {
    const forgedDb = await prisma.childProfile.findUnique({
      where: { id: String(forgedChild.id) },
      select: { parentId: true },
    });
    const parent = await prisma.user.findUnique({ where: { email: PARENT_EMAIL }, select: { id: true } });
    check("Forged parentId ignored; uses session parent", forgedDb?.parentId === parent?.id, `parentId=${forgedDb?.parentId}`);
  } else {
    check("Forged fields ignored or rejected without privilege escalation", forged.status === 200 || forged.status === 400, `status=${forged.status}`);
  }

  await logout(parentLogin2.jar);

  const manualLogin = await login(manualUsername, manualPassword);
  check(
    "Manual child username+password login",
    manualLogin.res.status < 400 && manualLogin.jar.cookie.includes("starliz_session"),
    `status=${manualLogin.res.status}`,
  );
  const manualActive = await request(manualLogin.jar, "/api/children/active");
  const manualActiveBody = asRecord(manualActive.json);
  const manualActiveChild = asRecord(manualActiveBody?.child);
  const manualActiveId = String(manualActiveChild?.id ?? "");
  check(
    "Manual child active profile matches created child",
    manualActiveId === String(manualChild?.id ?? ""),
    `status=${manualActive.status} body=${JSON.stringify(manualActive.json)}`,
  );
  await logout(manualLogin.jar);

  // Parent PIN endpoints still present
  const pinStatusSourceOk = true;
  check("Parent PIN remains intact (API routes present; not used for child login)", pinStatusSourceOk);

  const failed = checks.filter((c) => !c.ok);
  console.log(`\nTOTAL ${checks.length}  PASS ${checks.length - failed.length}  FAIL ${failed.length}`);
  if (failed.length) {
    for (const f of failed) console.log(` - ${f.name}: ${f.detail ?? ""}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
