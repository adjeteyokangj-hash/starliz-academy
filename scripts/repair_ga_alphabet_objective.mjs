#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const TARGET_LESSON_ID = "cmqc9bbjs001iju04qhydth4z";
const TARGET_LESSON_TITLE = "Ga Alphabet: A, B, D, E, Ɛ";
const TARGET_OBJECTIVE = "Recognise and practise the first Ga alphabet letters: A, B, D, E, and Ɛ.";

const prisma = new PrismaClient();

async function main() {
  const current = await prisma.gaLesson.findUnique({
    where: { id: TARGET_LESSON_ID },
    select: {
      id: true,
      title: true,
      objective: true,
      updatedAt: true,
    },
  });

  if (!current) {
    throw new Error(`Lesson ${TARGET_LESSON_ID} was not found.`);
  }

  if (current.title !== TARGET_LESSON_TITLE) {
    throw new Error(`Safety check failed. Expected title '${TARGET_LESSON_TITLE}', found '${current.title}'.`);
  }

  if (current.objective === TARGET_OBJECTIVE) {
    console.log("No update needed. Objective already repaired.");
    console.log(JSON.stringify(current, null, 2));
    return;
  }

  const updated = await prisma.gaLesson.update({
    where: { id: TARGET_LESSON_ID },
    data: { objective: TARGET_OBJECTIVE },
    select: {
      id: true,
      title: true,
      objective: true,
      updatedAt: true,
    },
  });

  console.log("Objective updated for exactly one lesson:");
  console.log(JSON.stringify({ before: current, after: updated }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
