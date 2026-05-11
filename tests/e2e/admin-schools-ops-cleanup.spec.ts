import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const PROJECT_ROOT = (() => {
  const cwd = process.cwd();
  if (existsSync(resolve(cwd, "package.json")) && existsSync(resolve(cwd, "src"))) {
    return cwd;
  }
  return resolve(cwd, "starliz-academy");
})();

function runSqlFile(filePath: string) {
  const sqlFile = resolve(PROJECT_ROOT, filePath);
  const dbFile = resolve(PROJECT_ROOT, "prisma", "dev.db");
  const script = [
    "import pathlib",
    "import sqlite3",
    `sql = pathlib.Path(${JSON.stringify(sqlFile)}).read_text(encoding='utf-8')`,
    `conn = sqlite3.connect(${JSON.stringify(dbFile)})`,
    "conn.executescript(sql)",
    "conn.commit()",
    "conn.close()",
  ].join("\n");

  execFileSync("python", ["-c", script], {
    cwd: PROJECT_ROOT,
    stdio: "pipe",
  });
}

function querySqlCount(query: string): number {
  const script = [
    "import sqlite3",
    "conn = sqlite3.connect('prisma/dev.db')",
    "cur = conn.cursor()",
    `row = cur.execute(${JSON.stringify(query)}).fetchone()`,
    "print(int(row[0]) if row and row[0] is not None else 0)",
    "conn.close()",
  ].join("\n");

  const output = execFileSync("python", ["-c", script], {
    cwd: PROJECT_ROOT,
    encoding: "utf-8",
  }).trim();

  const parsed = Number.parseInt(output, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

test.describe("Admin Schools Operations Data Hygiene", () => {
  test("validates seed → verify → cleanup → verify lifecycle", async () => {
    // Stage 1: Clean slate
    runSqlFile("./scripts/cleanup_ops_scenarios.sql");
    
    let schoolCount = querySqlCount("SELECT COUNT(*) FROM School WHERE slug LIKE 'ops-%';");
    expect(schoolCount).toBe(0);

    // Stage 2: Seed data
    runSqlFile("./scripts/seed_ops_scenarios.sql");

    // Stage 3: Verify seed was successful
    schoolCount = querySqlCount("SELECT COUNT(*) FROM School WHERE slug LIKE 'ops-%';");
    expect(schoolCount).toBe(5); // active, suspended, no-teacher, capacity, safeguarding

    const activeSchoolCount = querySqlCount("SELECT COUNT(*) FROM School WHERE slug LIKE 'ops-%' AND status = 'active';");
    expect(activeSchoolCount).toBe(4); // all except suspended

    const suspendedSchoolCount = querySqlCount("SELECT COUNT(*) FROM School WHERE slug LIKE 'ops-%' AND status = 'suspended';");
    expect(suspendedSchoolCount).toBe(1);

    let licenceCount = querySqlCount("SELECT COUNT(*) FROM SchoolLicence WHERE schoolId LIKE 'ops-%';");
    expect(licenceCount).toBe(5);

    let teacherCount = querySqlCount("SELECT COUNT(*) FROM SchoolTeacher WHERE schoolId LIKE 'ops-%';");
    expect(teacherCount).toBe(4); // active, invited, capacity, safeguarding
    
    let studentCount = querySqlCount("SELECT COUNT(*) FROM SchoolStudent WHERE schoolId = 'ops-school-capacity' AND status = 'active';");
    expect(studentCount).toBe(3); // capacity risk scenario has 3 students

    let incidentCount = querySqlCount("SELECT COUNT(*) FROM SafeguardingIncident WHERE schoolId = 'ops-school-safeguarding' AND status = 'open';");
    expect(incidentCount).toBe(1); // one open incident in safeguarding school

    let inviteCount = querySqlCount("SELECT COUNT(*) FROM SchoolInviteToken WHERE schoolId = 'ops-school-safeguarding' AND usedAt IS NULL AND expiresAt > CURRENT_TIMESTAMP;");
    expect(inviteCount).toBe(1); // one pending invite in safeguarding school

    // Stage 4: Run cleanup
    runSqlFile("./scripts/cleanup_ops_scenarios.sql");

    // Stage 5: Verify cleanup removed all ops data
    schoolCount = querySqlCount("SELECT COUNT(*) FROM School WHERE slug LIKE 'ops-%';");
    expect(schoolCount).toBe(0);

    licenceCount = querySqlCount("SELECT COUNT(*) FROM SchoolLicence WHERE schoolId LIKE 'ops-%';");
    expect(licenceCount).toBe(0);

    teacherCount = querySqlCount("SELECT COUNT(*) FROM SchoolTeacher WHERE schoolId LIKE 'ops-%';");
    expect(teacherCount).toBe(0);

    studentCount = querySqlCount("SELECT COUNT(*) FROM SchoolStudent WHERE schoolId LIKE 'ops-%';");
    expect(studentCount).toBe(0);

    incidentCount = querySqlCount("SELECT COUNT(*) FROM SafeguardingIncident WHERE schoolId LIKE 'ops-%';");
    expect(incidentCount).toBe(0);

    inviteCount = querySqlCount("SELECT COUNT(*) FROM SchoolInviteToken WHERE schoolId LIKE 'ops-%';");
    expect(inviteCount).toBe(0);

    const opsUserCount = querySqlCount("SELECT COUNT(*) FROM User WHERE email IN ('ops-owner@starliz.dev', 'active.teacher@starliz.dev', 'invite.only@starliz.dev', 'capacity.teacher@starliz.dev', 'safeguarding.teacher@starliz.dev', 'capacity-parent-1@starliz.dev', 'capacity-parent-2@starliz.dev', 'capacity-parent-3@starliz.dev');");
    expect(opsUserCount).toBe(0);

    const opsChildCount = querySqlCount("SELECT COUNT(*) FROM ChildProfile WHERE id LIKE 'ops-%';");
    expect(opsChildCount).toBe(0);
  });

  test("validates idempotent cleanup behavior", async () => {
    // Cleanup can be called multiple times without error
    runSqlFile("./scripts/cleanup_ops_scenarios.sql");
    runSqlFile("./scripts/cleanup_ops_scenarios.sql"); // Second cleanup should not error

    const schoolCount = querySqlCount("SELECT COUNT(*) FROM School WHERE slug LIKE 'ops-%';");
    expect(schoolCount).toBe(0);
  });

  test("validates seed idempotence after partial cleanup", async () => {
    // Seed, cleanup, seed again → should have same count as single seed
    runSqlFile("./scripts/cleanup_ops_scenarios.sql");
    runSqlFile("./scripts/seed_ops_scenarios.sql");

    const firstCount = querySqlCount("SELECT COUNT(*) FROM School WHERE slug LIKE 'ops-%';");
    expect(firstCount).toBe(5);

    runSqlFile("./scripts/cleanup_ops_scenarios.sql");
    runSqlFile("./scripts/seed_ops_scenarios.sql");

    const secondCount = querySqlCount("SELECT COUNT(*) FROM School WHERE slug LIKE 'ops-%';");
    expect(secondCount).toBe(5); // Idempotent: same result

    runSqlFile("./scripts/cleanup_ops_scenarios.sql");
  });
});
