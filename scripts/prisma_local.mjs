#!/usr/bin/env node

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { spawn } from "child_process";

const ENV_FILE = resolve(process.cwd(), ".env.local");

function parseEnvFile(content) {
  const values = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function normalizePgUrl(rawUrl) {
  if (!rawUrl) return rawUrl;

  const match = rawUrl.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.+)@(.+)$/i);
  if (!match) return rawUrl;

  const [, scheme, user, password, rest] = match;
  return `${scheme}${user}:${encodeURIComponent(password)}@${rest}`;
}

function loadLocalPrismaEnv() {
  if (!existsSync(ENV_FILE)) {
    throw new Error(".env.local not found. Prisma local helper requires a local environment file.");
  }

  const parsedEnv = parseEnvFile(readFileSync(ENV_FILE, "utf8"));
  const databaseUrl = normalizePgUrl(parsedEnv.DATABASE_URL);
  const directUrl = normalizePgUrl(parsedEnv.DIRECT_URL);

  if (!databaseUrl || !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error("DATABASE_URL is missing or invalid in .env.local.");
  }

  process.env.DATABASE_URL = databaseUrl;
  if (directUrl) {
    process.env.DIRECT_URL = directUrl;
  }

  return {
    source: ".env.local",
    hasDirectUrl: Boolean(directUrl),
  };
}

function resolvePrismaArgs(inputArgs) {
  const [command = "studio", ...rest] = inputArgs;

  if (command === "studio") return ["prisma", "studio", ...rest];
  if (command === "pull") return ["prisma", "db", "pull", ...rest];
  if (command === "generate") return ["prisma", "generate", ...rest];

  return ["prisma", command, ...rest];
}

async function main() {
  const envState = loadLocalPrismaEnv();
  const prismaArgs = resolvePrismaArgs(process.argv.slice(2));

  process.stdout.write(
    `Loaded Prisma env from ${envState.source} (DATABASE_URL: set, DIRECT_URL: ${envState.hasDirectUrl ? "set" : "not set"})\n`,
  );

  const child = spawn("npx", prismaArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  child.on("exit", (code) => {
    process.exit(code ?? 1);
  });

  child.on("error", (error) => {
    console.error(error.message);
    process.exit(1);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});