import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated test artifacts and local runtime logs:
    "test-results/**",
    "playwright-report/**",
    "*.log",
    "*.tsbuildinfo",
    ".eslintcache",
    ".vercel/**",
    // Local / temporary artefacts (not committed):
    "tmp/**",
    ".dev-port-check.txt",
    "package.json.full-backup.json",
    "package.json.surgical-backup.json",
    "package.json.tmp.defect.json",
    "run-playable-report.mts",
    "scripts/_direct_storage_uat.mts",
    "scripts/_disposition_uat_draft.mts",
    "scripts/_oak_diagnose.mts",
    "scripts/uat/_tmp-*",
  ]),
]);

export default eslintConfig;
