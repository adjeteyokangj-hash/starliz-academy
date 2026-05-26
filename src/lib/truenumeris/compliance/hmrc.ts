import type { ComplianceReadiness, TaxReportPack } from "@/lib/truenumeris/compliance/interfaces";

export function getHmrcReadinessSnapshot(): ComplianceReadiness {
  return {
    jurisdiction: "UK_HMRC",
    status: "in_progress",
    controls: [
      { name: "Digital VAT records", status: "ok" },
      { name: "Quarterly VAT return mapping", status: "warning", note: "Mapping is placeholder-only in Phase 1." },
      { name: "Direct HMRC submission", status: "missing", note: "Disabled by policy." },
    ],
  };
}

export function buildHmrcExportPack(input: {
  periodStart: string;
  periodEnd: string;
  rows: Array<Record<string, unknown>>;
}): TaxReportPack {
  const summary = input.rows.reduce<{ grossAmount: number; vatAmount: number; netAmount: number }>(
    (acc, row) => {
      acc.grossAmount += Number(row.grossAmount ?? 0);
      acc.vatAmount += Number(row.vatAmount ?? 0);
      acc.netAmount += Number(row.netAmount ?? 0);
      return acc;
    },
    { grossAmount: 0, vatAmount: 0, netAmount: 0 },
  );

  return {
    jurisdiction: "UK_HMRC",
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    generatedAt: new Date().toISOString(),
    records: input.rows,
    summary,
  };
}
