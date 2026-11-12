import { validateWorldCurriculumLinks } from "@/lib/coding/world/content-references";
import { worldRequestIsSameOrigin } from "@/lib/coding/world/request-origin";
import { parseStoredWorldMetadata } from "@/lib/coding/world/content";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminPermission, checkRateLimit } from "@/lib/api_guard";
import { studioActionSchema, publicationTransition, ContentReviewError, assertWorldPackConflicts } from "@/lib/coding/world/content-policy";
const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  if (error instanceof ContentReviewError) return NextResponse.json({ error: error.message }, { status: 409, headers });
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) return NextResponse.json({ error: "Content Studio storage is not installed. The additive migration is prepared for separate database authorisation; existing learning remains available." }, { status: 503, headers });
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) return NextResponse.json({ error: "Another editor saved or published a version. Reload the studio." }, { status: 409, headers });
  console.error("World content request failed", error instanceof Error ? error.name : "UnknownError");
  return NextResponse.json({ error: "The content version could not be saved. Existing versions were retained." }, { status: 500, headers });
}
export async function GET() {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT"); if (!session) return response;
  try { return NextResponse.json({ versions: (await prisma.codingWorldContentVersion.findMany({ orderBy: { updatedAt: "desc" }, take: 200 })).map(version => ({ ...version, metadata: parseStoredWorldMetadata(version.metadataJson) })), viewerId: session.userId, publicationEnabled: process.env.CODING_WORLD_CONTENT_PUBLICATION_ENABLED === "true" }, { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!worldRequestIsSameOrigin(request)) return NextResponse.json({ error: "Open Content Studio on StarLiz Academy." }, { status: 403, headers });
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT"); if (!session) return response;
  if (!checkRateLimit({ key: `world-studio:${session.userId}`, limit: 30, windowMs: 60000 }).allowed) return NextResponse.json({ error: "Pause before saving more versions." }, { status: 429, headers });
  const text = await request.text(); if (text.length > 24576) return NextResponse.json({ error: "Keep the content version within the studio limits." }, { status: 413, headers });
  const parsed = studioActionSchema.safeParse(await Promise.resolve().then(() => JSON.parse(text)).catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the mission, title, objective and dialogue. Only plain educational text is accepted." }, { status: 400, headers });
  const action = parsed.data;
  if (action.type === "approve" || action.type === "publish") { const approval = await requireAdminPermission("APPROVE_CONTENT"); if (!approval.session) return approval.response; }
  try {
    const version = await prisma.$transaction(async tx => {
      let saved;
      if (action.type === "draft") {
        validateWorldCurriculumLinks(action.content, false);
        const { metadata, ...copy } = action.content;
        const last = await tx.codingWorldContentVersion.findFirst({ where: { missionId: action.content.missionId }, orderBy: { version: "desc" }, select: { version: true } });
        saved = await tx.codingWorldContentVersion.create({ data: { ...copy, metadataJson: JSON.stringify(metadata ?? {}), version: (last?.version ?? 0) + 1, createdBy: session.userId } });
      } else {
        const existing = await tx.codingWorldContentVersion.findUnique({ where: { id: action.id } });
        if (!existing) throw new ContentReviewError("Version not found.");
        const metadata = parseStoredWorldMetadata(existing.metadataJson);
        validateWorldCurriculumLinks({ missionId: existing.missionId, title: existing.title, objective: existing.objective, dialogue: existing.dialogue, metadata }, action.type === "publish");
        if (action.type === "publish") {
          const live = await tx.codingWorldContentVersion.findMany({ where: { status: "published", NOT: { missionId: existing.missionId } }, select: { metadataJson: true } });
          assertWorldPackConflicts(metadata, live.map(row => parseStoredWorldMetadata(row.metadataJson)));
        }
        const next = publicationTransition(existing.status, action.type, existing.createdBy, session.userId, process.env.CODING_WORLD_CONTENT_PUBLICATION_ENABLED === "true");
        if (next === "published") await tx.codingWorldContentVersion.updateMany({ where: { missionId: existing.missionId, status: "published" }, data: { status: "archived" } });
        const updated = await tx.codingWorldContentVersion.updateMany({ where: { id: existing.id, status: existing.status, updatedAt: existing.updatedAt }, data: { status: next, ...(next === "approved" ? { approvedBy: session.userId } : {}), ...(next === "published" ? { publishedBy: session.userId } : {}) } });
        if (updated.count !== 1) throw new ContentReviewError("Version changed during review. Reload the studio.");
        saved = await tx.codingWorldContentVersion.findUniqueOrThrow({ where: { id: existing.id } });
      }
      await tx.auditLog.create({ data: { actorUserId: session.userId, action: `coding.world.content.${action.type}`, entityType: "CodingWorldContentVersion", entityId: saved.id, metadataJson: JSON.stringify({ missionId: saved.missionId, version: saved.version, status: saved.status }) } });
      return saved;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ version }, { headers });
  } catch (error) { return failure(error); }
}
