#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  console.log("=== Checking Students ===");
  const students = await prisma.childProfile.findMany({
    take: 2,
    select: { id: true, name: true },
  });
  console.log(`Found ${students.length} students`);
  if (students.length > 0) console.log(JSON.stringify(students[0], null, 2));

  console.log("\n=== Checking AI Content Cache ===");
  const content = await prisma.aIContentCache.findMany({
    take: 2,
    select: { id: true, topic: true, contentType: true, level: true, status: true },
  });
  console.log(`Found ${content.length} content items`);
  if (content.length > 0) console.log(JSON.stringify(content[0], null, 2));

  console.log("\n=== Checking Existing Assignments ===");
  const assignments = await prisma.assignment.findMany({
    take: 2,
    select: { id: true, studentId: true, contentId: true, createdAt: true, status: true },
  });
  console.log(`Found ${assignments.length} assignments`);
  if (assignments.length > 0) console.log(JSON.stringify(assignments[0], null, 2));

  if (students.length > 0 && content.length > 0) {
    console.log("\n=== Testing Assignment Creation ===");
    const testAssignment = await prisma.assignment.upsert({
      where: {
        studentId_contentId: {
          studentId: students[0].id,
          contentId: content[0].id,
        },
      },
      update: {},
      create: {
        studentId: students[0].id,
        contentId: content[0].id,
      },
    });
    console.log("Assignment created/updated:", testAssignment.id);
    console.log("Full assignment:", JSON.stringify(testAssignment, null, 2));
  }
} finally {
  await prisma.$disconnect();
}
