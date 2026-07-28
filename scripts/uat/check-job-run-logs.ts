import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
const jobs = ["tutor-presence-sweep", "short-learning-lifecycle", "short-learning-reminders"];
async function main() {
  for (const jobName of jobs) {
    const last = await prisma.jobRunLog.findFirst({
      where: { jobName },
      orderBy: { startedAt: "desc" },
      select: { status: true, startedAt: true, finishedAt: true, error: true },
    });
    if (!last) {
      console.log(`JOB ${jobName}=never_run`);
      continue;
    }
    console.log(`JOB ${jobName}=${last.status}@${last.startedAt.toISOString()}${last.error ? " error=present" : ""}`);
  }
}
main().finally(() => prisma.$disconnect());