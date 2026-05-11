"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { ChildProfile, getProfile, hydrateActiveProfileFromServer, saveProfile } from "@/lib/store";
import { getNextUnlockLevel } from "@/lib/reward_catalog";
import { levelFromXp } from "@/lib/level_system";
import { buyShopItem, equipShopItem, fetchOwnedItems, fetchShopItems, ShopCategory, ShopItemView } from "@/lib/shop_api";
import { previewShopVoicePack } from "@/lib/voice";
import { getVoiceStyleLabel } from "@/lib/voice_options";

const CATEGORY_TABS: Array<{ key: ShopCategory; label: string }> = [
  { key: "themes", label: "Themes" },
  { key: "avatars", label: "Avatars" },
  { key: "voices", label: "Voices" },
  { key: "pet", label: "Pet World" },
  { key: "boosts", label: "Boosts" },
];

const SHOP_REWARDS_BANNER_DISMISSED_KEY = "shop_rewards_moved_banner_dismissed";

const THEME_CARD_CLASS_BY_ID: Record<string, string> = {
  "theme-rainbow": "border-pink-200 bg-gradient-to-br from-pink-50 via-purple-50 to-cyan-50",
  "theme-sunshine": "border-amber-200 bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50",
  "theme-night-sky": "border-indigo-200 bg-gradient-to-br from-indigo-50 via-blue-50 to-slate-100",
  "theme-space": "border-violet-200 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-slate-100",
  "theme-candy": "border-rose-200 bg-gradient-to-br from-rose-50 via-pink-50 to-fuchsia-50",
  "theme-princess": "border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 via-pink-50 to-violet-50",
  "theme-dinosaur": "border-lime-200 bg-gradient-to-br from-lime-50 via-emerald-50 to-teal-50",
  "theme-jungle": "border-green-200 bg-gradient-to-br from-green-50 via-emerald-50 to-lime-50",
  "theme-football": "border-emerald-200 bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50",
  "theme-ocean": "border-cyan-200 bg-gradient-to-br from-cyan-50 via-sky-50 to-blue-50",
  "theme-galaxy-pro": "border-slate-300 bg-gradient-to-br from-slate-100 via-indigo-50 to-purple-50",
};

const AVATAR_SAMPLE_BY_ID: Record<string, string> = {
  "avatar-unicorn": "🦄",
  "avatar-star-student": "🧑‍🎓",
  "avatar-robot": "🤖",
  "avatar-astronaut": "👨‍🚀",
  "outfit-superhero-cape": "🦸",
  "avatar-dragon": "🐉",
  "outfit-crown": "👑",
  "outfit-wizard-hat": "🧙",
  "avatar-book-hero": "📚",
};

const PET_SAMPLE_BY_ID: Record<string, string> = {
  "pet-food": "🥣",
  "pet-treats": "🦴",
  "pet-ball": "🎾",
  "pet-brush": "🪮",
  "pet-bed": "🛏️",
  "pet-hat": "🎩",
  "pet-sparkle-collar": "✨",
  "pet-house": "🏠",
  "pet-playground": "🎠",
};

