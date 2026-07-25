/**
 * Load `.env.local` into process.env without printing secret values.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnvLocal(options?: { requiredKeys?: string[]; override?: boolean }): {
  loaded: boolean;
  presentKeyCount: number;
} {
  const requiredKeys = options?.requiredKeys ?? [];
  const override = options?.override ?? false;
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    const present = new Set<string>();
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (override || process.env[key] === undefined) process.env[key] = val;
      present.add(key);
    }
    if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
      process.env.DIRECT_URL = process.env.DATABASE_URL;
    }
    for (const key of requiredKeys) {
      if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${key} (value not printed).`);
      }
    }
    return { loaded: true, presentKeyCount: present.size };
  } catch (error) {
    if (requiredKeys.length > 0) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    return { loaded: false, presentKeyCount: 0 };
  }
}
