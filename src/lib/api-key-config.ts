import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secrets";

export type ApiKeyProvider = "openai" | "payment" | "email" | "voice" | "storage";

type StoredProviderKey = {
  secret: string;
  label: string;
  status: string;
};

function cleanSecret(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

export async function getStoredProviderKey(provider: ApiKeyProvider): Promise<StoredProviderKey | null> {
  const saved = await prisma.apiKeyConfig.findUnique({
    where: { provider },
    select: { encryptedValue: true, label: true, status: true },
  });

  if (!saved?.encryptedValue) {
    return null;
  }

  try {
    const secret = decryptSecret(saved.encryptedValue);
    const cleanedSecret = cleanSecret(secret);
    if (!cleanedSecret) return null;
    return {
      secret: cleanedSecret,
      label: saved.label,
      status: saved.status,
    };
  } catch {
    return null;
  }
}

export async function getProviderSecret(provider: ApiKeyProvider, fallbackEnvVar?: string): Promise<string | null> {
  const saved = await getStoredProviderKey(provider);
  if (saved?.secret) {
    return saved.secret;
  }

  if (!fallbackEnvVar) {
    return null;
  }

  return cleanSecret(process.env[fallbackEnvVar]);
}

export async function getOpenAiApiKey(): Promise<string | null> {
  return getProviderSecret("openai", "OPENAI_API_KEY");
}

export async function getVoiceApiKey(): Promise<string | null> {
  const voiceKey = await getProviderSecret("voice");
  if (voiceKey) {
    return voiceKey;
  }
  return getOpenAiApiKey();
}

export async function getPaymentApiKey(): Promise<string | null> {
  return getProviderSecret("payment", "STRIPE_SECRET_KEY");
}