export default function RewardsShopPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const profileId = profile?.id ?? null;
  const [items, setItems] = useState<ShopItemView[]>([]);
  const [ownedItems, setOwnedItems] = useState<ShopItemView[]>([]);
  const [activeTab, setActiveTab] = useState<ShopCategory>("themes");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [showRewardsMovedBanner, setShowRewardsMovedBanner] = useState(false);
  const [pendingPurchase, setPendingPurchase] = useState<ShopItemView | null>(null);

  useEffect(() => {
    void hydrateActiveProfileFromServer().then((serverProfile) => {
      const p = serverProfile ?? getProfile();
      if (!p) {
        router.replace("/profiles");
        return;
      }
      setProfile(p);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!profileId) return;
    void Promise.all([fetchShopItems(profileId), fetchOwnedItems(profileId)]).then(([shopPayload, ownedPayload]) => {
      if (shopPayload) setItems(shopPayload.items);
      if (ownedPayload) setOwnedItems(ownedPayload.owned);
    });
  }, [profileId]);

  const ownedBadges = useMemo(
    () => ownedItems.filter((item) => item.category === "badges"),
    [ownedItems],
  );

  useEffect(() => {
    const fromParam = searchParams.get("from");
    if (fromParam !== "rewards") return;

    const dismissed = sessionStorage.getItem(SHOP_REWARDS_BANNER_DISMISSED_KEY) === "1";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowRewardsMovedBanner(!dismissed);

    const cleanedParams = new URLSearchParams(searchParams.toString());
    cleanedParams.delete("from");
    const cleanedQuery = cleanedParams.toString();
    const cleanUrl = cleanedQuery ? `/shop?${cleanedQuery}` : "/shop";
    router.replace(cleanUrl);
  }, [router, searchParams]);

  const nextUnlock = useMemo(() => {
    if (!profile) return "Level 1";
    const currentLevel = levelFromXp(profile.xp);
    const upcoming = getNextUnlockLevel(currentLevel);
    return `Level ${upcoming}`;
  }, [profile]);

  const categoryItems = useMemo(() => items.filter((item) => item.category === activeTab), [activeTab, items]);

  if (!profile) return <main className="min-h-screen bg-background" />;
  const currentLevel = levelFromXp(profile.xp);

  function handleSpeakSample(item: ShopItemView): void {
    const played = previewShopVoicePack(profile!, item.id);
    setActionMessage(played ? `Playing ${item.name} sample...` : "Voice unavailable on this browser/device. Please check sound output and try again.");
  }

  function cardClassFor(item: ShopItemView): string {
    if (item.category === "themes") {
      return THEME_CARD_CLASS_BY_ID[item.id] ?? "border-slate-200 bg-white";
    }
    return "border-slate-200 bg-white";
  }

  function getPreviewEmoji(item: ShopItemView): string | null {
    if (item.category === "avatars") return AVATAR_SAMPLE_BY_ID[item.id] ?? "🙂";
    if (item.category === "pet") return PET_SAMPLE_BY_ID[item.id] ?? "🐾";
    return null;
  }

  function getState(item: ShopItemView, coins: number): "Locked" | "Buy" | "Owned" | "Use" | "Using" | "Not enough coins" {
    const levelLocked = currentLevel < item.unlockLevel;
    if (levelLocked) return "Locked";
    if (!item.owned && coins < item.cost) return "Not enough coins";
    if (!item.owned) return "Buy";
    if (item.equipped) return "Using";
    if (item.category === "boosts") return "Use";
    return "Use";
  }

  async function handleItemAction(item: ShopItemView): Promise<void> {
    const currentProfile = profile;
    if (!currentProfile) return;

    const state = getState(item, currentProfile.coins);
    if (state === "Locked" || state === "Not enough coins") return;

    if (state === "Buy") {
      setActionMessage(null);
      setLoadingItemId(null);
      setPendingPurchase(item);
      return;
    }

    setLoadingItemId(item.id);
    setActionMessage(null);

    if (state === "Use" || state === "Owned") {
      const result = await equipShopItem(currentProfile.id, item.id);
      if (!result.ok) {
        setActionMessage(result.error);
        setLoadingItemId(null);
        return;
      }
      saveProfile(result.child);
      setProfile(result.child);
      const refreshed = await fetchShopItems(result.child.id);
      if (refreshed) setItems(refreshed.items);
      const refreshedOwned = await fetchOwnedItems(result.child.id);
      if (refreshedOwned) setOwnedItems(refreshedOwned.owned);
      setActionMessage(`${item.name} is now active.`);
    }

    setLoadingItemId(null);
  }

  async function confirmPurchase(): Promise<void> {
    const currentProfile = profile;
    const item = pendingPurchase;
    if (!currentProfile || !item) return;

    setLoadingItemId(item.id);
    setActionMessage(null);

      const result = await buyShopItem(currentProfile.id, item.id);
      if (!result.ok) {
        setActionMessage(result.error);
        setPendingPurchase(null);
        setLoadingItemId(null);
        return;
      }
      saveProfile(result.child);
      setProfile(result.child);
      const refreshed = await fetchShopItems(result.child.id);
      if (refreshed) setItems(refreshed.items);
      const refreshedOwned = await fetchOwnedItems(result.child.id);
      if (refreshedOwned) setOwnedItems(refreshedOwned.owned);
      setActionMessage(`🎉 ${item.name} unlocked!`);
      setPendingPurchase(null);
      setLoadingItemId(null);
  }

  return (
    <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
      <Navbar />
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-indigo-200/50 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-20 h-80 w-80 rounded-full bg-cyan-200/40 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:py-10">
        {showRewardsMovedBanner ? (
          <div className="mb-4 flex flex-col gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800 sm:flex-row sm:items-center sm:justify-between">
            <p>Rewards moved here. You are in the new unified Shop experience.</p>
            <button
              type="button"
              className="self-start rounded-full bg-sky-700 px-3 py-1 text-xs font-black text-white hover:bg-sky-800"
              onClick={() => {
                sessionStorage.setItem(SHOP_REWARDS_BANNER_DISMISSED_KEY, "1");
                setShowRewardsMovedBanner(false);
              }}
            >
              Got it
            </button>
          </div>
        ) : null}
        <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 shadow-[0_28px_80px_rgba(72,93,165,0.16)] backdrop-blur">
          <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-cyan-900 px-5 py-6 text-white sm:px-8">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Rewards Shop</p>
            <h1 className="mt-2 font-heading text-3xl font-black sm:text-4xl">Unlock themes, pets, voices, and boosts.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">
              This shop now syncs with Admin Store. Active admin items appear here automatically.
            </p>
            <p className="mt-3 inline-flex rounded-full bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-100">
              Active tutor voice: {getVoiceStyleLabel(profile.settings.voiceStyle)}
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-sm font-bold text-blue-100">Coins Balance</p>
                <p className="mt-1 text-3xl font-black">{profile.coins} Coins</p>
                <p className="text-xs text-blue-100">Available to spend</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-sm font-bold text-blue-100">Items Owned</p>
                <p className="mt-1 text-3xl font-black">{items.filter((item) => item.owned).length} Items</p>
                <p className="text-xs text-blue-100">Unlocked rewards</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-sm font-bold text-blue-100">Next Unlock</p>
                <p className="mt-1 text-3xl font-black">{nextUnlock}</p>
                <p className="text-xs text-blue-100">Keep playing to unlock more</p>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-8">
          {actionMessage ? <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{actionMessage}</p> : null}

        <Card className="mb-4 rounded-[1.75rem]" title="Badge Inventory">
          <p className="text-sm font-semibold text-slate-600">Rare badges you have earned appear here automatically.</p>
          {ownedBadges.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {ownedBadges.map((badge) => (
                <div key={badge.id} className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 p-4 shadow-sm">
                  <p className="text-xs font-black uppercase tracking-[0.15em] text-amber-700">Rare Badge</p>
                  <p className="mt-1 text-lg font-black text-slate-900">🏅 {badge.name}</p>
                  {badge.description ? <p className="mt-2 text-sm text-slate-600">{badge.description}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
              No badges yet. Win a perfect Boss Battle to earn your first rare badge.
            </p>
          )}
        </Card>

        <Card className="rounded-[1.75rem]" title="Rewards Catalog">
          <div className="flex flex-wrap gap-2">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`rounded-full px-5 py-3 text-sm font-black transition ${activeTab === tab.key ? "bg-primary text-white shadow-lg shadow-indigo-200" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {categoryItems.map((item) => {
              const state = getState(item, profile.coins);
              const levelGap = Math.max(0, item.unlockLevel - currentLevel);
              const coinsGap = Math.max(0, item.cost - profile.coins);
              const cta = state === "Locked"
                ? `Reach Level ${item.unlockLevel}`
                : state === "Not enough coins"
                  ? "Earn coins"
                  : state === "Buy"
                    ? "Buy"
                    : state === "Using"
                      ? "Using"
                      : "Use";

              return (
                <div key={item.id} className={`rounded-[1.5rem] border p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-xl ${cardClassFor(item)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-heading text-xl font-black text-slate-900">{item.name}</p>
                      <p className="mt-1 text-sm font-bold text-slate-600">{item.cost} coins</p>
                    </div>
                    {item.id.startsWith("admin-store-") ? (
                      <span className="rounded-full bg-cyan-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-cyan-800">Admin</span>
                    ) : null}
                  </div>
                  {item.category === "themes" ? (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-white/90 ring-1 ring-slate-200" />
                      <span className="h-3 w-3 rounded-full bg-slate-200/90" />
                      <span className="h-3 w-3 rounded-full bg-slate-400/80" />
                      <p className="text-xs font-bold text-slate-600">Theme colors preview</p>
                    </div>
                  ) : null}
                  {getPreviewEmoji(item) ? (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/80 px-3 py-2">
                      <span aria-hidden className="text-2xl leading-none">{getPreviewEmoji(item)}</span>
                      <p className="text-xs font-black uppercase tracking-wide text-indigo-700">Preview</p>
                    </div>
                  ) : null}
                  {item.description ? <p className="mt-3 min-h-12 text-sm leading-6 text-slate-600">{item.description}</p> : null}
                  <p className="mt-2 text-xs font-bold text-slate-500">Unlocks at Level {item.unlockLevel}</p>
                  {state === "Locked" ? <p className="mt-1 text-xs font-semibold text-amber-700">Complete {Math.max(1, levelGap)} more level{levelGap === 1 ? "" : "s"} to unlock.</p> : null}
                  {state === "Not enough coins" ? <p className="mt-1 text-xs font-semibold text-rose-700">You need {coinsGap} more coins.</p> : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      disabled={state === "Locked" || state === "Using" || loadingItemId === item.id || state === "Not enough coins"}
                      variant={state === "Buy" ? "accent" : "primary"}
                      onClick={() => void handleItemAction(item)}
                    >
                      {loadingItemId === item.id ? "Please wait..." : cta}
                    </Button>
                    {activeTab === "voices" ? (
                      <button
                        type="button"
                        className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-700 transition hover:bg-indigo-100 active:scale-95"
                        onClick={() => handleSpeakSample(item)}
                      >
                        ▶ Sample
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">State: {state}</p>
                </div>
              );
            })}
            {!categoryItems.length ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm font-semibold text-slate-500">
                No active items in this category yet. Add one in Admin Store.
              </div>
            ) : null}
          </div>
        </Card>

        <div className="mt-4">
          <Link href="/dashboard"><Button variant="secondary">Back to Dashboard</Button></Link>
        </div>
          </div>
        </section>
      </div>
      </div>

      {pendingPurchase ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-black text-slate-900">Confirm Purchase</h2>
            <p className="mt-2 text-sm text-slate-600">
              Spend {pendingPurchase.cost} coins to unlock {pendingPurchase.name}?
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Current balance: {profile?.coins ?? 0} coins
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="accent"
                onClick={() => void confirmPurchase()}
                disabled={loadingItemId === pendingPurchase.id}
              >
                {loadingItemId === pendingPurchase.id ? "Buying..." : "Confirm"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setPendingPurchase(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}


