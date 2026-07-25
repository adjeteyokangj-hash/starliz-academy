const fs = require("fs");
const { spawnSync } = require("child_process");

/** @deprecated Prefer scripts/prisma_local.mjs via npm run prisma:local:* — never migrate reset. */

const envPath = ".env.local";
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1].trim()] = v;
  }
}
if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

const args = process.argv.slice(2);
const r = spawnSync("npx", ["prisma", ...args], {
  env: process.env,
  shell: true,
  encoding: "utf8",
});
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
process.exit(r.status ?? 1);
