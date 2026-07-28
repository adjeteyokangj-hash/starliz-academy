import { randomBytes } from "crypto";
import { existsSync, readFileSync, appendFileSync } from "fs";

const envPath = ".env.local";
if (!existsSync(envPath)) {
  console.log("NO_ENV_LOCAL");
  process.exit(1);
}
const raw = readFileSync(envPath, "utf8");
const hasCron = /(^|\n)\s*CRON_SECRET\s*=\s*\S+/.test(raw);
const hasEmailFrom = /(^|\n)\s*EMAIL_FROM\s*=\s*\S+/.test(raw);
const additions: string[] = [];
if (!hasCron) {
  const secret = randomBytes(32).toString("hex");
  additions.push(`CRON_SECRET=${secret}`);
}
if (!hasEmailFrom) {
  additions.push(`EMAIL_FROM="StarLiz Academy <onboarding@resend.dev>"`);
}
if (additions.length === 0) {
  console.log("ENV_PATCH=noop cron=present email_from=present");
  process.exit(0);
}
const suffix = (raw.endsWith("\n") ? "" : "\n") + "\n# Launch readiness remediation (" + new Date().toISOString().slice(0,10) + ")\n" + additions.join("\n") + "\n";
appendFileSync(envPath, suffix, "utf8");
console.log("ENV_PATCH=applied cron=" + (hasCron ? "kept" : "added") + " email_from=" + (hasEmailFrom ? "kept" : "added"));