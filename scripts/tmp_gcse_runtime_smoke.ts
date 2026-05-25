import {
  ageGroupForYearGroup,
  subjectsForYearGroup,
  skillsForSubjectAndYear,
  topicSuggestionsForSelection,
  type Subject,
} from "../src/lib/curriculum";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

type SmokeResult = {
  yearGroup: string;
  subject: string;
  ok: boolean;
  status: number;
  message: string;
  attempts: number;
};

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3001";
const YEAR_GROUPS = ["Year 10", "Year 11"] as const;
const HEALTH_WAIT_MS = Number(process.env.SMOKE_HEALTH_WAIT_MS ?? 90_000);
const HEALTH_POLL_MS = Number(process.env.SMOKE_HEALTH_POLL_MS ?? 1_000);
const REQUEST_RETRIES = Math.max(1, Number(process.env.SMOKE_REQUEST_RETRIES ?? 3));
const RETRY_BACKOFF_MS = Math.max(100, Number(process.env.SMOKE_RETRY_BACKOFF_MS ?? 1_000));
const STATUS_RETRIES = Math.max(1, Number(process.env.SMOKE_STATUS_RETRIES ?? 3));
const REQUEST_SPACING_MS = Math.max(0, Number(process.env.SMOKE_REQUEST_SPACING_MS ?? 9_000));
const YEAR_GROUP_PAUSE_MS = Math.max(0, Number(process.env.SMOKE_YEAR_GROUP_PAUSE_MS ?? 120_000));
const AUTO_START_DEV = String(process.env.SMOKE_AUTO_START_DEV ?? "1").trim() !== "0";
const IGNORE_EXISTING_SERVER = String(process.env.SMOKE_IGNORE_EXISTING_SERVER ?? "0").trim() === "1";
const REPLACE_LOCKED_DEV_SERVER = String(process.env.SMOKE_REPLACE_LOCKED_DEV_SERVER ?? "0").trim() === "1";
const DEV_ADMIN_FALLBACK_ENABLED = String(process.env.STARLIZ_ENABLE_DEV_ADMIN_FALLBACK ?? "true").trim();
const DEV_ADMIN_EMAIL = String(process.env.STARLIZ_DEV_ADMIN_EMAIL ?? "adjeteyokangj@gmail.com").trim();
const LOCAL_FALLBACK_URLS = ["http://127.0.0.1:3000", "http://localhost:3000", "http://127.0.0.1:3001", "http://localhost:3001"];

let spawnedDevServer: ChildProcess | null = null;

function toLabel(value: string): string {
  return value.replace(/^gcse-/, "GCSE ").replace(/-/g, " ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function basePortFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  } catch {
    return "3001";
  }
}

function candidateUrls(baseUrl: string): string[] {
  const normalized = baseUrl.replace(/\/+$/, "");
  const set = new Set<string>([normalized, ...LOCAL_FALLBACK_URLS]);
  return Array.from(set);
}

function tryReadLock(): { appUrl: string | null; pid: number | null } {
  const lockPath = `${process.cwd()}\\.next\\dev\\lock`;
  if (!existsSync(lockPath)) return { appUrl: null, pid: null };
  try {
    const raw = readFileSync(lockPath, "utf8");
    const parsed = JSON.parse(raw) as { appUrl?: unknown; pid?: unknown };
    const appUrl = typeof parsed.appUrl === "string" && parsed.appUrl.trim() ? parsed.appUrl.trim() : null;
    const pid = typeof parsed.pid === "number" && Number.isFinite(parsed.pid) ? parsed.pid : null;
    return { appUrl, pid };
  } catch {
    return { appUrl: null, pid: null };
  }
}

function stopLockedDevServerIfRequested(): void {
  if (!REPLACE_LOCKED_DEV_SERVER) return;
  const lock = tryReadLock();
  if (!lock.pid) return;
  try {
    process.kill(lock.pid);
    console.log(`Stopped locked Next dev server PID ${lock.pid}.`);
  } catch {
    // Ignore if process is already gone or inaccessible.
  }
}

async function checkHealth(baseUrl: string): Promise<{ ok: boolean; status: number; endpoint: string; message: string }> {
  const endpoints = ["/api/health", "/"];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, { method: "GET" });
      if (response.status >= 200 && response.status < 500) {
        return { ok: true, status: response.status, endpoint, message: "reachable" };
      }
      return { ok: false, status: response.status, endpoint, message: `HTTP ${response.status}` };
    } catch {
      continue;
    }
  }
  return { ok: false, status: 0, endpoint: "(none)", message: "unreachable" };
}

async function waitForHealthy(baseUrl: string, waitMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < waitMs) {
    const health = await checkHealth(baseUrl);
    if (health.ok) {
      console.log(`Health ready: ${health.endpoint} (${health.status})`);
      return;
    }
    await sleep(HEALTH_POLL_MS);
  }
  throw new Error(`Server not healthy at ${baseUrl} after ${waitMs}ms`);
}

