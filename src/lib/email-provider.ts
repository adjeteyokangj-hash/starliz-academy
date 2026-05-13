import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secrets";

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

function isConfiguredSecret(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("__SET_")) return false;
  return true;
}

async function getEmailConfig(): Promise<{ apiKey: string | null; from: string }> {
  const savedKey = await prisma.apiKeyConfig.findUnique({
    where: { provider: "email" },
    select: { encryptedValue: true, label: true },
  });

  const envApiKey = isConfiguredSecret(process.env.RESEND_API_KEY)
    ? process.env.RESEND_API_KEY.trim()
    : null;

  let savedApiKey: string | null = null;
  if (savedKey?.encryptedValue) {
    try {
      const decrypted = decryptSecret(savedKey.encryptedValue);
      savedApiKey = isConfiguredSecret(decrypted) ? decrypted.trim() : null;
    } catch (error) {
      console.error("[email-provider] Failed to decrypt saved email API key", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Prefer deployment env for predictable production behavior; fall back to DB-stored key.
  const apiKey = envApiKey ?? savedApiKey;

  // Use label as from address if it contains "@", otherwise fall back to env / default
  const from =
    savedKey?.label?.includes("@")
      ? savedKey.label
      : (process.env.EMAIL_FROM ?? "StarLiz Academy <onboarding@resend.dev>");

  return { apiKey, from };
}

export async function sendEmail(payload: EmailPayload) {
  const { apiKey, from } = await getEmailConfig();
  if (!apiKey) {
    return { ok: false as const, reason: "EMAIL_PROVIDER_NOT_CONFIGURED" };
  }

  try {
    const resend = new Resend(apiKey);

    const result = await resend.emails.send({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });

    if (result.error) {
      return { ok: false as const, reason: result.error.message };
    }

    return { ok: true as const, id: result.data?.id ?? null };
  } catch (error) {
    return {
      ok: false as const,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}