type ActivityType = "spelling" | "math" | "reading";

type BucketState = {
  usedIds: string[];
  queue: string[];
};

type HistoryFile = {
  version: number;
  buckets: Record<string, BucketState>;
};

const KEY = "starliz.questionHistory";

function readFile(): HistoryFile {
  if (typeof window === "undefined") return { version: 1, buckets: {} };
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return { version: 1, buckets: {} };
  try {
    const parsed = JSON.parse(raw) as HistoryFile;
    return parsed.buckets ? parsed : { version: 1, buckets: {} };
  } catch {
    return { version: 1, buckets: {} };
  }
}

function writeFile(file: HistoryFile): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(file));
}

function shuffle(values: string[]): string[] {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function getBucketKey(childId: string, activity: ActivityType, level: number): string {
  return `${childId}::${activity}::${level}`;
}

function getOrCreateBucket(file: HistoryFile, key: string): BucketState {
  if (!file.buckets[key]) {
    file.buckets[key] = { usedIds: [], queue: [] };
  }
  return file.buckets[key];
}

export function getNextQuestionId(params: {
  childId: string;
  activity: ActivityType;
  level: number;
  candidateIds: string[];
}): string | null {
  const { childId, activity, level, candidateIds } = params;
  if (!candidateIds.length) return null;

  const file = readFile();
  const bucket = getOrCreateBucket(file, getBucketKey(childId, activity, level));
  const allowed = new Set(candidateIds);

  bucket.usedIds = bucket.usedIds.filter((id) => allowed.has(id));
  bucket.queue = bucket.queue.filter((id) => allowed.has(id));

  if (!bucket.queue.length) {
    let unused = candidateIds.filter((id) => !bucket.usedIds.includes(id));
    if (!unused.length) {
      bucket.usedIds = [];
      unused = [...candidateIds];
    }
    bucket.queue = shuffle(unused);
  }

  writeFile(file);
  return bucket.queue[0] ?? null;
}

export function markQuestionCompleted(params: {
  childId: string;
  activity: ActivityType;
  level: number;
  questionId: string;
}): void {
  const { childId, activity, level, questionId } = params;
  const file = readFile();
  const bucket = getOrCreateBucket(file, getBucketKey(childId, activity, level));

  if (!bucket.usedIds.includes(questionId)) {
    bucket.usedIds.push(questionId);
  }

  bucket.queue = bucket.queue.filter((id) => id !== questionId);
  writeFile(file);
}
