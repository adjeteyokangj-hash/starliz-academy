import { prisma } from "@/lib/db";

type SessionLike = {
  userId: string;
  email: string;
  role: string;
};

export type ParentScope = {
  parentId: string;
  parentEmail: string;
  source: "session-user" | "email-match";
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function resolveParentScope(session: SessionLike): Promise<ParentScope | null> {
  const sessionEmail = normalizeEmail(session.email);
  const sessionUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, role: true },
  });

  if (sessionUser?.role === "parent") {
    return {
      parentId: sessionUser.id,
      parentEmail: normalizeEmail(sessionUser.email),
      source: "session-user",
    };
  }

  const allowEmailFallback =
    process.env.NODE_ENV === "development" &&
    String(process.env.STARLIZ_ALLOW_PARENT_EMAIL_FALLBACK ?? "").trim().toLowerCase() === "true";

  if (allowEmailFallback && sessionEmail) {
    const emailMatchedUser = await prisma.user.findUnique({
      where: { email: sessionEmail },
      select: { id: true, email: true, role: true },
    });

    if (emailMatchedUser?.role === "parent") {
      return {
        parentId: emailMatchedUser.id,
        parentEmail: normalizeEmail(emailMatchedUser.email),
        source: "email-match",
      };
    }
  }

  return null;
}
