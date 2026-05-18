import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSessionToken, getAuthCookieName, getSessionMaxAgeSeconds, hashPassword } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { canAddSchoolStudent } from "@/lib/schools/licensing";
import {
  isPhoneLinkedToAnotherParent,
  normalizeUkPhone,
  serializeUkAddress,
  toStoredAddress,
  validateParentEmailQuality,
  validateParentFullName,
} from "@/lib/uk_contact";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1),
  address: z.object({
    addressLine1: z.string().trim().min(1).max(160),
    addressLine2: z.string().trim().max(160).optional(),
    townCity: z.string().trim().min(1).max(120),
    county: z.string().trim().max(120).optional(),
    postcode: z.string().trim().min(1).max(12),
    country: z.string().trim().optional(),
  }),
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
    const validatedName = validateParentFullName(body.name);
    const normalizedEmail = validateParentEmailQuality(body.email);
    const normalizedPhone = normalizeUkPhone(body.phone);
    const normalizedAddress = serializeUkAddress(body.address);
    if (body.schoolEnrollment && !body.child) {
      return NextResponse.json({ error: "School enrolment requires a child profile." }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: "Email already in use." }, { status: 409 });
    }

    const existingPhone = await prisma.parentProfile.findFirst({
      where: { phone: normalizedPhone.e164 },
      select: { userId: true },
    });
    if (isPhoneLinkedToAnotherParent(existingPhone?.userId)) {
      return NextResponse.json(
        {
          error: "This phone number is already linked to a StarLiz Academy parent account. Please log in, reset your password, or contact support if you need help.",
        },
        { status: 409 },
      );
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
        email: normalizedEmail,
        passwordHash: await hashPassword(body.password),
        name: validatedName,
        parentProfile: {
          create: {
            phone: normalizedPhone.e164,
            address: toStoredAddress(normalizedAddress),
            country: normalizedAddress.country,
            status: "active",
          },
        },
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
        postcode: normalizedAddress.postcode,
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
  } catch (error) {
    if (error instanceof Error && error.message) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid sign up request." }, { status: 400 });
  }
}
