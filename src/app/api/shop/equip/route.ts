import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import {
  applyEquippedItemToProfile,
  getLiveShopItem,
  shopBodySchema,
  syncProfileFromDb,
} from "@/app/api/shop/_helpers";
import { applyWalletMutation } from "@/lib/wallet_ledger";

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  try {
    const body = shopBodySchema.parse(await request.json());
    const item = await getLiveShopItem(body.itemId);
    if (!item) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }

    const child = await prisma.childProfile.findFirst({
      where: { id: body.childId, parentId: session.userId, archived: false },
    });
    if (!child) {
      return NextResponse.json({ error: "Child not found." }, { status: 404 });
    }

    const ownership = await prisma.childReward.findUnique({
      where: { childId_rewardId: { childId: body.childId, rewardId: body.itemId } },
    });
    if (!ownership) {
      await prisma.walletTransaction.create({
        data: {
          childId: body.childId,
          type: "failed",
          amount: 0,
          source: "store",
          itemId: body.itemId,
          reason: "equip_not_owned",
          balanceBefore: child.coins,
          balanceAfter: child.coins,
          metadataJson: JSON.stringify({ itemName: item.name, category: item.category, failureCode: "equip_not_owned" }),
        },
      });
      return NextResponse.json({ error: "Item is not owned yet." }, { status: 400 });
    }

    const profile = await syncProfileFromDb(body.childId);
    if (!profile) {
      return NextResponse.json({ error: "Child profile not found." }, { status: 404 });
    }

    const updatedProfile = applyEquippedItemToProfile(profile, body.itemId, item.category);

    const equippedChild = await prisma.$transaction(async (tx) => {
      await tx.childReward.updateMany({
        where: {
          childId: body.childId,
          reward: { category: item.category },
        },
        data: { isEquipped: false },
      });

      await tx.childReward.update({
        where: { childId_rewardId: { childId: body.childId, rewardId: body.itemId } },
        data: { isEquipped: true },
      });
      const mutation = await applyWalletMutation(tx, {
        childId: body.childId,
        type: "equip",
        amount: 0,
        source: "store",
        itemId: body.itemId,
        reason: `${item.name} equipped`,
        profileSnapshot: updatedProfile,
        metadata: {
          itemName: item.name,
          category: item.category,
          itemCategory: item.category,
        },
      });
      return mutation.child;
    });

    return NextResponse.json({
      ok: true,
      child: equippedChild,
      itemId: body.itemId,
      message: `${item.name} equipped.`,
    });
  } catch {
    return NextResponse.json({ error: "Invalid equip request." }, { status: 400 });
  }
}
