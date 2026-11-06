import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PUBLISHED_CODING_LESSON_ID } from "../src/lib/coding/types";

function loadEnv(file: string, override: boolean) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  for (const line of text.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (override || !process.env[key]) process.env[key] = value;
  }
}

loadEnv(".env", false);
loadEnv(".env.local", true);

const base = process.env.CODING_TEST_BASE ?? "http://localhost:3000";
const lessonPath = `/api/student/coding/lessons/${PUBLISHED_CODING_LESSON_ID}`;

function quotedConstant(source: string, name: string): string {
  const line = source.split(/\n/).find((item) => item.includes(name));
  const quoted = line?.match(/"([^"]+)"/g);
  const last = quoted?.[quoted.length - 1];
  if (!last) throw new Error(`Missing fixture constant ${name}.`);
  return last.slice(1, -1);
}

async function login(identifier: string, password: string) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (!response.ok) return null;
  const data = await response.json() as { user?: { id?: string; role?: string } };
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const session = cookies.map((item) => item.split(";")[0] ?? "").find((item) => item.startsWith("starliz_session="));
  if (!session || !data.user?.id) return null;
  return { cookie: session, userId: data.user.id, role: data.user.role ?? "" };
}

async function mintCookie(user: { id: string; email: string; role: string }) {
  const { SignJWT } = await import("jose");
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not available for the fixture session.");
  const token = await new SignJWT({ userId: user.id, email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(secret));
  return `starliz_session=${token}`;
}

test("coding workspaces stay inside the signed-in learner and role", async () => {
  const { prisma } = await import("../src/lib/db");
  const { UAT_FIXTURES } = await import("../scripts/uat/local-fixtures");
  const probeId = "isolation-probe-b";
  let probeChildId = "";
  let beforeB: {
    id: string;
    stage: string;
    programsJson: string;
    undoJson: string;
    completedStagesJson: string;
    evidenceJson: string;
    hintCountsJson: string;
    skillStatus: string;
    lastFeedback: string | null;
    lastRunJson: string | null;
    teacherFeedback: string | null;
    privateProject: boolean;
    rewardFlagsJson: string;
    assignmentStatus: string;
    supportHandoffJson: string | null;
    attemptCount: number;
    checksPassed: number;
    yearGroup: string | null;
  } | null = null;
  let restore: { id: string; data: Record<string, string | number | boolean | null> } | null = null;
  const startedAt = new Date();

  try {
    const server = await fetch(base).catch(() => null);
    assert.ok(server, "The local app must be running for isolation checks.");

    const studentSource = fs.readFileSync("scripts/uat/_sync-adjei-password.ts", "utf8");
    const studentUserId = studentSource.match(/where: \{ id: "([^"]+)" \}/)?.[1];
    const studentPassword = quotedConstant(studentSource, "STUDENT_PASSWORD");
    assert.ok(studentUserId, "Fixture student id is not available.");
    const studentUser = await prisma.user.findUnique({
      where: { id: studentUserId },
      select: { id: true, username: true, email: true, role: true },
    });
    assert.ok(studentUser?.username, "Fixture student A is not available.");
    const studentLogin = await login(studentUser.username, studentPassword);
    assert.ok(studentLogin, "Fixture student A could not sign in.");
    const studentChild = await prisma.childProfile.findFirst({
      where: { userId: studentLogin.userId, archived: false },
      select: { id: true, parentId: true },
    });
    assert.ok(studentChild, "Fixture student A has no learner profile.");

    const beforeA = await prisma.codingWorkspace.findUnique({
      where: { childId_lessonId: { childId: studentChild.id, lessonId: PUBLISHED_CODING_LESSON_ID } },
    });
    const marker = beforeA?.programsJson.includes("accept-") ? "accept-" : "\"kind\":\"repeat\"";

    const otherChild = await prisma.childProfile.findFirst({
      where: {
        archived: false,
        id: { not: studentChild.id },
        account: { role: "student", username: { startsWith: "uat." } },
      },
      select: { id: true, account: { select: { id: true, email: true, role: true, username: true } } },
    }).then(record => { if (!record || !record.account) throw new Error("Required otherChild fixture is missing"); return { ...record, account: record.account }; });
    assert.ok(otherChild?.account?.username?.startsWith("uat."), "No second fixture student is available.");
    beforeB = await prisma.codingWorkspace.findUnique({
      where: { childId_lessonId: { childId: otherChild.id, lessonId: PUBLISHED_CODING_LESSON_ID } },
    });
    const studentBCookie = await mintCookie({
      id: otherChild.account.id,
      email: otherChild.account.email,
      role: otherChild.account.role,
    });

    const readB = await fetch(`${base}${lessonPath}`, { headers: { cookie: studentBCookie } });
    const readBText = await readB.text();
    assert.equal(readB.status, 200);
    assert.equal(readBText.includes(probeId), false);
    if (beforeA?.programsJson.includes("accept-loop")) assert.equal(readBText.includes("accept-loop"), false);

    const writeB = await fetch(`${base}${lessonPath}`, {
      method: "POST",
      headers: { cookie: studentBCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        stage: "discover",
        childId: studentChild.id,
        program: { blocks: [{ id: probeId, kind: "move", direction: "up" }] },
      }),
    });
    const writeBText = await writeB.text();
    assert.equal(writeB.status, 200);
    assert.equal(writeBText.includes(probeId), true);

    const afterA = await prisma.codingWorkspace.findUnique({
      where: { childId_lessonId: { childId: studentChild.id, lessonId: PUBLISHED_CODING_LESSON_ID } },
    });
    assert.equal(afterA?.programsJson ?? null, beforeA?.programsJson ?? null);
    assert.equal(afterA?.programsJson.includes(probeId) ?? false, false);

    const readA = await fetch(`${base}${lessonPath}`, { headers: { cookie: studentLogin.cookie } });
    const readAText = await readA.text();
    assert.equal(readA.status, 200);
    assert.equal(readAText.includes(probeId), false);
    if (marker === "accept-") assert.equal(readAText.includes("accept-"), true);

    probeChildId = otherChild.id;
    if (beforeB) {
      restore = {
        id: beforeB.id,
        data: {
          stage: beforeB.stage,
          programsJson: beforeB.programsJson,
          undoJson: beforeB.undoJson,
          completedStagesJson: beforeB.completedStagesJson,
          evidenceJson: beforeB.evidenceJson,
          hintCountsJson: beforeB.hintCountsJson,
          skillStatus: beforeB.skillStatus,
          lastFeedback: beforeB.lastFeedback,
          lastRunJson: beforeB.lastRunJson,
          teacherFeedback: beforeB.teacherFeedback,
          privateProject: beforeB.privateProject,
          rewardFlagsJson: beforeB.rewardFlagsJson,
          assignmentStatus: beforeB.assignmentStatus,
          supportHandoffJson: beforeB.supportHandoffJson,
          attemptCount: beforeB.attemptCount,
          checksPassed: beforeB.checksPassed,
          yearGroup: beforeB.yearGroup,
        },
      };
    }

    const parentSource = fs.readFileSync("tests/e2e/assigned-content-loop.spec.ts", "utf8");
    const parentEmail = quotedConstant(parentSource, "E2E_PARENT_EMAIL");
    const parentPassword = quotedConstant(parentSource, "E2E_PARENT_PASSWORD");
    const parentCandidates = [
      { email: parentEmail, password: parentPassword },
      { email: UAT_FIXTURES.parentEmail, password: UAT_FIXTURES.parentPassword },
    ];
    let parent: Awaited<ReturnType<typeof login>> = null;
    for (const candidate of parentCandidates) {
      parent = await login(candidate.email, candidate.password);
      if (parent?.role === "parent") break;
      parent = null;
    }
    assert.ok(parent, "No fixture parent could sign in.");
    const ownChild = await prisma.childProfile.findFirst({
      where: { parentId: parent.userId, archived: false },
      select: { id: true },
    });
    const otherParentChild = await prisma.childProfile.findFirst({
      where: { archived: false, parentId: { not: parent.userId } },
      select: { id: true },
    });
    assert.ok(ownChild && otherParentChild, "Parent isolation needs one owned child and one other child.");
    const ownSummary = await fetch(`${base}/api/parent/coding?studentId=${encodeURIComponent(ownChild.id)}`, {
      headers: { cookie: parent.cookie },
    });
    const ownSummaryText = await ownSummary.text();
    assert.equal(ownSummary.status, 200);
    assert.equal(ownSummaryText.includes("programsJson"), false);
    // Parents may inspect their own child's saved project through the protected preview.
    const ownSummaryData = JSON.parse(ownSummaryText) as { summary: { projectPreview?: { program?: { blocks?: unknown[] } } } };
    if (ownSummaryData.summary.projectPreview) {
      assert.ok(Array.isArray(ownSummaryData.summary.projectPreview.program?.blocks));
    }
    assert.equal(ownSummaryText.includes(probeId), false);
    const hiddenChild = await fetch(`${base}/api/parent/coding?studentId=${encodeURIComponent(otherParentChild.id)}`, {
      headers: { cookie: parent.cookie },
    });
    assert.equal(hiddenChild.status, 404);

    const teacherCandidates = [
      { email: UAT_FIXTURES.teacherEmail, password: UAT_FIXTURES.teacherPassword },
      { email: UAT_FIXTURES.schoolAdminEmail, password: UAT_FIXTURES.schoolAdminPassword },
    ];
    let teacher: Awaited<ReturnType<typeof login>> = null;
    let teacherGet: Response | null = null;
    for (const candidate of teacherCandidates) {
      const signedIn = await login(candidate.email, candidate.password);
      if (!signedIn) continue;
      const response = await fetch(`${base}/api/teacher/coding`, { headers: { cookie: signedIn.cookie } });
      if (response.status === 200) {
        teacher = signedIn;
        teacherGet = response;
        break;
      }
    }
    assert.ok(teacher && teacherGet, "No fixture teacher could open the coding desk.");
    const teacherBody = await teacherGet.json() as { students?: Array<{ id: string }> };
    const visibleIds = new Set((teacherBody.students ?? []).map((student) => student.id));
    const outsider = await prisma.childProfile.findFirst({
      where: { archived: false, id: { notIn: [...visibleIds] } },
      select: { id: true },
    });
    const deniedId = outsider?.id ?? "not-a-class-learner";
    const outsiderBefore = outsider
      ? await prisma.codingWorkspace.findUnique({
        where: { childId_lessonId: { childId: outsider.id, lessonId: PUBLISHED_CODING_LESSON_ID } },
      })
      : null;
    const deniedAssign = await fetch(`${base}/api/teacher/coding`, {
      method: "POST",
      headers: { cookie: teacher.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign", childId: deniedId }),
    });
    assert.equal(deniedAssign.status, 403);
    if (outsiderBefore) {
      const deniedFeedback = await fetch(`${base}/api/teacher/coding`, {
        method: "POST",
        headers: { cookie: teacher.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "feedback", workspaceId: outsiderBefore.id, feedback: "isolation probe" }),
      });
      assert.notEqual(deniedFeedback.status, 200);
      const outsiderAfter = await prisma.codingWorkspace.findUnique({ where: { id: outsiderBefore.id } });
      assert.equal(outsiderAfter?.programsJson, outsiderBefore.programsJson);
      assert.equal(outsiderAfter?.teacherFeedback, outsiderBefore.teacherFeedback);
      assert.equal(outsiderAfter?.assignmentStatus, outsiderBefore.assignmentStatus);
    }

    const studentTeacher = await fetch(`${base}/api/teacher/coding`, { headers: { cookie: studentLogin.cookie } });
    assert.equal(studentTeacher.status, 403);

    for (const path of [lessonPath, "/api/teacher/coding", `/api/parent/coding?studentId=${encodeURIComponent(studentChild.id)}`]) {
      const anonymous = await fetch(`${base}${path}`);
      assert.equal(anonymous.status, 401, path);
    }
  } finally {
    if (probeChildId && !beforeB) {
      await prisma.codingWorkspace.deleteMany({
        where: { childId: probeChildId, lessonId: PUBLISHED_CODING_LESSON_ID },
      });
    } else if (restore) {
      await prisma.codingProjectVersion.deleteMany({
        where: { workspaceId: restore.id, createdAt: { gt: startedAt } },
      });
      await prisma.codingWorkspace.update({ where: { id: restore.id }, data: restore.data });
    }
    await prisma.$disconnect();
  }
});
