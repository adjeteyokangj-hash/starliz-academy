import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import {
  buildParentProgressReportData,
  type ParentReportRange,
  renderParentProgressReportCsv,
  renderParentProgressReportExcel,
  renderParentProgressReportPdf,
} from "@/lib/reports/parent-progress-report";

const SUPPORTED_RANGES = new Set<ParentReportRange>(["7d", "30d", "90d", "all"]);

function asRange(value: string | null): ParentReportRange {
  if (value && SUPPORTED_RANGES.has(value as ParentReportRange)) {
    return value as ParentReportRange;
  }
  return "30d";
}

function toSafeFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "child";
}

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const childId = url.searchParams.get("childId")?.trim();
  const format = (url.searchParams.get("format") ?? "pdf").toLowerCase();
  const range = asRange(url.searchParams.get("range"));

  if (!childId) {
    return NextResponse.json({ error: "childId is required." }, { status: 400 });
  }

  if (!["pdf", "csv", "excel", "xls", "xlsx"].includes(format)) {
    return NextResponse.json({ error: "Supported formats are: pdf, csv, excel." }, { status: 400 });
  }

  try {
    const report = await buildParentProgressReportData({
      parentId: parentScope.parentId,
      childId,
      range,
    });

    const fileBase = `starliz-progress-report-${toSafeFilename(report.child.name)}-${new Date().toISOString().slice(0, 10)}`;

    if (format === "pdf") {
      const pdfBuffer = renderParentProgressReportPdf(report);
      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${fileBase}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (format === "csv") {
      const csv = renderParentProgressReportCsv(report);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileBase}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const excelXml = renderParentProgressReportExcel(report);
    return new NextResponse(excelXml, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileBase}.xls"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate report.";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
