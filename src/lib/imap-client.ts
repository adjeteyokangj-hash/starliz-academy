import { prisma } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/secrets";
import { randomBytes } from "crypto";
import { getInboxConnection, saveInboxConnection } from "@/lib/inbox-connection";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

const GRAPH_SCOPES = [
  "offline_access",
  "User.Read",
  "Mail.ReadWrite",
  "Mail.Send",
].join(" ");

type GraphTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

export type InboxConnection = {
  connected: boolean;
  adminUserId: string;
  email: string;
  microsoftUserId: string;
  displayName?: string | null;
};

function getRequiredEnv(name: "MICROSOFT_CLIENT_ID" | "MICROSOFT_CLIENT_SECRET" | "MICROSOFT_TENANT_ID") {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getTenantTokenUrl() {
  const tenantId = getRequiredEnv("MICROSOFT_TENANT_ID");
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
}

function getRedirectUri(origin: string) {
  return `${origin}/api/admin/inbox/oauth/callback`;
}

const PRODUCTION_OAUTH_ORIGIN = "https://www.starlizacademy.com";

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function pickOrigin(fallbackOrigin: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (process.env.NODE_ENV === "production") {
    if (configured) return normalizeOrigin(configured);
    return PRODUCTION_OAUTH_ORIGIN;
  }
  return normalizeOrigin(configured || fallbackOrigin);
}

export function getInboxRedirectUri(origin: string) {
  return getRedirectUri(origin);
}

async function readConnection(adminUserId: string) {
  return prisma.outlookToken.findUnique({ where: { adminUserId } });
}

async function refreshAccessToken(adminUserId: string, originForRedirectUri: string) {
  const existing = await readConnection(adminUserId);
  if (!existing) throw new Error("Inbox not connected.");

  const refreshToken = decryptSecret(existing.refreshToken);
  const body = new URLSearchParams({
    client_id: getRequiredEnv("MICROSOFT_CLIENT_ID"),
    client_secret: getRequiredEnv("MICROSOFT_CLIENT_SECRET"),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    redirect_uri: getRedirectUri(originForRedirectUri),
    scope: GRAPH_SCOPES,
  });

  const tokenRes = await fetch(getTenantTokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!tokenRes.ok) {
    const detail = await tokenRes.text();
    throw new Error(`Microsoft token refresh failed: ${detail}`);
  }

  const token = await tokenRes.json() as GraphTokenResponse;
  const nextRefresh = token.refresh_token ?? refreshToken;
  const updated = await prisma.outlookToken.update({
    where: { adminUserId },
    data: {
      accessToken: encryptSecret(token.access_token),
      refreshToken: encryptSecret(nextRefresh),
      scope: token.scope ?? existing.scope,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
    },
  });

  return {
    accessToken: decryptSecret(updated.accessToken),
    email: updated.email,
  };
}

async function getValidAccessToken(adminUserId: string, originForRedirectUri: string) {
  const connection = await readConnection(adminUserId);
  if (!connection) throw new Error("Inbox not connected.");

  const expiresSoon = connection.expiresAt.getTime() <= Date.now() + 60_000;
  if (expiresSoon) {
    return refreshAccessToken(adminUserId, originForRedirectUri);
  }

  return {
    accessToken: decryptSecret(connection.accessToken),
    email: connection.email,
  };
}

async function graphFetch(input: {
  adminUserId: string;
  originForRedirectUri: string;
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}) {
  const { accessToken } = await getValidAccessToken(input.adminUserId, input.originForRedirectUri);
  const res = await fetch(`${GRAPH_BASE_URL}${input.path}`, {
    method: input.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Microsoft Graph request failed (${res.status}): ${detail}`);
  }

  if (res.status === 204 || res.status === 202) return null;
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

function stripHtml(input: string) {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getInboxConfig(adminUserId: string): Promise<InboxConnection | null> {
  const conn = await getInboxConnection(adminUserId);
  if (!conn?.connected) return null;
  // Re-read to get microsoftUserId (not stored in InboxConnectionRecord)
  try {
    const row = await prisma.outlookToken.findUnique({ where: { adminUserId } });
    if (!row) return null;
    return {
      connected: true,
      adminUserId: row.adminUserId,
      email: row.email,
      microsoftUserId: row.microsoftUserId,
      displayName: row.displayName,
    };
  } catch (err) {
    console.error("[imap-client] getInboxConfig secondary read error:", err);
    // Return minimal config from the connection record — enough to show connected state
    return {
      connected: true,
      adminUserId: conn.adminUserId,
      email: conn.email,
      microsoftUserId: "",
      displayName: conn.displayName,
    };
  }
}

export async function disconnectInbox(adminUserId: string) {
  await prisma.outlookToken.deleteMany({ where: { adminUserId } });
}

export function generateOAuthState() {
  return randomBytes(24).toString("hex");
}

export function buildMicrosoftAuthorizeUrl(input: {
  origin: string;
  state: string;
}) {
  const params = new URLSearchParams({
    client_id: getRequiredEnv("MICROSOFT_CLIENT_ID"),
    response_type: "code",
    redirect_uri: getRedirectUri(input.origin),
    response_mode: "query",
    scope: GRAPH_SCOPES,
    state: input.state,
  });
  const tenantId = getRequiredEnv("MICROSOFT_TENANT_ID");
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function exchangeAuthCodeAndStore(input: {
  adminUserId: string;
  code: string;
  origin: string;
}) {
  const body = new URLSearchParams({
    client_id: getRequiredEnv("MICROSOFT_CLIENT_ID"),
    client_secret: getRequiredEnv("MICROSOFT_CLIENT_SECRET"),
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: getRedirectUri(input.origin),
    scope: GRAPH_SCOPES,
  });

  const tokenRes = await fetch(getTenantTokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) {
    const detail = await tokenRes.text();
    throw new Error(`Microsoft OAuth exchange failed: ${detail}`);
  }
  const token = await tokenRes.json() as GraphTokenResponse;

  const meRes = await fetch(`${GRAPH_BASE_URL}/me?$select=id,mail,userPrincipalName,displayName`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) {
    const detail = await meRes.text();
    throw new Error(`Failed to read Microsoft profile: ${detail}`);
  }
  const me = await meRes.json() as {
    id: string;
    mail?: string;
    userPrincipalName?: string;
    displayName?: string;
  };

  const email = me.mail || me.userPrincipalName;
  if (!email) throw new Error("Microsoft account did not return an email address.");

  await saveInboxConnection({
    adminUserId: input.adminUserId,
    microsoftUserId: me.id,
    email,
    displayName: me.displayName,
    accessToken: encryptSecret(token.access_token),
    refreshToken: encryptSecret(token.refresh_token ?? ""),
    scope: token.scope ?? GRAPH_SCOPES,
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
  });

  return { email, displayName: me.displayName };
}

export type EmailMessage = {
  id: string;
  subject: string;
  from: string;
  fromName: string;
  to: string;
  date: string;
  isRead: boolean;
  bodyPreview: string;
  hasAttachments: boolean;
  body?: string;
};

export async function fetchMessages(
  adminUserId: string,
  originForRedirectUri: string,
  folder = "inbox",
  limit = 50
): Promise<EmailMessage[]> {
  const folderMap: Record<string, string> = {
    inbox: "inbox",
    sent: "sentitems",
    drafts: "drafts",
    deleted: "deleteditems",
    junk: "junkemail",
  };
  const graphFolder = folderMap[folder] ?? "inbox";
  const top = Math.min(Math.max(limit, 1), 100);

  const data = await graphFetch({
    adminUserId,
    originForRedirectUri,
    path: `/me/mailFolders/${graphFolder}/messages?$top=${top}&$orderby=receivedDateTime%20desc&$select=id,subject,from,toRecipients,receivedDateTime,sentDateTime,isRead,bodyPreview,hasAttachments`,
  }) as {
    value?: Array<{
      id: string;
      subject?: string;
      from?: { emailAddress?: { address?: string; name?: string } };
      toRecipients?: Array<{ emailAddress?: { address?: string } }>;
      receivedDateTime?: string;
      sentDateTime?: string;
      isRead?: boolean;
      bodyPreview?: string;
      hasAttachments?: boolean;
    }>;
  };

  return (data.value ?? []).map((msg) => ({
    id: msg.id,
    subject: msg.subject || "(No subject)",
    from: msg.from?.emailAddress?.address ?? "",
    fromName: msg.from?.emailAddress?.name ?? msg.from?.emailAddress?.address ?? "",
    to: (msg.toRecipients ?? []).map((recipient) => recipient.emailAddress?.address).filter(Boolean).join(", "),
    date: msg.receivedDateTime ?? msg.sentDateTime ?? new Date().toISOString(),
    isRead: Boolean(msg.isRead),
    bodyPreview: msg.bodyPreview ?? "",
    hasAttachments: Boolean(msg.hasAttachments),
  }));
}

export async function fetchMessageBody(
  adminUserId: string,
  originForRedirectUri: string,
  messageId: string
): Promise<EmailMessage | null> {
  const msg = await graphFetch({
    adminUserId,
    originForRedirectUri,
    path: `/me/messages/${encodeURIComponent(messageId)}?$select=id,subject,from,toRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments,body,bodyPreview`,
  }) as {
    id: string;
    subject?: string;
    from?: { emailAddress?: { address?: string; name?: string } };
    toRecipients?: Array<{ emailAddress?: { address?: string } }>;
    receivedDateTime?: string;
    sentDateTime?: string;
    isRead?: boolean;
    hasAttachments?: boolean;
    bodyPreview?: string;
    body?: { contentType?: "text" | "html"; content?: string };
  } | null;

  if (!msg) return null;

  if (!msg.isRead) {
    await graphFetch({
      adminUserId,
      originForRedirectUri,
      path: `/me/messages/${encodeURIComponent(messageId)}`,
      method: "PATCH",
      body: { isRead: true },
    });
  }

  const bodyContent = msg.body?.content ?? msg.bodyPreview ?? "";
  const normalizedBody = msg.body?.contentType === "html" ? stripHtml(bodyContent) : bodyContent;

  return {
    id: msg.id,
    subject: msg.subject || "(No subject)",
    from: msg.from?.emailAddress?.address ?? "",
    fromName: msg.from?.emailAddress?.name ?? msg.from?.emailAddress?.address ?? "",
    to: (msg.toRecipients ?? []).map((recipient) => recipient.emailAddress?.address).filter(Boolean).join(", "),
    date: msg.receivedDateTime ?? msg.sentDateTime ?? new Date().toISOString(),
    isRead: true,
    bodyPreview: msg.bodyPreview ?? normalizedBody.slice(0, 300),
    hasAttachments: Boolean(msg.hasAttachments),
    body: normalizedBody,
  };
}

export async function deleteMessage(adminUserId: string, originForRedirectUri: string, messageId: string) {
  await graphFetch({
    adminUserId,
    originForRedirectUri,
    path: `/me/messages/${encodeURIComponent(messageId)}`,
    method: "DELETE",
  });
}

export async function sendEmail(adminUserId: string, originForRedirectUri: string, opts: {
  to: string;
  subject: string;
  html: string;
  cc?: string;
}) {
  await graphFetch({
    adminUserId,
    originForRedirectUri,
    path: "/me/sendMail",
    method: "POST",
    body: {
      message: {
        subject: opts.subject,
        body: {
          contentType: "HTML",
          content: opts.html,
        },
        toRecipients: opts.to
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
          .map((address) => ({ emailAddress: { address } })),
        ccRecipients: (opts.cc ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
          .map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    },
  });
}

export function getGraphOrigin(fallbackOrigin: string) {
  return pickOrigin(fallbackOrigin);
}
