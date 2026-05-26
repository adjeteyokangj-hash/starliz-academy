export type TaxJurisdiction = "UK_HMRC" | "GH_GRA";

export type TaxReportPack = {
  jurisdiction: TaxJurisdiction;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  records: Array<Record<string, unknown>>;
  summary: {
    grossAmount: number;
    vatAmount: number;
    netAmount: number;
  };
};

export type ComplianceReadiness = {
  jurisdiction: TaxJurisdiction;
  status: "ready" | "in_progress" | "not_configured";
  controls: Array<{ name: string; status: "ok" | "warning" | "missing"; note?: string }>;
};
