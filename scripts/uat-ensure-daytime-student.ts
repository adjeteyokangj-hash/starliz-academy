/**
 * Idempotent local UAT student for daytime Year-6 classroom.
 * Reuses SchoolStudent by externalRef; does not migrate or delete data.
 *
 * Usage: npx tsx scripts/uat-ensure-daytime-student.ts
 */
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
      const existing = String(process.env[key] ?? "").trim();
      const shouldOverrideDb =
        key === "DATABASE_URL"
        && existing.length > 0
        && !/^postgres(ql)?:\/\//i.test(existing)
        && /^postgres(ql)?:\/\//i.test(val);
      if (!existing || shouldOverrideDb) {
        process.env[key] = val;
      }
    }
  } catch {
    // ignore
  }
}

loadEnvLocal();

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { enrolSchoolStudent } from "../src/lib/schools/enrol-student";
import { ageGroupForYearGroup, keyStageForYearGroup } from "../src/lib/curriculum";

const prisma = new PrismaClient();

const SCHOOL_ID = process.env.UAT_DAYTIME_SCHOOL_ID ?? "cmpgzr6nc000jskjob867guo7";
const CLASSROOM_ID = process.env.UAT_DAYTIME_CLASSROOM_ID ?? "cmrxa9rs4002fskz8wyby3cfp";
const EXTERNAL_REF = "uat:daytime:year6";
const GUARDIAN_EMAIL = "uat.daytime.y6.parent@starliz.dev";
const GUARDIAN_PASSWORD = process.env.UAT_STUDENT_PARENT_PASSWORD ?? "UatDaytimeParent#2026";

function typicalAgeForYearGroup(yearGroup: string | null | undefined): number {
  const range = ageGroupForYearGroup(yearGroup);
  const parts = String(range).split(/[\u2012\u2013\u2014\u2015-]/).map((p) => Number(p.trim())).filter((n) => Number.isFinite(n));
  if (parts.length >= 2) return Math.round((parts[0] + parts[1]) / 2);
  if (parts.length === 1) return parts[0];
  const yearNum = Number(String(yearGroup ?? "").replace(/\D/g, ""));
  return Number.isFinite(yearNum) ? yearNum + 5 : 10;
}
async function main() {
  const classroom = await prisma.classroom.findFirst({
    where: { id: CLASSROOM_ID, schoolId: SCHOOL_ID },
    select: { id: true, name: true, yearGroup: true, schoolId: true },
  });
  if (!classroom) {
    throw new Error(`Classroom ${CLASSROOM_ID} not found for school ${SCHOOL_ID}`);
  }

  const admin = await prisma.user.findFirst({
    where: { role: "admin" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) {
    throw new Error("No admin user found to act as enrolment actor.");
  }

  const existing = await prisma.schoolStudent.findUnique({
    where: { schoolId_externalRef: { schoolId: SCHOOL_ID, externalRef: EXTERNAL_REF } },
    select: {
      id: true,
      childId: true,
      classroomId: true,
      status: true,
      child: { select: { id: true, name: true, parentId: true } },
    },
  });

  let schoolStudentId: string;
  let childId: string;
  let action: "created" | "reused" | "restored";

  if (existing) {
    const yearGroup = classroom.yearGroup || "Year 6";
    const keyStage = keyStageForYearGroup(yearGroup);
    const age = typicalAgeForYearGroup(yearGroup);
    await prisma.schoolStudent.update({
      where: { id: existing.id },
      data: {
        classroomId: CLASSROOM_ID,
        status: "active",
        updatedAt: new Date(),
      },
    });
    await prisma.childProfile.update({
      where: { id: existing.childId },
      data: { yearGroup, age },
    });
    await prisma.studentProfile.upsert({
      where: { childId: existing.childId },
      create: { childId: existing.childId, keyStageLevel: keyStage },
      update: { keyStageLevel: keyStage },
    });
    schoolStudentId = existing.id;
    childId = existing.childId;
    action = existing.classroomId === CLASSROOM_ID && existing.status === "active" ? "reused" : "restored";

    if (existing.child.parentId) {
      const hash = await bcrypt.hash(GUARDIAN_PASSWORD, 12);
      await prisma.user.update({
        where: { id: existing.child.parentId },
        data: {
          passwordHash: hash,
          consentAcceptedAt: new Date(),
          consentVersion: "uat-daytime-local",
        },
      });
    }
  } else {
    const enrolled = await enrolSchoolStudent({
      schoolId: SCHOOL_ID,
      firstName: "UAT",
      lastName: "Daytime",
      yearGroup: classroom.yearGroup || "Year 6",
      classroomId: CLASSROOM_ID,
      guardianName: "UAT Daytime Parent",
      guardianEmail: GUARDIAN_EMAIL,
      externalRef: EXTERNAL_REF,
      actorUserId: admin.id,
      baselineNotes: "Development-only daytime UAT student",
    });
    if (!enrolled.ok) {
      throw new Error(enrolled.error);
    }
    schoolStudentId = enrolled.schoolStudentId;
    childId = enrolled.childId;
    action = "created";

    const hash = await bcrypt.hash(GUARDIAN_PASSWORD, 12);
    await prisma.user.update({
      where: { id: enrolled.parentUserId },
      data: {
        passwordHash: hash,
        consentAcceptedAt: new Date(),
        consentVersion: "uat-daytime-local",
      },
    });
  }

  const result = {
    ok: true,
    action,
    schoolId: SCHOOL_ID,
    classroomId: CLASSROOM_ID,
    classroomName: classroom.name,
    yearGroup: classroom.yearGroup,
    schoolStudentId,
    childId,
    guardianEmail: GUARDIAN_EMAIL,
    externalRef: EXTERNAL_REF,
    note: "Use admin preview with childId, or parent login with UAT_STUDENT_PARENT_PASSWORD.",
  };
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
