import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkRateLimit, requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { decryptSecret } from "@/lib/secrets";

const testSchema = z.object({
  provider: z.enum(["openai", "payment", "email", "voice", "storage"]),
});

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("settings:api_keys:test");
  if (!session) return response;

  const rateCheck = checkRateLimit({ key: `admin:api-key-test:${session.userId}`, limit: 20, windowMs: 60_000 });
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many key-test requests. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rateCheck.retryAfterSeconds) },
      },
    );
  }

  try {
    const body = testSchema.parse(await request.json());
    const existing = await prisma.apiKeyConfig.findUnique({ where: { provider: body.provider } });
    if (!existing) {
      return NextResponse.json({ error: "Save a key before testing it." }, { status: 404 });
    }

    const apiKey = decryptSecret(existing.encryptedValue);
    let status = "untested";
    let message = "Key format verified.";
    if (body.provider === "openai") {
      try {
        const openAIResponse = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10_000),
        });
        status = openAIResponse.ok ? "connected" : "failed";
        message = openAIResponse.ok ? "OpenAI connection verified." : "OpenAI connection failed.";
      } catch {
        status = "failed";
        message = "OpenAI connection failed.";
      }
    } else if (body.provider === "payment") {
      status = apiKey.length >= 12 ? "connected" : "failed";
      message = status === "connected" ? "Payment key is saved and ready for webhook/provider integration." : "Payment key looks too short.";
    } else if (body.provider === "email") {
      // Validate against Resend's domains endpoint — works with any valid Resend key
      try {
        const resendResponse = await fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (resendResponse.ok) {
          status = "connected";
          message = "Resend API key verified — email delivery is ready.";
        } else if (resendResponse.status === 401) {
          status = "failed";
          message = "Invalid Resend API key. Check the key at resend.com/api-keys and try again.";
        } else {
          status = "failed";
          message = `Resend returned HTTP ${resendResponse.status}. Check your key.`;
        }
      } catch {
        status = "failed";
        message = "Could not reach Resend. Check your network and try again.";
      }
    } else if (body.provider === "voice") {
      const testUrl = process.env.VOICE_PROVIDER_TEST_URL;
      if (testUrl) {
        try {
          const providerResponse = await fetch(testUrl, {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(10_000),
          });
          status = providerResponse.ok ? "connected" : "failed";
          message = providerResponse.ok ? "Voice provider connection verified." : "Voice provider connection failed.";
        } catch {
          status = "failed";
          message = "Voice provider connection failed.";
        }
      } else {
        status = apiKey.length >= 12 ? "connected" : "failed";
        message = status === "connected" ? "Voice key is saved. Set VOICE_PROVIDER_TEST_URL for live checks." : "Voice key looks too short.";
      }
    } else if (body.provider === "storage") {
      const testUrl = process.env.STORAGE_PROVIDER_TEST_URL;
      if (testUrl) {
        try {
          const providerResponse = await fetch(testUrl, {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(10_000),
          });
          status = providerResponse.ok ? "connected" : "failed";
          message = providerResponse.ok ? "Storage provider connection verified." : "Storage provider connection failed.";
        } catch {
          status = "failed";
          message = "Storage provider connection failed.";
        }
      } else {
        status = apiKey.length >= 12 ? "connected" : "failed";
        message = status === "connected" ? "Storage key is saved. Set STORAGE_PROVIDER_TEST_URL for live checks." : "Storage key looks too short.";
      }
    }

    const key = await prisma.apiKeyConfig.update({
      where: { provider: body.provider },
      data: { status, lastTestedAt: new Date() },
      select: { id: true, provider: true, status: true, lastTestedAt: true },
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "api_key_tested",
      entityType: "api_key",
      entityId: key.id,
      metadata: { provider: key.provider, status: key.status },
    });

    return NextResponse.json({
      ok: true,
      provider: key.provider,
      status: key.status,
      message,
      lastTestedAt: key.lastTestedAt?.toISOString() ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Invalid test request." }, { status: 400 });
  }
}
