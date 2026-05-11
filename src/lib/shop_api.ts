import { ChildProfile } from "@/lib/store";

export type ShopCategory = "themes" | "avatars" | "voices" | "pet" | "boosts" | "badges";

export type ShopItemView = {
  id: string;
  name: string;
  cost: number;
  unlockLevel: number;
  requiredLevel?: number;
  minAge?: number;
  maxAge?: number | null;
  category: ShopCategory;
  description?: string;
  owned: boolean;
  equipped: boolean;
};

export type ShopItemsResponse = {
  childId: string;
  coins: number;
  level: number;
  items: ShopItemView[];
};

export type ShopOwnedResponse = {
  childId: string;
  owned: ShopItemView[];
};

export type ShopMutationResponse = {
  ok: true;
  child: ChildProfile;
  itemId: string;
  message: string;
};

export async function fetchShopItems(childId: string): Promise<ShopItemsResponse | null> {
  const response = await fetch(`/api/shop/items?childId=${encodeURIComponent(childId)}`, { credentials: "include" });
  if (!response.ok) return null;
  return await response.json() as ShopItemsResponse;
}

export async function fetchOwnedItems(childId: string): Promise<ShopOwnedResponse | null> {
  const response = await fetch(`/api/shop/owned?childId=${encodeURIComponent(childId)}`, { credentials: "include" });
  if (!response.ok) return null;
  return await response.json() as ShopOwnedResponse;
}

export async function buyShopItem(childId: string, itemId: string): Promise<ShopMutationResponse | { ok: false; error: string }> {
  const response = await fetch("/api/shop/buy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ childId, itemId }),
  });
  if (!response.ok) {
    const payload = await response.json() as { error?: string };
    return { ok: false, error: payload.error ?? "Could not buy item." };
  }
  return await response.json() as ShopMutationResponse;
}

export async function equipShopItem(childId: string, itemId: string): Promise<ShopMutationResponse | { ok: false; error: string }> {
  const response = await fetch("/api/shop/equip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ childId, itemId }),
  });
  if (!response.ok) {
    const payload = await response.json() as { error?: string };
    return { ok: false, error: payload.error ?? "Could not equip item." };
  }
  return await response.json() as ShopMutationResponse;
}
