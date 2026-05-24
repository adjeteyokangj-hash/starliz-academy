import {
  availableCertificateTemplates,
  availableCertificateThemes,
  defaultCertificateTemplateSettings,
  validateCertificateTemplateSettings,
  validateCertificateTemplateSettingsStrict,
  type CertificateTemplateSettings,
} from "@/lib/certificate-template-settings";

export const CERTIFICATE_TEMPLATE_SETTINGS_AUDIT_ACTION = "certificate_template_settings_saved";
export const CERTIFICATE_TEMPLATE_SETTINGS_ENTITY_TYPE = "certificate_template_settings";

export type CertificateTemplatePersistenceMode = "audit_log" | "preview_only";

export type CertificateTemplateSettingsAuditMetadata = {
  settings: CertificateTemplateSettings;
  schemaVersion: 1;
  source: "admin_certificates_templates";
};

export function buildCertificateTemplateSettingsAuditMetadata(settings: CertificateTemplateSettings): CertificateTemplateSettingsAuditMetadata {
  return {
    settings,
    schemaVersion: 1,
    source: "admin_certificates_templates",
  };
}

export function parseCertificateTemplateSettingsAuditMetadata(metadataJson: string | null | undefined): {
  settings: CertificateTemplateSettings;
  usedFallback: boolean;
} {
  if (!metadataJson) {
    return { settings: defaultCertificateTemplateSettings, usedFallback: true };
  }

  try {
    const parsed = JSON.parse(metadataJson) as { settings?: unknown };
    const settings = validateCertificateTemplateSettings(parsed?.settings ?? null);
    const usedFallback = JSON.stringify(settings) !== JSON.stringify(parsed?.settings ?? null);
    return { settings, usedFallback };
  } catch {
    return { settings: defaultCertificateTemplateSettings, usedFallback: true };
  }
}

export function validateCertificateTemplateSettingsPostPayload(input: unknown):
  | { ok: true; settings: CertificateTemplateSettings }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Request body must be an object." };
  }

  const raw = input as Record<string, unknown>;
  return validateCertificateTemplateSettingsStrict(raw.settings ?? null);
}

export function buildCertificateTemplateSettingsResponse(input: {
  settings: CertificateTemplateSettings;
  defaults?: CertificateTemplateSettings;
  persistenceMode: CertificateTemplatePersistenceMode;
  updatedAt?: string | null;
  updatedBy?: string | null;
  usedFallback?: boolean;
}) {
  return {
    settings: input.settings,
    defaults: input.defaults ?? defaultCertificateTemplateSettings,
    availableTemplates: availableCertificateTemplates,
    availableThemes: availableCertificateThemes,
    persistenceMode: input.persistenceMode,
    updatedAt: input.updatedAt ?? null,
    updatedBy: input.updatedBy ?? null,
    usedFallback: Boolean(input.usedFallback),
  };
}

export function isCertificateTemplatePersistenceUnavailable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = String((error as { message?: string } | null)?.message ?? "").toLowerCase();
  return code === "P2021" || message.includes("does not exist") || message.includes("no such table");
}
