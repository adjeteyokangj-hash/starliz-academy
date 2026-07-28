import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
const keys = [
  "DATABASE_URL","DIRECT_URL","OPENAI_API_KEY",
  "STRIPE_SECRET_KEY","STRIPE_WEBHOOK_SECRET","NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_MONTHLY_PRICE_ID","STRIPE_YEARLY_PRICE_ID","STRIPE_PUBLISHABLE_KEY",
  "BILLING_ENABLE_STRIPE","CRON_SECRET",
  "NEXTAUTH_SECRET","AUTH_SECRET","SESSION_SECRET",
  "NEXT_PUBLIC_APP_URL","APP_URL","RESEND_API_KEY","EMAIL_FROM",
  "SENTRY_DSN","MONITORING_DSN","BACKUP_PROVIDER"
];
for (const k of keys) {
  const v = (process.env[k] ?? "").trim();
  const present = v.length > 0;
  let hint = "";
  if (present) {
    if (k === "STRIPE_SECRET_KEY") hint = v.startsWith("sk_test") ? ":test" : v.startsWith("sk_live") ? ":live" : ":other";
    if (k === "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" || k === "STRIPE_PUBLISHABLE_KEY") hint = v.startsWith("pk_test") ? ":test" : v.startsWith("pk_live") ? ":live" : ":other";
    if (k === "STRIPE_WEBHOOK_SECRET") hint = v.startsWith("whsec_") ? ":whsec" : ":other";
    if (k === "BILLING_ENABLE_STRIPE") hint = ":" + v.toLowerCase();
    if (k.includes("PRICE_ID")) hint = ":price_id";
  }
  console.log(k + "=" + (present ? ("present:len=" + v.length + hint) : "MISSING"));
}