"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  getStoreItemImageUrl,
  getStorePreviewEmoji,
  getStorePreviewKind,
  getThemePalette,
  getThemePreviewClass,
} from "@/lib/store_item_preview";
import { previewShopVoicePackById } from "@/lib/voice";

export type StorePreviewItem = {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  price?: number;
};

type Props = {
  item: StorePreviewItem | null;
  onClose: () => void;
};

export default function AdminStoreItemPreview({ item, onClose }: Props) {
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset preview state when selected item changes; frozen behaviour, advisory only
    setVoiceMessage(null);
    setPlaying(false);
  }, [item?.id]);

  if (!item) return null;

  const kind = getStorePreviewKind(item.category, item.id);
  const emoji = getStorePreviewEmoji(item.category, item.id);
  const imageUrl = getStoreItemImageUrl(item.category, item.id);
  const palette = getThemePalette(item.id);

  async function playVoice() {
    setPlaying(true);
    setVoiceMessage(`Playing ${item!.name} sample…`);
    try {
      const played = await previewShopVoicePackById(item!.id);
      setVoiceMessage(
        played
          ? `Playing ${item!.name} sample…`
          : "Voice unavailable on this browser/device. Check sound output and try again.",
      );
    } finally {
      setPlaying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="store-preview-title">
      <div className="w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-[0_30px_80px_rgba(2,6,23,0.65)] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Item preview</p>
            <h2 id="store-preview-title" className="mt-1 text-xl font-black text-white">{item.name}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {item.category}
              {typeof item.price === "number" ? ` · ${item.price} coins` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-3 py-2 text-sm font-bold text-slate-200 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        {kind === "theme" ? (
          <div
            className={`mt-4 overflow-hidden rounded-2xl border ${getThemePreviewClass(item.id)}`}
            style={{ background: palette.background, color: palette.foreground }}
          >
            <div className="flex items-center gap-4 p-4">
              {imageUrl ? (
                <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-black/5 shadow-md">
                  <Image src={imageUrl} alt={`${item.name} preview`} fill className="object-cover" sizes="112px" />
                </div>
              ) : (
                <span aria-hidden className="text-6xl leading-none">{emoji ?? "🎨"}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-lg font-black">{item.name}</p>
                <p className="mt-1 text-xs font-bold opacity-70">How this theme tints the student app</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {palette.swatches.map((color) => (
                    <span
                      key={color}
                      className="h-8 w-8 rounded-full border border-black/10 shadow-sm"
                      style={{ background: color }}
                      title={color}
                    />
                  ))}
                </div>
                <div
                  className="mt-4 inline-flex rounded-full px-4 py-2 text-xs font-black text-white shadow"
                  style={{ backgroundImage: palette.button }}
                >
                  Sample button
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {kind !== "theme" && (imageUrl || emoji) ? (
          <div className="mt-4 flex items-center gap-4 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 px-5 py-4">
            {imageUrl ? (
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40 shadow">
                <Image src={imageUrl} alt={`${item.name} preview`} fill className="object-cover" sizes="96px" />
              </div>
            ) : (
              <span aria-hidden className="text-6xl leading-none">{emoji}</span>
            )}
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-indigo-200">Look</p>
              <p className="text-sm text-slate-200">
                {kind === "voice" ? "Voice pack art — play the sample below" : "What students see in the shop"}
              </p>
            </div>
          </div>
        ) : null}

        {kind === "voice" ? (
          <div className="mt-4 space-y-3">
            <button
              type="button"
              disabled={playing}
              onClick={() => void playVoice()}
              className="rounded-xl bg-cyan-500 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
            >
              {playing ? "Playing…" : "▶ Play voice sample"}
            </button>
            {voiceMessage ? <p className="text-sm text-slate-300">{voiceMessage}</p> : (
              <p className="text-xs text-slate-500">Uses browser speech so every catalog voice can be heard in admin.</p>
            )}
          </div>
        ) : null}

        {kind === "generic" ? (
          <p className="mt-4 text-sm text-slate-400">
            No rich media preview for this category yet. Students see the name, price, and description in the shop.
          </p>
        ) : null}

        {item.description ? (
          <p className="mt-4 text-sm leading-6 text-slate-300">{item.description}</p>
        ) : null}
      </div>
    </div>
  );
}