async function resolveReachableUrl(baseUrl: string): Promise<string | null> {
  const lockUrl = tryReadLock().appUrl;
  const targets = lockUrl ? [lockUrl, ...candidateUrls(baseUrl)] : candidateUrls(baseUrl);
  for (const target of targets) {
    const health = await checkHealth(target);
    if (health.ok) {
      console.log(`Using existing server at ${target} via ${health.endpoint} (${health.status}).`);
      return target;
    }
  }
  return null;
}

async function ensureServer(baseUrl: string): Promise<string> {
  if (!IGNORE_EXISTING_SERVER) {
    const existingUrl = await resolveReachableUrl(baseUrl);
    if (existingUrl) return existingUrl;
  }

  if (!AUTO_START_DEV) {
    throw new Error(`Server unreachable at ${baseUrl} and SMOKE_AUTO_START_DEV=0.`);
  }

  stopLockedDevServerIfRequested();

  const port = basePortFromUrl(baseUrl);
  console.log(`Server not reachable at ${baseUrl}. Starting dev server on port ${port}...`);
  spawnedDevServer = spawn("npm", ["run", "dev"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: port,
      STARLIZ_ENABLE_DEV_ADMIN_FALLBACK: DEV_ADMIN_FALLBACK_ENABLED,
      STARLIZ_DEV_ADMIN_EMAIL: DEV_ADMIN_EMAIL,
    },
    shell: true,
    stdio: "ignore",
  });

  await waitForHealthy(baseUrl, HEALTH_WAIT_MS);
  return baseUrl;
}

function stopSpawnedServer(): void {
  if (!spawnedDevServer) return;
  if (!spawnedDevServer.killed) {
    try {
      spawnedDevServer.kill();
    } catch {
      // Ignore cleanup failures in smoke script.
    }
  }
  spawnedDevServer = null;
}

async function requestWithRetry(url: string, init: RequestInit): Promise<{ response: Response | null; attempts: number; error: string | null }> {
  let lastError = "request failed";
  for (let attempt = 1; attempt <= REQUEST_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, init);
      return { response, attempts: attempt, error: null };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "request failed";
      if (attempt < REQUEST_RETRIES) {
        await sleep(RETRY_BACKOFF_MS * attempt);
      }
    }
  }
  return { response: null, attempts: REQUEST_RETRIES, error: lastError };
}

async function requestGenerateWithRetries(url: string, body: Record<string, unknown>): Promise<{ response: Response | null; payload: Record<string, unknown> | null; attempts: number; message: string | null }> {
  let lastMessage: string | null = null;

  for (let statusAttempt = 1; statusAttempt <= STATUS_RETRIES; statusAttempt += 1) {
    if (statusAttempt > 1) {
      console.log(`RETRY | waiting before attempt ${statusAttempt}/${STATUS_RETRIES}`);
    }

    const requestResult = await requestWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!requestResult.response) {
      lastMessage = requestResult.error ?? "request failed";
      continue;
    }

    const payload = await requestResult.response.json().catch(() => ({} as Record<string, unknown>));
    if (requestResult.response.status !== 429) {
      return {
        response: requestResult.response,
        payload,
        attempts: requestResult.attempts,
        message: null,
      };
    }

    const retryAfterHeader = Number(requestResult.response.headers.get("retry-after") ?? "0");
    const retryAfterMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
      ? retryAfterHeader * 1000
      : Math.max(60_000, RETRY_BACKOFF_MS * statusAttempt);
    lastMessage = (payload as { error?: string; message?: string }).error
      ?? (payload as { message?: string }).message
      ?? "Rate limit reached";

    console.log(`RATE LIMIT | HTTP 429 | attempt ${statusAttempt}/${STATUS_RETRIES} | waiting ${Math.round(retryAfterMs / 1000)}s before retry`);

    if (statusAttempt < STATUS_RETRIES) {
      await sleep(retryAfterMs);
    }
  }

  return {
    response: null,
    payload: null,
    attempts: STATUS_RETRIES,
    message: lastMessage ?? "request failed",
  };
}

function printMatrix(results: SmokeResult[]): void {
  const byYear = new Map<string, SmokeResult[]>();
  for (const result of results) {
    const current = byYear.get(result.yearGroup) ?? [];
    current.push(result);
    byYear.set(result.yearGroup, current);
  }

  for (const [year, rows] of byYear.entries()) {
    console.log(`\n=== ${year} ===`);
    for (const row of rows) {
      const marker = row.ok ? "PASS" : "FAIL";
      console.log(`${marker} | ${toLabel(row.subject).padEnd(36)} | status=${String(row.status).padEnd(3)} | attempts=${row.attempts} | ${row.message}`);
    }
  }
}

