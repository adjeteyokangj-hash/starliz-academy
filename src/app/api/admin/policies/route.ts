import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api_guard";
import {
  createPolicyDraft,
  listPolicyDocuments,
  getPolicyDocumentBySlug,
  deserializePolicyBody,
} from "@/lib/policies/cms";
import type { PolicyDocument } from "@/lib/policies/types";

export async function GET(req: NextRequest) {
  let auth = await requireAdminPermission("VIEW_POLICIES");
  if (!auth.session) {
    auth = await requireAdminPermission("MANAGE_SETTINGS");
  }
  if (!auth.session) return auth.response;

  const { searchParams } = new URL(req.url);
  const visibility = searchParams.get("visibility") as "public" | "internal" | "all" | null;
  const status = searchParams.get("status")?.trim();
  const q = searchParams.get("q")?.trim();

  try {
    const rows = await listPolicyDocuments({
      visibility: visibility ?? "all",
      status: status || undefined,
      q: q || undefined,
    });
    return NextResponse.json({
      documents: rows.map(({ doc, current }) => ({
        id: doc.id,
        slug: doc.slug,
        title: doc.title,
        category: doc.category,
        visibility: doc.visibility,
        audience: JSON.parse(doc.audienceJson),
        currentVersionId: doc.currentVersionId,
        current: current
          ? {
              id: current.id,
              version: current.version,
              status: current.status,
              effectiveDate: current.effectiveDate?.toISOString() ?? null,
              lastUpdatedAt: current.lastUpdatedAt.toISOString(),
              authorId: current.authorId,
              approvedBy: current.approvedBy,
              approvedAt: current.approvedAt?.toISOString() ?? null,
              publishedAt: current.publishedAt?.toISOString() ?? null,
              changeLog: current.changeLog,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("policy list failed:", error);
    return NextResponse.json({ error: "Policy centre is unavailable." }, { status: 503 });
  }
}

const createSchema = z.object({
  slug: z.string().trim().min(2).max(120),
  title: z.string().trim().min(3).max(200),
  category: z.string().trim().min(2).max(40),
  visibility: z.enum(["public", "internal"]).default("public"),
  audience: z.array(z.string()).default(["Public"]),
  body: z.record(z.string(), z.unknown()),
  changeLog: z.string().trim().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  const { session, response } = await requireAdminPermission("MANAGE_POLICIES");
  if (!session) return response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid policy draft payload." }, { status: 400 });
  }

  try {
    const body = parsed.data.body as unknown as PolicyDocument;
    const created = await createPolicyDraft({
      actorUserId: session.userId,
      slug: parsed.data.slug,
      title: parsed.data.title,
      category: parsed.data.category,
      visibility: parsed.data.visibility,
      audience: parsed.data.audience,
      body: {
        ...body,
        id: body.id || parsed.data.slug,
        slug: parsed.data.slug,
        title: parsed.data.title,
      },
      changeLog: parsed.data.changeLog,
    });
    return NextResponse.json({ document: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create policy draft." },
      { status: 400 },
    );
  }
}

export async function HEAD() {
  const detail = await getPolicyDocumentBySlug("terms").catch(() => null);
  return NextResponse.json({ ok: true, seeded: Boolean(detail) });
}

// Keep deserialize available for typed consumers.
void deserializePolicyBody;
