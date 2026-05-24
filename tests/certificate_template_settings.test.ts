import test from "node:test";
import assert from "node:assert/strict";

import {
  defaultCertificateTemplateSettings,
  resolveCertificateTemplateForType,
  buildCertificateTemplatePreviewData,
  validateCertificateTemplateSettings,
} from "../src/lib/certificate-template-settings";

test("default settings exist for all certificate types", () => {
  assert.ok(defaultCertificateTemplateSettings.term_completion);
  assert.ok(defaultCertificateTemplateSettings.end_of_term_exam);
  assert.ok(defaultCertificateTemplateSettings.subject_achievement);
  assert.ok(defaultCertificateTemplateSettings.english_achievement);
  assert.ok(defaultCertificateTemplateSettings.mastery_certificate);
  assert.ok(defaultCertificateTemplateSettings.award_certificate);
});

test("award certificate resolves to award prestige style", () => {
  const resolved = resolveCertificateTemplateForType({ certificateType: "award_certificate" });
  assert.equal(resolved.template, "gold_award");
  assert.equal(resolved.theme, "award_prestige");
});

test("english certificate resolves to english-specific template", () => {
  const resolved = resolveCertificateTemplateForType({ certificateType: "english_achievement" });
  assert.equal(resolved.template, "english_learning");
  assert.equal(resolved.theme, "english_scholar");
});

test("invalid template setting falls back safely", () => {
  const validated = validateCertificateTemplateSettings({
    term_completion: {
      certificateType: "term_completion",
      template: "invalid-template-name",
      theme: "invalid-theme-name",
    },
  });

  assert.equal(validated.term_completion.template, defaultCertificateTemplateSettings.term_completion.template);
  assert.equal(validated.term_completion.theme, defaultCertificateTemplateSettings.term_completion.theme);
});

test("demo preview data is marked as preview demo", () => {
  const preview = buildCertificateTemplatePreviewData({ certificateType: "term_completion" });
  assert.equal(preview.isPreviewDemo, true);
  assert.match(preview.studentDisplayName, /Preview Demo/);
});

test("preview data does not expose real student data", () => {
  const preview = buildCertificateTemplatePreviewData({ certificateType: "subject_achievement" });
  const previewObject = preview as unknown as Record<string, unknown>;
  assert.equal("studentId" in previewObject, false);
  assert.equal("studentName" in previewObject, false);
  assert.notEqual(preview.studentDisplayName, "Jane Morgan");
});

test("custom settings override template selection safely", () => {
  const resolved = resolveCertificateTemplateForType({
    certificateType: "subject_achievement",
    settings: {
      subject_achievement: {
        certificateType: "subject_achievement",
        template: "classic_academic",
        theme: "classic_academic",
      },
    },
  });

  assert.equal(resolved.template, "classic_academic");
  assert.equal(resolved.theme, "classic_academic");
});
