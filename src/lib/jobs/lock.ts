const activeLocks = new Set<string>();

export async function withJobLock<T>(name: string, run: () => Promise<T>) {
  if (activeLocks.has(name)) {
    return { skipped: true as const, reason: "already_running" };
  }

  activeLocks.add(name);
  try {
    const result = await run();
    return { skipped: false as const, result };
  } finally {
    activeLocks.delete(name);
  }
}
