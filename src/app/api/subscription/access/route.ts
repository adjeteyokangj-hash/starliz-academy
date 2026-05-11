import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { canUseFeature } from "@/lib/subscriptions/enforcement";
import { PremiumFeature } from "@/lib/subscriptions/plans";
import { resolveParentScope } from "@/lib/parent_scope";

const features = new Set(["learning", "ai-content", "reports", "store"]);

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const feature = new URL(request.url).searchParams.get("feature") ?? "learning";
  if (!features.has(feature)) {
    return NextResponse.json({ error: "Unknown feature." }, { status: 400 });
  }

  const decision = await canUseFeature(parentScope.parentId, feature as PremiumFeature);
  return NextResponse.json(decision, { status: decision.allowed ? 200 : 402 });
}
