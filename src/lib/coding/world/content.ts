import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { worldContentDraftSchema, worldContentMetadataSchema } from "./content-policy";
import { missions, type Mission } from "./model";
export function parseStoredWorldMetadata(raw: string) { return worldContentMetadataSchema.parse(JSON.parse(raw)); }
export async function publishedWorldCopy() {
  if (process.env.CODING_WORLD_CONTENT_PUBLICATION_ENABLED !== "true") return [];
  try {
    const rows = await prisma.codingWorldContentVersion.findMany({ where: { status: "published" }, select: { missionId: true, title: true, objective: true, dialogue: true, version: true, metadataJson: true } });
    return rows.flatMap(row => {
      try { const content = worldContentDraftSchema.safeParse({ missionId: row.missionId, title: row.title, objective: row.objective, dialogue: row.dialogue, metadata: parseStoredWorldMetadata(row.metadataJson) }); return content.success ? [{ ...content.data, version: row.version }] : []; }
      catch { return []; }
    });
  } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) return []; throw error; }
}
export function extendWorldMissions(copy: Awaited<ReturnType<typeof publishedWorldCopy>>): Mission[] {
  const available = [...missions], ids = new Set(missions.map(mission => mission.id));
  for (const content of copy) for (const extension of content.metadata?.extensions ?? []) {
    if (ids.has(extension.id)) continue;
    ids.add(extension.id);
    available.push({ id: extension.id, title: extension.title, objective: extension.objective, location: extension.simulation, simulation: extension.simulation, chapter: 6, count: 1, conditional: true, prerequisites: [...new Set([content.missionId, ...extension.prerequisites])] });
  }
  return available;
}
export async function publishedWorldMissions() { return extendWorldMissions(await publishedWorldCopy()); }
