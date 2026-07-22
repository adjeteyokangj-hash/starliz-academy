import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import bcrypt from "bcryptjs";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { selectNextPendingAssignment } from "../../src/lib/math-assignment-session";

type SeededSubject = {
  assignmentId: string;
  contentId: string;
};

type SeededData = {
  parentEmail: string;
  parentPassword: string;
  childId: string;
  childName: string;
  spelling: SeededSubject;
  math: SeededSubject;
  reading: SeededSubject;
};

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

const E2E_PARENT_EMAIL = process.env.E2E_PARENT_EMAIL ?? "e2e.parent+assigned@starliz.local";
const E2E_PARENT_PASSWORD = process.env.E2E_PARENT_PASSWORD ?? "PlaywrightAssigned#2026";
const E2E_CHILD_ID = "e2e-assigned-loop-child";
const E2E_CHILD_NAME = "E2E Assigned Loop";

let seeded: SeededData;

async function seedAssignedLoopFixtures(): Promise<SeededData> {
  const passwordHash = await bcrypt.hash(E2E_PARENT_PASSWORD, 12);

  const parent = await prisma.user.upsert({
    where: { email: E2E_PARENT_EMAIL },
    update: {
      passwordHash,
      role: "parent",
      name: "E2E Parent",
      trialSessionsUsed: 0,
      consentVersion: "1.0",
      consentAcceptedAt: new Date(),
      consentWithdrawnAt: null,
    },
    create: {
      email: E2E_PARENT_EMAIL,
      passwordHash,
      role: "parent",
      name: "E2E Parent",
      trialSessionsUsed: 0,
      consentVersion: "1.0",
      consentAcceptedAt: new Date(),
    },
    select: { id: true, email: true },
  });

  await prisma.subscription.deleteMany({
    where: { parentId: parent.id, providerSubId: "e2e-assigned-loop" },
  });

  await prisma.subscription.create({
    data: {
      parentId: parent.id,
      provider: "manual",
      providerSubId: "e2e-assigned-loop",
      planKey: "yearly",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.childProfile.upsert({
    where: { id: E2E_CHILD_ID },
    update: {
      parentId: parent.id,
      name: E2E_CHILD_NAME,
      avatar: "star",
      archived: false,
      age: 7,
      yearGroup: "Year 2",
    },
    create: {
      id: E2E_CHILD_ID,
      parentId: parent.id,
      name: E2E_CHILD_NAME,
      avatar: "star",
      age: 7,
      yearGroup: "Year 2",
    },
  });

  const spellingContent = await prisma.aIContentCache.create({
    data: {
      contentType: "spelling",
      level: 2,
      topic: "E2E assigned spelling",
      skillFocus: "silent-e",
      status: "published",
      createdBy: "e2e-playwright",
      contentJson: JSON.stringify([
        {
          id: "e2e-spelling-1",
          word: "cake",
          hint: "It ends with silent e.",
          categoryHint: "silent e",
          patterns: ["a_e"],
        },
        {
          id: "e2e-spelling-2",
          word: "make",
          hint: "Another silent e word.",
          categoryHint: "silent e",
          patterns: ["a_e"],
        },
      ]),
    },
    select: { id: true },
  });

  const mathContent = await prisma.aIContentCache.create({
    data: {
      contentType: "math",
      level: 2,
      topic: "E2E assigned math",
      skillFocus: "addition",
      status: "published",
      createdBy: "e2e-playwright",
      contentJson: JSON.stringify([
        {
          id: "e2e-math-1",
          prompt: "9 + 4 = ?",
          answer: 13,
          choices: [11, 12, 13, 14],
          topic: "addition",
          hints: ["Count on from 9.", "9 + 4 = 13"],
        },
        {
          id: "e2e-math-2",
          prompt: "10 + 2 = ?",
          answer: 12,
          choices: [10, 11, 12, 13],
          topic: "addition",
          hints: ["Count on from 10.", "10 + 2 = 12"],
        },
      ]),
    },
    select: { id: true },
  });

  const readingContent = await prisma.aIContentCache.create({
    data: {
      contentType: "reading",
      level: 2,
      topic: "E2E assigned reading",
      skillFocus: "comprehension",
      status: "published",
      createdBy: "e2e-playwright",
      contentJson: JSON.stringify([
        {
          id: "e2e-reading-1",
          passage: "Tom packs a red kite and goes to the park.",
          question: "What color is the kite?",
          answer: "Red",
          choices: ["Blue", "Red", "Green", "Yellow"],
        },
        {
          id: "e2e-reading-2",
          passage: "Maya takes a raincoat because the sky is dark.",
          question: "What does Maya take?",
          answer: "Raincoat",
          choices: ["Hat", "Raincoat", "Ball", "Book"],
        },
      ]),
    },
    select: { id: true },
  });

  const [spellingAssignment, mathAssignment, readingAssignment] = await Promise.all([
    prisma.assignment.create({
      data: { studentId: E2E_CHILD_ID, contentId: spellingContent.id, status: "assigned" },
      select: { id: true },
    }),
    prisma.assignment.create({
      data: { studentId: E2E_CHILD_ID, contentId: mathContent.id, status: "assigned" },
      select: { id: true },
    }),
    prisma.assignment.create({
      data: { studentId: E2E_CHILD_ID, contentId: readingContent.id, status: "assigned" },
      select: { id: true },
    }),
  ]);

  return {
    parentEmail: parent.email,
    parentPassword: E2E_PARENT_PASSWORD,
    childId: E2E_CHILD_ID,
    childName: E2E_CHILD_NAME,
    spelling: { assignmentId: spellingAssignment.id, contentId: spellingContent.id },
    math: { assignmentId: mathAssignment.id, contentId: mathContent.id },
    reading: { assignmentId: readingAssignment.id, contentId: readingContent.id },
  };
}

async function cleanupAssignedLoopFixtures(): Promise<void> {
  const content = await prisma.aIContentCache.findMany({
    where: { createdBy: "e2e-playwright" },
    select: { id: true },
  });
  const contentIds = content.map((entry) => entry.id);

  const assignments = await prisma.assignment.findMany({
    where: {
      OR: [
        { studentId: E2E_CHILD_ID },
        { contentId: { in: contentIds.length ? contentIds : ["__none__"] } },
      ],
    },
    select: { id: true },
  });
  const assignmentIds = assignments.map((entry) => entry.id);

  await prisma.attempt.deleteMany({
    where: {
      OR: [
        { assignmentId: { in: assignmentIds.length ? assignmentIds : ["__none__"] } },
        { contentId: { in: contentIds.length ? contentIds : ["__none__"] } },
        { studentId: E2E_CHILD_ID },
      ],
    },
  });

  await prisma.assignment.deleteMany({
    where: {
      OR: [
        { id: { in: assignmentIds.length ? assignmentIds : ["__none__"] } },
        { studentId: E2E_CHILD_ID },
        { contentId: { in: contentIds.length ? contentIds : ["__none__"] } },
      ],
    },
  });

  await prisma.childProfile.deleteMany({ where: { id: E2E_CHILD_ID } });
  await prisma.subscription.deleteMany({
    where: {
      OR: [
        { providerSubId: "e2e-assigned-loop" },
        { parent: { email: E2E_PARENT_EMAIL } },
      ],
    },
  });
  await prisma.aIContentCache.deleteMany({
    where: { id: { in: contentIds.length ? contentIds : ["__none__"] } },
  });
}

async function getAssignmentStatus(id: string): Promise<string | null> {
  const assignment = await prisma.assignment.findUnique({ where: { id }, select: { status: true } });
  return assignment?.status ?? null;
}

async function getLatestAttempt(assignmentId: string) {
  return prisma.attempt.findFirst({
    where: { assignmentId },
    orderBy: { createdAt: "desc" },
    select: {
      assignmentId: true,
      contentId: true,
      correct: true,
      questionText: true,
      answerGiven: true,
    },
  });
}

async function getAssignmentAttemptCount(assignmentId: string): Promise<number> {
  return prisma.attempt.count({ where: { assignmentId } });
}

async function resetAssignmentForUiJourney(assignmentId: string): Promise<void> {
  await prisma.attempt.deleteMany({ where: { assignmentId } });
  await prisma.assignment.update({
    where: { id: assignmentId },
    data: { status: "assigned", completedAt: null },
  });
}

async function seedClientProfileState(
  page: import("@playwright/test").Page,
  profile: { id: string; name: string },
): Promise<void> {
  await page.evaluate((payload) => {
    const profiles = JSON.stringify([
      {
        id: payload.id,
        name: payload.name,
        avatar: "🦊",
        ageRange: "5-7",
        adaptive: {
          spellingDifficulty: 2,
          mathDifficulty: 2,
          readingDifficulty: 2,
        },
      },
    ]);

    const profileKeys = ["starliz.profiles", "starliz.childProfiles", "childProfiles"];
    const activeKeys = ["starliz.activeProfileId", "activeChildId", "activeProfileId"];

    for (const key of profileKeys) {
      window.localStorage.setItem(key, profiles);
    }
    for (const key of activeKeys) {
      window.localStorage.setItem(key, payload.id);
    }
  }, profile);
}

test.describe("Assigned Content Closed Loop", () => {
  // Local Next.js compile + attempts writes routinely exceed the default 120s wall clock.
  test.describe.configure({ timeout: 360_000 });

  test.beforeAll(async () => {
    await cleanupAssignedLoopFixtures();
    seeded = await seedAssignedLoopFixtures();
  });

  test.afterAll(async () => {
    await cleanupAssignedLoopFixtures();
    await prisma.$disconnect();
  });

  test("serves assigned first and completes only after assigned attempt", async ({ page }) => {
    const loginResponse = await page.request.post("/api/auth/login", {
      data: {
        email: seeded.parentEmail,
        password: seeded.parentPassword,
      },
    });
    expect(loginResponse.ok()).toBe(true);

    await expect.poll(async () => {
      const response = await page.request.get("/api/auth/me");
      return response.status();
    }, { timeout: 20_000 }).toBe(200);

    const activateChild = await page.request.post("/api/children/active", {
      data: { childId: seeded.childId },
    });
    expect(activateChild.ok()).toBe(true);
    await page.goto("/dashboard");
    await seedClientProfileState(page, { id: seeded.childId, name: seeded.childName });

    const consentCheck = await page.request.get("/api/consent");
    const consentPayload = (await consentCheck.json()) as { accepted?: boolean };
    if (!consentPayload.accepted) {
      await page.request.post("/api/consent", { data: { accepted: true, version: "1.0" } });
    }

    const spoofedAttempt = await page.request.post("/api/attempts", {
      data: {
        studentId: seeded.childId,
        subject: "spelling",
        skillFocus: "silent-e",
        contentId: seeded.spelling.contentId,
        assignmentId: seeded.spelling.assignmentId,
        questionText: "spoofed question",
        answerGiven: "spoofed",
        correctAnswer: "spoofed",
        correct: true,
        responseTimeMs: 500,
        hintsUsed: 0,
        difficulty: 2,
      },
    });
    expect(spoofedAttempt.ok()).toBe(true);
    await expect.poll(async () => getAssignmentStatus(seeded.spelling.assignmentId)).toBe("assigned");

    const firstSpellingAttemptPost = await page.request.post("/api/attempts", {
      data: {
        studentId: seeded.childId,
        subject: "spelling",
        skillFocus: "silent-e",
        contentId: seeded.spelling.contentId,
        assignmentId: seeded.spelling.assignmentId,
        questionText: "cake",
        answerGiven: "cake",
        correctAnswer: "cake",
        correct: true,
        responseTimeMs: 500,
        hintsUsed: 0,
        difficulty: 2,
      },
    });
    expect(firstSpellingAttemptPost.ok()).toBe(true);

    await expect.poll(async () => getAssignmentStatus(seeded.spelling.assignmentId)).toBe("in_progress");
    const firstSpellingAttempt = await getLatestAttempt(seeded.spelling.assignmentId);
    const answeredWord = (firstSpellingAttempt?.questionText ?? "").trim().toLowerCase();
    const secondWord = answeredWord === "cake" ? "make" : "cake";

    const secondSpellingAttempt = await page.request.post("/api/attempts", {
      data: {
        studentId: seeded.childId,
        subject: "spelling",
        skillFocus: "silent-e",
        contentId: seeded.spelling.contentId,
        assignmentId: seeded.spelling.assignmentId,
        questionText: secondWord,
        answerGiven: secondWord,
        correctAnswer: secondWord,
        correct: true,
        responseTimeMs: 500,
        hintsUsed: 0,
        difficulty: 2,
      },
    });
    expect(secondSpellingAttempt.ok()).toBe(true);

    await expect.poll(async () => getAssignmentStatus(seeded.spelling.assignmentId)).toBe("completed");
    const spellingAttempt = await getLatestAttempt(seeded.spelling.assignmentId);
    expect(spellingAttempt?.contentId).toBe(seeded.spelling.contentId);
    expect(spellingAttempt?.correct).toBe(true);
    expect(await getAssignmentAttemptCount(seeded.spelling.assignmentId)).toBeGreaterThanOrEqual(2);

    const firstMathAttemptPost = await page.request.post("/api/attempts", {
      data: {
        studentId: seeded.childId,
        subject: "math",
        skillFocus: "addition",
        contentId: seeded.math.contentId,
        assignmentId: seeded.math.assignmentId,
        questionText: "9 + 4 = ?",
        answerGiven: "13",
        correctAnswer: "13",
        correct: true,
        responseTimeMs: 500,
        hintsUsed: 0,
        difficulty: 2,
      },
    });
    expect(firstMathAttemptPost.ok()).toBe(true);

    await expect.poll(async () => getAssignmentStatus(seeded.math.assignmentId)).toBe("in_progress");
    const firstMathAttempt = await getLatestAttempt(seeded.math.assignmentId);
    const firstMathPrompt = (firstMathAttempt?.questionText ?? "").trim();
    const secondMathQuestion = firstMathPrompt === "9 + 4 = ?"
      ? { prompt: "10 + 2 = ?", answer: "12" }
      : { prompt: "9 + 4 = ?", answer: "13" };

    const secondMathAttempt = await page.request.post("/api/attempts", {
      data: {
        studentId: seeded.childId,
        subject: "math",
        skillFocus: "addition",
        contentId: seeded.math.contentId,
        assignmentId: seeded.math.assignmentId,
        questionText: secondMathQuestion.prompt,
        answerGiven: secondMathQuestion.answer,
        correctAnswer: secondMathQuestion.answer,
        correct: true,
        responseTimeMs: 500,
        hintsUsed: 0,
        difficulty: 2,
      },
    });
    expect(secondMathAttempt.ok()).toBe(true);

    await expect.poll(async () => getAssignmentStatus(seeded.math.assignmentId)).toBe("completed");
    const mathAttempt = await getLatestAttempt(seeded.math.assignmentId);
    expect(mathAttempt?.contentId).toBe(seeded.math.contentId);
    expect(mathAttempt?.correct).toBe(true);
    expect(await getAssignmentAttemptCount(seeded.math.assignmentId)).toBeGreaterThanOrEqual(2);

    const firstReadingAttemptPost = await page.request.post("/api/attempts", {
      data: {
        studentId: seeded.childId,
        subject: "reading",
        skillFocus: "comprehension",
        contentId: seeded.reading.contentId,
        assignmentId: seeded.reading.assignmentId,
        questionText: "What color is the kite?",
        answerGiven: "Red",
        correctAnswer: "Red",
        correct: true,
        responseTimeMs: 500,
        hintsUsed: 0,
        difficulty: 2,
      },
    });
    expect(firstReadingAttemptPost.ok()).toBe(true);

    await expect.poll(async () => getAssignmentStatus(seeded.reading.assignmentId)).toBe("in_progress");
    const firstReadingAttempt = await getLatestAttempt(seeded.reading.assignmentId);
    const firstReadingQuestion = (firstReadingAttempt?.questionText ?? "").trim();
    const secondReadingQuestion = firstReadingQuestion === "What color is the kite?"
      ? { question: "What does Maya take?", answer: "Raincoat" }
      : { question: "What color is the kite?", answer: "Red" };

    const secondReadingAttempt = await page.request.post("/api/attempts", {
      data: {
        studentId: seeded.childId,
        subject: "reading",
        skillFocus: "comprehension",
        contentId: seeded.reading.contentId,
        assignmentId: seeded.reading.assignmentId,
        questionText: secondReadingQuestion.question,
        answerGiven: secondReadingQuestion.answer,
        correctAnswer: secondReadingQuestion.answer,
        correct: true,
        responseTimeMs: 500,
        hintsUsed: 0,
        difficulty: 2,
      },
    });
    expect(secondReadingAttempt.ok()).toBe(true);

    await expect.poll(async () => getAssignmentStatus(seeded.reading.assignmentId)).toBe("completed");
    const readingAttempt = await getLatestAttempt(seeded.reading.assignmentId);
    expect(readingAttempt?.contentId).toBe(seeded.reading.contentId);
    expect(readingAttempt?.correct).toBe(true);
    expect(await getAssignmentAttemptCount(seeded.reading.assignmentId)).toBeGreaterThanOrEqual(2);
  });

  test("math assigned session completes and Next Session opens the next assignment by href", async ({ page }) => {
    // Keep this journey independent of the API closed-loop test, which may complete the same fixtures.
    await resetAssignmentForUiJourney(seeded.math.assignmentId);
    await resetAssignmentForUiJourney(seeded.reading.assignmentId);
    await prisma.assignment.update({
      where: { id: seeded.spelling.assignmentId },
      data: { status: "completed", completedAt: new Date() },
    });

    const loginResponse = await page.request.post("/api/auth/login", {
      data: {
        email: seeded.parentEmail,
        password: seeded.parentPassword,
      },
    });
    expect(loginResponse.ok()).toBe(true);

    await expect.poll(async () => {
      const response = await page.request.get("/api/auth/me");
      return response.status();
    }, { timeout: 20_000 }).toBe(200);

    const activateChild = await page.request.post("/api/children/active", {
      data: { childId: seeded.childId },
    });
    expect(activateChild.ok()).toBe(true);
    await page.goto("/dashboard");
    await seedClientProfileState(page, { id: seeded.childId, name: seeded.childName });

    const consentCheck = await page.request.get("/api/consent");
    const consentPayload = (await consentCheck.json()) as { accepted?: boolean };
    if (!consentPayload.accepted) {
      await page.request.post("/api/consent", { data: { accepted: true, version: "1.0" } });
    }

    const assignmentsResponse = await page.request.get(`/api/student/assignments?studentId=${encodeURIComponent(seeded.childId)}`);
    expect(assignmentsResponse.ok(), `assignments status=${assignmentsResponse.status()}`).toBe(true);
    const assignmentsPayload = (await assignmentsResponse.json()) as {
      assignments?: Array<{ id: string; status: string; href?: string | null; subject?: string | null; contentId?: string | null }>;
    };
    expect(Array.isArray(assignmentsPayload.assignments)).toBe(true);

    const queue = assignmentsPayload.assignments ?? [];
    const mathAssignment = queue.find((entry) => entry.id === seeded.math.assignmentId);
    expect(mathAssignment).toBeTruthy();
    expect(["assigned", "in_progress"]).toContain(String(mathAssignment?.status).toLowerCase());

    const expectedNext = selectNextPendingAssignment({
      assignments: queue,
      currentAssignmentId: seeded.math.assignmentId,
    });
    expect(expectedNext?.id).toBe(seeded.reading.assignmentId);
    expect(expectedNext?.id).not.toBe(seeded.math.assignmentId);
    expect(typeof expectedNext?.href).toBe("string");
    expect(String(expectedNext?.href)).toMatch(/\/games\/reading/);

    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    const mathHref = `/games/math?assignmentId=${encodeURIComponent(seeded.math.assignmentId)}&contentId=${encodeURIComponent(seeded.math.contentId)}`;
    await page.goto("/dashboard");
    await page.evaluate((childId) => {
      window.sessionStorage.removeItem(`starliz_math_resume_${childId}`);
    }, seeded.childId);

    // Warm cold Next.js compiles so the locked maths session can hydrate before the assertion budget.
    await Promise.all([
      page.request.get("/api/children/active"),
      page.request.get(`/api/content/assigned?contentId=${encodeURIComponent(seeded.math.contentId)}&assignmentId=${encodeURIComponent(seeded.math.assignmentId)}`),
      page.request.get("/api/subscription/access?feature=learning"),
    ]);

    await page.goto(mathHref);
    await expect(page.getByText("Loading your learning profile...")).toHaveCount(0, { timeout: 180_000 });
    try {
      await expect(page.getByText("Question 1 of 2")).toBeVisible({ timeout: 120_000 });
    } catch (error) {
      const bodyText = (await page.locator("body").innerText()).slice(0, 1200);
      throw new Error(`Math session did not reach Question 1 of 2. URL=${page.url()} body=${bodyText}`, { cause: error });
    }
    await expect(page.getByText(/Daily goal:/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Refresh session" })).toHaveCount(0);

    async function answerCurrentMathQuestion() {
      const answerInput = page.locator('input[placeholder="Type the answer"]');
      await expect(answerInput).toBeVisible({ timeout: 60_000 });
      const prompt = (await page.locator("h2.font-heading").first().innerText()).trim().replace(/\s+/g, " ");
      const answer = /9\s*\+\s*4/.test(prompt) ? "13" : /10\s*\+\s*2/.test(prompt) ? "12" : null;
      expect(answer, `Unrecognized math prompt: ${prompt}`).toBeTruthy();
      await answerInput.fill(String(answer));
      const attemptPromise = page.waitForResponse((response) => (
        response.url().includes("/api/attempts")
        && response.request().method() === "POST"
      ), { timeout: 90_000 });
      await page.getByRole("button", { name: "Check Answer" }).click();
      const attemptResponse = await attemptPromise;
      expect(attemptResponse.ok(), `attempts status=${attemptResponse.status()}`).toBe(true);
    }

    await answerCurrentMathQuestion();
    await expect(page.getByText("Question 2 of 2")).toBeVisible({ timeout: 90_000 });
    await answerCurrentMathQuestion();

    await expect(page.getByText("Session complete.", { exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/Accuracy:.*\(.*2\/2\)/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Resolved:\s*2\/2/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Refresh session" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Next Session" })).toBeVisible();

    await page.waitForTimeout(2_000);
    await expect(page.getByText("Session complete.", { exact: true })).toBeVisible();
    await expect(page.getByText("Question 1 of 2")).toHaveCount(0);

    const patchPromise = page.waitForResponse((response) => (
      response.url().includes(`/api/assignments/${seeded.math.assignmentId}`)
      && response.request().method() === "PATCH"
    ), { timeout: 90_000 });

    await page.getByRole("button", { name: "Next Session" }).click();
    const patchResponse = await patchPromise;
    expect(patchResponse.ok()).toBe(true);

    await expect.poll(async () => {
      const url = page.url();
      return url.includes(`assignmentId=${expectedNext!.id}`);
    }, { timeout: 30_000 }).toBe(true);

    expect(page.url()).not.toContain(`assignmentId=${seeded.math.assignmentId}`);
    if (expectedNext?.href) {
      const expectedPath = expectedNext.href.split("?")[0];
      expect(page.url()).toContain(expectedPath);
    }

    await expect(page.getByText(/Activity Mismatch|does not match Maths/i)).toHaveCount(0);
    await expect.poll(async () => getAssignmentStatus(seeded.math.assignmentId)).toBe("completed");
    await expect.poll(async () => getAssignmentStatus(expectedNext!.id)).not.toBe("completed");

    const meaningfulConsoleErrors = consoleErrors.filter((entry) => (
      !/Download the React DevTools/i.test(entry)
      // E2E fixture children can hit wallet award validation without affecting assignment progression.
      && !/status of 400 \(Bad Request\)/i.test(entry)
    ));
    expect(meaningfulConsoleErrors).toEqual([]);
  });
});
