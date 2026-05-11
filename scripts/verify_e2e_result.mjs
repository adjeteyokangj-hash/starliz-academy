import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const child = await p.childProfile.findUnique({ where: { id: "e2e-assigned-loop-child" }, select: { id: true, name: true } });
console.log("child:", child);

const assignments = await p.assignment.findMany({
  where: { studentId: "e2e-assigned-loop-child" },
  select: { id: true, status: true, contentId: true },
});
console.log("assignments:", JSON.stringify(assignments, null, 2));

const attempts = await p.attempt.findMany({
  where: { studentId: "e2e-assigned-loop-child" },
  select: { assignmentId: true, contentId: true, correct: true, answerGiven: true },
});
console.log("attempts:", JSON.stringify(attempts, null, 2));

await p.$disconnect();
