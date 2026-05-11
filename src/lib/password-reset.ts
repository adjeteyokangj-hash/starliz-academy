import { createHash, randomBytes } from "crypto";

const RESET_TOKEN_BYTES = 32;
export const PASSWORD_RESET_TTL_MINUTES = 60;

export function createPasswordResetToken() {
  const token = randomBytes(RESET_TOKEN_BYTES).toString("base64url");
  return {
    token,
    tokenHash: hashPasswordResetToken(token),
  };
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getPasswordResetExpiry(now = new Date()) {
  return new Date(now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
}

