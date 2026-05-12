import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import {
  buildParentProgressReportData,
  type ParentReportRange,
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

  if (format !== "pdf") {
    return NextResponse.json({ error: "Only format=pdf is currently supported." }, { status: 400 });
  }

  try {
    const report = await buildParentProgressReportData({
      parentId: parentScope.parentId,
      childId,
      range,
    });

    const pdfBuffer = renderParentProgressReportPdf(report);
    const filename = `starliz-progress-report-${toSafeFilename(report.child.name)}-${new Date().toISOString().slice(0, 10)}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate report.";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
