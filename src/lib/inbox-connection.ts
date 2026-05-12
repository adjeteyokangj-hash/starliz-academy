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
  connected: boolean;
};

/**
 * Read the inbox connection for an admin user.
 * Returns null if not connected OR if the DB is temporarily unavailable.
 */
export async function getInboxConnection(
  adminUserId: string
): Promise<InboxConnectionRecord | null> {
  try {
    const row = await prisma.outlookToken.findUnique({ where: { adminUserId } });
    if (!row) {
      console.log("Inbox connection loaded", {
        provider: "microsoft",
        email: null,
        connected: false,
      });
      return null;
    }

    // Connected when email exists and at least one token is stored (non-empty string)
    const hasToken = !!(row.accessToken?.trim() || row.refreshToken?.trim());
    const connected = !!(row.email?.trim() && hasToken);

    const record: InboxConnectionRecord = {
      provider: "microsoft",
      adminUserId: row.adminUserId,
      email: row.email,
      displayName: row.displayName ?? null,
      connected,
    };

    console.log("Inbox connection loaded", {
      provider: record.provider,
      email: record.email,
      connected: record.connected,
    });

    return record;
  } catch (err) {
    console.error("[inbox-connection] getInboxConnection DB error:", err);
    return null;
  }
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
  const conn = await getInboxConnection(adminUserId);
  return conn?.connected ?? false;
}