async function run(): Promise<void> {
  const targetBaseUrl = await ensureServer(BASE_URL);

  const results: SmokeResult[] = [];

  for (let yearIndex = 0; yearIndex < YEAR_GROUPS.length; yearIndex += 1) {
    const yearGroup = YEAR_GROUPS[yearIndex];
    console.log(`\n=== Starting ${yearGroup} batch ===`);

    const jobs: Array<{ yearGroup: string; subject: Subject }> = [];
    const gcseSubjects = subjectsForYearGroup(yearGroup).filter((subject) => subject.startsWith("gcse-"));
    for (const subject of gcseSubjects) {
      jobs.push({ yearGroup, subject });
    }

    const seen = new Set<string>();
    const uniqueJobs = jobs.filter((job) => {
      const key = `${job.yearGroup}|${job.subject}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    for (const job of uniqueJobs) {
      const keyStage = "KS4";
      const ageGroup = ageGroupForYearGroup(job.yearGroup);
      const skillSourceSubject: Subject = job.subject === "gcse-english" ? "gcse-english-language" : job.subject;
      const skills = skillsForSubjectAndYear(skillSourceSubject, job.yearGroup);
      const skillFocus = skills[0] ?? "Core";
      const topics = topicSuggestionsForSelection({
        yearGroup: job.yearGroup,
        subject: job.subject,
        skillFocus,
      });
      const topic = topics[0] ?? `${toLabel(job.subject)} practice`;

      const englishStrand = (job.subject === "gcse-english" || job.subject === "gcse-english-language") ? "reading" : undefined;
      const body = {
        subject: job.subject,
        keyStage,
        yearGroup: job.yearGroup,
        curriculumPathway: "gcse",
        curriculumFramework: "National Curriculum England",
        countryRegion: "UK",
        examBoard: "AQA",
        examBoardSource: "manual",
        ageGroup,
        skillFocus,
        difficulty: 4,
        numberOfItems: 2,
        topic,
        englishStrand,
        aiMode: "fallback_only",
        aiVisualGenerationEnabled: false,
        visualGenerationMode: "none",
        maxVisualsPerLesson: 0,
        visualAllowedSubjects: [job.subject],
        requireVisualApproval: true,
      };

      const requestResult = await requestGenerateWithRetries(`${targetBaseUrl}/api/admin/ai/generate`, body);

      if (!requestResult.response || !requestResult.payload) {
        const row = {
          yearGroup: job.yearGroup,
          subject: job.subject,
          ok: false,
          status: 0,
          message: requestResult.message ?? "request failed",
          attempts: requestResult.attempts,
        };
        results.push(row);
        console.log(`LIVE | FAIL | ${row.yearGroup} | ${toLabel(row.subject)} | status=${row.status} | attempts=${row.attempts} | ${row.message}`);
        if (REQUEST_SPACING_MS > 0) {
          await sleep(REQUEST_SPACING_MS);
        }
        continue;
      }

      try {
        const response = requestResult.response;
        const payload = requestResult.payload;
        const ok = Boolean(response.ok && payload && (payload as { success?: boolean }).success !== false);
        const row = {
          yearGroup: job.yearGroup,
          subject: job.subject,
          ok,
          status: response.status,
          message: (payload as { error?: string; message?: string }).error
            ?? (payload as { message?: string }).message
            ?? (ok ? "ok" : "failed"),
          attempts: requestResult.attempts,
        };
        results.push(row);
        console.log(`LIVE | ${row.ok ? "PASS" : "FAIL"} | ${row.yearGroup} | ${toLabel(row.subject)} | status=${row.status} | attempts=${row.attempts} | ${row.message}`);
      } catch (error) {
        const row = {
          yearGroup: job.yearGroup,
          subject: job.subject,
          ok: false,
          status: 0,
          message: error instanceof Error ? error.message : "request failed",
          attempts: requestResult.attempts,
        };
        results.push(row);
        console.log(`LIVE | FAIL | ${row.yearGroup} | ${toLabel(row.subject)} | status=${row.status} | attempts=${row.attempts} | ${row.message}`);
      }

      if (REQUEST_SPACING_MS > 0) {
        await sleep(REQUEST_SPACING_MS);
      }
    }

    if (yearIndex < YEAR_GROUPS.length - 1 && YEAR_GROUP_PAUSE_MS > 0) {
      console.log(`\nPAUSE | completed ${yearGroup} batch | waiting ${Math.round(YEAR_GROUP_PAUSE_MS / 1000)}s before next year group`);
      await sleep(YEAR_GROUP_PAUSE_MS);
    }
  }

  const passed = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);

  console.log(`\nGCSE runtime smoke summary: ${passed.length}/${results.length} passed`);
  printMatrix(results);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error("Smoke script crashed:", error);
  process.exitCode = 1;
}).finally(() => {
  stopSpawnedServer();
});
