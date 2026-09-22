import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  createSessionToken,
  getAccessTokenMaxAgeSeconds,
  getAuthCookieName,
  getChildSelectionCookieName,
  getParentUnlockCookieName,
  getRefreshCookieName,
  hashPassword,
} from "@/lib/auth";
import { canAddSchoolStudent } from "@/lib/schools/licensing";
import { buildDeviceFingerprint, getRefreshTokenMaxAgeSeconds, issueRefreshToken } from "@/lib/auth_sessions";
import { getRequestIp } from "@/lib/api_guard";
import {
  calculateAgeFromDateOfBirth,
  getStageForYearGroup,
  mapLearningFocusToLegacyMainFocus,
} from "@/lib/registration/child-profile-options";
import {
  isPhoneLinkedToAnotherParent,
  normalizeUkPhone,
  serializeUkAddress,
  toStoredAddress,
  validateParentEmailQuality,
  validateParentFullName,
} from "@/lib/uk_contact";
import {
  createStudentUserInTx,
  resolveChildLoginCredentials,
  type CreateChildAccountMode,
} from "@/lib/child-account-create";

const childLoginSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("generated"),
  }),
  z.object({
    mode: z.literal("manual"),
    username: z.string().min(1),
    password: z.string().min(1),
  }),
]);

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
    age: z.number().int().min(3).max(20).optional(),
    dateOfBirth: z.string().trim().optional(),
    yearGroup: z.string().trim().min(1).max(32),
    stage: z.string().trim().optional(),
    selectedSubjects: z.array(z.string().trim().min(1).max(80)).optional(),
    learningFocus: z.string().trim().optional(),
    mainFocus: z.enum(["Spelling", "Maths", "Reading", "All subjects"]).optional(),
    avatar: z.string().trim().min(1).max(8).optional(),
    favouriteSubject: z.enum(["Spelling", "Maths", "Reading", "All subjects"]).optional(),
    learningConfidence: z.enum(["Needs support", "Growing", "Confident", "Advanced / ready for challenge"]).optional(),
  }).optional(),
  /** Slice 4: first-child login credentials. Defaults to generated when child is present. */
  childLogin: childLoginSchema.optional(),
  schoolEnrollment: z.object({
    schoolId: z.string().min(1),
    classroomId: z.string().min(1).optional(),
    externalRef: z.string().trim().min(1).max(120).optional(),
  }).optional(),
});

