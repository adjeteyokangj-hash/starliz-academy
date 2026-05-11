import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { buildAdminReports, reportsToCsv } from "@/lib/reports/admin-reports";

export async function GET(request: Request) {
  const { session, response } = await requireAdminPermission("reports:view");
  if (!session) return response;

  const report = await buildAdminReports();
  const format = new URL(request.url).searchParams.get("format");
  if (format === "csv") {
    return new NextResponse(reportsToCsv(report), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=starliz-report.csv",
      },
    });
  }

  return NextResponse.json(report);
}
