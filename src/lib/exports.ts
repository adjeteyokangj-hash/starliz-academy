import jsPDF from "jspdf";
import { buildParentAnalytics } from "@/lib/analytics";
import { createBarChartImage, createLineChartImage } from "@/lib/chart_images";
import { fetchAllChildrenHistory, fetchProfileHistory, getProfileHistory } from "@/lib/progress_data";
import { getTeacherSummary } from "@/lib/report_narrative";
import { getReportThemePalette } from "@/lib/report_theme";
import { ChildProfile } from "@/lib/store";
import { csvEscape } from "@/lib/csv_escape";

function drawSignatureSection(doc: jsPDF, y: number, textColor: [number, number, number]): number {
  doc.setTextColor(...textColor);
  doc.setFontSize(13);
  doc.text("Parent / Teacher Review", 20, y);
  y += 10;
  doc.setLineWidth(0.3);
  doc.line(20, y, 88, y);
  doc.line(110, y, 178, y);
  doc.setFontSize(10);
  doc.text("Parent Signature", 20, y + 5);
  doc.text("Teacher Signature", 110, y + 5);
  y += 15;
  doc.line(20, y, 88, y);
  doc.text("Date", 20, y + 5);
  return y + 14;
}

function drawFooter(doc: jsPDF): void {
  const pages = doc.getNumberOfPages();
  const today = new Date().toISOString().slice(0, 10);
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(9);
    doc.text(`StarLiz Academy Family Report | Generated ${today}`, 20, 289);
    doc.text(`Page ${page}/${pages}`, 176, 289);
  }
}

export async function exportAllHistoryCsv(profiles: ChildProfile[]): Promise<void> {
  await Promise.all(profiles.map((profile) => fetchProfileHistory(profile)));
  const rows: Array<Array<string | number | boolean>> = [
    ["childId", "childName", "activity", "timestamp", "score", "correct", "difficulty", "notes"],
  ];

  for (const profile of profiles) {
    const history = getProfileHistory(profile);
    for (const item of history) {
      rows.push([
        profile.id,
        profile.name,
        item.activity,
        item.ts,
        item.score,
        item.correct,
        item.difficulty,
        item.notes ?? "",
      ]);
    }
  }

  const csv = rows.map((row) => row.map((cell) => csvEscape(cell)).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "starliz-all-children-history.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportAllHistoryPdf(profiles: ChildProfile[]): Promise<void> {
  const doc = new jsPDF();
  const allHistory = await fetchAllChildrenHistory(profiles);

  doc.setFillColor(31, 42, 55);
  doc.rect(0, 0, 210, 297, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.text("StarLiz Academy", 20, 34);
  doc.setFontSize(18);
  doc.text("Family Learning Portfolio", 20, 48);
  doc.setFontSize(12);
  doc.text(`Profiles included: ${profiles.length}`, 20, 62);
  doc.text("Teacher-style summaries, chart visuals, and learning history.", 20, 72);
  let y = 34;

  for (const profile of profiles) {
    const history = allHistory[profile.id] ?? [];
    const analytics = buildParentAnalytics(profile, history);
    const summaryLines = getTeacherSummary(profile, history);
    const palette = getReportThemePalette(profile.theme);

    doc.addPage();
    y = 22;

    doc.setFillColor(...palette.cardBackground);
    doc.rect(0, 0, 210, 297, "F");
    doc.setFillColor(...palette.coverBackground);
    doc.roundedRect(16, 16, 178, 42, 12, 12, "F");
    doc.setTextColor(...palette.textLight);
    doc.setFontSize(16);
    doc.text("Child Profile Report", 24, 32);
    doc.setFontSize(30);
    doc.text(profile.avatar, 24, 50);
    doc.setFontSize(18);
    doc.text(profile.name, 42, 48);
    doc.setTextColor(...palette.textDark);
    y = 72;

    doc.setFontSize(16);
    doc.text(`${profile.name} (${profile.id.slice(0, 8)})`, 20, y);
    y += 10;
    doc.setFontSize(11);
    doc.text(`Level: ${Math.min(50, Math.floor(profile.xp / 100) + 1)}`, 20, y);
    y += 7;
    doc.text(`Stars: ${profile.stars} | XP: ${profile.xp} | Coins: ${profile.coins}`, 20, y);
    y += 7;
    doc.text(`Weekly grade: ${analytics.weeklySummary.grade}`, 20, y);
    y += 7;
    doc.text(`Weak areas: ${analytics.weakAreas.length ? analytics.weakAreas.join(", ") : "None"}`, 20, y);
    y += 10;
    doc.setFontSize(14);
    doc.text("Teacher Summary", 20, y);
    y += 8;
    doc.setFontSize(11);
    summaryLines.forEach((line) => {
      const wrapped = doc.splitTextToSize(line, 170);
      doc.text(wrapped, 20, y);
      y += wrapped.length * 6 + 2;
    });
    doc.text(`Recent events: ${history.length}`, 20, y);
    y += 8;

    const starsChart = await createLineChartImage(
      `${profile.name} stars`,
      analytics.starsPerDay.map((point) => ({ label: point.day.slice(5), value: point.stars })),
      palette.starsLineHex,
      {
        surface: palette.chartSurfaceHex,
        titleColor: palette.chartTitleHex,
        labelColor: palette.chartLabelHex,
        valueColor: palette.chartValueHex,
      }
    );
    if (starsChart) {
      doc.addImage(starsChart, "PNG", 18, y, 174, 60);
      y += 68;
    }

    const usageChart = await createBarChartImage(`${profile.name} activity usage`, [
      { label: "Spell", value: analytics.activityUsage.spelling, color: palette.usageBarHexes[0] },
      { label: "Math", value: analytics.activityUsage.math, color: palette.usageBarHexes[1] },
      { label: "Read", value: analytics.activityUsage.reading, color: palette.usageBarHexes[2] },
      { label: "Code", value: analytics.activityUsage.coding, color: palette.usageBarHexes[3] },
    ], {
      surface: palette.chartSurfaceHex,
      titleColor: palette.chartTitleHex,
      labelColor: palette.chartLabelHex,
      valueColor: palette.chartValueHex,
    });
    if (usageChart) {
      doc.addImage(usageChart, "PNG", 18, y, 174, 60);
      y += 68;
    }

    history.slice(-10).forEach((event) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(`${event.ts.slice(0, 10)} - ${event.activity} - ${event.correct ? "Correct" : "Try again"} - d${event.difficulty}`, 24, y);
      y += 6;
    });

    if (y > 248) {
      doc.addPage();
      doc.setFillColor(...palette.cardBackground);
      doc.rect(0, 0, 210, 297, "F");
      drawSignatureSection(doc, 36, palette.textDark);
    } else {
      drawSignatureSection(doc, y + 8, palette.textDark);
    }
  }

  if (profiles.length === 0 && Object.keys(allHistory).length === 0) {
    doc.addPage();
    doc.setTextColor(31, 42, 55);
    doc.text("No child histories found.", 20, 34);
  }

  drawFooter(doc);

  doc.save("starliz-family-history.pdf");
}