export async function POST(request: Request) {
  try {
    const ip = getRequestIp(request);
    const userAgent = request.headers.get("user-agent") ?? undefined;
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

    let childCredentials: {
      username: string;
      password: string;
      mode: CreateChildAccountMode;
      passwordHash: string;
      email: string;
    } | null = null;

    if (body.child) {
      const loginMode = body.childLogin?.mode ?? "generated";
      const resolved = await resolveChildLoginCredentials({
        mode: loginMode,
        childName: body.child.name,
        username: body.childLogin && body.childLogin.mode === "manual" ? body.childLogin.username : undefined,
        password: body.childLogin && body.childLogin.mode === "manual" ? body.childLogin.password : undefined,
      });
      if (!resolved.ok) {
        return NextResponse.json(
          {
            error: resolved.error,
            code: resolved.code,
            fieldErrors: resolved.fieldErrors,
          },
          { status: resolved.status },
        );
      }
      childCredentials = {
        username: resolved.username,
        password: resolved.password,
        mode: resolved.mode,
        passwordHash: resolved.passwordHash,
        email: resolved.email,
      };
    }

    const passwordHash = await hashPassword(body.password);
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: validatedName,
          role: "parent",
          parentProfile: {
            create: {
              phone: normalizedPhone.e164,
              address: toStoredAddress(normalizedAddress),
              country: normalizedAddress.country,
              status: "active",
              emailConsent: body.marketingOptIn ?? false,
              smsConsent: body.marketingOptIn ?? false,
            },
          },
        },
      });

      let childId: string | null = null;
      let childUserId: string | null = null;
      if (body.child && childCredentials) {
        childId = randomUUID();
        const parsedDob = body.child.dateOfBirth ? new Date(body.child.dateOfBirth) : null;
        const validDob = parsedDob && !Number.isNaN(parsedDob.getTime()) ? parsedDob : null;
        const derivedAge = body.child.age ?? (body.child.dateOfBirth ? calculateAgeFromDateOfBirth(body.child.dateOfBirth) ?? undefined : undefined);
        const keyStage = body.child.stage ?? getStageForYearGroup(body.child.yearGroup);
        const learningFocus = body.child.learningFocus ?? "All recommended subjects";

        const student = await createStudentUserInTx(tx, {
          username: childCredentials.username,
          email: childCredentials.email,
          passwordHash: childCredentials.passwordHash,
          name: body.child.name,
        });
        childUserId = student.userId;

        await tx.childProfile.create({
          data: {
            id: childId,
            parentId: user.id,
            userId: student.userId,
            name: body.child.name,
            age: derivedAge,
            yearGroup: body.child.yearGroup,
            avatar: body.child.avatar ?? "🦊",
            snapshotJson: JSON.stringify({
              onboarding: {
                dateOfBirth: body.child.dateOfBirth ?? null,
                keyStage,
                selectedSubjects: body.child.selectedSubjects ?? [],
                learningFocus,
                mainFocus: body.child.mainFocus ?? mapLearningFocusToLegacyMainFocus(learningFocus),
                favouriteSubject: body.child.favouriteSubject ?? null,
                learningConfidence: body.child.learningConfidence ?? null,
              },
            }),
          },
        });

        await tx.studentProfile.upsert({
          where: { childId },
          create: {
            childId,
            dateOfBirth: validDob ?? undefined,
            keyStageLevel: keyStage,
            learningLevel: body.child.learningConfidence,
            subjectFocus: body.child.selectedSubjects?.join(", ") ?? undefined,
          },
          update: {
            dateOfBirth: validDob ?? undefined,
            keyStageLevel: keyStage,
            learningLevel: body.child.learningConfidence,
            subjectFocus: body.child.selectedSubjects?.join(", ") ?? undefined,
          },
        });

        await tx.user.update({
          where: { id: user.id },
          data: { activeChildId: childId },
        });

        if (body.schoolEnrollment) {
          await tx.schoolStudent.create({
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

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "signup_completed",
          entityType: "parent",
          entityId: user.id,
          metadataJson: JSON.stringify({
            phoneProvided: Boolean(body.phone),
            postcode: normalizedAddress.postcode,
            marketingOptIn: body.marketingOptIn ?? false,
            childProvided: Boolean(body.child),
            childId,
            childUserId,
            childUsername: childCredentials?.username ?? null,
            childLoginMode: childCredentials?.mode ?? null,
            schoolEnrollment: body.schoolEnrollment?.schoolId ?? null,
          }),
        },
      });

      return user;
    });

    // Parent remains the authenticated session; child User is separate until explicit login.
    const fingerprint = buildDeviceFingerprint({ ip, userAgent });
    const token = await createSessionToken(
      { userId: created.id, email: created.email, role: created.role },
      getAccessTokenMaxAgeSeconds(),
    );
    const refresh = await issueRefreshToken({
      userId: created.id,
      fingerprint,
      ipAddress: ip,
      userAgent,
    });
    const responseBody: {
      ok: true;
      user: { id: string; email: string; name: string | null; role: string };
      childCredentials?: { username: string; password: string; mode: CreateChildAccountMode };
      notice?: string;
    } = {
      ok: true,
      user: { id: created.id, email: created.email, name: created.name, role: created.role },
    };

    if (childCredentials) {
      responseBody.childCredentials = {
        username: childCredentials.username,
        password: childCredentials.password,
        mode: childCredentials.mode,
      };
      responseBody.notice =
        "Save your child's username and password now. The password cannot be shown again because it is not stored in plain text.";
    }

    const response = NextResponse.json(responseBody, { status: 201 });
    response.cookies.set(getAuthCookieName(), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getAccessTokenMaxAgeSeconds(),
    });
    response.cookies.set(getRefreshCookieName(), refresh.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getRefreshTokenMaxAgeSeconds(),
    });
    response.cookies.set(getParentUnlockCookieName(), "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    response.cookies.set(getChildSelectionCookieName(), "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.message) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid sign up request." }, { status: 400 });
  }
}
