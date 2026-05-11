import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

const AUTH_COOKIE = "starliz_session";
const REFRESH_COOKIE = "starliz_refresh";
const PARENT_UNLOCK_COOKIE = "starliz_parent_unlock";
const ONE_WEEK = 60 * 60 * 24 * 7;
const FIFTEEN_MINUTES = 60 * 15;
const PARENT_UNLOCK_SECONDS = 60 * 10;

function getJwtSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw) {
    throw new Error("AUTH_SECRET is required. Set it in your environment before starting the app.");
  }
  return new TextEncoder().encode(raw);
}

type SessionPayload = {
  userId: string;
  email: string;
  role: string;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: SessionPayload, ttlSeconds = ONE_WEEK): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(getJwtSecret());
}

export async function readSessionFromCookie(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return {
      userId: String(payload.userId ?? ""),
      email: String(payload.email ?? ""),
      role: String(payload.role ?? "parent"),
    };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<{ id: string; email: string; role: string } | null> {
  const session = await readSessionFromCookie();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, role: true },
  });

  if (!user) return null;
  return user;
}

export function getAuthCookieName(): string {
  return AUTH_COOKIE;
}

export function getRefreshCookieName(): string {
  return REFRESH_COOKIE;
}

export function getParentUnlockCookieName(): string {
  return PARENT_UNLOCK_COOKIE;
}

export function getSessionMaxAgeSeconds(): number {
  return ONE_WEEK;
}

export function getAccessTokenMaxAgeSeconds(): number {
  return FIFTEEN_MINUTES;
}

export function getParentUnlockMaxAgeSeconds(): number {
  return PARENT_UNLOCK_SECONDS;
}

export async function createParentUnlockToken(userId: string): Promise<string> {
  return new SignJWT({ userId, scope: "parent-unlock" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PARENT_UNLOCK_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function readParentUnlockFromCookie(expectedUserId: string): Promise<boolean> {
  const token = (await cookies()).get(PARENT_UNLOCK_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return String(payload.userId ?? "") === expectedUserId && String(payload.scope ?? "") === "parent-unlock";
  } catch {
    return false;
  }
}
