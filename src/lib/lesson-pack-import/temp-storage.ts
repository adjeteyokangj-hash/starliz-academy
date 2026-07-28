import { randomUUID } from "node:crypto";
import { createWriteStream, createReadStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";

const UPLOAD_DIR_PREFIX = "starliz-lesson-import-";
const RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

function baseDir(): string {
  return process.env.LESSON_PACK_TEMP_DIR?.trim() || join(tmpdir(), "starliz-lesson-imports");
}

export type TempUploadSession = {
  sessionId: string;
  dir: string;
};

export async function createUploadSession(): Promise<TempUploadSession> {
  const sessionId = randomUUID().replace(/-/g, "");
  const dir = join(baseDir(), `${UPLOAD_DIR_PREFIX}${sessionId}`);
  await mkdir(dir, { recursive: true });
  return { sessionId, dir };
}

export async function writeStreamToTemp(
  session: TempUploadSession,
  fileName: string,
  stream: Readable,
  maxBytes: number,
): Promise<{ filePath: string; bytesWritten: number }> {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
  const filePath = join(session.dir, `${Date.now()}-${safeFileName}`);
  let bytesWritten = 0;

  return new Promise((resolve, reject) => {
    const ws = createWriteStream(filePath);
    stream.on("data", (chunk: Buffer) => {
      bytesWritten += chunk.length;
      if (bytesWritten > maxBytes) {
        stream.destroy();
        ws.destroy();
        rm(filePath, { force: true }).catch(() => {});
        reject(new Error(`File exceeds ${Math.round(maxBytes / (1024 * 1024))}MB limit`));
        return;
      }
      ws.write(chunk);
    });
    stream.on("end", () => {
      ws.end(() => resolve({ filePath, bytesWritten }));
    });
    stream.on("error", (err) => {
      ws.destroy();
      rm(filePath, { force: true }).catch(() => {});
      reject(err);
    });
  });
}

export function readTempFile(filePath: string): Readable {
  return createReadStream(filePath);
}

export async function readTempFileBuffer(filePath: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export async function cleanupSession(session: TempUploadSession): Promise<void> {
  try {
    await rm(session.dir, { recursive: true, force: true });
  } catch {
    // Best effort
  }
}

export async function cleanupExpiredSessions(): Promise<number> {
  const base = baseDir();
  let cleaned = 0;
  try {
    const entries = await readdir(base);
    const now = Date.now();
    for (const entry of entries) {
      if (!entry.startsWith(UPLOAD_DIR_PREFIX)) continue;
      const entryPath = join(base, entry);
      try {
        const st = await stat(entryPath);
        if (now - st.mtimeMs > RETENTION_MS) {
          await rm(entryPath, { recursive: true, force: true });
          cleaned++;
        }
      } catch {
        // Entry may have been removed concurrently
      }
    }
  } catch {
    // Base dir may not exist yet
  }
  return cleaned;
}
