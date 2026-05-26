import { prisma } from "@/lib/db";
import { buildGraExportPack } from "@/lib/truenumeris/compliance/gra";
import { buildHmrcExportPack } from "@/lib/truenumeris/compliance/hmrc";

export async function buildComplianceExportPack(input: {
  jurisdiction: "UK_HMRC" | "GH_GRA";
  periodStart: Date;
  periodEnd: Date;
}) {
  const rows = await prisma.financialInvoice.findMany({
    where: {
      createdAt: {
        gte: input.periodStart,
        lte: input.periodEnd,
      },
      status: { in: ["issued", "paid"] },
    },
    select: {
      invoiceNumber: true,
      createdAt: true,
      grossAmount: true,
      vatAmount: true,
      netAmount: true,
      currency: true,
      providerReference: true,
    },
  });

  const mappedRows = rows.map((row) => ({
    invoiceNumber: row.invoiceNumber,
    createdAt: row.createdAt.toISOString(),
    grossAmount: Number(row.grossAmount),
    vatAmount: Number(row.vatAmount),
    netAmount: Number(row.netAmount),
    currency: row.currency,
    providerReference: row.providerReference,
  }));

  if (input.jurisdiction === "GH_GRA") {
    return buildGraExportPack({
      periodStart: input.periodStart.toISOString(),
      periodEnd: input.periodEnd.toISOString(),
      rows: mappedRows,
    });
  }

  return buildHmrcExportPack({
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    rows: mappedRows,
  });
}
