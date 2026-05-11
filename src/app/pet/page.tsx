"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { applyStreakProtection } from "@/lib/gamification";
import { ChildProfile, getProfile, saveProfile } from "@/lib/store";
import { applyPetOutcome } from "@/lib/pet_state";
import { fetchOwnedItems, ShopItemView } from "@/lib/shop_api";

const STAGE_EMOJI = ["🐣", "🐶", "🐕", "🦊", "🐉"];
const MOOD_TEXT: Record<ChildProfile["petEmotion"], string> = {
  calm: "Calm and focused",
  happy: "Happy and playful",
  excited: "Excited and energetic",
  sad: "A little sad, needs encouragement",
};
const MOOD_EMOJI: Record<ChildProfile["petEmotion"], string> = {
  calm: "🙂",
  happy: "😄",
  excited: "🤩",
  sad: "🥺",
};

function petItemEmoji(itemId: string): string {
  if (itemId.startsWith("pet-food")) return "🍖";
  if (itemId.startsWith("pet-treats")) return "🦴";
  if (itemId.startsWith("pet-ball")) return "🎾";
  if (itemId.startsWith("pet-brush")) return "🪮";
  if (itemId.startsWith("pet-bed")) return "🛏️";
  if (itemId.startsWith("pet-hat")) return "🎩";
  if (itemId.startsWith("pet-sparkle-collar")) return "📿";
  if (itemId.startsWith("pet-house")) return "🏠";
  if (itemId.startsWith("pet-playground")) return "🛝";
  return "🐾";
}

export default function PetPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [ownedPetItems, setOwnedPetItems] = useState<ShopItemView[]>([]);

  useEffect(() => {
    const p = getProfile();
    if (!p) {
      router.replace("/onboarding");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(p);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    void fetchOwnedItems(profile.id).then((payload) => {
      setOwnedPetItems(payload?.owned.filter((item) => item.category === "pet") ?? []);
    });
  }, [profile?.id, profile?.inventory.length]);

  const petEmoji = useMemo(() => {
    if (!profile) return "🐣";
    return STAGE_EMOJI[Math.max(0, Math.min(profile.petStage - 1, STAGE_EMOJI.length - 1))];
  }, [profile]);
  const equippedPetItem = useMemo(
    () => ownedPetItems.find((item) => item.equipped) ?? null,
    [ownedPetItems]
  );

  if (!profile) return <main className="min-h-screen bg-background" />;

  return (
    <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
      <Navbar />
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-amber-200/50 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-20 h-80 w-80 rounded-full bg-cyan-200/40 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 shadow-[0_28px_80px_rgba(72,93,165,0.16)] backdrop-blur">
          <div className="bg-gradient-to-r from-slate-950 via-amber-900 to-cyan-900 px-5 py-6 text-white sm:px-8">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-200">Pet World</p>
            <h1 className="mt-2 font-heading text-3xl font-black sm:text-4xl">Care for your learning buddy.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-amber-50">
              Feed, protect, and decorate your pet with rewards unlocked from the shop.
            </p>
          </div>

          <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[1fr_360px]">
            <Card className="rounded-[1.75rem] p-6" title="Pet Home">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="flex h-40 w-40 items-center justify-center rounded-[2rem] bg-gradient-to-br from-amber-100 to-cyan-100 text-7xl shadow-inner">
                  {petEmoji}
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-amber-700">Evolution Stage</p>
                  <p className="font-heading text-4xl font-black text-slate-950">{profile.petStage}/5</p>
                  <div className="h-3 w-full rounded-full bg-slate-100 sm:w-80">
                    <div
                      className="h-3 rounded-full bg-gradient-to-r from-amber-400 to-cyan-400"
                      style={{ width: `${Math.min(100, profile.petStage * 20)}%` }}
                    />
                  </div>
                  {equippedPetItem ? (
                    <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800">
                      Active pet reward: {petItemEmoji(equippedPetItem.id)} {equippedPetItem.name}
                    </p>
                  ) : (
                    <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
                      No active pet reward equipped yet.
                    </p>
                  )}
                </div>
              </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-500">Mood</p>
              <p className="mt-1 text-lg font-black text-slate-900">{MOOD_EMOJI[profile.petEmotion]} {MOOD_TEXT[profile.petEmotion]}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-500">Streak Shields</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{profile.streakShields}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-500">Pet Items</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{ownedPetItems.length}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              onClick={() => {
                const updated = applyPetOutcome({
                  ...profile,
                  weekStreak: profile.weekStreak + 1,
                }, "care");
                saveProfile(updated);
                setProfile(updated);
              }}
            >
              Daily Pet Care (+Streak)
            </Button>
            <Button
              variant="accent"
              onClick={() => {
                const updated = applyStreakProtection(profile);
                setProfile(updated);
              }}
            >
              Use Streak Shield
            </Button>
            <Link href="/shop"><Button variant="secondary">Open Rewards Shop</Button></Link>
          </div>

            </Card>

            <aside className="space-y-4">
              <div className="rounded-[1.75rem] border border-slate-200 bg-slate-950 p-5 text-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Owned Pet Items</p>
                <div className="mt-4 space-y-2">
                  {ownedPetItems.length ? ownedPetItems.map((item) => (
                    <div key={item.id} className="rounded-2xl bg-white/10 p-3">
                      <p className="font-black">{item.name}</p>
                      <p className="mt-1 text-xs text-cyan-100">{item.equipped ? "Equipped" : "Unlocked"}</p>
                    </div>
                  )) : (
                    <p className="rounded-2xl bg-white/10 p-3 text-sm text-cyan-100">
                      No pet items yet. Visit the shop to unlock food, toys, beds, hats, and more.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
                <p className="text-sm font-black text-amber-950">How to grow</p>
                <p className="mt-2 text-sm leading-6 text-amber-800">
                  Complete daily care, protect streaks, and use pet rewards from the shop to keep your buddy excited.
                </p>
              </div>
            </aside>
          </div>
        </section>
      </div>
      </div>
    </main>
  );
}
