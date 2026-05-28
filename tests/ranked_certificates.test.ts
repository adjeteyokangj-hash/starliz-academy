import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import CertificatePreview from "../src/components/certificates/CertificatePreview";
import { resolveCertificateDesign, type CertificateDesignInput } from "../src/components/certificates/certificate-designs";
import {
  buildCertificateIdempotencyKey,
  issueRankedCertificateRecord,
  verifyIssuedCertificate,
  type IssuedCertificateRecord,
} from "../src/lib/certificate-issuing";
import { listIssuedCertificatesForLibrary } from "../src/lib/certificate-library";
import { buildCertificateExportPayload, buildCertificateExportHtml } from "../src/lib/certificate-pdf-export";
import { buildCertificateRecordCreateData, persistedCertificateRowToIssuedRecord } from "../src/lib/certificate-records";
import {
  rankLabelForCertificate,
  rankedCertificateTypeLabel,
  type RankedCertificateType,
} from "../src/lib/ranked-certificates";

function rankedRecord(overrides: Partial<IssuedCertificateRecord> & { certificateType?: RankedCertificateType } = {}): IssuedCertificateRecord {
  const record = issueRankedCertificateRecord({
    certificateType: overrides.certificateType ?? "COMPETITION_FIRST_PLACE",
    studentId: "student-1",
    studentName: "Ama Star",
    yearGroup: "Year 5",
    keyStage: "KS2",
    awardSourceType: "competition",
    awardSourceId: overrides.awardSourceId ?? "maths-challenge-2026",
    competitionName: "Year 5 Maths Challenge",
    subject: "Maths",
    score: 98,
    rank: overrides.rank ?? 1,
    rankLabel: overrides.rankLabel ?? undefined,
    tiedRank: overrides.tiedRank ?? false,
    rankingMethod: overrides.rankingMethod ?? "standard",
  });
  return { ...record, ...overrides, certificateType: overrides.certificateType ?? record.certificateType };
}

function previewInput(overrides: Partial<CertificateDesignInput> = {}): CertificateDesignInput {
  return {
    title: "Year 5 Maths Challenge - 1st Place",
    studentDisplayName: "A***",
    certificateType: "COMPETITION_FIRST_PLACE",
    typeLabel: "Competition 1st Place",
    yearGroup: "Year 5",
    keyStage: "KS2",
    term: "Spring",
    subject: "Maths",
    strand: null,
    awardType: "COMPETITION_FIRST_PLACE",
    awardScope: "competition",
    issuedAt: "2026-05-01T10:00:00.000Z",
    certificateNumber: "SLA-2026-R1-RAN-05-ABCDEF",
    verificationCode: "SV-RANKED01",
    verificationUrl: "/certificates/verify/SV-RANKED01",
    status: "issued",
    score: 98,
    awardReason: "Achieved 1st Place in the Year 5 Maths Challenge.",
    competitionName: "Year 5 Maths Challenge",
    rank: 1,
    rankLabel: "1st Place",
    tiedRank: false,
    rankingMethod: "standard",
    ...overrides,
  };
}

test("ranked certificate type mapping includes launch ranked awards", () => {
  assert.equal(rankedCertificateTypeLabel("COMPETITION_PARTICIPANT"), "Competition Participant");
  assert.equal(rankedCertificateTypeLabel("SUBJECT_TEST_FIRST_PLACE"), "Subject Test 1st Place");
  assert.equal(rankedCertificateTypeLabel("STARLIZ_STUDENT_OF_YEAR"), "StarLiz Student of the Year");
});

test("rank label generation handles first second third finalist and participant", () => {
  assert.equal(rankLabelForCertificate({ certificateType: "COMPETITION_FIRST_PLACE", rank: 1 }), "1st Place");
  assert.equal(rankLabelForCertificate({ certificateType: "QUIZ_SECOND_PLACE", rank: 2 }), "2nd Place");
  assert.equal(rankLabelForCertificate({ certificateType: "CHALLENGE_THIRD_PLACE", rank: 3 }), "3rd Place");
  assert.equal(rankLabelForCertificate({ certificateType: "COMPETITION_FINALIST" }), "Finalist");
  assert.equal(rankLabelForCertificate({ certificateType: "COMPETITION_PARTICIPANT" }), "Participant");
  assert.equal(rankLabelForCertificate({ certificateType: "COMPETITION_FINALIST", rank: 1 }), "Finalist");
  assert.equal(rankLabelForCertificate({ certificateType: "COMPETITION_PARTICIPANT", rank: 1 }), "Participant");
});

