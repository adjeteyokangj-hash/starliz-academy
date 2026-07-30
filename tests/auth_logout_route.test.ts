import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("logout route supports GET redirect and POST JSON clear", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/auth/logout/route.ts"), "utf8");
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function GET/);
  assert.match(route, /NextResponse\.redirect/);
  assert.match(route, /loggedOut/);
  assert.match(route, /PORTAL_MODE_COOKIE/);
});

test("teacher and school-admin navs no longer link GET logout", () => {
  const teacher = readFileSync(join(process.cwd(), "src/components/teacher/TeacherNav.tsx"), "utf8");
  const schoolAdmin = readFileSync(
    join(process.cwd(), "src/components/school-admin/SchoolAdminNav.tsx"),
    "utf8",
  );
  assert.equal(teacher.includes('href="/api/auth/logout"'), false);
  assert.equal(schoolAdmin.includes('href="/api/auth/logout"'), false);
  assert.match(teacher, /method:\s*["']POST["']/);
  assert.match(schoolAdmin, /method:\s*["']POST["']/);
});