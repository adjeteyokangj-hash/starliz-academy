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

  const [sessionUser, emailMatchedUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, role: true },
    }),
    sessionEmail
      ? prisma.user.findUnique({
          where: { email: sessionEmail },
          select: { id: true, email: true, role: true },
        })
      : Promise.resolve(null),
  ]);

  if (sessionUser?.role === "parent") {
    return {
      parentId: sessionUser.id,
      parentEmail: normalizeEmail(sessionUser.email),
      source: "session-user",
    };
  }

  if (emailMatchedUser?.role === "parent") {
    return {
      parentId: emailMatchedUser.id,
      parentEmail: normalizeEmail(emailMatchedUser.email),
      source: "email-match",
    };
  }

  return null;
}
