import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import {
  CERTIFICATE_TEMPLATE_SETTINGS_AUDIT_ACTION,
  CERTIFICATE_TEMPLATE_SETTINGS_ENTITY_TYPE,
  buildCertificateTemplateSettingsAuditMetadata,
  buildCertificateTemplateSettingsResponse,
  isCertificateTemplatePersistenceUnavailable,
  parseCertificateTemplateSettingsAuditMetadata,
  validateCertificateTemplateSettingsPostPayload,
} from "@/lib/certificate-template-persistence";

export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  try {
    const latest = await prisma.auditLog.findFirst({
      where: {
        action: CERTIFICATE_TEMPLATE_SETTINGS_AUDIT_ACTION,
        entityType: CERTIFICATE_TEMPLATE_SETTINGS_ENTITY_TYPE,
      },
      orderBy: { createdAt: "desc" },
      include: {
        actor: {
          select: { email: true },
        },
      },
    });

    const parsed = parseCertificateTemplateSettingsAuditMetadata(latest?.metadataJson ?? null);

    return NextResponse.json(buildCertificateTemplateSettingsResponse({
      settings: parsed.settings,
      persistenceMode: "audit_log",
      updatedAt: latest?.createdAt.toISOString() ?? null,
      updatedBy: latest?.actor?.email ?? null,
      usedFallback: parsed.usedFallback,
    }));
  } catch (error) {
    if (!isCertificateTemplatePersistenceUnavailable(error)) {
      throw error;
    }

    const fallback = parseCertificateTemplateSettingsAuditMetadata(null);
    return NextResponse.json(buildCertificateTemplateSettingsResponse({
      settings: fallback.settings,
      persistenceMode: "preview_only",
      usedFallback: true,
    }));
  }
}

export async function POST(req: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const parsedBody = validateCertificateTemplateSettingsPostPayload(await req.json());
  if (!parsedBody.ok) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }

  try {
    const created = await prisma.auditLog.create({
      data: {
        actorUserId: session.userId,
        action: CERTIFICATE_TEMPLATE_SETTINGS_AUDIT_ACTION,
        entityType: CERTIFICATE_TEMPLATE_SETTINGS_ENTITY_TYPE,
        metadataJson: JSON.stringify(buildCertificateTemplateSettingsAuditMetadata(parsedBody.settings)),
      },
      include: {
        actor: {
          select: { email: true },
        },
      },
    });

    return NextResponse.json(buildCertificateTemplateSettingsResponse({
      settings: parsedBody.settings,
      persistenceMode: "audit_log",
      updatedAt: created.createdAt.toISOString(),
      updatedBy: created.actor?.email ?? session.email ?? null,
    }));
  } catch (error) {
    if (!isCertificateTemplatePersistenceUnavailable(error)) {
      throw error;
    }

    return NextResponse.json({
      error: "Certificate template settings persistence is unavailable in this environment.",
      persistenceMode: "preview_only",
      settings: parsedBody.settings,
    }, { status: 503 });
  }
}
