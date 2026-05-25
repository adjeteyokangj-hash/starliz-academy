import { NextResponse } from "next/server";
import { checkRateLimit, getRequestIp, requireAdminPermission } from "@/lib/api_guard";
import { getOpenAiApiKeyWithSource, getStoredProviderKey } from "@/lib/api-key-config";

type ProviderHealthStatus = "healthy" | "degraded" | "unauthorized" | "missing_key" | "unreachable";

type ProviderHealthPayload = {
  ok: boolean;
  provider: "openai";
  status: ProviderHealthStatus;
  configured: boolean;
  source: "database" | "environment" | "none";
  message: string;
  checkedAt: string;
  providerHttpStatus: number | null;
  apiKeyMeta: {
    label: string | null;
    savedStatus: string | null;
  };
};

async function probeOpenAi(apiKey: string): Promise<{ status: ProviderHealthStatus; message: string; providerHttpStatus: number | null }> {
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });

    if (response.ok) {
      return {
        status: "healthy",
        message: "OpenAI provider is reachable and the API key is valid.",
        providerHttpStatus: response.status,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        status: "unauthorized",
        message: "OpenAI rejected the configured API key.",
        providerHttpStatus: response.status,
      };
    }

    if (response.status === 429) {
      return {
        status: "degraded",
        message: "OpenAI is reachable but currently rate-limited.",
        providerHttpStatus: response.status,
      };
    }

    return {
      status: "degraded",
      message: `OpenAI responded with HTTP ${response.status}.`,
      providerHttpStatus: response.status,
    };
  } catch {
    return {
      status: "unreachable",
      message: "Unable to reach OpenAI provider.",
      providerHttpStatus: null,
    };
  }
}

export async function GET(request: Request) {
  const { session, response } = await requireAdminPermission("ai:run");
  if (!session) return response;

  const requesterIp = getRequestIp(request);
  const rateCheck = checkRateLimit({
    key: `admin:ai-provider-health:${session.userId}:${requesterIp}`,
    limit: 30,
    windowMs: 60_000,
  });

  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many provider health checks. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rateCheck.retryAfterSeconds) },
      },
    );
  }

  const storedKey = await getStoredProviderKey("openai");
  const resolved = await getOpenAiApiKeyWithSource();
  const activeKey = resolved.apiKey;
  const source: ProviderHealthPayload["source"] = resolved.keySource;

  const checkedAt = new Date().toISOString();

  if (!activeKey) {
    const payload: ProviderHealthPayload = {
      ok: false,
      provider: "openai",
      status: "missing_key",
      configured: false,
      source,
      message: "OpenAI API key is not configured.",
      checkedAt,
      providerHttpStatus: null,
      apiKeyMeta: {
        label: storedKey?.label ?? null,
        savedStatus: storedKey?.status ?? null,
      },
    };

    return NextResponse.json(payload);
  }

  const probe = await probeOpenAi(activeKey);
  const payload: ProviderHealthPayload = {
    ok: probe.status === "healthy",
    provider: "openai",
    status: probe.status,
    configured: true,
    source,
    message: probe.message,
    checkedAt,
    providerHttpStatus: probe.providerHttpStatus,
    apiKeyMeta: {
      label: storedKey?.label ?? null,
      savedStatus: storedKey?.status ?? null,
    },
  };

  return NextResponse.json(payload);
}
