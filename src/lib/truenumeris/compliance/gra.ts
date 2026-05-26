import type { ComplianceReadiness, TaxReportPack } from "@/lib/truenumeris/compliance/interfaces";

export function getGraReadinessSnapshot(): ComplianceReadiness {
  return {
    jurisdiction: "GH_GRA",
    status: "not_configured",
    controls: [
      { name: "Digital VAT records", status: "warning", note: "Region-ready scaffolding only." },
      { name: "GRA return mapping", status: "missing" },
      { name: "Direct GRA submission", status: "missing", note: "Disabled by policy." },
    ],
  };
}

export function buildGraExportPack(input: {
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
    jurisdiction: "GH_GRA",
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    generatedAt: new Date().toISOString(),
    records: input.rows,
    summary,
  };
}
