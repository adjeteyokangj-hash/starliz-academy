import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { getEquippedMap, getLiveShopItems, getOwnedMap, levelForProfile, syncProfileFromDb } from "@/app/api/shop/_helpers";

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

  const [profile, ownedMap, equippedMap, liveItems] = await Promise.all([
    syncProfileFromDb(childId),
    getOwnedMap(childId),
    getEquippedMap(childId),
    getLiveShopItems(),
  ]);

  if (!profile) {
    return NextResponse.json({ error: "Child profile not found." }, { status: 404 });
  }

  const items = liveItems
    .filter((item) => profile.ageYears >= item.minAge && (item.maxAge === null || profile.ageYears <= item.maxAge))
    .map((item) => ({
    id: item.id,
    name: item.name,
    cost: item.cost,
    unlockLevel: item.unlockLevel,
    requiredLevel: item.requiredLevel,
    minAge: item.minAge,
    maxAge: item.maxAge,
    category: item.category,
    description: item.description,
    owned: ownedMap.has(item.id),
    equipped: equippedMap.has(item.id),
  }));

  return NextResponse.json({
    childId,
    coins: profile.coins,
    level: levelForProfile(profile),
    items,
  });
}
