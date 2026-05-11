import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { getEquippedMap, getLiveShopItems, getOwnedMap } from "@/app/api/shop/_helpers";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const url = new URL(request.url);
  const childIdParam = url.searchParams.get("childId");
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { activeChildId: true } });
  const childId = childIdParam ?? user?.activeChildId ?? "";
  if (!childId) {
    return NextResponse.json({ error: "No active child selected." }, { status: 400 });
  }

  const child = await prisma.childProfile.findFirst({ where: { id: childId, parentId: session.userId, archived: false } });
  if (!child) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  const [ownedMap, equippedMap, liveItems] = await Promise.all([getOwnedMap(childId), getEquippedMap(childId), getLiveShopItems()]);
  const owned = liveItems.filter((item) => ownedMap.has(item.id)).map((item) => ({
    ...item,
    owned: true,
    equipped: equippedMap.has(item.id),
  }));

  return NextResponse.json({ childId, owned });
}
