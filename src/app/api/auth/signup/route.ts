import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSessionToken, getAuthCookieName, getSessionMaxAgeSeconds, hashPassword } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { canAddSchoolStudent } from "@/lib/schools/licensing";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().regex(/^\+?[0-9\s()\-]{8,20}$/).optional(),
  marketingOptIn: z.boolean().optional(),
  child: z.object({
    name: z.string().trim().min(1).max(64),
    age: z.number().int().min(5).max(10),
    yearGroup: z.string().trim().min(1).max(32),
    mainFocus: z.enum(["Spelling", "Maths", "Reading", "All subjects"]),
    avatar: z.string().trim().min(1).max(8).optional(),
    favouriteSubject: z.enum(["Spelling", "Maths", "Reading", "All subjects"]).optional(),
    learningConfidence: z.enum(["Needs support", "Growing", "Confident"]).optional(),
  }).optional(),
  schoolEnrollment: z.object({
    schoolId: z.string().min(1),
    classroomId: z.string().min(1).optional(),
    externalRef: z.string().trim().min(1).max(120).optional(),
  }).optional(),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    if (body.schoolEnrollment && !body.child) {
      return NextResponse.json({ error: "School enrolment requires a child profile." }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "Email already in use." }, { status: 409 });
    }

    if (body.schoolEnrollment) {
      const school = await prisma.school.findUnique({
        where: { id: body.schoolEnrollment.schoolId },
        select: { id: true },
      });
      if (!school) {
        return NextResponse.json({ error: "School not found." }, { status: 404 });
      }

      const seatCheck = await canAddSchoolStudent(body.schoolEnrollment.schoolId);
      if (!seatCheck.allowed) {
        return NextResponse.json(
          {
            error: "School licence does not currently allow new student enrolment.",
            access: seatCheck,
          },
          { status: 402 },
        );
      }
    }

    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash: await hashPassword(body.password),
        name: body.name,
      },
    });

    if (body.child) {
      const childId = randomUUID();
      await prisma.childProfile.create({
        data: {
          id: childId,
          parentId: user.id,
          name: body.child.name,
          age: body.child.age,
          yearGroup: body.child.yearGroup,
          avatar: body.child.avatar ?? "🦊",
          snapshotJson: JSON.stringify({
            onboarding: {
              mainFocus: body.child.mainFocus,
              favouriteSubject: body.child.favouriteSubject ?? null,
              learningConfidence: body.child.learningConfidence ?? null,
            },
          }),
        },
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { activeChildId: childId },
      });

      if (body.schoolEnrollment) {
        await prisma.schoolStudent.create({
          data: {
            schoolId: body.schoolEnrollment.schoolId,
            childId,
            classroomId: body.schoolEnrollment.classroomId,
            externalRef: body.schoolEnrollment.externalRef,
            status: "active",
          },
        });
      }
    }

    await writeAuditLog({
      actorUserId: user.id,
      action: "signup_completed",
      entityType: "parent",
      entityId: user.id,
      metadata: {
        phoneProvided: Boolean(body.phone),
        marketingOptIn: body.marketingOptIn ?? false,
        childProvided: Boolean(body.child),
        schoolEnrollment: body.schoolEnrollment?.schoolId ?? null,
      },
    });

    const token = await createSessionToken({ userId: user.id, email: user.email, role: user.role });
    const response = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } }, { status: 201 });
    response.cookies.set(getAuthCookieName(), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getSessionMaxAgeSeconds(),
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Invalid sign up request." }, { status: 400 });
  }
}
