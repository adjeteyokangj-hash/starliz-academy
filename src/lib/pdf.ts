import jsPDF from "jspdf";
import { ChildProfile } from "@/lib/store";
import { buildParentAnalytics } from "@/lib/analytics";
import { createBarChartImage, createLineChartImage } from "@/lib/chart_images";
import { getTeacherSummary } from "@/lib/report_narrative";
import { getReportThemePalette } from "@/lib/report_theme";
import { fetchProfileHistory } from "@/lib/progress_data";

function toPdfSafeText(value: string): string {
  return value
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
    .trim();
}

function drawSignatureSection(doc: jsPDF, y: number): number {
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

function drawFooter(doc: jsPDF, label: string, textColor: [number, number, number]): void {
  const pages = doc.getNumberOfPages();
  const today = new Date().toISOString().slice(0, 10);
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setTextColor(...textColor);
    doc.setFontSize(9);
    doc.text(`${label} | Generated ${today}`, 20, 289);
    doc.text(`Page ${page}/${pages}`, 176, 289);
  }
}

export async function exportWeeklyReportPdf(profile: ChildProfile): Promise<void> {
  const history = await fetchProfileHistory(profile.id);
  const analytics = buildParentAnalytics(profile, history);
  const doc = new jsPDF();
  const summaryLines = getTeacherSummary(profile, history).map(toPdfSafeText);
  const palette = getReportThemePalette(profile.theme);
  const safeName = toPdfSafeText(profile.name) || "Learner";
  const starsChart = await createLineChartImage(
    "Stars Trend",
    analytics.starsPerDay.map((point) => ({ label: point.day.slice(5), value: point.stars })),
    palette.starsLineHex,
    {
      surface: palette.chartSurfaceHex,
      titleColor: palette.chartTitleHex,
      labelColor: palette.chartLabelHex,
      valueColor: palette.chartValueHex,
    }
  );
  const usageChart = await createBarChartImage("Activity Usage", [
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

  doc.setFillColor(...palette.coverBackground);
  doc.rect(0, 0, 210, 297, "F");
  doc.setFillColor(...palette.cardBackground);
  doc.roundedRect(18, 22, 174, 252, 14, 14, "F");
  doc.setFontSize(26);
  doc.setTextColor(...palette.textDark);
  doc.text("StarLiz Academy", 26, 42);
  doc.setFontSize(11);
  doc.text("StarLiz Academy", 26, 49);
  doc.setFontSize(16);
  doc.text("Weekly Learning Report", 26, 58);
  doc.setFontSize(11);
  doc.text("Learner Avatar: selected", 26, 76);
  doc.setFontSize(18);
  doc.text(safeName, 26, 86);
  doc.setFontSize(12);
  doc.text(`Learn. Play. Grow.`, 26, 92);
  doc.setDrawColor(...palette.line);
  doc.line(26, 100, 184, 100);
  doc.setFontSize(12);
  doc.text(`Level ${Math.min(50, Math.floor(profile.xp / 100) + 1)} | ${profile.stars} stars | ${profile.coins} coins`, 26, 112);
  doc.text(`Weekly grade: ${analytics.weeklySummary.grade}`, 26, 120);
  doc.text(`Weak areas: ${analytics.weakAreas.length ? analytics.weakAreas.join(", ") : "None"}`, 26, 128);
  doc.setFontSize(15);
  doc.text("Teacher Summary", 26, 146);
  doc.setFontSize(11);
  let coverY = 156;
  summaryLines.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, 156);
    doc.text(wrapped, 26, coverY);
    coverY += wrapped.length * 6 + 4;
  });
  drawSignatureSection(doc, Math.min(238, coverY + 6));

  doc.addPage();
  doc.setFillColor(...palette.cardBackground);
  doc.rect(0, 0, 210, 297, "F");
  doc.setTextColor(...palette.textDark);
  doc.setFontSize(22);
  doc.text("Progress Snapshot", 20, 20);
  doc.setFontSize(12);
  doc.text(`Child: ${safeName}`, 20, 32);
  doc.text(`Level: ${Math.min(50, Math.floor(profile.xp / 100) + 1)}`, 20, 40);
  doc.text(`Stars: ${profile.stars}`, 20, 48);
  doc.text(`Coins: ${profile.coins}`, 20, 56);

  doc.setFontSize(14);
  doc.text("Weekly Summary", 20, 72);
  doc.setFontSize(11);
  doc.text(`Completed activities: ${analytics.weeklySummary.completed}`, 20, 82);
  doc.text(`Average accuracy: ${Math.round(analytics.weeklySummary.averageAccuracy * 100)}%`, 20, 90);
  doc.text(`Grade: ${analytics.weeklySummary.grade}`, 20, 98);
  doc.text(`Weak areas: ${analytics.weakAreas.length ? analytics.weakAreas.join(", ") : "None"}`, 20, 106);
  doc.setFontSize(14);
  doc.text("Teacher Notes", 110, 72);
  doc.setFontSize(11);
  let noteY = 82;
  summaryLines.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, 78);
    doc.text(wrapped, 110, noteY);
    noteY += wrapped.length * 6 + 2;
  });

  if (starsChart) {
    doc.addImage(starsChart, "PNG", 18, 114, 174, 68);
  }

  if (usageChart) {
    doc.addPage();
    doc.setFontSize(16);
    doc.text("Activity Usage", 20, 20);
    doc.addImage(usageChart, "PNG", 18, 28, 174, 68);
  }

  doc.setFontSize(14);
  doc.text("Stars Per Day Data", 20, usageChart ? 112 : 196);
  let y = usageChart ? 122 : 206;
  analytics.starsPerDay.forEach((point) => {
    doc.setFontSize(11);
    doc.text(toPdfSafeText(`${point.day}: ${point.stars} stars`), 24, y);
    y += 8;
  });

  if (y > 248) {
    doc.addPage();
    doc.setFillColor(...palette.cardBackground);
    doc.rect(0, 0, 210, 297, "F");
    doc.setTextColor(...palette.textDark);
    drawSignatureSection(doc, 36);
  } else {
    drawSignatureSection(doc, y + 8);
  }

  drawFooter(doc, `${palette.footerLabel} | StarLiz Academy`, palette.mutedText);

  doc.save(`starliz-weekly-report-${safeName.toLowerCase().replace(/\s+/g, "-")}.pdf`);
}
