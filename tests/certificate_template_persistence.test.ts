import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCertificateTemplateSettingsAuditMetadata,
  buildCertificateTemplateSettingsResponse,
  parseCertificateTemplateSettingsAuditMetadata,
  validateCertificateTemplateSettingsPostPayload,
} from "../src/lib/certificate-template-persistence";
import {
  buildCertificateTemplatePreviewData,
  defaultCertificateTemplateSettings,
} from "../src/lib/certificate-template-settings";

test("GET returns defaults when no saved settings exist", () => {
  const parsed = parseCertificateTemplateSettingsAuditMetadata(null);
  const payload = buildCertificateTemplateSettingsResponse({
    settings: parsed.settings,
    persistenceMode: "audit_log",
    usedFallback: parsed.usedFallback,
  });

  assert.deepEqual(payload.settings, defaultCertificateTemplateSettings);
  assert.equal(payload.usedFallback, true);
});

test("POST rejects invalid certificate type", () => {
  const result = validateCertificateTemplateSettingsPostPayload({
    settings: {
      ...defaultCertificateTemplateSettings,
      invalid_type: {
        certificateType: "invalid_type",
        template: "classic_academic",
        theme: "classic_academic",
      },
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /invalid certificate type/i);
});

test("POST rejects invalid template", () => {
  const result = validateCertificateTemplateSettingsPostPayload({
    settings: {
      ...defaultCertificateTemplateSettings,
      term_completion: {
        certificateType: "term_completion",
        template: "bad-template-value",
        theme: "classic_academic",
      },
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /invalid template/i);
});

test("POST rejects invalid theme", () => {
  const result = validateCertificateTemplateSettingsPostPayload({
    settings: {
      ...defaultCertificateTemplateSettings,
      term_completion: {
        certificateType: "term_completion",
        template: "classic_academic",
        theme: "bad-theme-value",
      },
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /invalid theme/i);
});

test("POST accepts valid settings", () => {
  const result = validateCertificateTemplateSettingsPostPayload({
    settings: defaultCertificateTemplateSettings,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.settings.award_certificate.template, "gold_award");
});

test("invalid saved settings fall back safely", () => {
  const metadataJson = JSON.stringify({
    settings: {
      term_completion: {
        certificateType: "term_completion",
        template: "invalid-template",
        theme: "invalid-theme",
      },
    },
  });

  const parsed = parseCertificateTemplateSettingsAuditMetadata(metadataJson);
  assert.equal(parsed.settings.term_completion.template, defaultCertificateTemplateSettings.term_completion.template);
  assert.equal(parsed.settings.term_completion.theme, defaultCertificateTemplateSettings.term_completion.theme);
  assert.equal(parsed.usedFallback, true);
});

test("award certificate setting can persist award-style template", () => {
  const metadataJson = JSON.stringify(buildCertificateTemplateSettingsAuditMetadata({
    ...defaultCertificateTemplateSettings,
    award_certificate: {
      certificateType: "award_certificate",
      template: "gold_award",
      theme: "award_prestige",
    },
  }));

  const parsed = parseCertificateTemplateSettingsAuditMetadata(metadataJson);
  assert.equal(parsed.settings.award_certificate.template, "gold_award");
  assert.equal(parsed.settings.award_certificate.theme, "award_prestige");
});

test("english certificate setting can persist English-specific template", () => {
  const metadataJson = JSON.stringify(buildCertificateTemplateSettingsAuditMetadata({
    ...defaultCertificateTemplateSettings,
    english_achievement: {
      certificateType: "english_achievement",
      template: "english_learning",
      theme: "english_scholar",
    },
  }));

  const parsed = parseCertificateTemplateSettingsAuditMetadata(metadataJson);
  assert.equal(parsed.settings.english_achievement.template, "english_learning");
  assert.equal(parsed.settings.english_achievement.theme, "english_scholar");
});

test("demo preview remains marked as preview/demo", () => {
  const preview = buildCertificateTemplatePreviewData({
    certificateType: "term_completion",
    settings: defaultCertificateTemplateSettings,
  });

  assert.equal(preview.isPreviewDemo, true);
  assert.match(preview.studentDisplayName, /preview demo/i);
});

test("POST payload validation requires settings root", () => {
  const result = validateCertificateTemplateSettingsPostPayload({});
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /settings payload/i);
});
