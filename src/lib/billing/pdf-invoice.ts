import jsPDF from "jspdf";

type InvoicePdfInput = {
  invoiceNumber: string;
  parentName?: string | null;
  studentName?: string | null;
  provider: string;
  currency: string;
  grossAmount: number;
  vatAmount: number;
  netAmount: number;
  issuedAt: Date;
  paymentReference?: string | null;
};

function formatMoney(currency: string, value: number): string {
  return `${currency.toUpperCase()} ${value.toFixed(2)}`;
}

export function generateInvoicePdf(input: InvoicePdfInput): Uint8Array {
  const doc = new jsPDF();
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 297, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text("StarLiz Academy", 20, 26);

  doc.setFontSize(12);
  doc.text("Financial Invoice", 20, 36);

  doc.setDrawColor(71, 85, 105);
  doc.line(20, 42, 190, 42);

  doc.setFontSize(11);
  doc.text(`Invoice #: ${input.invoiceNumber}`, 20, 54);
  doc.text(`Issued: ${input.issuedAt.toISOString().slice(0, 10)}`, 20, 62);
  doc.text(`Provider: ${input.provider}`, 20, 70);
  if (input.paymentReference) {
    doc.text(`Payment Ref: ${input.paymentReference}`, 20, 78);
  }

  doc.text(`Parent: ${input.parentName ?? "N/A"}`, 20, 92);
  doc.text(`Student: ${input.studentName ?? "N/A"}`, 20, 100);

  doc.setFillColor(30, 41, 59);
  doc.roundedRect(20, 112, 170, 70, 6, 6, "F");

  doc.setTextColor(226, 232, 240);
  doc.text(`Net Amount: ${formatMoney(input.currency, input.netAmount)}`, 28, 130);
  doc.text(`VAT Amount: ${formatMoney(input.currency, input.vatAmount)}`, 28, 144);
  doc.text(`Gross Amount: ${formatMoney(input.currency, input.grossAmount)}`, 28, 158);

  doc.setTextColor(148, 163, 184);
  doc.setFontSize(9);
  doc.text("Prepared for accounting, VAT reporting, and reconciliation.", 20, 280);

  return doc.output("arraybuffer") as unknown as Uint8Array;
}
