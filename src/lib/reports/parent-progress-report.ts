import jsPDF from "jspdf";
import { prisma } from "@/lib/db";
import { csvEscape } from "@/lib/csv_escape";
import { summarizeWalletTransactions } from "@/lib/wallet_ledger";
import { isGcseYearGroup } from "@/lib/curriculum";
import { parseWeakAreaMetadata } from "@/lib/weakAreas";

export type ParentReportRange = "7d" | "30d" | "90d" | "all";

const RANGE_TO_DAYS: Record<Exclude<ParentReportRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

type TopicStats = {
  topic: string;
  accuracy: number;
  attempts: number;
};

type ActivityPoint = {
  date: string;
  count: number;
};

export type ParentProgressReportData = {
  generatedAt: string;
  range: ParentReportRange;
  branding: {
    productName: string;
    reportName: string;
  };
  parent: {
    id: string;
    email: string;
    name: string;
  };
  child: {
    id: string;
    name: string;
    age: number | null;
    yearGroup: string | null;
    level: number;
  };
  summary: {
    totalAttempts: number;
    averageAccuracy: number;
    learningMode: string | null;
    lastActivityAt: string | null;
    revisionProgressPct: number | null;
    examReadinessPct: number | null;
    weakTopicCount: number;
    interventionTrackingCount: number;
  };
  strengths: TopicStats[];
  weakAreas: TopicStats[];
  activity: ActivityPoint[];
  rewards: {
    balancePence: number;
    earnedPence: number;
    spentPence: number;
  };
  recommendations: string[];
};

export type ParentProgressReportTable = {
  name: string;
  headers: string[];
  rows: Array<Array<string | number | boolean>>;
};

function toDateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getRangeStart(range: ParentReportRange): Date | null {
  if (range === "all") return null;
  const days = RANGE_TO_DAYS[range];
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function resolveLearningMode(modes: Array<string | null>): string | null {
  const counts = new Map<string, number>();
  for (const mode of modes) {
    if (!mode) continue;
    counts.set(mode, (counts.get(mode) ?? 0) + 1);
  }
  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
  return top?.[0] ?? null;
}

function buildTopicStats(attempts: Array<{ skillFocus: string; correct: boolean }>): TopicStats[] {
  const buckets = new Map<string, { total: number; correct: number }>();
  for (const attempt of attempts) {
    const key = attempt.skillFocus || "General";
    const existing = buckets.get(key) ?? { total: 0, correct: 0 };
    existing.total += 1;
    if (attempt.correct) existing.correct += 1;
    buckets.set(key, existing);
  }

  return Array.from(buckets.entries())
    .map(([topic, stats]) => ({
      topic,
      accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
      attempts: stats.total,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);
}

function buildActivity(attemptDates: Date[], range: ParentReportRange): ActivityPoint[] {
  const activityCounts = new Map<string, number>();
  for (const createdAt of attemptDates) {
    const key = toDateIso(createdAt);
    activityCounts.set(key, (activityCounts.get(key) ?? 0) + 1);
  }

  const windowDays = range === "all" ? 30 : RANGE_TO_DAYS[range];
  const now = new Date();
  const points: ActivityPoint[] = [];
  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = toDateIso(day);
    points.push({ date: key, count: activityCounts.get(key) ?? 0 });
  }
  return points;
}

function buildRecommendations(input: {
  averageAccuracy: number;
  weakAreas: TopicStats[];
  activity: ActivityPoint[];
  learningMode: string | null;
  isGcse: boolean;
  revisionProgressPct: number | null;
  examReadinessPct: number | null;
  interventionTrackingCount: number;
}): string[] {
  const recommendations: string[] = [];

  if (input.weakAreas.length > 0) {
    const topWeak = input.weakAreas[0];
    recommendations.push(`Prioritize 10-15 minutes daily on ${topWeak.topic} to lift confidence in this weak area.`);
  }

  if (input.averageAccuracy < 70) {
    recommendations.push("Reduce difficulty for one week and focus on accuracy before increasing pace.");
  } else if (input.averageAccuracy >= 85) {
    recommendations.push("Introduce stretch challenges to keep progress accelerating and prevent plateau.");
  } else {
    recommendations.push("Maintain current pace while adding one focused review session each week.");
  }

  const activeDays = input.activity.filter((point) => point.count > 0).length;
  if (activeDays < 3) {
    recommendations.push("Increase weekly consistency by scheduling at least 3 short learning sessions.");
  } else {
    recommendations.push("Consistency is strong; keep the same weekly learning rhythm.");
  }

  if (input.learningMode) {
    recommendations.push(`Current dominant learning mode is ${input.learningMode}; continue using it for reinforcement.`);
  }

  if (input.isGcse) {
    if (typeof input.revisionProgressPct === "number") {
      recommendations.push(`Revision progress is ${input.revisionProgressPct}%. Keep a weekly revision plan to improve exam readiness.`);
    }
    if (typeof input.examReadinessPct === "number") {
      recommendations.push(`Current exam readiness indicator is ${input.examReadinessPct}%. Prioritise mock-style practice on weak topics.`);
    }
    if (input.interventionTrackingCount > 0) {
      recommendations.push(`Intervention tracking shows ${input.interventionTrackingCount} active support signals. Review these areas this week.`);
    }
  }

  return recommendations.slice(0, 5);
}

export async function buildParentProgressReportData(input: {
  parentId: string;
  childId: string;
  range: ParentReportRange;
}): Promise<ParentProgressReportData> {
  const since = getRangeStart(input.range);

  const [parent, child] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.parentId },
      select: { id: true, email: true, name: true },
    }),
    prisma.childProfile.findFirst({
      where: { id: input.childId, parentId: input.parentId },
      select: { id: true, name: true, age: true, yearGroup: true, level: true, coins: true },
    }),
  ]);

  if (!parent || !child) {
    throw new Error("Child not found for this parent account.");
  }

  const [attempts, walletTransactions, assignments, weakAreaSignals] = await Promise.all([
    prisma.attempt.findMany({
      where: {
        studentId: child.id,
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      select: {
        skillFocus: true,
        correct: true,
        spellingMode: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 1200,
    }),
    prisma.walletTransaction.findMany({
      where: {
        childId: child.id,
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.assignment.findMany({
      where: {
        studentId: child.id,
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      select: { status: true },
      take: 600,
    }),
    prisma.weakArea.findMany({
      where: {
        studentId: child.id,
        status: "active",
        ...(since ? { lastDetectedAt: { gte: since } } : {}),
      },
      select: { metadataJson: true },
      take: 200,
    }),
  ]);

  const totalAttempts = attempts.length;
  const totalCorrect = attempts.filter((attempt) => attempt.correct).length;
  const averageAccuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  const topics = buildTopicStats(attempts.map((attempt) => ({
    skillFocus: attempt.skillFocus,
    correct: attempt.correct,
  })));
  const strengths = topics.filter((topic) => topic.accuracy >= 80).slice(0, 5);
  const weakAreas = topics.filter((topic) => topic.accuracy < 80).slice(0, 5);

  const activity = buildActivity(attempts.map((attempt) => attempt.createdAt), input.range);
  const learningMode = resolveLearningMode(attempts.map((attempt) => attempt.spellingMode));
  const lastActivityAt = attempts[0]?.createdAt?.toISOString() ?? null;

  const rewards = summarizeWalletTransactions(walletTransactions, child.coins);

  const isGcse = isGcseYearGroup(child.yearGroup);
  const revisionProgressPct = assignments.length
    ? Math.round((assignments.filter((entry) => entry.status === "completed").length / assignments.length) * 100)
    : null;
  const weakTopicCount = weakAreas.length;
  const interventionTrackingCount = weakAreaSignals.filter((entry) => {
    const intervention = parseWeakAreaMetadata(entry.metadataJson).intervention;
    return Boolean(intervention?.launchedAt) && !intervention?.completedAt;
  }).length;
  const examReadinessPct = isGcse
    ? Math.max(0, Math.min(100, Math.round((averageAccuracy * 0.7) + ((revisionProgressPct ?? 0) * 0.3) - weakTopicCount * 2)))
    : null;

  const recommendations = buildRecommendations({
    averageAccuracy,
    weakAreas,
    activity,
    learningMode,
    isGcse,
    revisionProgressPct,
    examReadinessPct,
    interventionTrackingCount,
  });

  return {
    generatedAt: new Date().toISOString(),
    range: input.range,
    branding: {
      productName: "StarLiz Academy",
      reportName: "Progress Report",
    },
    parent: {
      id: parent.id,
      email: parent.email,
      name: parent.name ?? "Parent",
    },
    child: {
      id: child.id,
      name: child.name,
      age: child.age,
      yearGroup: child.yearGroup,
      level: child.level,
    },
    summary: {
      totalAttempts,
      averageAccuracy,
      learningMode,
      lastActivityAt,
      revisionProgressPct,
      examReadinessPct,
      weakTopicCount,
      interventionTrackingCount,
    },
    strengths,
    weakAreas,
    activity,
    rewards: {
      balancePence: rewards.balance,
      earnedPence: rewards.totalEarned,
      spentPence: rewards.totalSpent,
    },
    recommendations,
  };
}

function drawHeader(doc: jsPDF, report: ParentProgressReportData) {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 595, 92, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text(report.branding.productName, 40, 44);
  doc.setFontSize(12);
  doc.text(`${report.branding.reportName} | ${report.range.toUpperCase()} range`, 40, 64);
  doc.text(`Generated: ${report.generatedAt.slice(0, 10)}`, 420, 64);
}

function drawSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.text(title, 40, y);
  doc.setDrawColor(203, 213, 225);
  doc.line(40, y + 6, 555, y + 6);
  return y + 22;
}

function drawTextLines(doc: jsPDF, lines: string[], y: number): number {
  doc.setFontSize(11);
  doc.setTextColor(51, 65, 85);
  let currentY = y;
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, 500);
    doc.text(wrapped, 40, currentY);
    currentY += wrapped.length * 14;
  }
  return currentY;
}

function formatCurrencyPence(value: number): string {
  return `GBP ${(value / 100).toFixed(2)}`;
}

function formatActivityDate(value: string): string {
  return value.slice(5);
}

function formatDateTime(value: string | null): string {
  if (!value) return "";
  return value.replace("T", " ").slice(0, 16);
}

function formatCurrency(value: number): string {
  return (value / 100).toFixed(2);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildParentProgressReportTables(report: ParentProgressReportData): ParentProgressReportTable[] {
  return [
    {
      name: "Summary",
      headers: ["field", "value"],
      rows: [
        ["generatedAt", report.generatedAt],
        ["range", report.range],
        ["parentName", report.parent.name],
        ["parentEmail", report.parent.email],
        ["childName", report.child.name],
        ["childId", report.child.id],
        ["yearGroup", report.child.yearGroup ?? ""],
        ["level", report.child.level],
        ["totalAttempts", report.summary.totalAttempts],
        ["averageAccuracy", report.summary.averageAccuracy],
        ["revisionProgressPct", report.summary.revisionProgressPct ?? ""],
        ["examReadinessPct", report.summary.examReadinessPct ?? ""],
        ["weakTopicCount", report.summary.weakTopicCount],
        ["interventionTrackingCount", report.summary.interventionTrackingCount],
        ["learningMode", report.summary.learningMode ?? ""],
        ["lastActivityAt", formatDateTime(report.summary.lastActivityAt)],
      ],
    },
    {
      name: "Strengths",
      headers: ["topic", "accuracy", "attempts"],
      rows: report.strengths.map((item) => [item.topic, item.accuracy, item.attempts]),
    },
    {
      name: "WeakAreas",
      headers: ["topic", "accuracy", "attempts"],
      rows: report.weakAreas.map((item) => [item.topic, item.accuracy, item.attempts]),
    },
    {
      name: "Activity",
      headers: ["date", "attemptCount"],
      rows: report.activity.map((item) => [item.date, item.count]),
    },
    {
      name: "Rewards",
      headers: ["metric", "value"],
      rows: [
        ["balanceGbp", formatCurrency(report.rewards.balancePence)],
        ["earnedGbp", formatCurrency(report.rewards.earnedPence)],
        ["spentGbp", formatCurrency(report.rewards.spentPence)],
      ],
    },
    {
      name: "Recommendations",
      headers: ["priority", "recommendation"],
      rows: report.recommendations.map((item, index) => [index + 1, item]),
    },
  ];
}

export function renderParentProgressReportCsv(report: ParentProgressReportData): string {
  const tables = buildParentProgressReportTables(report);
  const lines: string[] = [];

  for (const table of tables) {
    lines.push(csvEscape(table.name));
    lines.push(table.headers.map((header) => csvEscape(header)).join(","));
    for (const row of table.rows) {
      lines.push(row.map((cell) => csvEscape(cell)).join(","));
    }
    lines.push("");
  }

  return lines.join("\r\n");
}

export function renderParentProgressReportExcel(report: ParentProgressReportData): string {
  const tables = buildParentProgressReportTables(report);
  const sheets = tables
    .map((table) => {
      const headerRow = `<Row>${table.headers.map((header) => `<Cell><Data ss:Type="String">${escapeXml(header)}</Data></Cell>`).join("")}</Row>`;
      const dataRows = table.rows
        .map((row) => {
          const cells = row.map((cell) => {
            const isNumber = typeof cell === "number";
            const type = isNumber ? "Number" : "String";
            return `<Cell><Data ss:Type="${type}">${escapeXml(String(cell))}</Data></Cell>`;
          }).join("");
          return `<Row>${cells}</Row>`;
        })
        .join("");

      return `<Worksheet ss:Name="${escapeXml(table.name.slice(0, 31))}"><Table>${headerRow}${dataRows}</Table></Worksheet>`;
    })
    .join("");

  return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
${sheets}
</Workbook>`;
}

export function renderParentProgressReportPdf(report: ParentProgressReportData): ArrayBuffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  drawHeader(doc, report);

  let y = 124;
  y = drawSectionTitle(doc, "Child Summary", y);
  y = drawTextLines(doc, [
    `Child: ${report.child.name}`,
    `Parent: ${report.parent.name} (${report.parent.email})`,
    `Year Group: ${report.child.yearGroup ?? "Not set"} | Level: ${report.child.level}`,
    `Average Accuracy: ${report.summary.averageAccuracy}% | Attempts: ${report.summary.totalAttempts}`,
    `Last Activity: ${report.summary.lastActivityAt ? report.summary.lastActivityAt.replace("T", " ").slice(0, 16) : "No activity recorded"}`,
    `Learning Mode: ${report.summary.learningMode ?? "Standard"}`,
    `Revision Progress: ${report.summary.revisionProgressPct ?? "N/A"}% | Exam Readiness: ${report.summary.examReadinessPct ?? "N/A"}%`,
    `Weak Topics: ${report.summary.weakTopicCount} | Active Interventions: ${report.summary.interventionTrackingCount}`,
  ], y);

  y += 10;
  y = drawSectionTitle(doc, "Strengths", y);
  const strengthsLines = report.strengths.length
    ? report.strengths.map((item) => `${item.topic}: ${item.accuracy}% accuracy across ${item.attempts} attempts`)
    : ["No strengths available yet."];
  y = drawTextLines(doc, strengthsLines, y);

  y += 10;
  y = drawSectionTitle(doc, "Weak Areas", y);
  const weakLines = report.weakAreas.length
    ? report.weakAreas.map((item) => `${item.topic}: ${item.accuracy}% accuracy across ${item.attempts} attempts`)
    : ["No weak areas detected in this range."];
  y = drawTextLines(doc, weakLines, y);

  if (y > 700) {
    doc.addPage();
    drawHeader(doc, report);
    y = 124;
  }

  y += 10;
  y = drawSectionTitle(doc, "Activity and Rewards", y);
  const activityTotal = report.activity.reduce((total, point) => total + point.count, 0);
  const topDays = [...report.activity]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .filter((point) => point.count > 0)
    .map((point) => `${formatActivityDate(point.date)} (${point.count})`)
    .join(", ");
  y = drawTextLines(doc, [
    `Total activity points in chart window: ${activityTotal}`,
    `Most active days: ${topDays || "No activity recorded"}`,
    `Reward balance: ${formatCurrencyPence(report.rewards.balancePence)}`,
    `Rewards earned: ${formatCurrencyPence(report.rewards.earnedPence)} | Rewards spent: ${formatCurrencyPence(report.rewards.spentPence)}`,
  ], y);

  y += 10;
  y = drawSectionTitle(doc, "Recommendations", y);
  const recLines = report.recommendations.length
    ? report.recommendations.map((item, index) => `${index + 1}. ${item}`)
    : ["No recommendations generated yet."];
  y = drawTextLines(doc, recLines, y);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("StarLiz Academy | Parent Progress Report", 40, 820);
  doc.text("Page 1", 540, 820);

  return doc.output("arraybuffer");
}
