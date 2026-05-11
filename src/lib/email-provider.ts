import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secrets";

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

async function getEmailConfig(): Promise<{ apiKey: string | null; from: string }> {
  const savedKey = await prisma.apiKeyConfig.findUnique({
    where: { provider: "email" },
    select: { encryptedValue: true, label: true },
  });

  const apiKey = savedKey?.encryptedValue
    ? decryptSecret(savedKey.encryptedValue)
    : (process.env.RESEND_API_KEY ?? null);

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
}