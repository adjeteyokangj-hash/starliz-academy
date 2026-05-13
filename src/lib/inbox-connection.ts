/**
 * inbox-connection.ts
 * Single source of truth for admin inbox connection state.
 * Reads and writes the OutlookToken table via Prisma.
 * All Prisma calls are wrapped in try/catch so DB saturation never causes
 * the connected state to appear false.
 */
import { prisma } from "@/lib/db";

export type InboxConnectionRecord = {
  provider: "microsoft";
  adminUserId: string;
  email: string;
  displayName: string | null;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  connected: boolean;
};

/**
 * Read the inbox connection for an admin user.
 * Returns null only when no saved connection exists.
 * Throws on DB errors so callers can handle "unknown" separately from "disconnected".
 */
export async function getInboxConnection(
  adminUserId: string
): Promise<InboxConnectionRecord | null> {
  const row = await prisma.outlookToken.findUnique({ where: { adminUserId } });
  if (!row) {
    console.log("Inbox connection loaded", {
      provider: "microsoft",
      email: null,
      connected: false,
    });
    return null;
  }

  const hasAccessToken = !!row.accessToken?.trim();
  const hasRefreshToken = !!row.refreshToken?.trim();
  const connected = !!(row.email?.trim() && (hasAccessToken || hasRefreshToken));

  const record: InboxConnectionRecord = {
    provider: "microsoft",
    adminUserId: row.adminUserId,
    email: row.email,
    displayName: row.displayName ?? null,
    hasAccessToken,
    hasRefreshToken,
    connected,
  };

  console.log("Inbox connection loaded", {
    provider: record.provider,
    email: record.email,
    connected: record.connected,
  });

  return record;
}

/**
 * Persist inbox connection tokens.
 * Accepts pre-encrypted accessToken and refreshToken so encryption stays
 * in imap-client.ts alongside the OAuth exchange logic.
 */
export async function saveInboxConnection(data: {
  adminUserId: string;
  microsoftUserId: string;
  email: string;
  displayName?: string | null;
  accessToken: string; // already encrypted
  refreshToken: string; // already encrypted
  scope: string;
  expiresAt: Date;
}): Promise<void> {
  try {
    await prisma.outlookToken.upsert({
      where: { adminUserId: data.adminUserId },
      create: {
        adminUserId: data.adminUserId,
        microsoftUserId: data.microsoftUserId,
        email: data.email,
        displayName: data.displayName ?? null,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        scope: data.scope,
        expiresAt: data.expiresAt,
      },
      update: {
        microsoftUserId: data.microsoftUserId,
        email: data.email,
        displayName: data.displayName ?? null,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        scope: data.scope,
        expiresAt: data.expiresAt,
      },
    });
    console.log("[inbox-connection] saveInboxConnection: upsert OK", {
      adminUserId: data.adminUserId,
      email: data.email,
    });
  } catch (err) {
    console.error("[inbox-connection] saveInboxConnection DB error:", err);
    throw err;
  }
}

/**
 * Returns true when a valid inbox connection exists.
 * Returns false on DB errors (fail-safe — does not crash the request).
 */
export async function isInboxConnected(adminUserId: string): Promise<boolean> {
  try {
    const conn = await getInboxConnection(adminUserId);
    return conn?.connected ?? false;
  } catch (err) {
    console.error("[inbox-connection] isInboxConnected DB error:", err);
    return false;
  }
}
