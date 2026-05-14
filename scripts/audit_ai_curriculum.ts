import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCurriculumCoverageReport } from "@/lib/curriculum";

const report = buildCurriculumCoverageReport();

const lines: string[] = [];
lines.push("# AI Curriculum Coverage Report");
lines.push("");
lines.push(`- Total paths: ${report.totalPaths}`);
lines.push(`- Fully wired: ${report.fullyWired}`);
lines.push(`- Partially wired: ${report.partiallyWired}`);
lines.push(`- Fallback only: ${report.fallbackOnly}`);
lines.push(`- Missing: ${report.missing}`);
lines.push("");

function section(title: string, status: "fully-wired" | "partially-wired" | "fallback-only" | "missing") {
  const rows = report.paths.filter((path) => path.status === status);
  lines.push(`## ${title} (${rows.length})`);
  if (!rows.length) {
    lines.push("- None");
    lines.push("");
    return;
  }
  for (const row of rows) {
    const notes = row.notes.length ? ` | notes: ${row.notes.join("; ")}` : "";
    lines.push(`- ${row.yearGroup} | ${row.keyStage} | age ${row.ageGroup} | ${row.subject} | ${row.skillFocus} | topics=${row.topicThemes.length}${notes}`);
  }
  lines.push("");
}

section("Fully Wired", "fully-wired");
section("Partially Wired", "partially-wired");
section("Fallback Only", "fallback-only");
section("Missing", "missing");

const outputPath = resolve(process.cwd(), "docs", "AI_CURRICULUM_COVERAGE_REPORT.md");
writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");

console.log(`AI curriculum coverage report written to ${outputPath}`);

if (report.missing > 0 || report.fallbackOnly > 0 || report.partiallyWired > 0) {
  console.error("Coverage audit failed: missing, fallback-only, or partially-wired paths detected.");
  process.exit(1);
}
