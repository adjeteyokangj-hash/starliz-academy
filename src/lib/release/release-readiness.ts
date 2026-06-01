export type ReleaseReadinessItem = {
  id: string;
  title: string;
  phase: string;
  blocking: boolean;
  command: string;
  docPath: string;
};

export function getReleaseReadinessItems(): ReleaseReadinessItem[] {
  return [
    {
      id: "release-qa",
      title: "Opt-in release QA journeys",
      phase: "Phase 6",
      blocking: true,
      command: "E2E_RELEASE_QA=1 playwright test tests/e2e/release-qa-foundation.spec.ts",
      docPath: "docs/RELEASE_QA_CHECKLIST_PHASE6.md",
    },
    {
      id: "ops-checklist",
      title: "Release operations checklist",
      phase: "Phase 7",
      blocking: true,
      command: "Review docs/ops/RELEASE_OPERATIONS_CHECKLIST.md before release window",
      docPath: "docs/ops/RELEASE_OPERATIONS_CHECKLIST.md",
    },
    {
      id: "final-smoke",
      title: "Opt-in final smoke",
      phase: "Phase 9",
      blocking: true,
      command: "E2E_FINAL_SMOKE=1 npm run test:e2e:final-smoke",
      docPath: "docs/FINAL_SMOKE_CHECKLIST_PHASE9.md",
    },
    {
      id: "launch-env-audit",
      title: "Launch environment audit",
      phase: "Phase 10",
      blocking: true,
      command: "npm run audit:launch-env",
      docPath: "docs/LAUNCH_ENV_AUDIT_PHASE10.md",
    },
    {
      id: "route-smoke",
      title: "Route smoke baseline",
      phase: "Foundation",
      blocking: true,
      command: "npm run smoke:routes",
      docPath: "docs/ops/RELEASE_OPERATIONS_CHECKLIST.md",
    },
  ];
}

export function buildReleaseReadinessReport(): string {
  const lines = ["StarLiz release readiness report", ""];

  for (const item of getReleaseReadinessItems()) {
    lines.push(`[${item.blocking ? "BLOCKING" : "INFO"}] ${item.phase} - ${item.title}`);
    lines.push(`  command: ${item.command}`);
    lines.push(`  doc: ${item.docPath}`);
    lines.push("");
  }

  return lines.join("\n");
}