import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // ignore
  }
}

loadEnvLocal();

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const lessonIds = [
    "cmrx2huep002zsk1w6as85e0i",
    "cmrx2hum30030sk1w3inty6dc",
    "cmrx2hut90031sk1wl65seaid",
    "cmrxik1qd00xkskms8ub34hpf",
    "cmrxikevj00ygskms7enkd8ux",
  ];
  const lessons = await prisma.lesson.findMany({
    where: { id: { in: lessonIds } },
    select: { id: true, title: true, reviewStatus: true, machineHealthJson: true, contentRefs: true },
  });
  for (const lesson of lessons) {
    let health: { overall?: string; reason?: string; checks?: Array<{ id: string; passed: boolean; detail?: string }> } | null = null;
    try {
      health = JSON.parse(lesson.machineHealthJson || "null");
    } catch {
      health = null;
    }
    const failed = (health?.checks || []).filter((check) => !check.passed).map((check) => ({
      id: check.id,
      detail: check.detail,
    }));
    console.log(JSON.stringify({
      id: lesson.id,
      title: lesson.title,
      reviewStatus: lesson.reviewStatus,
      overall: health?.overall,
      reason: health?.reason,
      failed,
    }));
  }

  const period = await prisma.schoolDayLesson.findUnique({
    where: { id: "cmrxh7dkk00jhskmstinb86ox" },
    select: { classroomId: true, schoolId: true },
  });
  const enrolCount = period?.classroomId
    ? await prisma.schoolStudent.count({ where: { classroomId: period.classroomId, status: "active" } })
    : 0;
  console.log(JSON.stringify({ periodClassroom: period, enrolCount }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
