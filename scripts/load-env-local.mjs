#!/usr/bin/env node
/**
 * Shared loader for local `.env.local` into process.env (does not print secret values).
 * Used by launch verification / UAT runners. Prefer `scripts/prisma_local.mjs` for Prisma CLI.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * @param {{ requiredKeys?: string[], override?: boolean }} [options]
 * @returns {{ loaded: boolean, source: string | null, presentKeys: string[] }}
 */
export function loadEnvLocal(options = {}) {
  const { requiredKeys = [], override = false } = options;
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    if (requiredKeys.length > 0) {
      throw new Error(
        `.env.local not found. Required keys (names only): ${requiredKeys.join(", ")}. ` +
          "Never commit .env.local. Never run prisma migrate reset on the launch database.",
      );
    }
    return { loaded: false, source: null, presentKeys: [] };
  }

  const presentKeys = [];
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
    presentKeys.push(key);
  }

  if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
    process.env.DIRECT_URL = process.env.DATABASE_URL;
  }

  for (const key of requiredKeys) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key} (value not printed).`);
    }
  }

  return { loaded: true, source: ".env.local", presentKeys };
}

/** CLI: node scripts/load-env-local.mjs --check DATABASE_URL */
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("load-env-local.mjs")) {
  try {
    const keys = process.argv.slice(2).filter((a) => a !== "--check");
    const state = loadEnvLocal({ requiredKeys: keys });
    process.stdout.write(
      `env_local=${state.loaded ? "loaded" : "missing"} keys_named=${state.presentKeys.length}\n`,
    );
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
