import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getTrialFromCookie } from "@/lib/trial-api";
import { normalizeTrialEmail, TRIAL_COOKIE_NAME } from "@/lib/trial-server";

const upgradeSchema = z.object({
  email: z.string().email().optional(),
});

export async function POST(request: Request) {
  try {
    const body = upgradeSchema.parse(await request.json());
    const sessionTrial = await getTrialFromCookie();

    let trialId = sessionTrial?.id;
    let email = sessionTrial?.email;

    if (!trialId && body.email) {
      const normalized = normalizeTrialEmail(body.email);
      const trial = await prisma.trialAccount.findUnique({ where: { email: normalized }, select: { id: true, email: true } });
      if (!trial) {
        return NextResponse.json({ error: "Trial account not found." }, { status: 404 });
      }
      trialId = trial.id;
      email = trial.email;
    }

    if (!trialId || !email) {
      return NextResponse.json({ error: "Trial session not found." }, { status: 401 });
    }

    await prisma.trialAccount.update({
      where: { id: trialId },
      data: {
        convertedToAccount: true,
        upgradedAt: new Date(),
      },
    });

    const response = NextResponse.json(
      {
        ok: true,
        signupUrl: `/signup?email=${encodeURIComponent(email)}`,
      },
      { status: 200 },
    );

    response.cookies.set(TRIAL_COOKIE_NAME, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Invalid upgrade request." }, { status: 400 });
  }
}