test("ranked certificate design maps rank to gold silver bronze finalist and participant themes", () => {
  assert.equal(resolveCertificateDesign(previewInput({ rank: 1, rankLabel: "1st Place" })).theme, "ranked_gold");
  assert.equal(resolveCertificateDesign(previewInput({ rank: 2, rankLabel: "2nd Place" })).theme, "ranked_silver");
  assert.equal(resolveCertificateDesign(previewInput({ rank: 3, rankLabel: "3rd Place" })).theme, "ranked_bronze");
  assert.equal(resolveCertificateDesign(previewInput({ certificateType: "COMPETITION_FINALIST", rank: null, rankLabel: "Finalist" })).theme, "ranked_finalist");
  assert.equal(resolveCertificateDesign(previewInput({ certificateType: "COMPETITION_PARTICIPANT", rank: null, rankLabel: "Participant" })).theme, "ranked_participant");
});

test("ranked certificate record creation stores source and rank metadata", () => {
  const record = rankedRecord();
  const data = buildCertificateRecordCreateData(record);

  assert.equal(data.certificateType, "COMPETITION_FIRST_PLACE");
  assert.equal(data.awardSourceType, "competition");
  assert.equal(data.awardSourceId, "maths-challenge-2026");
  assert.equal(data.competitionName, "Year 5 Maths Challenge");
  assert.equal(data.rank, 1);
  assert.equal(data.rankLabel, "1st Place");
  assert.equal(data.tiedRank, false);
  assert.equal(data.rankingMethod, "standard");
});

test("ranked idempotency includes same student source and rank", () => {
  const first = rankedRecord();
  const duplicate = rankedRecord({
    id: "duplicate",
    certificateNumber: "SLA-2026-R1-RAN-05-FFFFFF",
    verificationCode: "SV-DUPLICATE",
  });
  const secondPlace = rankedRecord({ certificateType: "COMPETITION_SECOND_PLACE", rank: 2, rankLabel: "2nd Place" });

  assert.equal(buildCertificateIdempotencyKey(first), buildCertificateIdempotencyKey(duplicate));
  assert.notEqual(buildCertificateIdempotencyKey(first), buildCertificateIdempotencyKey(secondPlace));
});

test("persisted ranked certificate restores verification details", () => {
  const record = rankedRecord();
  const row = {
    ...buildCertificateRecordCreateData(record),
    id: "db-ranked-1",
    createdAt: new Date("2026-05-01T10:00:00.000Z"),
    updatedAt: new Date("2026-05-01T10:00:00.000Z"),
    student: { name: "Ama Star" },
  };
  const restored = persistedCertificateRowToIssuedRecord(row);
  const verification = verifyIssuedCertificate({ verificationCode: restored.verificationCode, candidates: [restored] });

  assert.equal(restored.rankLabel, "1st Place");
  assert.equal(restored.competitionName, "Year 5 Maths Challenge");
  assert.equal(verification.status, "valid");
  assert.equal(verification.certificate?.rankLabel, "1st Place");
});

test("ranked certificates display clearly in the library", () => {
  const library = listIssuedCertificatesForLibrary(null, [rankedRecord()]);

  assert.equal(library[0]?.typeGroup, "competition_certificates");
  assert.equal(library[0]?.typeLabel, "Competition 1st Place");
  assert.equal(library[0]?.rankLabel, "1st Place");
  assert.equal(library[0]?.competitionName, "Year 5 Maths Challenge");
});

test("ranked preview and export include rank event score and verification", () => {
  const html = renderToStaticMarkup(React.createElement(CertificatePreview, previewInput()));
  assert.match(html, /1st Place/);
  assert.match(html, /Year 5 Maths Challenge/);
  assert.match(html, /Award score:/);
  assert.match(html, /SV-RANKED01/);

  const payload = buildCertificateExportPayload(previewInput());
  assert.equal(payload.ok, true);
  if (payload.ok) {
    assert.equal(payload.payload.rankLabel, "1st Place");
    assert.equal(payload.payload.competitionName, "Year 5 Maths Challenge");
    const exportHtml = buildCertificateExportHtml(payload.payload);
    assert.match(exportHtml, /Rank \/ place/);
    assert.match(exportHtml, /Real verification QR/);
  }
});
